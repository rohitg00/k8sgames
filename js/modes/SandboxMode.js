const SANDBOX_STATE = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused'
};

const ALL_RESOURCE_TYPES = [
  'Namespace', 'Pod', 'Deployment', 'ReplicaSet', 'StatefulSet', 'DaemonSet',
  'Job', 'CronJob', 'Service', 'Ingress', 'NetworkPolicy', 'ConfigMap',
  'Secret', 'PersistentVolume', 'PersistentVolumeClaim', 'StorageClass',
  'HorizontalPodAutoscaler', 'PodDisruptionBudget', 'ResourceQuota',
  'LimitRange', 'Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding',
  'ServiceAccount', 'Node'
];

class SandboxMode {
  constructor(gameEngine, scoringEngine) {
    this.gameEngine = gameEngine;
    this.scoringEngine = scoringEngine;
    this.state = SANDBOX_STATE.IDLE;
    this.startTime = 0;
    this.elapsedTime = 0;
    this.ticker = null;
    this.resourceCount = 0;
    this.architectureScore = null;
    this.autoScoreInterval = null;
  }

  start(initialNodes) {
    this.state = SANDBOX_STATE.PLAYING;
    this.startTime = Date.now();
    this.elapsedTime = 0;
    this.resourceCount = 0;
    this.architectureScore = null;

    this.setupCluster(initialNodes || 3);

    this.ticker = setInterval(() => this.update(), 1000);
    this.autoScoreInterval = setInterval(() => this.refreshArchitectureScore(), 10000);

    this.gameEngine.emit('sandbox:started', {
      availableResources: ALL_RESOURCE_TYPES,
      nodeCount: initialNodes || 3
    });
  }

  setupCluster(nodeCount) {
    const clusterState = this.gameEngine.getState();
    if (!clusterState) return;

    clusterState.clear();

    for (let i = 1; i <= nodeCount; i++) {
      clusterState.addResource({
        kind: 'Node',
        name: `sandbox-node-${i}`,
        metadata: { name: `sandbox-node-${i}`, namespace: 'default', labels: { role: 'worker' } },
        spec: { cpu: '16', memory: '32Gi', status: 'Ready' },
        status: { phase: 'Running' }
      });
    }

    clusterState.addResource({
      kind: 'Namespace',
      name: 'default',
      metadata: { name: 'default', labels: {} },
      spec: {},
      status: { phase: 'Active' }
    });
  }

  update() {
    if (this.state !== SANDBOX_STATE.PLAYING) return;

    this.elapsedTime = (Date.now() - this.startTime) / 1000;

    const state = this.gameEngine.getState();
    if (state) {
      const allResources = state.getAllResources ? state.getAllResources() : [];
      this.resourceCount = allResources.length;
    }

    this.gameEngine.emit('sandbox:update', {
      elapsedTime: Math.round(this.elapsedTime),
      resourceCount: this.resourceCount,
      architectureScore: this.architectureScore ? this.architectureScore.total : null
    });
  }

  addResource(kind, name, spec) {
    const state = this.gameEngine.getState();
    if (!state) return false;

    if (!ALL_RESOURCE_TYPES.includes(kind)) return false;

    const resource = {
      kind: kind,
      name: name,
      metadata: {
        name: name,
        namespace: spec?.namespace || 'default',
        labels: spec?.labels || {}
      },
      spec: spec || {},
      status: { phase: 'Running' }
    };

    state.addResource(resource);
    this.resourceCount++;

    this.gameEngine.emit('resource:created', {
      kind: kind,
      name: name,
      mode: 'sandbox',
      concurrentPods: kind === 'Pod' ? (state.getResourcesByKind('Pod') || []).length : undefined,
      nodeCount: kind === 'Node' ? (state.getResourcesByKind('Node') || []).length : undefined
    });

    return true;
  }

  removeResource(kind, name) {
    const state = this.gameEngine.getState();
    if (!state) return false;

    const removed = state.removeResource(kind, name);
    if (removed) {
      this.resourceCount--;
      this.gameEngine.emit('resource:removed', { kind, name, mode: 'sandbox' });
    }
    return removed;
  }

  getArchitectureScore() {
    const state = this.gameEngine.getState();
    if (!state) return null;

    this.architectureScore = this.scoringEngine.calculateArchitectureScore(state);

    this.gameEngine.emit('sandbox:architecture-score', {
      total: this.architectureScore.total,
      categories: Object.entries(this.architectureScore.categories).map(([key, val]) => ({
        name: key,
        score: val.score,
        recommendations: val.recommendations
      }))
    });

    return this.architectureScore;
  }

  refreshArchitectureScore() {
    if (this.state !== SANDBOX_STATE.PLAYING) return;
    this.getArchitectureScore();
  }

  exportClusterYAML() {
    const state = this.gameEngine.getState();
    if (!state) return '';

    const allResources = state.getAllResources ? state.getAllResources() : [];
    const documents = [];

    for (const resource of allResources) {
      const doc = {
        apiVersion: this.getApiVersion(resource.kind),
        kind: resource.kind,
        metadata: {
          name: resource.name || resource.metadata?.name,
          namespace: resource.metadata?.namespace || 'default'
        },
        spec: this.cleanSpec(resource.spec)
      };

      if (resource.metadata?.labels && Object.keys(resource.metadata.labels).length > 0) {
        doc.metadata.labels = resource.metadata.labels;
      }

      documents.push(doc);
    }

    const yaml = documents.map((doc) => this.toYAML(doc)).join('\n---\n');

    this.gameEngine.emit('sandbox:yaml-exported', { resourceCount: documents.length });
    this.gameEngine.emit('yaml:viewed', {});

    return yaml;
  }

  getApiVersion(kind) {
    const versionMap = {
      Pod: 'v1', Service: 'v1', Namespace: 'v1', ConfigMap: 'v1', Secret: 'v1',
      PersistentVolume: 'v1', PersistentVolumeClaim: 'v1', ServiceAccount: 'v1',
      Node: 'v1', ResourceQuota: 'v1', LimitRange: 'v1',
      Deployment: 'apps/v1', ReplicaSet: 'apps/v1', StatefulSet: 'apps/v1', DaemonSet: 'apps/v1',
      Job: 'batch/v1', CronJob: 'batch/v1',
      Ingress: 'networking.k8s.io/v1', NetworkPolicy: 'networking.k8s.io/v1',
      StorageClass: 'storage.k8s.io/v1',
      HorizontalPodAutoscaler: 'autoscaling/v2',
      PodDisruptionBudget: 'policy/v1',
      Role: 'rbac.authorization.k8s.io/v1',
      ClusterRole: 'rbac.authorization.k8s.io/v1',
      RoleBinding: 'rbac.authorization.k8s.io/v1',
      ClusterRoleBinding: 'rbac.authorization.k8s.io/v1'
    };
    return versionMap[kind] || 'v1';
  }

  cleanSpec(spec) {
    if (!spec) return {};
    const cleaned = {};
    for (const [key, value] of Object.entries(spec)) {
      if (key === 'status') continue;
      if (value === null || value === undefined) continue;
      cleaned[key] = value;
    }
    return cleaned;
  }

  toYAML(obj, indent) {
    indent = indent || 0;
    const pad = '  '.repeat(indent);
    let result = '';

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'object' && item !== null) {
          result += `${pad}-\n${this.toYAML(item, indent + 1)}`;
        } else {
          result += `${pad}- ${item}\n`;
        }
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value) && value.length === 0) {
            result += `${pad}${key}: []\n`;
          } else if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
            result += `${pad}${key}: {}\n`;
          } else {
            result += `${pad}${key}:\n${this.toYAML(value, indent + 1)}`;
          }
        } else {
          const val = typeof value === 'string' && (value.includes(':') || value.includes('#'))
            ? `"${value}"` : value;
          result += `${pad}${key}: ${val}\n`;
        }
      }
    }

    return result;
  }

  pause() {
    if (this.state !== SANDBOX_STATE.PLAYING) return;
    this.state = SANDBOX_STATE.PAUSED;
    this.gameEngine.emit('sandbox:paused', {});
  }

  resume() {
    if (this.state !== SANDBOX_STATE.PAUSED) return;
    this.state = SANDBOX_STATE.PLAYING;
    this.gameEngine.emit('sandbox:resumed', {});
  }

  getStatus() {
    return {
      state: this.state,
      elapsedTime: Math.round(this.elapsedTime),
      resourceCount: this.resourceCount,
      availableResources: ALL_RESOURCE_TYPES,
      architectureScore: this.architectureScore
    };
  }

  stopTicking() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (this.autoScoreInterval) {
      clearInterval(this.autoScoreInterval);
      this.autoScoreInterval = null;
    }
  }

  exit() {
    this.stopTicking();
    this.state = SANDBOX_STATE.IDLE;
    this.gameEngine.emit('sandbox:exited', {});
  }

  destroy() {
    this.stopTicking();
    this.gameEngine = null;
    this.scoringEngine = null;
  }
}

export { SandboxMode, SANDBOX_STATE, ALL_RESOURCE_TYPES };
