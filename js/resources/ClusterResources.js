import { ResourceBase } from './ResourceBase.js';

export class Node extends ResourceBase {
  constructor(metadata = {}) {
    super('Node', metadata);
    this.spec = {
      podCIDR: metadata.podCIDR || `10.244.${Math.floor(Math.random() * 255)}.0/24`,
      providerID: metadata.providerID || `kind://docker/kubeops/${metadata.name}`,
      taints: metadata.taints || [],
      unschedulable: false
    };
    this.capacity = {
      cpu: metadata.cpuCapacity || '4',
      memory: metadata.memoryCapacity || '8Gi',
      pods: metadata.podCapacity || '110',
      ephemeralStorage: metadata.ephemeralStorage || '50Gi'
    };
    this.allocatable = {
      cpu: metadata.cpuAllocatable || '3800m',
      memory: metadata.memoryAllocatable || '7Gi',
      pods: metadata.podAllocatable || '110',
      ephemeralStorage: metadata.ephemeralStorageAllocatable || '45Gi'
    };
    this.cpuCapacityMillis = this._parseCpu(this.capacity.cpu);
    this.memoryCapacityBytes = this._parseMemory(this.capacity.memory);
    this.cpuAllocatableMillis = this._parseCpu(this.allocatable.cpu);
    this.memoryAllocatableBytes = this._parseMemory(this.allocatable.memory);
    this.cpuUsedMillis = 0;
    this.memoryUsedBytes = 0;
    this.pods = [];
    const now = new Date().toISOString();
    const makeCondition = (type, status, reason, message) => ({
      type,
      status,
      lastHeartbeatTime: now,
      lastTransitionTime: now,
      reason,
      message,
    });
    this.conditions = [
      makeCondition('Ready', 'True', 'KubeletReady', 'kubelet is posting ready status'),
      makeCondition('MemoryPressure', 'False', 'KubeletHasSufficientMemory', 'kubelet has sufficient memory available'),
      makeCondition('DiskPressure', 'False', 'KubeletHasNoDiskPressure', 'kubelet has no disk pressure'),
      makeCondition('PIDPressure', 'False', 'KubeletHasSufficientPID', 'kubelet has sufficient PID available'),
      makeCondition('NetworkUnavailable', 'False', 'FlannelIsUp', 'Flannel is running on this node'),
    ];
    this.nodeInfo = {
      kubeletVersion: 'v1.29.2',
      containerRuntimeVersion: 'containerd://1.7.11',
      osImage: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      operatingSystem: 'linux',
      kernelVersion: '5.15.0-91-generic'
    };
    this.heartbeatTimer = 0;
    this.heartbeatInterval = 10;
    this.isCordon = false;
    this.setStatus('Ready');
  }

  _parseCpu(cpu) {
    if (typeof cpu === 'number') return cpu;
    if (cpu.endsWith('m')) return parseInt(cpu);
    return parseFloat(cpu) * 1000;
  }

  _parseMemory(mem) {
    if (typeof mem === 'number') return mem;
    const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 };
    for (const [suffix, multiplier] of Object.entries(units)) {
      if (mem.endsWith(suffix)) return parseInt(mem) * multiplier;
    }
    return parseInt(mem);
  }

  addPod(pod) {
    this.pods.push(pod);
    pod.spec.nodeName = this.metadata.name;
  }

  removePod(pod) {
    this.pods = this.pods.filter(p => p !== pod);
  }

  canSchedulePod(pod) {
    if (this.spec.unschedulable || this.isCordon) return false;
    if (this.pods.length >= parseInt(this.allocatable.pods)) return false;

    for (const taint of this.spec.taints) {
      if (taint.effect === 'NoSchedule') {
        const tolerates = (pod.spec?.tolerations || []).some(t =>
          t.key === taint.key && (t.operator === 'Exists' || t.value === taint.value)
        );
        if (!tolerates) return false;
      }
    }
    return true;
  }

  cordon() {
    this.isCordon = true;
    this.spec.unschedulable = true;
    this.addEvent('Normal', 'NodeCordon', `Node ${this.metadata.name} cordoned`);
    this.setStatus('Ready,SchedulingDisabled');
  }

  uncordon() {
    this.isCordon = false;
    this.spec.unschedulable = false;
    this.addEvent('Normal', 'NodeUncordon', `Node ${this.metadata.name} uncordoned`);
    this.setStatus('Ready');
  }

  drain() {
    this.cordon();
    const podsToDrain = [...this.pods];
    this.addEvent('Normal', 'NodeDrain', `Draining node, evicting ${podsToDrain.length} pods`);
    return podsToDrain;
  }

  addTaint(key, value, effect) {
    this.spec.taints.push({ key, value, effect });
    this.addEvent('Normal', 'TaintAdded', `Taint ${key}=${value}:${effect} added`);
  }

  removeTaint(key) {
    this.spec.taints = this.spec.taints.filter(t => t.key !== key);
    this.addEvent('Normal', 'TaintRemoved', `Taint ${key} removed`);
  }

  getCpuUsagePercent() {
    return (this.cpuUsedMillis / this.cpuAllocatableMillis) * 100;
  }

  getMemoryUsagePercent() {
    return (this.memoryUsedBytes / this.memoryAllocatableBytes) * 100;
  }

  isReady() {
    return this.conditions.find(c => c.type === 'Ready')?.status === 'True';
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    this.cpuUsedMillis = 0;
    this.memoryUsedBytes = 0;
    for (const pod of this.pods) {
      if (pod.phase === 'Running') {
        this.cpuUsedMillis += pod.cpuUsage * 1000;
        this.memoryUsedBytes += pod.memoryUsage;
      }
    }

    this.heartbeatTimer += deltaTime;
    if (this.heartbeatTimer >= this.heartbeatInterval) {
      this.heartbeatTimer = 0;
      const now = new Date().toISOString();
      this.conditions = this.conditions.map(c => ({ ...c, lastHeartbeatTime: now }));
    }

    const memPercent = this.getMemoryUsagePercent();
    const memPressure = this.conditions.find(c => c.type === 'MemoryPressure');
    if (memPercent > 90 && memPressure.status === 'False') {
      memPressure.status = 'True';
      memPressure.reason = 'KubeletHasInsufficientMemory';
      memPressure.message = 'kubelet has insufficient memory available';
      memPressure.lastTransitionTime = new Date().toISOString();
      this.addEvent('Warning', 'NodeHasInsufficientMemory', `Node ${this.metadata.name} has memory pressure`);
    } else if (memPercent <= 80 && memPressure.status === 'True') {
      memPressure.status = 'False';
      memPressure.reason = 'KubeletHasSufficientMemory';
      memPressure.message = 'kubelet has sufficient memory available';
      memPressure.lastTransitionTime = new Date().toISOString();
    }
  }

  getShape() { return 'platform'; }
  getColor() { return '#374151'; }

  toYAML() {
    return `apiVersion: v1
kind: Node
metadata:
  name: ${this.metadata.name}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
spec:
  podCIDR: ${this.spec.podCIDR}
${this.spec.taints.length > 0 ? `  taints:
${this.spec.taints.map(t => `  - key: ${t.key}
    value: ${t.value}
    effect: ${t.effect}`).join('\n')}` : ''}
  unschedulable: ${this.spec.unschedulable}
status:
  capacity:
    cpu: "${this.capacity.cpu}"
    memory: "${this.capacity.memory}"
    pods: "${this.capacity.pods}"
  allocatable:
    cpu: "${this.allocatable.cpu}"
    memory: "${this.allocatable.memory}"
    pods: "${this.allocatable.pods}"
  conditions:
${this.conditions.map(c => `  - type: ${c.type}
    status: "${c.status}"
    reason: ${c.reason}`).join('\n')}
  nodeInfo:
    kubeletVersion: ${this.nodeInfo.kubeletVersion}
    containerRuntimeVersion: ${this.nodeInfo.containerRuntimeVersion}
    osImage: ${this.nodeInfo.osImage}`;
  }

  toDescribe() {
    return `Name:               ${this.metadata.name}
Roles:              ${this.metadata.labels['node-role.kubernetes.io/control-plane'] !== undefined ? 'control-plane' : 'worker'}
Labels:             ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join('\n                    ')}
Taints:             ${this.spec.taints.map(t => `${t.key}=${t.value}:${t.effect}`).join('\n                    ') || '<none>'}
Unschedulable:      ${this.spec.unschedulable}
Conditions:
  Type                 Status  Reason
  ----                 ------  ------
${this.conditions.map(c => `  ${c.type.padEnd(20)} ${c.status.padEnd(6)}  ${c.reason}`).join('\n')}
Capacity:
  cpu:                ${this.capacity.cpu}
  memory:             ${this.capacity.memory}
  pods:               ${this.capacity.pods}
Allocatable:
  cpu:                ${this.allocatable.cpu}
  memory:             ${this.allocatable.memory}
  pods:               ${this.allocatable.pods}
System Info:
  Kubelet Version:    ${this.nodeInfo.kubeletVersion}
  Container Runtime:  ${this.nodeInfo.containerRuntimeVersion}
  OS Image:           ${this.nodeInfo.osImage}
  Kernel Version:     ${this.nodeInfo.kernelVersion}
  Architecture:       ${this.nodeInfo.architecture}
Non-terminated Pods: (${this.pods.length} in total)
  CPU Usage:          ${this.cpuUsedMillis}m / ${this.allocatable.cpu} (${this.getCpuUsagePercent().toFixed(1)}%)
  Memory Usage:       ${(this.memoryUsedBytes / (1024 ** 2)).toFixed(0)}Mi / ${this.allocatable.memory} (${this.getMemoryUsagePercent().toFixed(1)}%)
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class Namespace extends ResourceBase {
  constructor(metadata = {}) {
    super('Namespace', metadata);
    this.phase = 'Active';
    this.resourceQuota = null;
    this.podCount = 0;
    this.serviceCount = 0;
    this.deploymentCount = 0;
    this.configMapCount = 0;
    this.secretCount = 0;
    this.totalCpuRequests = 0;
    this.totalMemoryRequests = 0;
    this.displayColor = metadata.displayColor || this._generateColor(metadata.name);
    this.setStatus('Active');
  }

  _generateColor(name) {
    const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
  }

  terminate() {
    this.phase = 'Terminating';
    this.setStatus('Terminating');
    this.addEvent('Normal', 'NamespaceTerminating', `Namespace ${this.metadata.name} is terminating`);
  }

  updateCounts(resources) {
    const nsResources = resources.filter(r => r.metadata.namespace === this.metadata.name);
    const countByKind = (kind) => nsResources.filter(r => r.kind === kind).length;
    this.podCount = countByKind('Pod');
    this.serviceCount = countByKind('Service');
    this.deploymentCount = countByKind('Deployment');
    this.configMapCount = countByKind('ConfigMap');
    this.secretCount = countByKind('Secret');
  }


  getShape() { return 'floor-zone'; }
  getColor() { return this.displayColor; }

  toYAML() {
    return `apiVersion: v1
kind: Namespace
metadata:
  name: ${this.metadata.name}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
status:
  phase: ${this.phase}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ')}
Annotations:  ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Status:       ${this.phase}

Resource Counts:
  Pods:         ${this.podCount}
  Services:     ${this.serviceCount}
  Deployments:  ${this.deploymentCount}
  ConfigMaps:   ${this.configMapCount}
  Secrets:      ${this.secretCount}

Resource Quota:  ${this.resourceQuota ? this.resourceQuota.metadata.name : '<none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class HorizontalPodAutoscaler extends ResourceBase {
  constructor(metadata = {}) {
    super('HorizontalPodAutoscaler', metadata);
    this.spec = {
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: metadata.targetKind || 'Deployment',
        name: metadata.targetName || metadata.name
      },
      minReplicas: metadata.minReplicas || 1,
      maxReplicas: metadata.maxReplicas || 10,
      metrics: metadata.metrics || [{
        type: 'Resource',
        resource: {
          name: 'cpu',
          target: { type: 'Utilization', averageUtilization: 50 },
        },
      }],
      behavior: {
        scaleUp: {
          stabilizationWindowSeconds: metadata.scaleUpStabilization || 0,
          policies: [
            { type: 'Percent', value: 100, periodSeconds: 15 },
            { type: 'Pods', value: 4, periodSeconds: 15 },
          ],
          selectPolicy: 'Max',
        },
        scaleDown: {
          stabilizationWindowSeconds: metadata.scaleDownStabilization || 300,
          policies: [
            { type: 'Percent', value: 100, periodSeconds: 15 },
          ],
          selectPolicy: 'Max',
        },
      }
    };
    this.currentReplicas = metadata.currentReplicas || this.spec.minReplicas;
    this.desiredReplicas = this.currentReplicas;
    this.currentMetrics = { cpu: 0 };
    this.targetDeployment = null;
    this.lastScaleTime = null;
    this.scaleUpCooldown = 0;
    this.scaleDownCooldown = 0;
    const conditionTime = new Date().toISOString();
    this.conditions = [
      { type: 'AbleToScale', status: 'True', reason: 'ReadyForNewScale', lastTransitionTime: conditionTime },
      { type: 'ScalingActive', status: 'True', reason: 'ValidMetricFound', lastTransitionTime: conditionTime },
    ];
    this.setStatus('Active');
  }

  setTargetDeployment(deployment) {
    this.targetDeployment = deployment;
  }

  _calculateDesiredReplicas(currentCpuPercent, targetCpuPercent) {
    const ratio = currentCpuPercent / targetCpuPercent;
    return Math.ceil(this.currentReplicas * ratio);
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    if (this.scaleUpCooldown > 0) this.scaleUpCooldown -= deltaTime;
    if (this.scaleDownCooldown > 0) this.scaleDownCooldown -= deltaTime;

    if (!this.targetDeployment) return;

    const pods = this.targetDeployment.replicaSets
      ? this.targetDeployment.replicaSets.flatMap(rs => rs.pods || [])
      : [];

    if (pods.length === 0) return;

    const runningPods = pods.filter(p => p.phase === 'Running');
    if (runningPods.length === 0) return;

    const avgCpu = runningPods.reduce((sum, p) => sum + (p.cpuUsage || 0), 0) / runningPods.length;
    const cpuLimit = runningPods[0]?.cpuLimit || 0.5;
    this.currentMetrics.cpu = cpuLimit > 0 ? (avgCpu / cpuLimit) * 100 : 0;

    const targetCpu = this.spec.metrics[0]?.resource?.target?.averageUtilization || 50;
    this.desiredReplicas = this._calculateDesiredReplicas(this.currentMetrics.cpu, targetCpu);
    this.desiredReplicas = Math.max(this.spec.minReplicas, Math.min(this.spec.maxReplicas, this.desiredReplicas));

    if (this.desiredReplicas > this.currentReplicas && this.scaleUpCooldown <= 0) {
      const scaleTo = Math.min(this.desiredReplicas, this.currentReplicas + 4);
      this.addEvent('Normal', 'SuccessfulRescale', `New size: ${scaleTo}; reason: cpu resource utilization (percentage of request) above target`);
      this.currentReplicas = scaleTo;
      this.targetDeployment.scale(scaleTo);
      this.lastScaleTime = new Date().toISOString();
      this.scaleUpCooldown = this.spec.behavior.scaleUp.stabilizationWindowSeconds || 15;
    } else if (this.desiredReplicas < this.currentReplicas && this.scaleDownCooldown <= 0) {
      const scaleTo = Math.max(this.desiredReplicas, Math.ceil(this.currentReplicas * 0.5));
      this.addEvent('Normal', 'SuccessfulRescale', `New size: ${scaleTo}; reason: cpu resource utilization (percentage of request) below target`);
      this.currentReplicas = scaleTo;
      this.targetDeployment.scale(scaleTo);
      this.lastScaleTime = new Date().toISOString();
      this.scaleDownCooldown = this.spec.behavior.scaleDown.stabilizationWindowSeconds || 300;
    }
  }

  getShape() { return 'gauge'; }
  getColor() { return '#14b8a6'; }

  toYAML() {
    return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
  scaleTargetRef:
    apiVersion: ${this.spec.scaleTargetRef.apiVersion}
    kind: ${this.spec.scaleTargetRef.kind}
    name: ${this.spec.scaleTargetRef.name}
  minReplicas: ${this.spec.minReplicas}
  maxReplicas: ${this.spec.maxReplicas}
  metrics:
${this.spec.metrics.map(m => `  - type: ${m.type}
    resource:
      name: ${m.resource.name}
      target:
        type: ${m.resource.target.type}
        averageUtilization: ${m.resource.target.averageUtilization}`).join('\n')}
status:
  currentReplicas: ${this.currentReplicas}
  desiredReplicas: ${this.desiredReplicas}
  currentMetrics:
  - type: Resource
    resource:
      name: cpu
      current:
        averageUtilization: ${Math.round(this.currentMetrics.cpu)}`;
  }

  toDescribe() {
    const targetCpu = this.spec.metrics[0]?.resource?.target?.averageUtilization || 50;
    return `Name:                                  ${this.metadata.name}
Namespace:                             ${this.metadata.namespace}
Reference:                             ${this.spec.scaleTargetRef.kind}/${this.spec.scaleTargetRef.name}
Metrics:                               ( current / target )
  resource cpu on pods (as a percentage of request):  ${Math.round(this.currentMetrics.cpu)}% / ${targetCpu}%
Min replicas:                          ${this.spec.minReplicas}
Max replicas:                          ${this.spec.maxReplicas}
${this.spec.scaleTargetRef.kind}/${this.spec.scaleTargetRef.name} replicas: ${this.currentReplicas}
Conditions:
${this.conditions.map(c => `  Type: ${c.type}  Status: ${c.status}  Reason: ${c.reason}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class ResourceQuota extends ResourceBase {
  constructor(metadata = {}) {
    super('ResourceQuota', metadata);
    this.spec = {
      hard: {
        cpu: metadata.cpuLimit || '4',
        memory: metadata.memoryLimit || '8Gi',
        pods: metadata.podLimit || '20',
        services: metadata.serviceLimit || '10',
        configmaps: metadata.configmapLimit || '20',
        secrets: metadata.secretLimit || '20',
        'requests.cpu': metadata.requestsCpu || '2',
        'requests.memory': metadata.requestsMemory || '4Gi',
        'limits.cpu': metadata.limitsCpu || '4',
        'limits.memory': metadata.limitsMemory || '8Gi'
      }
    };
    this.used = {
      cpu: '0',
      memory: '0',
      pods: '0',
      services: '0',
      configmaps: '0',
      secrets: '0',
      'requests.cpu': '0',
      'requests.memory': '0',
      'limits.cpu': '0',
      'limits.memory': '0'
    };
    this.targetNamespace = null;
    this.setStatus('Active');
  }

  setTargetNamespace(ns) {
    this.targetNamespace = ns;
    ns.resourceQuota = this;
  }

  updateUsage(resources) {
    const ns = this.metadata.namespace;
    const nsResources = resources.filter(r => r.metadata.namespace === ns);

    this.used.pods = String(nsResources.filter(r => r.kind === 'Pod').length);
    this.used.services = String(nsResources.filter(r => r.kind === 'Service').length);
    this.used.configmaps = String(nsResources.filter(r => r.kind === 'ConfigMap').length);
    this.used.secrets = String(nsResources.filter(r => r.kind === 'Secret').length);

    const pods = nsResources.filter(r => r.kind === 'Pod' && r.phase === 'Running');
    let totalCpuRequests = 0;
    let totalMemoryRequests = 0;
    let totalCpuLimits = 0;
    let totalMemoryLimits = 0;

    for (const pod of pods) {
      for (const c of pod.spec.containers) {
        if (c.resources?.requests?.cpu) totalCpuRequests += this._parseCpu(c.resources.requests.cpu);
        if (c.resources?.requests?.memory) totalMemoryRequests += this._parseMemory(c.resources.requests.memory);
        if (c.resources?.limits?.cpu) totalCpuLimits += this._parseCpu(c.resources.limits.cpu);
        if (c.resources?.limits?.memory) totalMemoryLimits += this._parseMemory(c.resources.limits.memory);
      }
    }

    this.used['requests.cpu'] = `${totalCpuRequests}m`;
    this.used['requests.memory'] = `${Math.floor(totalMemoryRequests / (1024 ** 2))}Mi`;
    this.used['limits.cpu'] = `${totalCpuLimits}m`;
    this.used['limits.memory'] = `${Math.floor(totalMemoryLimits / (1024 ** 2))}Mi`;
  }

  _parseCpu(cpu) {
    if (typeof cpu === 'number') return cpu;
    if (cpu.endsWith('m')) return parseInt(cpu);
    return parseFloat(cpu) * 1000;
  }

  _parseMemory(mem) {
    if (typeof mem === 'number') return mem;
    const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3 };
    for (const [suffix, multiplier] of Object.entries(units)) {
      if (mem.endsWith(suffix)) return parseInt(mem) * multiplier;
    }
    return parseInt(mem);
  }

  isExceeded(resourceType) {
    const used = parseInt(this.used[resourceType]) || 0;
    const hard = parseInt(this.spec.hard[resourceType]) || 0;
    return used >= hard;
  }

  getUsagePercent(resourceType) {
    const used = parseInt(this.used[resourceType]) || 0;
    const hard = parseInt(this.spec.hard[resourceType]) || 0;
    return hard > 0 ? (used / hard) * 100 : 0;
  }


  getShape() { return 'barrier'; }
  getColor() { return '#ca8a04'; }

  toYAML() {
    return `apiVersion: v1
kind: ResourceQuota
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
  hard:
${Object.entries(this.spec.hard).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
status:
  hard:
${Object.entries(this.spec.hard).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
  used:
${Object.entries(this.used).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Namespace:    ${this.metadata.namespace}
Resource      Used    Hard
--------      ----    ----
${Object.keys(this.spec.hard).map(k => `${k.padEnd(14)} ${String(this.used[k]).padEnd(7)} ${this.spec.hard[k]}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class PodDisruptionBudget extends ResourceBase {
  constructor(metadata = {}) {
    super('PodDisruptionBudget', metadata);
    this.apiVersion = 'policy/v1';
    this.spec = {
      selector: { matchLabels: metadata.matchLabels || {} },
      minAvailable: metadata.minAvailable !== undefined ? metadata.minAvailable : null,
      maxUnavailable: metadata.maxUnavailable !== undefined ? metadata.maxUnavailable : (metadata.minAvailable !== undefined ? null : 1),
      unhealthyPodEvictionPolicy: metadata.unhealthyPodEvictionPolicy || 'IfHealthy',
    };
    this.currentHealthy = 0;
    this.desiredHealthy = 0;
    this.disruptionsAllowed = 0;
    this.expectedPods = 0;
    this.observedGeneration = 1;
    this.setStatus('Active');
  }

  updateStatus(matchingPods) {
    const running = matchingPods.filter(p => p.phase === 'Running' || p.status?.phase === 'Running');
    this.expectedPods = matchingPods.length;
    this.currentHealthy = running.length;

    if (this.spec.minAvailable !== null) {
      const minAvail = typeof this.spec.minAvailable === 'string' && this.spec.minAvailable.endsWith('%')
        ? Math.ceil(this.expectedPods * parseInt(this.spec.minAvailable) / 100)
        : parseInt(this.spec.minAvailable);
      this.desiredHealthy = minAvail;
      this.disruptionsAllowed = Math.max(0, this.currentHealthy - minAvail);
    } else if (this.spec.maxUnavailable !== null) {
      const maxUnavail = typeof this.spec.maxUnavailable === 'string' && this.spec.maxUnavailable.endsWith('%')
        ? Math.ceil(this.expectedPods * parseInt(this.spec.maxUnavailable) / 100)
        : parseInt(this.spec.maxUnavailable);
      this.desiredHealthy = Math.max(0, this.expectedPods - maxUnavail);
      this.disruptionsAllowed = Math.max(0, maxUnavail - (this.expectedPods - this.currentHealthy));
    }
  }

  canDisrupt() {
    return this.disruptionsAllowed > 0;
  }


  getShape() { return 'shield-check'; }
  getColor() { return '#0ea5e9'; }

  toYAML() {
    const specLines = [];
    if (this.spec.minAvailable !== null) specLines.push(`  minAvailable: ${this.spec.minAvailable}`);
    if (this.spec.maxUnavailable !== null) specLines.push(`  maxUnavailable: ${this.spec.maxUnavailable}`);
    return `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
${specLines.join('\n')}
  selector:
    matchLabels:
${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `      ${k}: "${v}"`).join('\n')}
status:
  currentHealthy: ${this.currentHealthy}
  desiredHealthy: ${this.desiredHealthy}
  disruptionsAllowed: ${this.disruptionsAllowed}
  expectedPods: ${this.expectedPods}
  observedGeneration: ${this.observedGeneration}`;
  }

  toDescribe() {
    const specStr = this.spec.minAvailable !== null
      ? `Min Available:         ${this.spec.minAvailable}`
      : `Max Unavailable:       ${this.spec.maxUnavailable}`;
    return `Name:                  ${this.metadata.name}
Namespace:             ${this.metadata.namespace}
${specStr}
Selector:              ${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(', ')}
Status:
  Allowed Disruptions: ${this.disruptionsAllowed}
  Current Healthy:     ${this.currentHealthy}
  Desired Healthy:     ${this.desiredHealthy}
  Total:               ${this.expectedPods}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}
