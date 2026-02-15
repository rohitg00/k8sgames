import { ResourceBase } from '../resources/ResourceBase.js';

const RESOURCE_KINDS = [
  'Node', 'Namespace', 'Pod', 'Deployment', 'ReplicaSet', 'StatefulSet',
  'DaemonSet', 'Job', 'CronJob', 'Service', 'Ingress', 'NetworkPolicy',
  'ConfigMap', 'Secret', 'PersistentVolume', 'PersistentVolumeClaim',
  'StorageClass', 'HorizontalPodAutoscaler',
];

const OWNER_CHAINS = {
  Deployment: ['ReplicaSet'],
  ReplicaSet: ['Pod'],
  StatefulSet: ['Pod'],
  DaemonSet: ['Pod'],
  Job: ['Pod'],
  CronJob: ['Job'],
};

export class ClusterState {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.resources = new Map();
    this.relationships = new Map();
    this.reverseRelationships = new Map();
    this.kindIndex = new Map();
    this.namespaceIndex = new Map();
    this.nameIndex = new Map();
    this.labelIndex = new Map();
    this.resourceQuotas = new Map();
    this.limitRanges = new Map();
    this._watchCallbacks = new Map();
    this._batchMode = false;
    this._batchedEvents = [];

    for (const kind of RESOURCE_KINDS) {
      this.kindIndex.set(kind, new Set());
    }

    this._initDefaultNamespaces();
  }

  _initDefaultNamespaces() {
    const defaults = ['default', 'kube-system', 'kube-public', 'kube-node-lease'];
    for (const ns of defaults) {
      const resource = new ResourceBase('Namespace', 'v1', ns, '');
      resource.setPhase('Active');
      resource.setLabel('kubernetes.io/metadata.name', ns);
      this.add(resource);
    }
  }

  get totalResources() {
    return this.resources.size;
  }

  startBatch() {
    this._batchMode = true;
    this._batchedEvents = [];
  }

  flushBatch() {
    this._batchMode = false;
    for (const evt of this._batchedEvents) {
      this._emitEvent(evt.type, evt.resource, evt.extra);
    }
    this._batchedEvents = [];
  }

  _emitEvent(type, resource, extra = {}) {
    const payload = {
      type,
      resource,
      kind: resource.kind,
      name: resource.metadata.name,
      namespace: resource.metadata.namespace,
      uid: resource.metadata.uid,
      timestamp: Date.now(),
      ...extra,
    };
    if (this._batchMode) {
      this._batchedEvents.push({ type, resource, extra });
      return;
    }
    if (this.eventBus) {
      this.eventBus.emit(`cluster:${type}`, payload);
      this.eventBus.emit(`cluster:${type}:${resource.kind}`, payload);
    }
    const watchers = this._watchCallbacks.get(resource.kind) || [];
    for (const cb of watchers) {
      cb(payload);
    }
  }

  add(resource) {
    if (!(resource instanceof ResourceBase)) {
      throw new Error('Resource must be an instance of ResourceBase');
    }
    const existing = this.resources.get(resource.uid);
    if (existing) {
      return this.update(resource.uid, resource);
    }

    this.resources.set(resource.uid, resource);
    this._addToKindIndex(resource);
    this._addToNamespaceIndex(resource);
    this._addToNameIndex(resource);
    this._addToLabelIndex(resource);
    this.relationships.set(resource.uid, new Set());
    this.reverseRelationships.set(resource.uid, new Set());

    for (const ref of resource.metadata.ownerReferences) {
      this._addRelationship(ref.uid, resource.uid);
    }

    this._emitEvent('added', resource);
    return resource;
  }

  update(uid, updates) {
    const resource = this.resources.get(uid);
    if (!resource) return null;

    this._removeFromLabelIndex(resource);

    if (updates instanceof ResourceBase) {
      const oldPhase = resource.status.phase;
      resource.spec = JSON.parse(JSON.stringify(updates.spec));
      resource.status = JSON.parse(JSON.stringify(updates.status));
      Object.assign(resource.metadata.labels, updates.metadata.labels);
      Object.assign(resource.metadata.annotations, updates.metadata.annotations);
      resource._bumpResourceVersion();

      if (oldPhase !== resource.status.phase) {
        resource.recordEvent('Normal', 'PhaseChange', `Phase changed from ${oldPhase} to ${resource.status.phase}`);
      }
    } else if (typeof updates === 'object') {
      if (updates.spec) {
        Object.assign(resource.spec, updates.spec);
        resource.metadata.generation++;
      }
      if (updates.status) {
        const oldPhase = resource.status.phase;
        Object.assign(resource.status, updates.status);
        if (updates.status.conditions) {
          resource.status.conditions = updates.status.conditions;
        }
        if (oldPhase !== resource.status.phase) {
          resource.recordEvent('Normal', 'PhaseChange', `Phase changed from ${oldPhase} to ${resource.status.phase}`);
        }
      }
      if (updates.metadata) {
        if (updates.metadata.labels) Object.assign(resource.metadata.labels, updates.metadata.labels);
        if (updates.metadata.annotations) Object.assign(resource.metadata.annotations, updates.metadata.annotations);
      }
      resource._bumpResourceVersion();
    }

    this._addToLabelIndex(resource);
    this._emitEvent('modified', resource);
    return resource;
  }

  remove(uid) {
    const resource = this.resources.get(uid);
    if (!resource) return null;

    if (resource.metadata.finalizers.length > 0) {
      resource.markForDeletion();
      this._emitEvent('modified', resource, { deletionPending: true });
      return resource;
    }

    const children = this.getChildren(uid);
    for (const child of children) {
      this.remove(child.uid);
    }

    this._removeFromKindIndex(resource);
    this._removeFromNamespaceIndex(resource);
    this._removeFromNameIndex(resource);
    this._removeFromLabelIndex(resource);

    const parents = this.reverseRelationships.get(uid);
    if (parents) {
      for (const parentUid of parents) {
        const parentRels = this.relationships.get(parentUid);
        if (parentRels) parentRels.delete(uid);
      }
    }

    const childRels = this.relationships.get(uid);
    if (childRels) {
      for (const childUid of childRels) {
        const reverseRels = this.reverseRelationships.get(childUid);
        if (reverseRels) reverseRels.delete(uid);
      }
    }

    this.relationships.delete(uid);
    this.reverseRelationships.delete(uid);
    this.resources.delete(uid);

    resource._deleted = true;
    this._emitEvent('deleted', resource);
    return resource;
  }

  get(uid) {
    return this.resources.get(uid) || null;
  }

  getByName(kind, name, namespace = 'default') {
    const key = `${kind}:${namespace}:${name}`;
    const uid = this.nameIndex.get(key);
    if (!uid) return null;
    return this.resources.get(uid) || null;
  }

  getByKind(kind) {
    const uids = this.kindIndex.get(kind);
    if (!uids) return [];
    const results = [];
    for (const uid of uids) {
      const r = this.resources.get(uid);
      if (r) results.push(r);
    }
    return results;
  }

  getByNamespace(namespace) {
    const uids = this.namespaceIndex.get(namespace);
    if (!uids) return [];
    const results = [];
    for (const uid of uids) {
      const r = this.resources.get(uid);
      if (r) results.push(r);
    }
    return results;
  }

  getByKindAndNamespace(kind, namespace) {
    const kindUids = this.kindIndex.get(kind);
    if (!kindUids) return [];
    const nsUids = this.namespaceIndex.get(namespace);
    if (!nsUids) return [];
    const results = [];
    for (const uid of kindUids) {
      if (nsUids.has(uid)) {
        const r = this.resources.get(uid);
        if (r) results.push(r);
      }
    }
    return results;
  }

  query(options = {}) {
    let results = [];

    if (options.kind) {
      results = this.getByKind(options.kind);
    } else if (options.namespace) {
      results = this.getByNamespace(options.namespace);
    } else {
      results = Array.from(this.resources.values());
    }

    if (options.kind && options.namespace) {
      results = results.filter((r) => r.metadata.namespace === options.namespace);
    }

    if (options.selector) {
      results = results.filter((r) => r.matchesSelector(options.selector));
    }

    if (options.fieldSelector) {
      for (const [field, value] of Object.entries(options.fieldSelector)) {
        results = results.filter((r) => r.matchesFieldSelector(field, value));
      }
    }

    if (options.phase) {
      results = results.filter((r) => r.status.phase === options.phase);
    }

    if (options.name) {
      results = results.filter((r) => r.metadata.name.includes(options.name));
    }

    if (options.sortBy) {
      const key = options.sortBy;
      results.sort((a, b) => {
        const av = a.metadata[key] || a.status[key] || '';
        const bv = b.metadata[key] || b.status[key] || '';
        if (av < bv) return options.sortOrder === 'desc' ? 1 : -1;
        if (av > bv) return options.sortOrder === 'desc' ? -1 : 1;
        return 0;
      });
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  selectByLabels(kind, selector) {
    const candidates = this.getByKind(kind);
    return candidates.filter((r) => r.matchesSelector(selector));
  }

  findPodsForService(serviceName, namespace = 'default') {
    const svc = this.getByName('Service', serviceName, namespace);
    if (!svc || !svc.spec.selector) return [];
    return this.selectByLabels('Pod', svc.spec.selector).filter(
      (p) => p.metadata.namespace === namespace
    );
  }

  findServiceForPod(podUid) {
    const pod = this.get(podUid);
    if (!pod) return [];
    const services = this.getByKindAndNamespace('Service', pod.metadata.namespace);
    return services.filter((svc) => {
      if (!svc.spec.selector) return false;
      return pod.matchesSelector(svc.spec.selector);
    });
  }

  getOwnerChain(uid) {
    const chain = [];
    let current = this.get(uid);
    while (current) {
      chain.unshift(current);
      const owner = current.getControllerOwner();
      if (!owner) break;
      current = this.get(owner.uid);
    }
    return chain;
  }

  getChildren(uid) {
    const childUids = this.relationships.get(uid);
    if (!childUids) return [];
    const results = [];
    for (const childUid of childUids) {
      const r = this.resources.get(childUid);
      if (r) results.push(r);
    }
    return results;
  }

  getDescendants(uid) {
    const descendants = [];
    const queue = [uid];
    const visited = new Set();
    while (queue.length > 0) {
      const currentUid = queue.shift();
      if (visited.has(currentUid)) continue;
      visited.add(currentUid);
      const children = this.getChildren(currentUid);
      for (const child of children) {
        descendants.push(child);
        queue.push(child.uid);
      }
    }
    return descendants;
  }

  getParents(uid) {
    const parentUids = this.reverseRelationships.get(uid);
    if (!parentUids) return [];
    const results = [];
    for (const parentUid of parentUids) {
      const r = this.resources.get(parentUid);
      if (r) results.push(r);
    }
    return results;
  }

  _addRelationship(parentUid, childUid) {
    let parentChildren = this.relationships.get(parentUid);
    if (!parentChildren) {
      parentChildren = new Set();
      this.relationships.set(parentUid, parentChildren);
    }
    parentChildren.add(childUid);

    let childParents = this.reverseRelationships.get(childUid);
    if (!childParents) {
      childParents = new Set();
      this.reverseRelationships.set(childUid, childParents);
    }
    childParents.add(parentUid);
  }

  addRelationship(parentUid, childUid) {
    this._addRelationship(parentUid, childUid);
    const child = this.get(childUid);
    const parent = this.get(parentUid);
    if (child && parent) {
      child.addOwnerReference(parent);
    }
  }

  _addToKindIndex(resource) {
    let set = this.kindIndex.get(resource.kind);
    if (!set) {
      set = new Set();
      this.kindIndex.set(resource.kind, set);
    }
    set.add(resource.uid);
  }

  _removeFromKindIndex(resource) {
    const set = this.kindIndex.get(resource.kind);
    if (set) set.delete(resource.uid);
  }

  _addToNamespaceIndex(resource) {
    const ns = resource.metadata.namespace || '';
    let set = this.namespaceIndex.get(ns);
    if (!set) {
      set = new Set();
      this.namespaceIndex.set(ns, set);
    }
    set.add(resource.uid);
  }

  _removeFromNamespaceIndex(resource) {
    const ns = resource.metadata.namespace || '';
    const set = this.namespaceIndex.get(ns);
    if (set) set.delete(resource.uid);
  }

  _addToNameIndex(resource) {
    const key = `${resource.kind}:${resource.metadata.namespace}:${resource.metadata.name}`;
    this.nameIndex.set(key, resource.uid);
  }

  _removeFromNameIndex(resource) {
    const key = `${resource.kind}:${resource.metadata.namespace}:${resource.metadata.name}`;
    this.nameIndex.delete(key);
  }

  _addToLabelIndex(resource) {
    for (const [key, value] of Object.entries(resource.metadata.labels)) {
      const indexKey = `${key}=${value}`;
      let set = this.labelIndex.get(indexKey);
      if (!set) {
        set = new Set();
        this.labelIndex.set(indexKey, set);
      }
      set.add(resource.uid);
    }
  }

  _removeFromLabelIndex(resource) {
    for (const [key, value] of Object.entries(resource.metadata.labels)) {
      const indexKey = `${key}=${value}`;
      const set = this.labelIndex.get(indexKey);
      if (set) set.delete(resource.uid);
    }
  }

  getByLabel(key, value) {
    const indexKey = `${key}=${value}`;
    const uids = this.labelIndex.get(indexKey);
    if (!uids) return [];
    const results = [];
    for (const uid of uids) {
      const r = this.resources.get(uid);
      if (r) results.push(r);
    }
    return results;
  }

  watch(kind, callback) {
    if (!this._watchCallbacks.has(kind)) {
      this._watchCallbacks.set(kind, []);
    }
    this._watchCallbacks.get(kind).push(callback);
    return () => {
      const list = this._watchCallbacks.get(kind);
      if (list) {
        this._watchCallbacks.set(
          kind,
          list.filter((cb) => cb !== callback)
        );
      }
    };
  }

  setResourceQuota(namespace, quota) {
    this.resourceQuotas.set(namespace, {
      hard: { ...quota },
      used: this._calculateQuotaUsage(namespace),
    });
  }

  getResourceQuota(namespace) {
    return this.resourceQuotas.get(namespace) || null;
  }

  _calculateQuotaUsage(namespace) {
    const pods = this.getByKindAndNamespace('Pod', namespace);
    let cpuUsed = 0;
    let memoryUsed = 0;
    let podCount = 0;

    for (const pod of pods) {
      if (pod.status.phase === 'Running' || pod.status.phase === 'Pending') {
        podCount++;
        const containers = pod.spec.containers || [];
        for (const c of containers) {
          const requests = (c.resources && c.resources.requests) || {};
          cpuUsed += this._parseCpu(requests.cpu || '0');
          memoryUsed += this._parseMemory(requests.memory || '0');
        }
      }
    }

    return { pods: podCount, cpu: cpuUsed, memory: memoryUsed };
  }

  checkQuota(namespace, requestedCpu, requestedMemory) {
    const quota = this.resourceQuotas.get(namespace);
    if (!quota) return { allowed: true };

    const usage = this._calculateQuotaUsage(namespace);
    const violations = [];

    if (quota.hard.cpu && usage.cpu + requestedCpu > quota.hard.cpu) {
      violations.push(`CPU quota exceeded: ${usage.cpu + requestedCpu}m > ${quota.hard.cpu}m`);
    }
    if (quota.hard.memory && usage.memory + requestedMemory > quota.hard.memory) {
      violations.push(`Memory quota exceeded: ${usage.memory + requestedMemory}Mi > ${quota.hard.memory}Mi`);
    }
    if (quota.hard.pods !== undefined) {
      const podCount = usage.pods + 1;
      if (podCount > quota.hard.pods) {
        violations.push(`Pod count exceeded: ${podCount} > ${quota.hard.pods}`);
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      usage,
    };
  }

  _parseCpu(value) {
    if (typeof value === 'number') return value;
    const str = String(value);
    if (str.endsWith('m')) return parseInt(str, 10);
    return parseFloat(str) * 1000;
  }

  _parseMemory(value) {
    if (typeof value === 'number') return value;
    const str = String(value);
    if (str.endsWith('Gi')) return parseFloat(str) * 1024;
    if (str.endsWith('Mi')) return parseFloat(str);
    if (str.endsWith('Ki')) return parseFloat(str) / 1024;
    return parseFloat(str) / (1024 * 1024);
  }

  getNodeAllocatable(nodeName) {
    const node = this.getByName('Node', nodeName, '');
    if (!node) return null;

    const capacity = node.status.capacity || { cpu: 4000, memory: 8192 };
    const pods = this.getByKind('Pod').filter(
      (p) => p.spec.nodeName === nodeName && (p.status.phase === 'Running' || p.status.phase === 'Pending')
    );

    let cpuUsed = 0;
    let memoryUsed = 0;

    for (const pod of pods) {
      const containers = pod.spec.containers || [];
      for (const c of containers) {
        const requests = (c.resources && c.resources.requests) || {};
        cpuUsed += this._parseCpu(requests.cpu || '0');
        memoryUsed += this._parseMemory(requests.memory || '0');
      }
    }

    return {
      cpu: { capacity: capacity.cpu, used: cpuUsed, available: capacity.cpu - cpuUsed },
      memory: { capacity: capacity.memory, used: memoryUsed, available: capacity.memory - memoryUsed },
      podCount: pods.length,
    };
  }

  getClusterStats() {
    const nodes = this.getByKind('Node');
    const pods = this.getByKind('Pod');
    const deployments = this.getByKind('Deployment');
    const services = this.getByKind('Service');
    const namespaces = this.getByKind('Namespace');

    let totalCpu = 0;
    let usedCpu = 0;
    let totalMemory = 0;
    let usedMemory = 0;

    for (const node of nodes) {
      const alloc = this.getNodeAllocatable(node.name);
      if (alloc) {
        totalCpu += alloc.cpu.capacity;
        usedCpu += alloc.cpu.used;
        totalMemory += alloc.memory.capacity;
        usedMemory += alloc.memory.used;
      }
    }

    const podPhases = { Pending: 0, Running: 0, Succeeded: 0, Failed: 0, Unknown: 0 };
    for (const pod of pods) {
      const phase = pod.status.phase || 'Unknown';
      podPhases[phase] = (podPhases[phase] || 0) + 1;
    }

    return {
      nodes: { total: nodes.length, ready: nodes.filter((n) => n.isConditionTrue('Ready')).length },
      pods: { total: pods.length, ...podPhases },
      deployments: { total: deployments.length, available: deployments.filter((d) => d.isConditionTrue('Available')).length },
      services: { total: services.length },
      namespaces: { total: namespaces.length },
      resources: { total: this.resources.size },
      cpu: { total: totalCpu, used: usedCpu, percent: totalCpu > 0 ? Math.round((usedCpu / totalCpu) * 100) : 0 },
      memory: { total: totalMemory, used: usedMemory, percent: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0 },
    };
  }

  getResourceGraph() {
    const nodes = [];
    const edges = [];

    for (const [uid, resource] of this.resources) {
      nodes.push({
        id: uid,
        kind: resource.kind,
        name: resource.metadata.name,
        namespace: resource.metadata.namespace,
        phase: resource.status.phase,
      });
    }

    for (const [parentUid, childUids] of this.relationships) {
      for (const childUid of childUids) {
        if (this.resources.has(parentUid) && this.resources.has(childUid)) {
          edges.push({ source: parentUid, target: childUid });
        }
      }
    }

    return { nodes, edges };
  }

  snapshot() {
    const data = {};
    for (const [uid, resource] of this.resources) {
      data[uid] = resource.toJSON();
    }
    return {
      timestamp: Date.now(),
      resourceCount: this.resources.size,
      resources: data,
    };
  }

  clear() {
    this.resources.clear();
    this.relationships.clear();
    this.reverseRelationships.clear();
    this.nameIndex.clear();
    this.labelIndex.clear();
    this.resourceQuotas.clear();
    this.limitRanges.clear();

    for (const [, set] of this.kindIndex) {
      set.clear();
    }
    for (const [, set] of this.namespaceIndex) {
      set.clear();
    }

    this._initDefaultNamespaces();

    if (this.eventBus) {
      this.eventBus.emit('cluster:reset', { timestamp: Date.now() });
    }
  }

  getExpectedChildKinds(kind) {
    return OWNER_CHAINS[kind] || [];
  }

  getAllKinds() {
    return [...RESOURCE_KINDS];
  }
}

export default ClusterState;
