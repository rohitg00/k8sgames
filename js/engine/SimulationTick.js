import { ResourceBase } from '../resources/ResourceBase.js';

export class SimulationTick {
  constructor(clusterState, eventBus) {
    this.cluster = clusterState;
    this.eventBus = eventBus;
    this.tickCount = 0;
    this.tickRate = 1;
    this.schedulerQueue = [];
    this.pendingScaleDecisions = new Map();
    this.hpaEvalInterval = 15;
    this.probeInterval = 5;
    this.cronCheckInterval = 10;
    this.metricsHistory = new Map();
    this.maxMetricsHistory = 60;
    this.randomFailureRate = 0.002;
    this.networkLatencyBase = 5;
    this.enableChaos = false;
    this.chaosConfig = {
      podKillRate: 0,
      nodeFailRate: 0,
      networkPartition: false,
      cpuStress: 0,
      memoryStress: 0,
    };
  }

  tick(deltaTime) {
    this.tickCount++;
    const dt = deltaTime * this.tickRate;

    this.cluster.startBatch();

    this._tickNodes(dt);
    this._tickPodScheduling(dt);
    this._tickPodLifecycle(dt);
    this._tickContainerResources(dt);
    this._tickHealthChecks(dt);
    this._tickOOMKiller(dt);
    this._tickDeployments(dt);
    this._tickStatefulSets(dt);
    this._tickDaemonSets(dt);
    this._tickJobs(dt);

    if (this.tickCount % this.cronCheckInterval === 0) {
      this._tickCronJobs(dt);
    }
    if (this.tickCount % this.hpaEvalInterval === 0) {
      this._tickHPA(dt);
    }
    if (this.tickCount % this.probeInterval === 0) {
      this._tickProbes(dt);
    }

    this._tickQuotaEnforcement(dt);
    this._recordMetrics();

    if (this.enableChaos) {
      this._tickChaos(dt);
    }

    this.cluster.flushBatch();

    if (this.eventBus) {
      this.eventBus.emit('simulation:tick', {
        tickCount: this.tickCount,
        deltaTime: dt,
        stats: this.cluster.getClusterStats(),
      });
    }
  }

  _tickNodes(dt) {
    const nodes = this.cluster.getByKind('Node');
    for (const node of nodes) {
      if (node.status.phase === 'Terminating') continue;

      const alloc = this.cluster.getNodeAllocatable(node.name);
      if (!alloc) continue;

      node.status.allocatable = {
        cpu: alloc.cpu.available,
        memory: alloc.memory.available,
      };
      node.status.usage = {
        cpu: alloc.cpu.used,
        memory: alloc.memory.used,
        cpuPercent: alloc.cpu.capacity > 0 ? Math.round((alloc.cpu.used / alloc.cpu.capacity) * 100) : 0,
        memoryPercent: alloc.memory.capacity > 0 ? Math.round((alloc.memory.used / alloc.memory.capacity) * 100) : 0,
      };

      const isReady = node.status.phase !== 'NotReady' && node.status.phase !== 'Unknown';
      node.setCondition('Ready', isReady ? 'True' : 'False', isReady ? 'KubeletReady' : 'KubeletNotReady');

      if (alloc.memory.available < 100) {
        node.setCondition('MemoryPressure', 'True', 'KubeletHasInsufficientMemory');
      } else {
        node.setCondition('MemoryPressure', 'False', 'KubeletHasSufficientMemory');
      }

      if (alloc.cpu.available < 50) {
        node.setCondition('PIDPressure', 'True', 'KubeletHasInsufficientPIDs');
      } else {
        node.setCondition('PIDPressure', 'False', 'KubeletHasSufficientPIDs');
      }
    }
  }

  _tickPodScheduling(dt) {
    const pendingPods = this.cluster.getByKind('Pod').filter(
      (p) => p.status.phase === 'Pending' && !p.spec.nodeName
    );

    for (const pod of pendingPods) {
      const node = this._findBestNode(pod);
      if (node) {
        pod.spec.nodeName = node.name;
        pod.status.phase = 'Running';
        pod.status.startTime = new Date().toISOString();
        pod.status.hostIP = node.status.addresses?.[0]?.address || '10.0.0.1';
        pod.status.podIP = this._generatePodIP();
        pod.setCondition('PodScheduled', 'True', 'Scheduled', `Successfully assigned to ${node.name}`);
        pod.setCondition('Initialized', 'True', 'PodInitialized');
        pod.setCondition('Ready', 'False', 'ContainersNotReady');
        pod.recordEvent('Normal', 'Scheduled', `Successfully assigned ${pod.namespace}/${pod.name} to ${node.name}`);

        this._initContainerStatuses(pod);
      } else {
        pod.setCondition('PodScheduled', 'False', 'Unschedulable', 'No nodes available with sufficient resources');
        pod.recordEvent('Warning', 'FailedScheduling', 'No nodes available to schedule pod');
      }
    }
  }

  _findBestNode(pod) {
    const nodes = this.cluster.getByKind('Node').filter(
      (n) => n.isConditionTrue('Ready') && n.status.phase !== 'Terminating'
    );

    if (nodes.length === 0) return null;

    const requested = this._getPodResourceRequests(pod);
    const nodeSelector = pod.spec.nodeSelector || {};

    let bestNode = null;
    let bestScore = -1;

    for (const node of nodes) {
      if (!node.matchesSelector(nodeSelector)) continue;

      if (pod.spec.tolerations) {
        const taints = node.spec.taints || [];
        const tolerations = pod.spec.tolerations;
        const untolerated = taints.filter(
          (t) => !tolerations.some((tol) => tol.key === t.key && (tol.operator === 'Exists' || tol.value === t.value))
        );
        if (untolerated.some((t) => t.effect === 'NoSchedule')) continue;
      }

      const alloc = this.cluster.getNodeAllocatable(node.name);
      if (!alloc) continue;
      if (alloc.cpu.available < requested.cpu) continue;
      if (alloc.memory.available < requested.memory) continue;

      const cpuScore = alloc.cpu.available / (alloc.cpu.capacity || 1);
      const memScore = alloc.memory.available / (alloc.memory.capacity || 1);
      const score = (cpuScore + memScore) / 2;

      if (pod.spec.affinity?.nodeAffinity?.preferredDuringScheduling) {
        const prefs = pod.spec.affinity.nodeAffinity.preferredDuringScheduling;
        for (const pref of prefs) {
          if (node.matchesSelector(pref.matchLabels || {})) {
            score + pref.weight / 100;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    return bestNode;
  }

  _getPodResourceRequests(pod) {
    let cpu = 0;
    let memory = 0;
    const containers = pod.spec.containers || [];
    for (const c of containers) {
      const requests = (c.resources && c.resources.requests) || {};
      cpu += this.cluster._parseCpu(requests.cpu || '100m');
      memory += this.cluster._parseMemory(requests.memory || '128Mi');
    }
    return { cpu, memory };
  }

  _getPodResourceLimits(pod) {
    let cpu = 0;
    let memory = 0;
    const containers = pod.spec.containers || [];
    for (const c of containers) {
      const limits = (c.resources && c.resources.limits) || {};
      cpu += this.cluster._parseCpu(limits.cpu || '0');
      memory += this.cluster._parseMemory(limits.memory || '0');
    }
    return { cpu, memory };
  }

  _initContainerStatuses(pod) {
    pod.status.containerStatuses = (pod.spec.containers || []).map((c) => ({
      name: c.name,
      image: c.image || 'unknown:latest',
      ready: false,
      started: false,
      restartCount: 0,
      state: { waiting: { reason: 'ContainerCreating' } },
      lastState: {},
      resources: {
        cpu: 0,
        memory: 0,
        cpuLimit: this.cluster._parseCpu((c.resources?.limits?.cpu) || '0'),
        memoryLimit: this.cluster._parseMemory((c.resources?.limits?.memory) || '0'),
        cpuRequest: this.cluster._parseCpu((c.resources?.requests?.cpu) || '100m'),
        memoryRequest: this.cluster._parseMemory((c.resources?.requests?.memory) || '128Mi'),
      },
    }));
  }

  _tickPodLifecycle(dt) {
    const runningPods = this.cluster.getByKind('Pod').filter(
      (p) => p.status.phase === 'Running'
    );

    for (const pod of runningPods) {
      if (!pod.status.containerStatuses) continue;

      let allReady = true;
      let anyRunning = false;

      for (const cs of pod.status.containerStatuses) {
        if (cs.state.waiting) {
          if (cs.state.waiting.reason === 'ContainerCreating') {
            cs.state = { running: { startedAt: new Date().toISOString() } };
            cs.started = true;
            cs.ready = false;
            pod.recordEvent('Normal', 'Started', `Started container ${cs.name}`);
          } else if (cs.state.waiting.reason === 'CrashLoopBackOff') {
            const backoffTime = Math.min(300, Math.pow(2, cs.restartCount) * 10);
            if (Math.random() < dt / backoffTime) {
              cs.state = { running: { startedAt: new Date().toISOString() } };
              cs.started = true;
              cs.ready = false;
            }
            allReady = false;
            continue;
          }
        }

        if (cs.state.running) {
          anyRunning = true;
          if (!cs.ready && cs.started) {
            cs.ready = true;
            pod.recordEvent('Normal', 'Ready', `Container ${cs.name} is ready`);
          }
        }

        if (!cs.ready) allReady = false;
      }

      if (allReady && anyRunning) {
        pod.setCondition('ContainersReady', 'True', 'ContainersReady');
        pod.setCondition('Ready', 'True', 'PodReady');
      } else {
        pod.setCondition('Ready', 'False', 'ContainersNotReady');
      }

      if (pod.isDeleting) {
        const gracePeriod = pod.spec.terminationGracePeriodSeconds || 30;
        const deletionTime = new Date(pod.metadata.deletionTimestamp).getTime();
        if (Date.now() - deletionTime > gracePeriod * 1000 * (1 / this.tickRate)) {
          pod.status.phase = 'Succeeded';
          pod.removeFinalizer('kubernetes');
        }
      }
    }
  }

  _tickContainerResources(dt) {
    const runningPods = this.cluster.getByKind('Pod').filter(
      (p) => p.status.phase === 'Running' && p.status.containerStatuses
    );

    for (const pod of runningPods) {
      for (const cs of pod.status.containerStatuses) {
        if (!cs.state.running) continue;

        const baseLoad = cs.resources.cpuRequest * 0.6;
        const variance = cs.resources.cpuRequest * 0.3;
        cs.resources.cpu = Math.max(0, baseLoad + (Math.random() - 0.5) * variance);

        const memBase = cs.resources.memoryRequest * 0.7;
        const memGrowth = cs.resources.memoryRequest * 0.01 * Math.random();
        cs.resources.memory = Math.min(
          cs.resources.memoryLimit > 0 ? cs.resources.memoryLimit * 1.1 : cs.resources.memoryRequest * 2,
          memBase + memGrowth + (cs.resources.memory > memBase ? (cs.resources.memory - memBase) * 0.99 : 0)
        );

        if (this.randomFailureRate > 0 && Math.random() < this.randomFailureRate) {
          cs.state = { waiting: { reason: 'CrashLoopBackOff' } };
          cs.ready = false;
          cs.started = false;
          cs.restartCount++;
          cs.lastState = { terminated: { exitCode: 1, reason: 'Error', finishedAt: new Date().toISOString() } };
          pod.recordEvent('Warning', 'BackOff', `Back-off restarting failed container ${cs.name}`);
        }
      }
    }
  }

  _tickHealthChecks(dt) {
    const runningPods = this.cluster.getByKind('Pod').filter(
      (p) => p.status.phase === 'Running' && p.status.containerStatuses
    );

    for (const pod of runningPods) {
      const containers = pod.spec.containers || [];

      for (let i = 0; i < containers.length; i++) {
        const container = containers[i];
        const cs = pod.status.containerStatuses[i];
        if (!cs || !cs.state.running) continue;

        if (container.livenessProbe) {
          const alive = this._evaluateProbe(container.livenessProbe, cs);
          if (!alive) {
            cs.state = { waiting: { reason: 'CrashLoopBackOff' } };
            cs.ready = false;
            cs.started = false;
            cs.restartCount++;
            cs.lastState = { terminated: { exitCode: 137, reason: 'LivenessProbeFailure', finishedAt: new Date().toISOString() } };
            pod.recordEvent('Warning', 'Unhealthy', `Liveness probe failed for container ${cs.name}`);
          }
        }

        if (container.readinessProbe) {
          const ready = this._evaluateProbe(container.readinessProbe, cs);
          if (!ready && cs.ready) {
            cs.ready = false;
            pod.recordEvent('Warning', 'Unhealthy', `Readiness probe failed for container ${cs.name}`);
          } else if (ready && !cs.ready) {
            cs.ready = true;
          }
        }

        if (container.startupProbe && !cs._startupComplete) {
          const started = this._evaluateProbe(container.startupProbe, cs);
          if (started) {
            cs._startupComplete = true;
          } else {
            cs.ready = false;
          }
        }
      }
    }
  }

  _evaluateProbe(probe, containerStatus) {
    if (!containerStatus.state.running) return false;
    const failThreshold = probe.failureThreshold || 3;
    const cpuOverloaded = containerStatus.resources.cpu > containerStatus.resources.cpuLimit * 0.95 && containerStatus.resources.cpuLimit > 0;
    const memOverloaded = containerStatus.resources.memory > containerStatus.resources.memoryLimit * 0.95 && containerStatus.resources.memoryLimit > 0;
    if (cpuOverloaded || memOverloaded) {
      containerStatus._probeFailCount = (containerStatus._probeFailCount || 0) + 1;
      return containerStatus._probeFailCount < failThreshold;
    }
    containerStatus._probeFailCount = 0;
    return true;
  }

  _tickOOMKiller(dt) {
    const runningPods = this.cluster.getByKind('Pod').filter(
      (p) => p.status.phase === 'Running' && p.status.containerStatuses
    );

    for (const pod of runningPods) {
      for (const cs of pod.status.containerStatuses) {
        if (!cs.state.running) continue;
        if (cs.resources.memoryLimit <= 0) continue;

        if (cs.resources.memory > cs.resources.memoryLimit) {
          cs.state = { waiting: { reason: 'CrashLoopBackOff' } };
          cs.ready = false;
          cs.started = false;
          cs.restartCount++;
          cs.lastState = {
            terminated: {
              exitCode: 137,
              reason: 'OOMKilled',
              finishedAt: new Date().toISOString(),
              message: `Container ${cs.name} exceeded memory limit (${Math.round(cs.resources.memory)}Mi > ${cs.resources.memoryLimit}Mi)`,
            },
          };
          cs.resources.memory = 0;
          cs.resources.cpu = 0;
          pod.recordEvent('Warning', 'OOMKilled', `Container ${cs.name} was OOM killed`);

          if (this.eventBus) {
            this.eventBus.emit('incident:oomkill', {
              pod: pod.name,
              namespace: pod.namespace,
              container: cs.name,
              memoryUsed: cs.resources.memory,
              memoryLimit: cs.resources.memoryLimit,
            });
          }
        }
      }
    }
  }

  _tickDeployments(dt) {
    const deployments = this.cluster.getByKind('Deployment');

    for (const deploy of deployments) {
      const desiredReplicas = deploy.spec.replicas ?? 1;
      const selector = deploy.spec.selector?.matchLabels || deploy.metadata.labels;

      const replicaSets = this.cluster.selectByLabels('ReplicaSet', selector)
        .filter((rs) => rs.metadata.namespace === deploy.namespace);

      let currentRS = replicaSets[0];
      if (!currentRS) continue;

      const pods = this.cluster.getChildren(currentRS.uid)
        .filter((p) => p.kind === 'Pod');

      const runningPods = pods.filter((p) => p.status.phase === 'Running' && p.isConditionTrue('Ready'));
      const totalPods = pods.filter((p) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed');

      currentRS.status.replicas = totalPods.length;
      currentRS.status.readyReplicas = runningPods.length;
      currentRS.status.availableReplicas = runningPods.length;

      deploy.status.replicas = totalPods.length;
      deploy.status.readyReplicas = runningPods.length;
      deploy.status.availableReplicas = runningPods.length;
      deploy.status.updatedReplicas = totalPods.length;
      deploy.status.observedGeneration = deploy.metadata.generation;

      if (runningPods.length >= desiredReplicas) {
        deploy.setCondition('Available', 'True', 'MinimumReplicasAvailable');
        deploy.setCondition('Progressing', 'True', 'NewReplicaSetAvailable');
      } else {
        deploy.setCondition('Available', 'False', 'MinimumReplicasUnavailable',
          `${runningPods.length}/${desiredReplicas} replicas available`);
        deploy.setCondition('Progressing', 'True', 'ReplicaSetUpdated',
          `${totalPods.length}/${desiredReplicas} replicas created`);
      }

      if (totalPods.length < desiredReplicas) {
        const toCreate = desiredReplicas - totalPods.length;
        for (let i = 0; i < toCreate; i++) {
          this._createPodForWorkload(currentRS, deploy);
        }
      } else if (totalPods.length > desiredReplicas) {
        const toRemove = totalPods.length - desiredReplicas;
        const sortedPods = [...totalPods].sort((a, b) => {
          if (a.status.phase === 'Pending' && b.status.phase !== 'Pending') return -1;
          if (b.status.phase === 'Pending' && a.status.phase !== 'Pending') return 1;
          return new Date(b.metadata.creationTimestamp) - new Date(a.metadata.creationTimestamp);
        });
        for (let i = 0; i < toRemove; i++) {
          this.cluster.remove(sortedPods[i].uid);
        }
      }
    }
  }

  _tickStatefulSets(dt) {
    const statefulSets = this.cluster.getByKind('StatefulSet');

    for (const sts of statefulSets) {
      const desiredReplicas = sts.spec.replicas ?? 1;
      const pods = this.cluster.getChildren(sts.uid).filter((p) => p.kind === 'Pod');
      const activePods = pods.filter((p) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed');
      const readyPods = activePods.filter((p) => p.isConditionTrue('Ready'));

      sts.status.replicas = activePods.length;
      sts.status.readyReplicas = readyPods.length;
      sts.status.currentReplicas = activePods.length;

      if (activePods.length < desiredReplicas) {
        const ordinal = activePods.length;
        this._createPodForWorkload(sts, sts, `${sts.name}-${ordinal}`);
      } else if (activePods.length > desiredReplicas) {
        const sorted = [...activePods].sort((a, b) => {
          const aOrd = parseInt(a.name.split('-').pop(), 10) || 0;
          const bOrd = parseInt(b.name.split('-').pop(), 10) || 0;
          return bOrd - aOrd;
        });
        this.cluster.remove(sorted[0].uid);
      }
    }
  }

  _tickDaemonSets(dt) {
    const daemonSets = this.cluster.getByKind('DaemonSet');
    const nodes = this.cluster.getByKind('Node').filter((n) => n.isConditionTrue('Ready'));

    for (const ds of daemonSets) {
      const pods = this.cluster.getChildren(ds.uid).filter((p) => p.kind === 'Pod');
      const nodeSelector = ds.spec.nodeSelector || {};

      const targetNodes = nodes.filter((n) => n.matchesSelector(nodeSelector));
      const podNodeNames = new Set(pods.map((p) => p.spec.nodeName).filter(Boolean));

      for (const node of targetNodes) {
        if (!podNodeNames.has(node.name)) {
          const pod = this._createPodForWorkload(ds, ds);
          if (pod) {
            pod.spec.nodeName = node.name;
          }
        }
      }

      const activePods = pods.filter((p) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed');
      ds.status.desiredNumberScheduled = targetNodes.length;
      ds.status.currentNumberScheduled = activePods.length;
      ds.status.numberReady = activePods.filter((p) => p.isConditionTrue('Ready')).length;
    }
  }

  _tickJobs(dt) {
    const jobs = this.cluster.getByKind('Job');

    for (const job of jobs) {
      if (job.status.phase === 'Complete' || job.status.phase === 'Failed') continue;

      const completions = job.spec.completions ?? 1;
      const parallelism = job.spec.parallelism ?? 1;
      const pods = this.cluster.getChildren(job.uid).filter((p) => p.kind === 'Pod');
      const succeededPods = pods.filter((p) => p.status.phase === 'Succeeded');
      const activePods = pods.filter((p) => p.status.phase === 'Running' || p.status.phase === 'Pending');
      const failedPods = pods.filter((p) => p.status.phase === 'Failed');

      job.status.succeeded = succeededPods.length;
      job.status.active = activePods.length;
      job.status.failed = failedPods.length;

      if (succeededPods.length >= completions) {
        job.setPhase('Complete');
        job.status.completionTime = new Date().toISOString();
        job.setCondition('Complete', 'True', 'JobComplete');
        continue;
      }

      const backoffLimit = job.spec.backoffLimit ?? 6;
      if (failedPods.length > backoffLimit) {
        job.setPhase('Failed');
        job.setCondition('Failed', 'True', 'BackoffLimitExceeded');
        continue;
      }

      const needed = Math.min(parallelism, completions - succeededPods.length) - activePods.length;
      for (let i = 0; i < needed; i++) {
        const pod = this._createPodForWorkload(job, job);
        if (pod) {
          pod.spec.restartPolicy = 'Never';
          const duration = (job.spec.estimatedDurationSeconds || 30) * 1000;
          pod._completionTime = Date.now() + duration * (0.8 + Math.random() * 0.4);
        }
      }

      for (const pod of activePods) {
        if (pod._completionTime && Date.now() >= pod._completionTime) {
          pod.setPhase('Succeeded');
          for (const cs of (pod.status.containerStatuses || [])) {
            cs.state = { terminated: { exitCode: 0, reason: 'Completed', finishedAt: new Date().toISOString() } };
            cs.ready = false;
          }
        }
      }
    }
  }

  _tickCronJobs(dt) {
    const cronJobs = this.cluster.getByKind('CronJob');

    for (const cj of cronJobs) {
      if (cj.spec.suspend) continue;

      const now = Date.now();
      const lastSchedule = cj.status.lastScheduleTime ? new Date(cj.status.lastScheduleTime).getTime() : 0;
      const interval = this._parseCronInterval(cj.spec.schedule || '*/5 * * * *');

      if (now - lastSchedule >= interval) {
        const jobName = `${cj.name}-${Math.floor(now / 1000)}`;
        const newJob = new ResourceBase('Job', 'batch/v1', jobName, cj.namespace);
        newJob.spec = JSON.parse(JSON.stringify(cj.spec.jobTemplate || {}));
        newJob.addOwnerReference(cj);
        this.cluster.add(newJob);
        this.cluster.addRelationship(cj.uid, newJob.uid);
        cj.status.lastScheduleTime = new Date().toISOString();
        cj.status.active = (cj.status.active || 0) + 1;
        cj.recordEvent('Normal', 'SuccessfulCreate', `Created job ${jobName}`);

        const historyLimit = cj.spec.successfulJobsHistoryLimit ?? 3;
        const completedJobs = this.cluster.getChildren(cj.uid)
          .filter((j) => j.kind === 'Job' && j.status.phase === 'Complete')
          .sort((a, b) => new Date(a.metadata.creationTimestamp) - new Date(b.metadata.creationTimestamp));

        while (completedJobs.length > historyLimit) {
          this.cluster.remove(completedJobs.shift().uid);
        }
      }
    }
  }

  _parseCronInterval(schedule) {
    const parts = schedule.split(' ');
    if (parts.length < 5) return 300000;
    const minutePart = parts[0];
    if (minutePart.startsWith('*/')) {
      return parseInt(minutePart.slice(2), 10) * 60 * 1000;
    }
    return 60 * 60 * 1000;
  }

  _tickHPA(dt) {
    const hpas = this.cluster.getByKind('HorizontalPodAutoscaler');

    for (const hpa of hpas) {
      const targetRef = hpa.spec.scaleTargetRef;
      if (!targetRef) continue;

      const target = this.cluster.getByName(targetRef.kind, targetRef.name, hpa.namespace);
      if (!target) continue;

      const currentReplicas = target.spec.replicas ?? 1;
      const minReplicas = hpa.spec.minReplicas ?? 1;
      const maxReplicas = hpa.spec.maxReplicas ?? 10;

      const metrics = hpa.spec.metrics || [{ type: 'Resource', resource: { name: 'cpu', targetAverageUtilization: 50 } }];
      let desiredReplicas = currentReplicas;

      for (const metric of metrics) {
        if (metric.type === 'Resource' && metric.resource) {
          const targetUtil = metric.resource.targetAverageUtilization || 50;
          const currentUtil = this._getWorkloadCpuUtilization(target);

          if (currentUtil > 0) {
            const ratio = currentUtil / targetUtil;
            const calculated = Math.ceil(currentReplicas * ratio);
            desiredReplicas = Math.max(desiredReplicas, calculated);
          }

          hpa.status.currentMetrics = hpa.status.currentMetrics || [];
          const existingIdx = hpa.status.currentMetrics.findIndex(
            (m) => m.resource?.name === metric.resource.name
          );
          const metricStatus = {
            type: 'Resource',
            resource: { name: metric.resource.name, currentAverageUtilization: currentUtil },
          };
          if (existingIdx >= 0) {
            hpa.status.currentMetrics[existingIdx] = metricStatus;
          } else {
            hpa.status.currentMetrics.push(metricStatus);
          }
        }
      }

      desiredReplicas = Math.max(minReplicas, Math.min(maxReplicas, desiredReplicas));

      const scaleUpLimit = Math.max(4, currentReplicas * 2);
      const scaleDownLimit = Math.max(1, Math.floor(currentReplicas * 0.5));

      if (desiredReplicas > currentReplicas) {
        desiredReplicas = Math.min(desiredReplicas, currentReplicas + scaleUpLimit);
      } else if (desiredReplicas < currentReplicas) {
        desiredReplicas = Math.max(desiredReplicas, scaleDownLimit);
      }

      if (desiredReplicas !== currentReplicas) {
        const lastScaleTime = hpa.status.lastScaleTime ? new Date(hpa.status.lastScaleTime).getTime() : 0;
        const cooldown = desiredReplicas > currentReplicas ? 30000 : 300000;

        if (Date.now() - lastScaleTime >= cooldown) {
          target.spec.replicas = desiredReplicas;
          hpa.status.currentReplicas = desiredReplicas;
          hpa.status.desiredReplicas = desiredReplicas;
          hpa.status.lastScaleTime = new Date().toISOString();

          const direction = desiredReplicas > currentReplicas ? 'up' : 'down';
          hpa.recordEvent('Normal', 'SuccessfulRescale',
            `Scaled ${direction} to ${desiredReplicas} replicas`);

          if (this.eventBus) {
            this.eventBus.emit('hpa:scaled', {
              hpa: hpa.name,
              target: target.name,
              from: currentReplicas,
              to: desiredReplicas,
              direction,
            });
          }
        }
      }
    }
  }

  _getWorkloadCpuUtilization(workload) {
    const selector = workload.spec.selector?.matchLabels || workload.metadata.labels;
    const pods = this.cluster.selectByLabels('Pod', selector)
      .filter((p) => p.metadata.namespace === workload.namespace && p.status.phase === 'Running');

    if (pods.length === 0) return 0;

    let totalUtil = 0;
    let count = 0;

    for (const pod of pods) {
      if (!pod.status.containerStatuses) continue;
      for (const cs of pod.status.containerStatuses) {
        if (cs.resources.cpuRequest > 0) {
          totalUtil += (cs.resources.cpu / cs.resources.cpuRequest) * 100;
          count++;
        }
      }
    }

    return count > 0 ? Math.round(totalUtil / count) : 0;
  }

  _tickProbes(dt) {
    const services = this.cluster.getByKind('Service');

    for (const svc of services) {
      const pods = this.cluster.findPodsForService(svc.name, svc.namespace);
      const readyPods = pods.filter((p) => p.isConditionTrue('Ready'));

      svc.status.readyEndpoints = readyPods.length;
      svc.status.totalEndpoints = pods.length;

      if (svc.spec.type === 'LoadBalancer' && !svc.status.loadBalancer) {
        svc.status.loadBalancer = {
          ingress: [{ ip: this._generateExternalIP() }],
        };
      }
    }
  }

  _tickQuotaEnforcement(dt) {
    for (const [namespace] of this.cluster.resourceQuotas) {
      const result = this.cluster.checkQuota(namespace, 0, 0);
      if (!result.allowed) {
        if (this.eventBus) {
          this.eventBus.emit('quota:exceeded', {
            namespace,
            violations: result.violations,
            usage: result.usage,
          });
        }
      }
    }
  }

  _tickChaos(dt) {
    if (this.chaosConfig.podKillRate > 0) {
      const pods = this.cluster.getByKind('Pod').filter((p) => p.status.phase === 'Running');
      for (const pod of pods) {
        if (Math.random() < this.chaosConfig.podKillRate * dt) {
          pod.setPhase('Failed');
          pod.recordEvent('Warning', 'ChaosKilled', 'Pod killed by chaos engineering');
          if (this.eventBus) {
            this.eventBus.emit('chaos:podkill', { pod: pod.name, namespace: pod.namespace });
          }
        }
      }
    }

    if (this.chaosConfig.nodeFailRate > 0) {
      const nodes = this.cluster.getByKind('Node').filter((n) => n.isConditionTrue('Ready'));
      for (const node of nodes) {
        if (Math.random() < this.chaosConfig.nodeFailRate * dt) {
          node.setPhase('NotReady');
          node.setCondition('Ready', 'False', 'ChaosNodeFailure');
          node.recordEvent('Warning', 'ChaosNodeDown', 'Node failed due to chaos injection');

          const pods = this.cluster.getByKind('Pod').filter(
            (p) => p.spec.nodeName === node.name && p.status.phase === 'Running'
          );
          for (const pod of pods) {
            pod.setPhase('Failed');
            pod.recordEvent('Warning', 'NodeLost', `Node ${node.name} became unreachable`);
          }

          if (this.eventBus) {
            this.eventBus.emit('chaos:nodefailure', { node: node.name, podsEvicted: pods.length });
          }
        }
      }
    }

    if (this.chaosConfig.cpuStress > 0 || this.chaosConfig.memoryStress > 0) {
      const pods = this.cluster.getByKind('Pod').filter(
        (p) => p.status.phase === 'Running' && p.status.containerStatuses
      );
      for (const pod of pods) {
        for (const cs of pod.status.containerStatuses) {
          if (!cs.state.running) continue;
          if (this.chaosConfig.cpuStress > 0) {
            cs.resources.cpu += cs.resources.cpuRequest * this.chaosConfig.cpuStress;
          }
          if (this.chaosConfig.memoryStress > 0) {
            cs.resources.memory += cs.resources.memoryRequest * this.chaosConfig.memoryStress;
          }
        }
      }
    }
  }

  _createPodForWorkload(parent, templateSource, nameOverride) {
    const podName = nameOverride || `${parent.name}-${this._randomSuffix()}`;
    const pod = new ResourceBase('Pod', 'v1', podName, parent.namespace);

    const template = templateSource.spec.template || {};
    const podSpec = template.spec || {};
    pod.spec = JSON.parse(JSON.stringify(podSpec));
    pod.spec.containers = pod.spec.containers || [
      {
        name: 'main',
        image: 'app:latest',
        resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
      },
    ];

    const templateLabels = template.metadata?.labels || templateSource.metadata.labels;
    for (const [key, value] of Object.entries(templateLabels)) {
      pod.setLabel(key, value);
    }
    pod.setLabel('pod-template-hash', this._randomSuffix());

    pod.addOwnerReference(parent);
    this.cluster.add(pod);
    this.cluster.addRelationship(parent.uid, pod.uid);

    return pod;
  }

  _recordMetrics() {
    const stats = this.cluster.getClusterStats();
    const key = this.tickCount;

    this.metricsHistory.set(key, {
      tick: key,
      timestamp: Date.now(),
      cpu: stats.cpu,
      memory: stats.memory,
      pods: stats.pods,
      nodes: stats.nodes,
    });

    if (this.metricsHistory.size > this.maxMetricsHistory) {
      const oldestKey = this.metricsHistory.keys().next().value;
      this.metricsHistory.delete(oldestKey);
    }
  }

  getMetricsHistory(count) {
    const entries = Array.from(this.metricsHistory.values());
    return count ? entries.slice(-count) : entries;
  }

  getMetricsSummary() {
    const entries = Array.from(this.metricsHistory.values());
    if (entries.length === 0) return null;

    const cpuValues = entries.map((e) => e.cpu.percent);
    const memValues = entries.map((e) => e.memory.percent);

    return {
      cpu: {
        current: cpuValues[cpuValues.length - 1],
        avg: Math.round(cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length),
        max: Math.max(...cpuValues),
        min: Math.min(...cpuValues),
      },
      memory: {
        current: memValues[memValues.length - 1],
        avg: Math.round(memValues.reduce((a, b) => a + b, 0) / memValues.length),
        max: Math.max(...memValues),
        min: Math.min(...memValues),
      },
      tickCount: this.tickCount,
      historyLength: entries.length,
    };
  }

  setChaosConfig(config) {
    Object.assign(this.chaosConfig, config);
    this.enableChaos = Object.values(this.chaosConfig).some((v) => v > 0 || v === true);
  }

  setTickRate(rate) {
    this.tickRate = Math.max(0.1, Math.min(10, rate));
  }

  reset() {
    this.tickCount = 0;
    this.schedulerQueue = [];
    this.pendingScaleDecisions.clear();
    this.metricsHistory.clear();
    this.enableChaos = false;
    this.chaosConfig = {
      podKillRate: 0,
      nodeFailRate: 0,
      networkPartition: false,
      cpuStress: 0,
      memoryStress: 0,
    };
  }

  _generatePodIP() {
    return `10.244.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  }

  _generateExternalIP() {
    return `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
  }

  _randomSuffix() {
    return Math.random().toString(36).substring(2, 7);
  }
}

export default SimulationTick;
