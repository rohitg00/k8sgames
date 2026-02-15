const CHALLENGE_STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const CHALLENGES = [
  {
    id: 1,
    title: 'Three-Tier Web App',
    description: 'Deploy a complete 3-tier application: frontend (nginx), backend (node), and database (postgres). Each must have a Service.',
    timeLimit: 300,
    objectives: [
      { type: 'deploy', kind: 'Deployment', name: 'frontend', label: 'Deploy frontend' },
      { type: 'deploy', kind: 'Deployment', name: 'backend', label: 'Deploy backend' },
      { type: 'deploy', kind: 'Deployment', name: 'database', label: 'Deploy database' },
      { type: 'deploy', kind: 'Service', count: 3, label: 'Create 3 Services' },
      { type: 'connect', from: 'frontend', to: 'backend', label: 'Frontend connects to backend' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi' } }
    ],
    availableResources: ['Deployment', 'Service', 'ConfigMap', 'Secret', 'Namespace']
  },
  {
    id: 2,
    title: 'Fix CrashLoopBackOff',
    description: 'A critical production Pod is crash looping. Investigate and fix the issue before the outage impacts users.',
    timeLimit: 180,
    objectives: [
      { type: 'investigate', incidentType: 'CrashLoopBackOff', label: 'Investigate the crash' },
      { type: 'resolve', incidentType: 'CrashLoopBackOff', count: 1, label: 'Resolve CrashLoopBackOff' },
      { type: 'uptime', percentage: 90, label: 'Restore cluster health to 90%' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Deployment', name: 'payment-service', spec: { replicas: 3, image: 'payments:broken' } }
    ],
    preloadIncidents: [
      { type: 'CrashLoopBackOff', target: 'payment-service', severity: 3, triggerTime: 2 }
    ],
    availableResources: ['Pod', 'Deployment']
  },
  {
    id: 3,
    title: 'Ingress with TLS',
    description: 'Set up an Ingress controller with TLS termination. Route /app and /api to their respective services.',
    timeLimit: 240,
    objectives: [
      { type: 'deploy', kind: 'Ingress', count: 1, label: 'Create Ingress' },
      { type: 'route', paths: ['/app', '/api'], label: 'Route /app and /api' },
      { type: 'tls', enabled: true, label: 'Enable TLS' },
      { type: 'deploy', kind: 'Secret', count: 1, label: 'Create TLS Secret' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Deployment', name: 'app', spec: { replicas: 2 } },
      { kind: 'Service', name: 'app-svc', spec: { port: 80 } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2 } },
      { kind: 'Service', name: 'api-svc', spec: { port: 3000 } }
    ],
    availableResources: ['Ingress', 'Secret', 'Service']
  },
  {
    id: 4,
    title: 'Network Segmentation',
    description: 'Implement zero-trust networking. Isolate namespaces and only allow necessary traffic paths.',
    timeLimit: 300,
    objectives: [
      { type: 'deploy', kind: 'NetworkPolicy', count: 3, label: 'Create 3 NetworkPolicies' },
      { type: 'isolate', namespace: 'database', label: 'Isolate database namespace' },
      { type: 'allow', from: 'backend', to: 'database', label: 'Allow backend to database' },
      { type: 'deny', from: 'frontend', to: 'database', label: 'Block frontend from database' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Namespace', name: 'frontend', spec: {} },
      { kind: 'Namespace', name: 'backend', spec: {} },
      { kind: 'Namespace', name: 'database', spec: {} },
      { kind: 'Deployment', name: 'web', spec: { namespace: 'frontend', replicas: 2 } },
      { kind: 'Deployment', name: 'api', spec: { namespace: 'backend', replicas: 2 } },
      { kind: 'Deployment', name: 'postgres', spec: { namespace: 'database', replicas: 1 } }
    ],
    availableResources: ['NetworkPolicy']
  },
  {
    id: 5,
    title: 'Black Friday Scaling',
    description: 'Traffic is surging! Scale your application to handle 10x the normal load before customers start bouncing.',
    timeLimit: 180,
    objectives: [
      { type: 'scale', kind: 'Deployment', name: 'web', replicas: 10, label: 'Scale web to 10 replicas' },
      { type: 'scale', kind: 'Deployment', name: 'api', replicas: 8, label: 'Scale API to 8 replicas' },
      { type: 'hpa', count: 2, label: 'Create 2 HPAs' },
      { type: 'deploy', kind: 'Node', count: 5, label: 'Ensure 5 nodes available' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Deployment', name: 'web', spec: { replicas: 2, image: 'nginx:latest' } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, image: 'node:18' } },
      { kind: 'Service', name: 'web-svc', spec: { port: 80 } },
      { kind: 'Service', name: 'api-svc', spec: { port: 3000 } }
    ],
    availableResources: ['Node', 'Deployment', 'HorizontalPodAutoscaler']
  },
  {
    id: 6,
    title: 'Node Failure Recovery',
    description: 'A node just died taking several Pods with it. Recover the cluster and ensure workloads are rescheduled.',
    timeLimit: 240,
    objectives: [
      { type: 'resolve', incidentType: 'NodeNotReady', count: 1, label: 'Fix the failed node' },
      { type: 'reschedule', count: 3, label: 'Reschedule 3 evicted Pods' },
      { type: 'uptime', percentage: 85, label: 'Restore health to 85%' },
      { type: 'pdb', count: 1, label: 'Create a PodDisruptionBudget' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Deployment', name: 'app', spec: { replicas: 4 } },
      { kind: 'Service', name: 'app-svc', spec: { port: 80 } }
    ],
    preloadIncidents: [
      { type: 'NodeNotReady', target: 'node-2', severity: 5, triggerTime: 3 },
      { type: 'PodEviction', target: 'app', severity: 2, triggerTime: 8 }
    ],
    availableResources: ['Node', 'Pod', 'Deployment', 'PodDisruptionBudget']
  },
  {
    id: 7,
    title: 'StatefulSet with PVC',
    description: 'Deploy a 3-replica StatefulSet database with persistent storage and a headless Service.',
    timeLimit: 300,
    objectives: [
      { type: 'deploy', kind: 'StatefulSet', count: 1, label: 'Create StatefulSet' },
      { type: 'scale', kind: 'StatefulSet', replicas: 3, label: 'Scale to 3 replicas' },
      { type: 'deploy', kind: 'PersistentVolumeClaim', count: 3, label: 'Create 3 PVCs' },
      { type: 'headless', kind: 'Service', count: 1, label: 'Create headless Service' },
      { type: 'deploy', kind: 'PersistentVolume', count: 3, label: 'Create 3 PVs' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '8', memory: '16Gi' } }
    ],
    availableResources: ['StatefulSet', 'Service', 'PersistentVolume', 'PersistentVolumeClaim', 'StorageClass']
  },
  {
    id: 8,
    title: 'RBAC Fortress',
    description: 'Implement proper RBAC: create dedicated ServiceAccounts, Roles with least-privilege, and RoleBindings.',
    timeLimit: 300,
    objectives: [
      { type: 'deploy', kind: 'ServiceAccount', count: 2, label: 'Create 2 ServiceAccounts' },
      { type: 'deploy', kind: 'Role', count: 2, label: 'Create 2 Roles' },
      { type: 'deploy', kind: 'RoleBinding', count: 2, label: 'Create 2 RoleBindings' },
      { type: 'leastPrivilege', label: 'No wildcard permissions' },
      { type: 'resolve', incidentType: 'UnauthorizedAccess', count: 1, label: 'Fix unauthorized access' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Namespace', name: 'prod', spec: {} },
      { kind: 'Deployment', name: 'app', spec: { namespace: 'prod', replicas: 2 } },
      { kind: 'ServiceAccount', name: 'overprivileged-sa', spec: { namespace: 'prod', wildcard: true } }
    ],
    preloadIncidents: [
      { type: 'UnauthorizedAccess', target: 'overprivileged-sa', severity: 5, triggerTime: 5 }
    ],
    availableResources: ['ServiceAccount', 'Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding']
  },
  {
    id: 9,
    title: 'DNS Resolution Failure',
    description: 'CoreDNS is down and services cannot discover each other. Diagnose and fix the DNS infrastructure.',
    timeLimit: 180,
    objectives: [
      { type: 'investigate', incidentType: 'DNSResolutionFailure', label: 'Investigate DNS failure' },
      { type: 'resolve', incidentType: 'DNSResolutionFailure', count: 1, label: 'Fix DNS resolution' },
      { type: 'deploy', kind: 'NetworkPolicy', count: 1, label: 'Allow DNS egress in NetworkPolicy' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi' } },
      { kind: 'Deployment', name: 'coredns', spec: { namespace: 'kube-system', replicas: 2 } },
      { kind: 'Service', name: 'kube-dns', spec: { namespace: 'kube-system', port: 53 } },
      { kind: 'Deployment', name: 'app', spec: { replicas: 3 } },
      { kind: 'NetworkPolicy', name: 'strict-deny', spec: { policyTypes: ['Ingress', 'Egress'] } }
    ],
    preloadIncidents: [
      { type: 'DNSResolutionFailure', target: 'kube-dns', severity: 4, triggerTime: 2 }
    ],
    availableResources: ['NetworkPolicy', 'Pod', 'Service']
  },
  {
    id: 10,
    title: 'Full Production Readiness',
    description: 'The ultimate challenge: build a complete production-grade cluster from scratch within 10 minutes.',
    timeLimit: 600,
    objectives: [
      { type: 'deploy', kind: 'Namespace', count: 3, label: 'Create 3 namespaces' },
      { type: 'deploy', kind: 'Deployment', count: 3, label: 'Deploy 3 applications' },
      { type: 'deploy', kind: 'Service', count: 3, label: 'Expose with Services' },
      { type: 'deploy', kind: 'Ingress', count: 1, label: 'Set up Ingress' },
      { type: 'deploy', kind: 'NetworkPolicy', count: 2, label: 'Network segmentation' },
      { type: 'deploy', kind: 'Secret', count: 1, label: 'Store credentials' },
      { type: 'deploy', kind: 'HorizontalPodAutoscaler', count: 1, label: 'Configure autoscaling' },
      { type: 'probes', kind: 'Deployment', liveness: true, readiness: true, label: 'Add health probes' },
      { type: 'architectureScore', minScore: 70, label: 'Architecture score >= 70' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '16', memory: '32Gi' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '16', memory: '32Gi' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '16', memory: '32Gi' } }
    ],
    availableResources: [
      'Namespace', 'Pod', 'Deployment', 'Service', 'Ingress', 'ConfigMap', 'Secret',
      'NetworkPolicy', 'PersistentVolume', 'PersistentVolumeClaim', 'StatefulSet',
      'HorizontalPodAutoscaler', 'Role', 'RoleBinding', 'ServiceAccount'
    ]
  }
];

class ChallengeMode {
  constructor(gameEngine, incidentEngine, scoringEngine) {
    this.gameEngine = gameEngine;
    this.incidentEngine = incidentEngine;
    this.scoringEngine = scoringEngine;
    this.state = CHALLENGE_STATE.MENU;
    this.currentChallenge = null;
    this.currentChallengeDef = null;
    this.objectiveProgress = [];
    this.startTime = 0;
    this.elapsedTime = 0;
    this.timeRemaining = 0;
    this.pausedTime = 0;
    this.pauseStart = 0;
    this.ticker = null;
  }

  getChallenges() {
    const progress = this.scoringEngine.getProgress();
    return CHALLENGES.map((ch) => {
      const cp = progress.challengeProgress?.[ch.id];
      const completed = cp?.completed || false;
      const stars = cp?.stars || 0;
      const bestTime = cp?.bestTime || null;

      return {
        id: ch.id,
        title: ch.title,
        description: ch.description,
        timeLimit: ch.timeLimit,
        objectiveCount: ch.objectives.length,
        completed,
        stars,
        bestTime,
      };
    });
  }

  startChallenge(challengeId) {
    const def = CHALLENGES.find((c) => c.id === challengeId);
    if (!def) return false;

    this.currentChallenge = challengeId;
    this.currentChallengeDef = def;
    this.pausedTime = 0;

    this.objectiveProgress = def.objectives.map((obj) => ({
      ...obj,
      current: 0,
      target: obj.count || 1,
      completed: false
    }));

    this.setupCluster(def);
    this.incidentEngine.reset();

    if (def.preloadIncidents) {
      this.incidentEngine.loadScriptedIncidents(def.preloadIncidents);
    }

    this.state = CHALLENGE_STATE.PLAYING;
    this.startTime = Date.now();
    this.incidentEngine.start('challenge');

    this.ticker = setInterval(() => this.update(), 1000);

    const objectives = this.objectiveProgress;

    this.gameEngine.emit('challenge:started', {
      challengeId: def.id,
      title: def.title,
      description: def.description,
      timeLimit: def.timeLimit,
      objectives,
      availableResources: def.availableResources,
    });

    return true;
  }

  setupCluster(def) {
    const clusterState = this.gameEngine.getState();
    if (!clusterState) return;

    clusterState.clear();

    for (const resource of def.startingResources) {
      clusterState.addResource({
        kind: resource.kind,
        name: resource.name,
        metadata: {
          name: resource.name,
          namespace: resource.spec?.namespace || 'default',
          labels: {}
        },
        spec: resource.spec || {},
        status: { phase: 'Running' }
      });
    }
  }

  update() {
    if (this.state !== CHALLENGE_STATE.PLAYING) return;

    this.elapsedTime = (Date.now() - this.startTime - this.pausedTime) / 1000;
    this.timeRemaining = Math.max(0, this.currentChallengeDef.timeLimit - this.elapsedTime);

    this.updateObjectives();
    this.checkCompletion();
    this.checkTimeout();

    this.gameEngine.emit('challenge:update', {
      challengeId: this.currentChallenge,
      elapsedTime: Math.round(this.elapsedTime),
      timeRemaining: Math.round(this.timeRemaining),
      objectives: this.objectiveProgress,
      completionPercentage: this.getCompletionPercentage()
    });
  }

  updateObjectives() {
    const state = this.gameEngine.getState();
    if (!state) return;

    for (const obj of this.objectiveProgress) {
      if (obj.completed) continue;

      switch (obj.type) {
        case 'deploy': {
          const resources = state.getResourcesByKind(obj.kind) || [];
          if (obj.name) {
            obj.completed = resources.some((r) => r.name === obj.name || r.metadata?.name === obj.name);
            obj.current = obj.completed ? 1 : 0;
          } else {
            obj.current = resources.length;
            obj.completed = obj.current >= obj.target;
          }
          break;
        }
        case 'resolve': {
          const stats = this.incidentEngine.getStats();
          obj.current = Math.min(stats.totalResolved, obj.target);
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'investigate': {
          const active = this.incidentEngine.getActiveIncidents();
          const incident = active.find((i) => i.name === obj.incidentType);
          obj.current = incident?.investigationProgress >= 0.5 ? 1 : 0;
          obj.completed = obj.current >= 1;
          break;
        }
        case 'uptime': {
          const health = this.incidentEngine.getClusterHealth();
          obj.current = Math.round(health);
          obj.target = obj.percentage;
          obj.completed = health >= obj.percentage;
          break;
        }
        case 'connect': {
          const services = state.getResourcesByKind('Service') || [];
          obj.completed = services.some((s) => s.name === obj.to + '-svc' || s.name === obj.to);
          obj.current = obj.completed ? 1 : 0;
          break;
        }
        case 'scale': {
          const resources = state.getResourcesByKind(obj.kind) || [];
          const target = resources.find((r) => r.name === obj.name || r.metadata?.name === obj.name);
          const replicas = target?.spec?.replicas || 0;
          obj.current = replicas;
          obj.target = obj.replicas;
          obj.completed = replicas >= obj.replicas;
          break;
        }
        case 'hpa': {
          const hpas = state.getResourcesByKind('HorizontalPodAutoscaler') || [];
          obj.current = hpas.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'route': {
          const ingresses = state.getResourcesByKind('Ingress') || [];
          const paths = ingresses.flatMap((i) => i.spec?.rules?.flatMap((r) => r.paths?.map((p) => p.path)) || []);
          const matched = obj.paths.filter((p) => paths.includes(p));
          obj.current = matched.length;
          obj.target = obj.paths.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'tls': {
          const ingresses = state.getResourcesByKind('Ingress') || [];
          const hasTLS = ingresses.some((i) => i.spec?.tls && i.spec.tls.length > 0);
          obj.current = hasTLS ? 1 : 0;
          obj.completed = hasTLS;
          break;
        }
        case 'isolate': {
          const policies = state.getResourcesByKind('NetworkPolicy') || [];
          obj.completed = policies.some((p) =>
            p.spec?.namespace === obj.namespace || p.metadata?.namespace === obj.namespace
          );
          obj.current = obj.completed ? 1 : 0;
          break;
        }
        case 'allow':
        case 'deny': {
          const policies = state.getResourcesByKind('NetworkPolicy') || [];
          obj.current = policies.length > 0 ? 1 : 0;
          obj.completed = policies.length > 0;
          break;
        }
        case 'reschedule': {
          obj.current = state._rescheduledCount || 0;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'pdb': {
          const pdbs = state.getResourcesByKind('PodDisruptionBudget') || [];
          obj.current = pdbs.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'headless': {
          const services = state.getResourcesByKind('Service') || [];
          const headless = services.filter((s) => s.spec?.clusterIP === 'None');
          obj.current = headless.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'leastPrivilege': {
          const roles = state.getResourcesByKind('Role') || [];
          const hasWildcard = roles.some((r) => r.spec?.rules?.some((rule) => rule.verbs?.includes('*')));
          obj.completed = !hasWildcard && roles.length > 0;
          obj.current = obj.completed ? 1 : 0;
          break;
        }
        case 'probes': {
          const deps = state.getResourcesByKind('Deployment') || [];
          const withProbes = deps.filter((d) => d.spec?.livenessProbe && d.spec?.readinessProbe);
          obj.current = withProbes.length;
          obj.target = deps.length;
          obj.completed = withProbes.length === deps.length && deps.length > 0;
          break;
        }
        case 'architectureScore': {
          const score = this.scoringEngine.calculateArchitectureScore(state);
          obj.current = score.total;
          obj.target = obj.minScore;
          obj.completed = score.total >= obj.minScore;
          break;
        }
      }
    }
  }

  getCompletionPercentage() {
    if (this.objectiveProgress.length === 0) return 0;
    const completed = this.objectiveProgress.filter((o) => o.completed).length;
    return Math.round((completed / this.objectiveProgress.length) * 100);
  }

  checkCompletion() {
    if (this.objectiveProgress.every((obj) => obj.completed)) {
      this.complete();
    }
  }

  checkTimeout() {
    if (this.timeRemaining <= 0) {
      this.timeout();
    }
  }

  complete() {
    this.state = CHALLENGE_STATE.COMPLETED;
    this.stopTicking();
    this.incidentEngine.stop();

    const result = this.scoringEngine.completeChallenge(
      this.currentChallenge,
      this.elapsedTime,
      100
    );

    this.gameEngine.emit('challenge:completed', {
      challengeId: this.currentChallenge,
      title: this.currentChallengeDef.title,
      completionTime: Math.round(this.elapsedTime),
      timeLimit: this.currentChallengeDef.timeLimit,
      stars: result.stars,
      xpEarned: result.xpEarned
    });

    return result;
  }

  timeout() {
    this.state = CHALLENGE_STATE.FAILED;
    this.stopTicking();
    this.incidentEngine.stop();

    const percentage = this.getCompletionPercentage();
    const result = this.scoringEngine.completeChallenge(
      this.currentChallenge,
      this.currentChallengeDef.timeLimit,
      percentage
    );

    this.gameEngine.emit('challenge:timeout', {
      challengeId: this.currentChallenge,
      title: this.currentChallengeDef.title,
      completionPercentage: percentage,
      xpEarned: result.xpEarned
    });

    return result;
  }

  pause() {
    if (this.state !== CHALLENGE_STATE.PLAYING) return;
    this.state = CHALLENGE_STATE.PAUSED;
    this.pauseStart = Date.now();
    this.incidentEngine.pause();
    this.gameEngine.emit('challenge:paused', { challengeId: this.currentChallenge });
  }

  resume() {
    if (this.state !== CHALLENGE_STATE.PAUSED) return;
    this.state = CHALLENGE_STATE.PLAYING;
    this.pausedTime += Date.now() - this.pauseStart;
    this.incidentEngine.resume();
    this.gameEngine.emit('challenge:resumed', {});
  }

  retryChallenge() {
    if (!this.currentChallenge) return false;
    return this.startChallenge(this.currentChallenge);
  }

  getStatus() {
    return {
      state: this.state,
      challengeId: this.currentChallenge,
      title: this.currentChallengeDef?.title || null,
      elapsedTime: Math.round(this.elapsedTime),
      timeRemaining: Math.round(this.timeRemaining),
      timeLimit: this.currentChallengeDef?.timeLimit || 0,
      objectives: this.objectiveProgress,
      completionPercentage: this.getCompletionPercentage(),
      activeIncidents: this.incidentEngine.getActiveIncidents().length
    };
  }

  stopTicking() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  exitToMenu() {
    this.stopTicking();
    this.incidentEngine.stop();
    this.state = CHALLENGE_STATE.MENU;
    this.currentChallenge = null;
    this.currentChallengeDef = null;
    this.gameEngine.emit('challenge:exit-to-menu', {});
  }

  destroy() {
    this.stopTicking();
    this.gameEngine = null;
    this.incidentEngine = null;
    this.scoringEngine = null;
  }
}

export { ChallengeMode, CHALLENGE_STATE, CHALLENGES };
