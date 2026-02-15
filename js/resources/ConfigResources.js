import { ResourceBase } from './ResourceBase.js';

export class ConfigMap extends ResourceBase {
  constructor(metadata = {}) {
    super('ConfigMap', metadata);
    this.data = metadata.data || {};
    this.binaryData = metadata.binaryData || {};
    this.immutable = metadata.immutable || false;
    this.mountedBy = [];
    this.envInjectedBy = [];
    this.setStatus('Active');
  }

  setData(key, value) {
    if (this.immutable) {
      this.addEvent('Warning', 'ImmutableViolation', `Cannot modify immutable ConfigMap`);
      return false;
    }
    this.data[key] = value;
    this.addEvent('Normal', 'Updated', `Key "${key}" updated`);
    return true;
  }

  deleteData(key) {
    if (this.immutable) {
      this.addEvent('Warning', 'ImmutableViolation', `Cannot modify immutable ConfigMap`);
      return false;
    }
    delete this.data[key];
    this.addEvent('Normal', 'Updated', `Key "${key}" deleted`);
    return true;
  }

  getData(key) {
    return this.data[key];
  }

  getKeys() {
    return Object.keys(this.data);
  }

  getSize() {
    return Object.entries(this.data).reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  }

  addMountReference(podName) {
    if (!this.mountedBy.includes(podName)) {
      this.mountedBy.push(podName);
    }
  }

  removeMountReference(podName) {
    this.mountedBy = this.mountedBy.filter(n => n !== podName);
  }

  addEnvReference(podName) {
    if (!this.envInjectedBy.includes(podName)) {
      this.envInjectedBy.push(podName);
    }
  }

  removeEnvReference(podName) {
    this.envInjectedBy = this.envInjectedBy.filter(n => n !== podName);
  }

  tick(deltaTime) {
    super.tick(deltaTime);
  }

  getShape() { return 'scroll'; }
  getColor() { return '#92400e'; }

  toYAML() {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
${this.immutable ? 'immutable: true' : ''}
data:
${Object.entries(this.data).map(([k, v]) => {
  if (v.includes('\n')) return `  ${k}: |\n${v.split('\n').map(line => `    ${line}`).join('\n')}`;
  return `  ${k}: "${v}"`;
}).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Namespace:    ${this.metadata.namespace}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ')}
Annotations:  ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}

Data
====
${Object.entries(this.data).map(([k, v]) => `${k}:
----
${v}
`).join('\n')}
BinaryData
====
${Object.keys(this.binaryData).length > 0 ? Object.entries(this.binaryData).map(([k, v]) => `${k}: ${v.length} bytes`).join('\n') : '<none>'}

Mounted By:    ${this.mountedBy.join(', ') || '<none>'}
Env Injected:  ${this.envInjectedBy.join(', ') || '<none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class Secret extends ResourceBase {
  constructor(metadata = {}) {
    super('Secret', metadata);
    this.type = metadata.secretType || 'Opaque';
    this.data = {};
    this.stringData = metadata.stringData || {};
    this.immutable = metadata.immutable || false;
    this.mountedBy = [];
    this.envInjectedBy = [];

    if (metadata.data) {
      for (const [k, v] of Object.entries(metadata.data)) {
        this.data[k] = v;
      }
    } else if (metadata.stringData) {
      for (const [k, v] of Object.entries(metadata.stringData)) {
        this.data[k] = btoa(v);
      }
    }

    if (this.type === 'kubernetes.io/tls' && !this.data['tls.crt']) {
      this.data['tls.crt'] = btoa('-----BEGIN CERTIFICATE-----\nMIIBxTCCAW...\n-----END CERTIFICATE-----');
      this.data['tls.key'] = btoa('-----BEGIN PRIVATE KEY-----\nMIIEvgIBAD...\n-----END PRIVATE KEY-----');
    }

    if (this.type === 'kubernetes.io/dockerconfigjson' && !this.data['.dockerconfigjson']) {
      this.data['.dockerconfigjson'] = btoa(JSON.stringify({
        auths: { 'registry.example.com': { username: 'user', password: '***', auth: btoa('user:***') } }
      }));
    }

    this.setStatus('Active');
  }

  setData(key, value, encode = true) {
    if (this.immutable) {
      this.addEvent('Warning', 'ImmutableViolation', `Cannot modify immutable Secret`);
      return false;
    }
    this.data[key] = encode ? btoa(value) : value;
    this.addEvent('Normal', 'Updated', `Key "${key}" updated`);
    return true;
  }

  getData(key, decode = true) {
    const val = this.data[key];
    if (!val) return undefined;
    return decode ? atob(val) : val;
  }

  deleteData(key) {
    if (this.immutable) return false;
    delete this.data[key];
    return true;
  }

  getKeys() {
    return Object.keys(this.data);
  }

  getSize() {
    return Object.values(this.data).reduce((sum, v) => sum + v.length, 0);
  }

  addMountReference(podName) {
    if (!this.mountedBy.includes(podName)) this.mountedBy.push(podName);
  }

  removeMountReference(podName) {
    this.mountedBy = this.mountedBy.filter(n => n !== podName);
  }

  addEnvReference(podName) {
    if (!this.envInjectedBy.includes(podName)) this.envInjectedBy.push(podName);
  }

  removeEnvReference(podName) {
    this.envInjectedBy = this.envInjectedBy.filter(n => n !== podName);
  }

  tick(deltaTime) {
    super.tick(deltaTime);
  }

  getShape() { return 'lock'; }
  getColor() { return '#991b1b'; }

  toYAML() {
    return `apiVersion: v1
kind: Secret
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
type: ${this.type}
${this.immutable ? 'immutable: true' : ''}
data:
${Object.entries(this.data).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Namespace:    ${this.metadata.namespace}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ')}
Annotations:  ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}

Type:  ${this.type}

Data
====
${Object.entries(this.data).map(([k, v]) => `${k}:  ${atob(v).length} bytes`).join('\n')}

Mounted By:    ${this.mountedBy.join(', ') || '<none>'}
Env Injected:  ${this.envInjectedBy.join(', ') || '<none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}
