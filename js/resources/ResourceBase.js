let uidCounter = 0;

function generateUID() {
  uidCounter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}-${uidCounter.toString(36).padStart(4, '0')}`;
}

export class ResourceBase {
  constructor(kind, apiVersionOrMeta, name, namespace = 'default') {
    this.kind = kind;
    if (typeof apiVersionOrMeta === 'object' && apiVersionOrMeta !== null) {
      const meta = apiVersionOrMeta;
      this.apiVersion = meta.apiVersion || 'v1';
      this.metadata = {
        name: meta.name || 'unnamed',
        namespace: meta.namespace || 'default',
        uid: generateUID(),
        labels: meta.labels ? { ...meta.labels } : {},
        annotations: meta.annotations ? { ...meta.annotations } : {},
        creationTimestamp: new Date().toISOString(),
        deletionTimestamp: null,
        generation: 1,
        resourceVersion: '1',
        ownerReferences: meta.ownerReferences ? [...meta.ownerReferences] : [],
        finalizers: meta.finalizers ? [...meta.finalizers] : [],
      };
    } else {
      this.apiVersion = apiVersionOrMeta || 'v1';
      this.metadata = {
        name: name || 'unnamed',
        namespace,
        uid: generateUID(),
        labels: {},
        annotations: {},
        creationTimestamp: new Date().toISOString(),
        deletionTimestamp: null,
        generation: 1,
        resourceVersion: '1',
        ownerReferences: [],
        finalizers: [],
      };
    }
    this.spec = {};
    this.status = {
      phase: 'Pending',
      conditions: [],
      observedGeneration: 0,
    };
    this._events = [];
    this._maxEvents = 50;
    this._deleted = false;
    this._listeners = new Map();
  }

  get name() {
    return this.metadata.name;
  }

  get namespace() {
    return this.metadata.namespace;
  }

  get uid() {
    return this.metadata.uid;
  }

  get labels() {
    return this.metadata.labels;
  }

  get annotations() {
    return this.metadata.annotations;
  }

  get age() {
    const created = new Date(this.metadata.creationTimestamp).getTime();
    return Date.now() - created;
  }

  get ageFormatted() {
    const ms = this.age;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  get isDeleting() {
    return this.metadata.deletionTimestamp !== null;
  }

  get fullyQualifiedName() {
    return `${this.metadata.namespace}/${this.kind}/${this.metadata.name}`;
  }

  setLabel(key, value) {
    this.metadata.labels[key] = value;
    this._bumpResourceVersion();
    return this;
  }

  removeLabel(key) {
    delete this.metadata.labels[key];
    this._bumpResourceVersion();
    return this;
  }

  setAnnotation(key, value) {
    this.metadata.annotations[key] = value;
    this._bumpResourceVersion();
    return this;
  }

  removeAnnotation(key) {
    delete this.metadata.annotations[key];
    this._bumpResourceVersion();
    return this;
  }

  matchesSelector(selector) {
    if (!selector || Object.keys(selector).length === 0) return true;
    for (const [key, value] of Object.entries(selector)) {
      if (this.metadata.labels[key] !== value) return false;
    }
    return true;
  }

  matchesFieldSelector(field, value) {
    const parts = field.split('.');
    let current = this;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return false;
      current = current[part];
    }
    return String(current) === String(value);
  }

  addOwnerReference(owner) {
    const ref = {
      apiVersion: owner.apiVersion,
      kind: owner.kind,
      name: owner.metadata.name,
      uid: owner.metadata.uid,
      controller: true,
      blockOwnerDeletion: true,
    };
    const existing = this.metadata.ownerReferences.findIndex(
      (r) => r.uid === ref.uid
    );
    if (existing >= 0) {
      this.metadata.ownerReferences[existing] = ref;
    } else {
      this.metadata.ownerReferences.push(ref);
    }
    this._bumpResourceVersion();
    return this;
  }

  removeOwnerReference(ownerUid) {
    this.metadata.ownerReferences = this.metadata.ownerReferences.filter(
      (r) => r.uid !== ownerUid
    );
    this._bumpResourceVersion();
    return this;
  }

  getControllerOwner() {
    return this.metadata.ownerReferences.find((r) => r.controller) || null;
  }

  addFinalizer(name) {
    if (!this.metadata.finalizers.includes(name)) {
      this.metadata.finalizers.push(name);
      this._bumpResourceVersion();
    }
    return this;
  }

  removeFinalizer(name) {
    this.metadata.finalizers = this.metadata.finalizers.filter(
      (f) => f !== name
    );
    this._bumpResourceVersion();
    return this;
  }

  markForDeletion() {
    if (!this.metadata.deletionTimestamp) {
      this.metadata.deletionTimestamp = new Date().toISOString();
      this._bumpResourceVersion();
      this.recordEvent('Normal', 'Killing', 'Resource marked for deletion');
    }
    return this;
  }

  canBeRemoved() {
    return (
      this.metadata.deletionTimestamp !== null &&
      this.metadata.finalizers.length === 0
    );
  }

  setCondition(type, status, reason = '', message = '') {
    const now = new Date().toISOString();
    const existing = this.status.conditions.findIndex((c) => c.type === type);
    const condition = {
      type,
      status: String(status),
      reason,
      message,
      lastTransitionTime: now,
      lastHeartbeatTime: now,
    };
    if (existing >= 0) {
      const prev = this.status.conditions[existing];
      if (prev.status === condition.status) {
        condition.lastTransitionTime = prev.lastTransitionTime;
      }
      this.status.conditions[existing] = condition;
    } else {
      this.status.conditions.push(condition);
    }
    this._bumpResourceVersion();
    return this;
  }

  getCondition(type) {
    return this.status.conditions.find((c) => c.type === type) || null;
  }

  isConditionTrue(type) {
    const condition = this.getCondition(type);
    return condition ? condition.status === 'True' : false;
  }

  setPhase(phase) {
    if (this.status.phase !== phase) {
      const oldPhase = this.status.phase;
      this.status.phase = phase;
      this._bumpResourceVersion();
      this.recordEvent(
        'Normal',
        'PhaseChange',
        `Phase changed from ${oldPhase} to ${phase}`
      );
    }
    return this;
  }

  setStatus(status) {
    return this.setPhase(status);
  }

  updateSpec(partialSpec) {
    Object.assign(this.spec, partialSpec);
    this.metadata.generation++;
    this._bumpResourceVersion();
    return this;
  }

  get events() {
    return this._events;
  }

  tick(deltaTime) {}

  addEvent(type, reason, message) {
    return this.recordEvent(type, reason, message);
  }

  recordEvent(type, reason, message) {
    const event = {
      type,
      reason,
      message,
      timestamp: new Date().toISOString(),
      count: 1,
      source: this.kind,
      involvedObject: {
        kind: this.kind,
        name: this.metadata.name,
        namespace: this.metadata.namespace,
        uid: this.metadata.uid,
      },
    };
    if (this._events.length > 0) {
      const last = this._events[this._events.length - 1];
      if (last.reason === reason && last.message === message) {
        last.count++;
        last.timestamp = event.timestamp;
        return this;
      }
    }
    this._events.push(event);
    if (this._events.length > this._maxEvents) {
      this._events.shift();
    }
    return this;
  }

  getEvents(limit) {
    if (limit) {
      return this._events.slice(-limit);
    }
    return [...this._events];
  }

  getWarningEvents() {
    return this._events.filter((e) => e.type === 'Warning');
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
    return this;
  }

  off(event, callback) {
    const list = this._listeners.get(event);
    if (list) {
      this._listeners.set(
        event,
        list.filter((cb) => cb !== callback)
      );
    }
    return this;
  }

  emit(event, data) {
    const list = this._listeners.get(event);
    if (list) {
      for (const cb of list) {
        cb(data);
      }
    }
  }

  _bumpResourceVersion() {
    this.metadata.resourceVersion = String(
      parseInt(this.metadata.resourceVersion, 10) + 1
    );
  }

  toJSON() {
    return {
      apiVersion: this.apiVersion,
      kind: this.kind,
      metadata: {
        ...this.metadata,
        ownerReferences: [...this.metadata.ownerReferences],
        finalizers: [...this.metadata.finalizers],
        labels: { ...this.metadata.labels },
        annotations: { ...this.metadata.annotations },
      },
      spec: JSON.parse(JSON.stringify(this.spec)),
      status: {
        ...this.status,
        conditions: this.status.conditions.map((c) => ({ ...c })),
      },
    };
  }

  toYAML(indent = 0) {
    const pad = (level) => '  '.repeat(level);
    const lines = [];

    const renderValue = (val, level) => {
      if (val === null || val === undefined) return 'null';
      if (typeof val === 'boolean') return String(val);
      if (typeof val === 'number') return String(val);
      if (typeof val === 'string') {
        if (val.includes('\n') || val.includes(':') || val.includes('#') || val.includes("'") || val === '') {
          return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
        }
        return val;
      }
      return String(val);
    };

    const renderObject = (obj, level) => {
      if (obj === null || obj === undefined) {
        lines.push(`${pad(level)}null`);
        return;
      }
      if (Array.isArray(obj)) {
        if (obj.length === 0) {
          lines[lines.length - 1] += ' []';
          return;
        }
        for (const item of obj) {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const entries = Object.entries(item);
            if (entries.length > 0) {
              const [firstKey, firstVal] = entries[0];
              if (typeof firstVal === 'object' && firstVal !== null) {
                lines.push(`${pad(level)}- ${firstKey}:`);
                renderObject(firstVal, level + 2);
              } else {
                lines.push(`${pad(level)}- ${firstKey}: ${renderValue(firstVal, level + 1)}`);
              }
              for (let i = 1; i < entries.length; i++) {
                const [k, v] = entries[i];
                if (typeof v === 'object' && v !== null) {
                  lines.push(`${pad(level + 1)}${k}:`);
                  renderObject(v, level + 2);
                } else {
                  lines.push(`${pad(level + 1)}${k}: ${renderValue(v, level + 1)}`);
                }
              }
            } else {
              lines.push(`${pad(level)}- {}`);
            }
          } else {
            lines.push(`${pad(level)}- ${renderValue(item, level)}`);
          }
        }
        return;
      }
      const entries = Object.entries(obj);
      if (entries.length === 0) {
        lines[lines.length - 1] += ' {}';
        return;
      }
      for (const [key, value] of entries) {
        if (value === undefined) continue;
        if (typeof value === 'object' && value !== null) {
          lines.push(`${pad(level)}${key}:`);
          renderObject(value, level + 1);
        } else {
          lines.push(`${pad(level)}${key}: ${renderValue(value, level)}`);
        }
      }
    };

    lines.push(`${pad(indent)}apiVersion: ${renderValue(this.apiVersion, indent)}`);
    lines.push(`${pad(indent)}kind: ${renderValue(this.kind, indent)}`);
    lines.push(`${pad(indent)}metadata:`);
    renderObject(
      {
        name: this.metadata.name,
        namespace: this.metadata.namespace,
        uid: this.metadata.uid,
        labels: Object.keys(this.metadata.labels).length > 0 ? this.metadata.labels : undefined,
        annotations: Object.keys(this.metadata.annotations).length > 0 ? this.metadata.annotations : undefined,
        creationTimestamp: this.metadata.creationTimestamp,
        ownerReferences: this.metadata.ownerReferences.length > 0 ? this.metadata.ownerReferences : undefined,
      },
      indent + 1
    );
    lines.push(`${pad(indent)}spec:`);
    renderObject(this.spec, indent + 1);
    lines.push(`${pad(indent)}status:`);
    renderObject(this.status, indent + 1);

    return lines.join('\n');
  }

  clone() {
    const cloned = new ResourceBase(this.kind, this.apiVersion, this.metadata.name, this.metadata.namespace);
    cloned.metadata = JSON.parse(JSON.stringify(this.metadata));
    cloned.metadata.uid = generateUID();
    cloned.spec = JSON.parse(JSON.stringify(this.spec));
    cloned.status = JSON.parse(JSON.stringify(this.status));
    cloned._events = [];
    return cloned;
  }

  equals(other) {
    if (!other || !(other instanceof ResourceBase)) return false;
    return this.metadata.uid === other.metadata.uid;
  }

  toString() {
    return `${this.kind}/${this.metadata.namespace}/${this.metadata.name}`;
  }
}

export default ResourceBase;
