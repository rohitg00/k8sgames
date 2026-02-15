import { ResourceBase } from './ResourceBase.js';

export class Pod extends ResourceBase {
  constructor(metadata = {}) {
    super('Pod', metadata);
    this.spec = {
      containers: metadata.containers || [{ name: 'main', image: 'nginx:latest', resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '256Mi' } } }],
      restartPolicy: metadata.restartPolicy || 'Always',
      nodeName: metadata.nodeName || null,
      serviceAccountName: metadata.serviceAccountName || 'default',
      terminationGracePeriodSeconds: 30
    };
    this.phase = 'Pending';
    this.conditions = [];
    this.containerStatuses = this.spec.containers.map(c => ({
      name: c.name,
      image: c.image,
      ready: false,
      started: false,
      restartCount: 0,
      state: { waiting: { reason: 'ContainerCreating' } },
      lastState: {}
    }));
    this.cpuUsage = 0;
    this.memoryUsage = 0;
    this.cpuLimit = this._parseCpu(this.spec.containers[0]?.resources?.limits?.cpu || '500m');
    this.memoryLimit = this._parseMemory(this.spec.containers[0]?.resources?.limits?.memory || '256Mi');
    this.crashLoopBackoffTimer = 0;
    this.crashLoopBackoffDelay = 10;
    this.crashLoopCount = 0;
    this.oomKillCount = 0;
    this.pendingDuration = 0;
    this.containerCreatingDuration = 0;
    this.startupTime = 1 + Math.random() * 3;
    this.ip = null;
    this.qosClass = this._calculateQoS();
    this.setStatus('Pending');
  }

  _parseCpu(cpu) {
    if (typeof cpu === 'number') return cpu;
    if (cpu.endsWith('m')) return parseInt(cpu) / 1000;
    return parseFloat(cpu);
  }

  _parseMemory(mem) {
    if (typeof mem === 'number') return mem;
    const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3 };
    for (const [suffix, multiplier] of Object.entries(units)) {
      if (mem.endsWith(suffix)) return parseInt(mem) * multiplier;
    }
    return parseInt(mem);
  }

  _calculateQoS() {
    const containers = this.spec.containers;
    const allGuaranteed = containers.every(c => {
      const r = c.resources;
      return r?.requests?.cpu && r?.requests?.memory && r?.limits?.cpu && r?.limits?.memory &&
             r.requests.cpu === r.limits.cpu && r.requests.memory === r.limits.memory;
    });
    if (allGuaranteed) return 'Guaranteed';
    const anyRequest = containers.some(c => c.resources?.requests?.cpu || c.resources?.requests?.memory);
    return anyRequest ? 'Burstable' : 'BestEffort';
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    if (this.phase === 'Pending') {
      this.pendingDuration += deltaTime;
      if (this.pendingDuration >= 0.5 && this.spec.nodeName) {
        this.phase = 'ContainerCreating';
        this.containerStatuses.forEach(cs => {
          cs.state = { waiting: { reason: 'ContainerCreating' } };
        });
        this.addEvent('Normal', 'Scheduled', `Successfully assigned ${this.metadata.namespace}/${this.metadata.name} to ${this.spec.nodeName}`);
        this.addEvent('Normal', 'Pulling', `Pulling image "${this.spec.containers[0].image}"`);
      }
    }

    if (this.phase === 'ContainerCreating') {
      this.containerCreatingDuration += deltaTime;
      if (this.containerCreatingDuration >= this.startupTime) {
        this.phase = 'Running';
        this.ip = `10.244.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
        this.containerStatuses.forEach(cs => {
          cs.ready = true;
          cs.started = true;
          cs.state = { running: { startedAt: new Date().toISOString() } };
        });
        this.conditions = [
          { type: 'Initialized', status: 'True', lastTransitionTime: new Date().toISOString() },
          { type: 'Ready', status: 'True', lastTransitionTime: new Date().toISOString() },
          { type: 'ContainersReady', status: 'True', lastTransitionTime: new Date().toISOString() },
          { type: 'PodScheduled', status: 'True', lastTransitionTime: new Date().toISOString() }
        ];
        this.addEvent('Normal', 'Pulled', `Successfully pulled image "${this.spec.containers[0].image}"`);
        this.addEvent('Normal', 'Created', `Created container ${this.spec.containers[0].name}`);
        this.addEvent('Normal', 'Started', `Started container ${this.spec.containers[0].name}`);
        this.setStatus('Running');
      }
    }

    if (this.phase === 'Running') {
      this.cpuUsage = Math.min(this.cpuLimit, Math.max(0, this.cpuUsage + (Math.random() - 0.5) * 0.05));
      this.memoryUsage = Math.min(this.memoryLimit, Math.max(0, this.memoryUsage + (Math.random() - 0.3) * this.memoryLimit * 0.02));

      if (this.memoryUsage >= this.memoryLimit * 0.98) {
        this._triggerOOMKill();
      }
    }

    if (this.phase === 'CrashLoopBackOff') {
      this.crashLoopBackoffTimer -= deltaTime;
      if (this.crashLoopBackoffTimer <= 0) {
        this.phase = 'ContainerCreating';
        this.containerCreatingDuration = 0;
        this.startupTime = 0.5 + Math.random();
        this.containerStatuses.forEach(cs => {
          cs.state = { waiting: { reason: 'ContainerCreating' } };
        });
      }
    }
  }

  _triggerOOMKill() {
    this.oomKillCount++;
    this.containerStatuses.forEach(cs => {
      cs.restartCount++;
      cs.ready = false;
      cs.started = false;
      cs.lastState = { terminated: { exitCode: 137, reason: 'OOMKilled', finishedAt: new Date().toISOString() } };
      cs.state = { waiting: { reason: 'CrashLoopBackOff' } };
    });
    this.addEvent('Warning', 'OOMKilled', `Container ${this.spec.containers[0].name} was OOM killed`);
    this.memoryUsage = 0;
    this.cpuUsage = 0;
    this._enterCrashLoop();
  }

  triggerCrash(reason = 'Error', exitCode = 1) {
    this.containerStatuses.forEach(cs => {
      cs.restartCount++;
      cs.ready = false;
      cs.started = false;
      cs.lastState = { terminated: { exitCode, reason, finishedAt: new Date().toISOString() } };
      cs.state = { waiting: { reason: 'CrashLoopBackOff' } };
    });
    this.addEvent('Warning', 'BackOff', `Back-off restarting failed container ${this.spec.containers[0].name}`);
    this._enterCrashLoop();
  }

  _enterCrashLoop() {
    this.phase = 'CrashLoopBackOff';
    this.crashLoopCount++;
    this.crashLoopBackoffDelay = Math.min(300, 10 * Math.pow(2, this.crashLoopCount - 1));
    this.crashLoopBackoffTimer = this.crashLoopBackoffDelay;
    this.setStatus('CrashLoopBackOff');
    this.conditions = this.conditions.map(c =>
      c.type === 'Ready' ? { ...c, status: 'False', lastTransitionTime: new Date().toISOString() } : c
    );
  }

  terminate(reason = 'Terminated') {
    this.phase = reason === 'Completed' ? 'Succeeded' : 'Failed';
    this.containerStatuses.forEach(cs => {
      cs.ready = false;
      cs.started = false;
      cs.state = { terminated: { exitCode: reason === 'Completed' ? 0 : 1, reason, finishedAt: new Date().toISOString() } };
    });
    this.setStatus(this.phase);
    this.addEvent('Normal', 'Killing', `Stopping container ${this.spec.containers[0].name}`);
  }

  isReady() {
    return this.containerStatuses.every(cs => cs.ready);
  }

  getRestartCount() {
    return this.containerStatuses.reduce((sum, cs) => sum + cs.restartCount, 0);
  }

  getShape() { return 'hexagon'; }
  getColor() { return '#326CE5'; }

  toYAML() {
    return `apiVersion: v1
kind: Pod
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
spec:
  containers:
${this.spec.containers.map(c => `  - name: ${c.name}
    image: ${c.image}
    resources:
      requests:
        cpu: "${c.resources?.requests?.cpu || '100m'}"
        memory: "${c.resources?.requests?.memory || '128Mi'}"
      limits:
        cpu: "${c.resources?.limits?.cpu || '500m'}"
        memory: "${c.resources?.limits?.memory || '256Mi'}"`).join('\n')}
  restartPolicy: ${this.spec.restartPolicy}
  nodeName: ${this.spec.nodeName || '<none>'}
status:
  phase: ${this.phase}
  podIP: ${this.ip || '<none>'}
  qosClass: ${this.qosClass}`;
  }

  toDescribe() {
    const cs = this.containerStatuses[0];
    return `Name:         ${this.metadata.name}
Namespace:    ${this.metadata.namespace}
Node:         ${this.spec.nodeName || '<none>'}
Status:       ${this.phase}
IP:           ${this.ip || '<none>'}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ')}
Containers:
${this.containerStatuses.map(cs => `  ${cs.name}:
    Image:          ${cs.image}
    State:          ${Object.keys(cs.state)[0]}
    Ready:          ${cs.ready}
    Restart Count:  ${cs.restartCount}`).join('\n')}
Conditions:
${this.conditions.map(c => `  Type: ${c.type}  Status: ${c.status}`).join('\n')}
QoS Class:    ${this.qosClass}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class Deployment extends ResourceBase {
  constructor(metadata = {}) {
    super('Deployment', metadata);
    this.spec = {
      replicas: metadata.replicas || 3,
      selector: { matchLabels: metadata.matchLabels || { app: metadata.name } },
      strategy: {
        type: metadata.strategyType || 'RollingUpdate',
        rollingUpdate: {
          maxSurge: metadata.maxSurge || 1,
          maxUnavailable: metadata.maxUnavailable || 0
        }
      },
      template: {
        metadata: { labels: metadata.matchLabels || { app: metadata.name } },
        spec: { containers: metadata.containers || [{ name: 'main', image: 'nginx:latest', resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '256Mi' } } }] }
      },
      revisionHistoryLimit: 10
    };
    this.replicaSets = [];
    this.revision = 1;
    this.revisionHistory = [];
    this.availableReplicas = 0;
    this.readyReplicas = 0;
    this.updatedReplicas = 0;
    this.isRollingOut = false;
    this.rolloutProgress = 0;
    this.conditions = [
      { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', lastTransitionTime: new Date().toISOString() },
      { type: 'Progressing', status: 'True', reason: 'NewReplicaSetAvailable', lastTransitionTime: new Date().toISOString() }
    ];
    this.setStatus('Available');
  }

  getCurrentReplicaSet() {
    return this.replicaSets.find(rs => rs.metadata.labels['pod-template-hash'] === `rev-${this.revision}`);
  }

  addReplicaSet(rs) {
    this.replicaSets.push(rs);
    rs.ownerReferences.push({ kind: 'Deployment', name: this.metadata.name, uid: this.uid });
  }

  triggerRollingUpdate(newImage) {
    this.isRollingOut = true;
    this.rolloutProgress = 0;
    this.revision++;
    this.spec.template.spec.containers[0].image = newImage;
    this.revisionHistory.push({
      revision: this.revision,
      image: newImage,
      timestamp: new Date().toISOString()
    });
    if (this.revisionHistory.length > this.spec.revisionHistoryLimit) {
      this.revisionHistory.shift();
    }
    this.addEvent('Normal', 'ScalingReplicaSet', `Scaled up new replica set to ${this.spec.strategy.rollingUpdate.maxSurge}`);
    this.conditions = this.conditions.map(c =>
      c.type === 'Progressing' ? { ...c, status: 'True', reason: 'ReplicaSetUpdated', lastTransitionTime: new Date().toISOString() } : c
    );
    this.setStatus('Progressing');
    return `rev-${this.revision}`;
  }

  rollback(toRevision) {
    const target = this.revisionHistory.find(r => r.revision === toRevision);
    if (!target) return false;
    this.addEvent('Normal', 'DeploymentRollback', `Rolled back deployment "${this.metadata.name}" to revision ${toRevision}`);
    return this.triggerRollingUpdate(target.image);
  }

  scale(replicas) {
    const old = this.spec.replicas;
    this.spec.replicas = replicas;
    this.addEvent('Normal', 'ScalingReplicaSet', `Scaled replica set from ${old} to ${replicas}`);
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    if (this.isRollingOut) {
      this.rolloutProgress += deltaTime * 0.3;
      if (this.rolloutProgress >= 1) {
        this.isRollingOut = false;
        this.rolloutProgress = 1;
        this.addEvent('Normal', 'ScalingReplicaSet', `Scaled down old replica set to 0`);
        this.setStatus('Available');
      }
    }

    this.readyReplicas = 0;
    this.availableReplicas = 0;
    this.updatedReplicas = 0;

    for (const rs of this.replicaSets) {
      if (rs.metadata.labels['pod-template-hash'] === `rev-${this.revision}`) {
        this.updatedReplicas += rs.readyReplicas || 0;
      }
      this.readyReplicas += rs.readyReplicas || 0;
      this.availableReplicas += rs.availableReplicas || 0;
    }
  }

  getShape() { return 'rounded-rect'; }
  getColor() { return '#f97316'; }

  toYAML() {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
spec:
  replicas: ${this.spec.replicas}
  selector:
    matchLabels:
${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `      ${k}: "${v}"`).join('\n')}
  strategy:
    type: ${this.spec.strategy.type}
    rollingUpdate:
      maxSurge: ${this.spec.strategy.rollingUpdate.maxSurge}
      maxUnavailable: ${this.spec.strategy.rollingUpdate.maxUnavailable}
  template:
    spec:
      containers:
${this.spec.template.spec.containers.map(c => `      - name: ${c.name}
        image: ${c.image}`).join('\n')}
status:
  replicas: ${this.spec.replicas}
  readyReplicas: ${this.readyReplicas}
  availableReplicas: ${this.availableReplicas}
  updatedReplicas: ${this.updatedReplicas}
  conditions:
${this.conditions.map(c => `  - type: ${c.type}
    status: "${c.status}"
    reason: ${c.reason}`).join('\n')}`;
  }

  toDescribe() {
    return `Name:                   ${this.metadata.name}
Namespace:              ${this.metadata.namespace}
Selector:               ${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}
Replicas:               ${this.spec.replicas} desired | ${this.updatedReplicas} updated | ${this.readyReplicas + this.updatedReplicas} total | ${this.availableReplicas} available
StrategyType:           ${this.spec.strategy.type}
MinReadySeconds:        0
RollingUpdateStrategy:  ${this.spec.strategy.rollingUpdate.maxUnavailable} max unavailable, ${this.spec.strategy.rollingUpdate.maxSurge} max surge
Conditions:
${this.conditions.map(c => `  Type: ${c.type}  Status: ${c.status}  Reason: ${c.reason}`).join('\n')}
OldReplicaSets:         ${this.replicaSets.filter(rs => rs.metadata.labels['pod-template-hash'] !== `rev-${this.revision}`).map(rs => rs.metadata.name).join(', ') || '<none>'}
NewReplicaSet:          ${this.replicaSets.filter(rs => rs.metadata.labels['pod-template-hash'] === `rev-${this.revision}`).map(rs => rs.metadata.name).join(', ') || '<none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class ReplicaSet extends ResourceBase {
  constructor(metadata = {}) {
    super('ReplicaSet', metadata);
    this.spec = {
      replicas: metadata.replicas || 3,
      selector: { matchLabels: metadata.matchLabels || { app: metadata.name } },
      template: {
        metadata: { labels: metadata.matchLabels || { app: metadata.name } },
        spec: { containers: metadata.containers || [{ name: 'main', image: 'nginx:latest' }] }
      }
    };
    this.pods = [];
    this.readyReplicas = 0;
    this.availableReplicas = 0;
    this.fullyLabeledReplicas = 0;
    this.setStatus('Active');
  }

  addPod(pod) {
    this.pods.push(pod);
    pod.ownerReferences.push({ kind: 'ReplicaSet', name: this.metadata.name, uid: this.uid });
  }

  removePod(pod) {
    const idx = this.pods.indexOf(pod);
    if (idx !== -1) this.pods.splice(idx, 1);
  }

  matchesSelector(labels) {
    return Object.entries(this.spec.selector.matchLabels).every(([k, v]) => labels[k] === v);
  }

  tick(deltaTime) {
    super.tick(deltaTime);
    this.readyReplicas = this.pods.filter(p => p.isReady()).length;
    this.availableReplicas = this.readyReplicas;
    this.fullyLabeledReplicas = this.pods.length;
  }

  getDesiredPodCount() {
    return this.spec.replicas;
  }

  getShape() { return 'stacked-rects'; }
  getColor() { return '#eab308'; }

  toYAML() {
    return `apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
spec:
  replicas: ${this.spec.replicas}
  selector:
    matchLabels:
${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `      ${k}: "${v}"`).join('\n')}
status:
  replicas: ${this.pods.length}
  readyReplicas: ${this.readyReplicas}
  availableReplicas: ${this.availableReplicas}`;
  }

  toDescribe() {
    return `Name:           ${this.metadata.name}
Namespace:      ${this.metadata.namespace}
Selector:       ${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}
Replicas:       ${this.spec.replicas} desired | ${this.pods.length} current | ${this.readyReplicas} ready
Pods Status:    ${this.readyReplicas} Running / 0 Waiting / ${this.pods.filter(p => p.phase === 'Failed').length} Failed
Pod Template:
  Containers:
${this.spec.template.spec.containers.map(c => `   ${c.name}:
    Image:  ${c.image}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class StatefulSet extends ResourceBase {
  constructor(metadata = {}) {
    super('StatefulSet', metadata);
    this.spec = {
      replicas: metadata.replicas || 3,
      selector: { matchLabels: metadata.matchLabels || { app: metadata.name } },
      serviceName: metadata.serviceName || `${metadata.name}-headless`,
      podManagementPolicy: metadata.podManagementPolicy || 'OrderedReady',
      updateStrategy: { type: 'RollingUpdate', rollingUpdate: { partition: 0 } },
      template: {
        spec: { containers: metadata.containers || [{ name: 'main', image: 'postgres:15' }] }
      },
      volumeClaimTemplates: metadata.volumeClaimTemplates || [
        { metadata: { name: 'data' }, spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '10Gi' } } } }
      ]
    };
    this.pods = [];
    this.readyReplicas = 0;
    this.currentReplicas = 0;
    this.updatedReplicas = 0;
    this.currentRevision = `${metadata.name}-rev1`;
    this.updateRevision = `${metadata.name}-rev1`;
    this.deployingOrdinal = 0;
    this.isDeploying = false;
    this.setStatus('Active');
  }

  getStableNetworkId(ordinal) {
    return `${this.metadata.name}-${ordinal}.${this.spec.serviceName}.${this.metadata.namespace}.svc.cluster.local`;
  }

  addPod(pod, ordinal) {
    pod.metadata.name = `${this.metadata.name}-${ordinal}`;
    pod.metadata.labels['statefulset.kubernetes.io/pod-name'] = pod.metadata.name;
    pod.metadata.labels['controller-revision-hash'] = this.currentRevision;
    pod.hostname = pod.metadata.name;
    pod.subdomain = this.spec.serviceName;
    pod.ownerReferences.push({ kind: 'StatefulSet', name: this.metadata.name, uid: this.uid });
    this.pods.push(pod);
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    this.readyReplicas = this.pods.filter(p => p.isReady()).length;
    this.currentReplicas = this.pods.length;
    this.updatedReplicas = this.pods.filter(p =>
      p.metadata.labels['controller-revision-hash'] === this.updateRevision
    ).length;

    if (this.isDeploying && this.spec.podManagementPolicy === 'OrderedReady') {
      if (this.deployingOrdinal < this.spec.replicas) {
        const currentPod = this.pods.find(p => p.metadata.name === `${this.metadata.name}-${this.deployingOrdinal}`);
        if (currentPod && currentPod.isReady()) {
          this.deployingOrdinal++;
          if (this.deployingOrdinal >= this.spec.replicas) {
            this.isDeploying = false;
            this.addEvent('Normal', 'SuccessfulCreate', `All replicas are ready`);
          }
        }
      }
    }
  }

  scale(replicas) {
    const old = this.spec.replicas;
    this.spec.replicas = replicas;
    this.addEvent('Normal', 'SuccessfulScale', `Scaled statefulset from ${old} to ${replicas}`);
  }

  getShape() { return 'numbered-hexagons'; }
  getColor() { return '#a855f7'; }

  toYAML() {
    return `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
  replicas: ${this.spec.replicas}
  serviceName: ${this.spec.serviceName}
  podManagementPolicy: ${this.spec.podManagementPolicy}
  selector:
    matchLabels:
${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `      ${k}: "${v}"`).join('\n')}
  volumeClaimTemplates:
${this.spec.volumeClaimTemplates.map(v => `  - metadata:
      name: ${v.metadata.name}
    spec:
      accessModes: [${v.spec.accessModes.map(a => `"${a}"`).join(', ')}]
      resources:
        requests:
          storage: ${v.spec.resources.requests.storage}`).join('\n')}
status:
  replicas: ${this.currentReplicas}
  readyReplicas: ${this.readyReplicas}
  currentRevision: ${this.currentRevision}
  updateRevision: ${this.updateRevision}`;
  }

  toDescribe() {
    return `Name:               ${this.metadata.name}
Namespace:          ${this.metadata.namespace}
Selector:           ${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}
Replicas:           ${this.spec.replicas} desired | ${this.currentReplicas} total
Update Strategy:    ${this.spec.updateStrategy.type}
Pods Status:        ${this.readyReplicas} Running / ${this.pods.filter(p => p.phase === 'Pending').length} Waiting / ${this.pods.filter(p => p.phase === 'Failed').length} Failed
Pod Template:
  Containers:
${this.spec.template.spec.containers.map(c => `   ${c.name}:
    Image:  ${c.image}`).join('\n')}
Volume Claims:
${this.spec.volumeClaimTemplates.map(v => `  Name:  ${v.metadata.name}
  Mode:  ${v.spec.accessModes.join(', ')}
  Size:  ${v.spec.resources.requests.storage}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class DaemonSet extends ResourceBase {
  constructor(metadata = {}) {
    super('DaemonSet', metadata);
    this.spec = {
      selector: { matchLabels: metadata.matchLabels || { app: metadata.name } },
      template: {
        metadata: { labels: metadata.matchLabels || { app: metadata.name } },
        spec: {
          containers: metadata.containers || [{ name: 'main', image: 'fluentd:latest' }],
          nodeSelector: metadata.nodeSelector || {},
          tolerations: metadata.tolerations || []
        }
      },
      updateStrategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 1 } }
    };
    this.pods = [];
    this.desiredNumberScheduled = 0;
    this.currentNumberScheduled = 0;
    this.numberReady = 0;
    this.numberAvailable = 0;
    this.numberMisscheduled = 0;
    this.updatedNumberScheduled = 0;
    this.nodesPodMap = new Map();
    this.setStatus('Active');
  }

  shouldRunOnNode(node) {
    const ns = this.spec.template.spec.nodeSelector;
    if (Object.keys(ns).length > 0) {
      return Object.entries(ns).every(([k, v]) => node.metadata.labels[k] === v);
    }
    return true;
  }

  addPod(pod, nodeName) {
    pod.spec.nodeName = nodeName;
    pod.ownerReferences.push({ kind: 'DaemonSet', name: this.metadata.name, uid: this.uid });
    this.pods.push(pod);
    this.nodesPodMap.set(nodeName, pod);
  }

  removePodForNode(nodeName) {
    const pod = this.nodesPodMap.get(nodeName);
    if (pod) {
      this.pods = this.pods.filter(p => p !== pod);
      this.nodesPodMap.delete(nodeName);
    }
    return pod;
  }

  tick(deltaTime) {
    super.tick(deltaTime);
    this.currentNumberScheduled = this.pods.length;
    this.numberReady = this.pods.filter(p => p.isReady()).length;
    this.numberAvailable = this.numberReady;
    this.updatedNumberScheduled = this.currentNumberScheduled;
  }

  getShape() { return 'star'; }
  getColor() { return '#06b6d4'; }

  toYAML() {
    return `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
  selector:
    matchLabels:
${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `      ${k}: "${v}"`).join('\n')}
  updateStrategy:
    type: ${this.spec.updateStrategy.type}
status:
  desiredNumberScheduled: ${this.desiredNumberScheduled}
  currentNumberScheduled: ${this.currentNumberScheduled}
  numberReady: ${this.numberReady}
  numberAvailable: ${this.numberAvailable}`;
  }

  toDescribe() {
    return `Name:           ${this.metadata.name}
Namespace:      ${this.metadata.namespace}
Selector:       ${Object.entries(this.spec.selector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}
Node-Selector:  ${Object.entries(this.spec.template.spec.nodeSelector).map(([k, v]) => `${k}=${v}`).join(',') || '<none>'}
Desired Number of Nodes Scheduled: ${this.desiredNumberScheduled}
Current Number of Nodes Scheduled: ${this.currentNumberScheduled}
Number of Nodes Running at Least 1 Pod: ${this.currentNumberScheduled}
Number Ready:   ${this.numberReady}
Pod Template:
  Containers:
${this.spec.template.spec.containers.map(c => `   ${c.name}:
    Image:  ${c.image}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class Job extends ResourceBase {
  constructor(metadata = {}) {
    super('Job', metadata);
    this.spec = {
      completions: metadata.completions || 1,
      parallelism: metadata.parallelism || 1,
      backoffLimit: metadata.backoffLimit || 6,
      activeDeadlineSeconds: metadata.activeDeadlineSeconds || null,
      template: {
        spec: {
          containers: metadata.containers || [{ name: 'worker', image: 'busybox:latest' }],
          restartPolicy: 'Never'
        }
      }
    };
    this.pods = [];
    this.succeeded = 0;
    this.failed = 0;
    this.active = 0;
    this.startTime = new Date().toISOString();
    this.completionTime = null;
    this.elapsedTime = 0;
    this.isComplete = false;
    this.isFailed = false;
    this.setStatus('Active');
  }

  addPod(pod) {
    pod.spec.restartPolicy = 'Never';
    pod.ownerReferences.push({ kind: 'Job', name: this.metadata.name, uid: this.uid });
    this.pods.push(pod);
  }

  tick(deltaTime) {
    super.tick(deltaTime);
    if (this.isComplete || this.isFailed) return;

    this.elapsedTime += deltaTime;

    this.active = this.pods.filter(p => p.phase === 'Running' || p.phase === 'Pending' || p.phase === 'ContainerCreating').length;
    this.succeeded = this.pods.filter(p => p.phase === 'Succeeded').length;
    this.failed = this.pods.filter(p => p.phase === 'Failed').length;

    if (this.succeeded >= this.spec.completions) {
      this.isComplete = true;
      this.completionTime = new Date().toISOString();
      this.addEvent('Normal', 'Completed', `Job completed successfully`);
      this.setStatus('Complete');
    }

    if (this.failed >= this.spec.backoffLimit) {
      this.isFailed = true;
      this.addEvent('Warning', 'BackoffLimitExceeded', `Job has reached the specified backoff limit`);
      this.setStatus('Failed');
    }

    if (this.spec.activeDeadlineSeconds && this.elapsedTime >= this.spec.activeDeadlineSeconds) {
      this.isFailed = true;
      this.addEvent('Warning', 'DeadlineExceeded', `Job was active longer than specified deadline`);
      this.setStatus('Failed');
    }
  }

  getDuration() {
    return Math.floor(this.elapsedTime);
  }

  getShape() { return 'hourglass'; }
  getColor() { return '#d97706'; }

  toYAML() {
    return `apiVersion: batch/v1
kind: Job
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
  completions: ${this.spec.completions}
  parallelism: ${this.spec.parallelism}
  backoffLimit: ${this.spec.backoffLimit}
  template:
    spec:
      containers:
${this.spec.template.spec.containers.map(c => `      - name: ${c.name}
        image: ${c.image}`).join('\n')}
      restartPolicy: ${this.spec.template.spec.restartPolicy}
status:
  succeeded: ${this.succeeded}
  failed: ${this.failed}
  active: ${this.active}
  startTime: ${this.startTime}
  completionTime: ${this.completionTime || '<pending>'}`;
  }

  toDescribe() {
    return `Name:           ${this.metadata.name}
Namespace:      ${this.metadata.namespace}
Completions:    ${this.succeeded}/${this.spec.completions}
Parallelism:    ${this.spec.parallelism}
Backoff Limit:  ${this.spec.backoffLimit}
Start Time:     ${this.startTime}
Completed At:   ${this.completionTime || '<pending>'}
Duration:       ${this.getDuration()}s
Pods Statuses:  ${this.active} Active / ${this.succeeded} Succeeded / ${this.failed} Failed
Pod Template:
  Containers:
${this.spec.template.spec.containers.map(c => `   ${c.name}:
    Image:  ${c.image}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class CronJob extends ResourceBase {
  constructor(metadata = {}) {
    super('CronJob', metadata);
    this.spec = {
      schedule: metadata.schedule || '*/5 * * * *',
      concurrencyPolicy: metadata.concurrencyPolicy || 'Allow',
      suspend: false,
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 1,
      startingDeadlineSeconds: metadata.startingDeadlineSeconds || null,
      jobTemplate: {
        spec: {
          completions: metadata.completions || 1,
          parallelism: metadata.parallelism || 1,
          backoffLimit: metadata.backoffLimit || 6,
          template: {
            spec: {
              containers: metadata.containers || [{ name: 'cron-worker', image: 'busybox:latest' }],
              restartPolicy: 'OnFailure'
            }
          }
        }
      }
    };
    this.activeJobs = [];
    this.successfulJobs = [];
    this.failedJobs = [];
    this.lastScheduleTime = null;
    this.lastSuccessfulTime = null;
    this.elapsedSinceLastSchedule = 0;
    this.scheduleIntervalSeconds = this._parseSchedule(this.spec.schedule);
    this.setStatus('Active');
  }

  _parseSchedule(cron) {
    const parts = cron.split(' ');
    if (parts[0].startsWith('*/')) {
      const interval = parseInt(parts[0].substring(2));
      if (parts[1] === '*') return interval * 60;
      return interval * 3600;
    }
    if (parts[0] === '0' && parts[1] === '*') return 3600;
    if (parts[0] === '0' && parts[1] === '0') return 86400;
    return 300;
  }

  tick(deltaTime) {
    super.tick(deltaTime);
    if (this.spec.suspend) return;

    this.elapsedSinceLastSchedule += deltaTime;

    if (this.elapsedSinceLastSchedule >= this.scheduleIntervalSeconds) {
      this.elapsedSinceLastSchedule = 0;
      this._triggerJob();
    }

    for (const job of this.activeJobs) {
      if (job.isComplete) {
        this.successfulJobs.push(job);
        this.lastSuccessfulTime = new Date().toISOString();
        this.addEvent('Normal', 'SawCompletedJob', `Saw completed job: ${job.metadata.name}`);
      } else if (job.isFailed) {
        this.failedJobs.push(job);
        this.addEvent('Warning', 'SawFailedJob', `Saw failed job: ${job.metadata.name}`);
      }
    }

    this.activeJobs = this.activeJobs.filter(j => !j.isComplete && !j.isFailed);

    while (this.successfulJobs.length > this.spec.successfulJobsHistoryLimit) {
      this.successfulJobs.shift();
    }
    while (this.failedJobs.length > this.spec.failedJobsHistoryLimit) {
      this.failedJobs.shift();
    }
  }

  _triggerJob() {
    if (this.spec.concurrencyPolicy === 'Forbid' && this.activeJobs.length > 0) {
      this.addEvent('Normal', 'JobAlreadyActive', `Skipped scheduled job: concurrency policy Forbid`);
      return null;
    }

    if (this.spec.concurrencyPolicy === 'Replace' && this.activeJobs.length > 0) {
      this.activeJobs.forEach(j => {
        j.isFailed = true;
        j.setStatus('Replaced');
      });
      this.activeJobs = [];
    }

    this.lastScheduleTime = new Date().toISOString();
    const timestamp = Date.now().toString(36);
    this.addEvent('Normal', 'SuccessfulCreate', `Created job ${this.metadata.name}-${timestamp}`);
    return { name: `${this.metadata.name}-${timestamp}`, spec: this.spec.jobTemplate.spec };
  }

  suspend() {
    this.spec.suspend = true;
    this.addEvent('Normal', 'Suspended', `CronJob suspended`);
    this.setStatus('Suspended');
  }

  resume() {
    this.spec.suspend = false;
    this.addEvent('Normal', 'Resumed', `CronJob resumed`);
    this.setStatus('Active');
  }

  addActiveJob(job) {
    this.activeJobs.push(job);
    job.ownerReferences.push({ kind: 'CronJob', name: this.metadata.name, uid: this.uid });
  }

  getShape() { return 'clock'; }
  getColor() { return '#d97706'; }

  toYAML() {
    return `apiVersion: batch/v1
kind: CronJob
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
  schedule: "${this.spec.schedule}"
  concurrencyPolicy: ${this.spec.concurrencyPolicy}
  suspend: ${this.spec.suspend}
  successfulJobsHistoryLimit: ${this.spec.successfulJobsHistoryLimit}
  failedJobsHistoryLimit: ${this.spec.failedJobsHistoryLimit}
  jobTemplate:
    spec:
      template:
        spec:
          containers:
${this.spec.jobTemplate.spec.template.spec.containers.map(c => `          - name: ${c.name}
            image: ${c.image}`).join('\n')}
          restartPolicy: ${this.spec.jobTemplate.spec.template.spec.restartPolicy}
status:
  active: [${this.activeJobs.map(j => j.metadata.name).join(', ')}]
  lastScheduleTime: ${this.lastScheduleTime || '<none>'}
  lastSuccessfulTime: ${this.lastSuccessfulTime || '<none>'}`;
  }

  toDescribe() {
    return `Name:                          ${this.metadata.name}
Namespace:                     ${this.metadata.namespace}
Schedule:                      ${this.spec.schedule}
Concurrency Policy:            ${this.spec.concurrencyPolicy}
Suspend:                       ${this.spec.suspend}
Successful Job History Limit:  ${this.spec.successfulJobsHistoryLimit}
Failed Job History Limit:      ${this.spec.failedJobsHistoryLimit}
Active Jobs:                   ${this.activeJobs.map(j => j.metadata.name).join(', ') || '<none>'}
Last Schedule Time:            ${this.lastScheduleTime || '<none>'}
Last Successful Time:          ${this.lastSuccessfulTime || '<none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}
