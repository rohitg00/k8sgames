import { ResourceBase } from './ResourceBase.js';

export class PersistentVolume extends ResourceBase {
  constructor(metadata = {}) {
    super('PersistentVolume', { ...metadata, namespace: '' });
    this.apiVersion = 'v1';
    this.spec = {
      capacity: { storage: metadata.capacity || '10Gi' },
      accessModes: metadata.accessModes || ['ReadWriteOnce'],
      persistentVolumeReclaimPolicy: metadata.reclaimPolicy || 'Retain',
      storageClassName: metadata.storageClassName || 'standard',
      volumeMode: metadata.volumeMode || 'Filesystem',
      hostPath: metadata.hostPath ? { path: metadata.hostPath } : null,
      nfs: metadata.nfs || null,
      csi: metadata.csi || null,
      nodeAffinity: metadata.nodeAffinity || null,
      mountOptions: metadata.mountOptions || [],
    };
    this.phase = 'Available';
    this.claimRef = null;
    this.capacityBytes = this._parseStorage(this.spec.capacity.storage);
    this.setStatus('Available');
  }

  _parseStorage(storage) {
    if (typeof storage === 'number') return storage;
    const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 };
    for (const [suffix, multiplier] of Object.entries(units)) {
      if (storage.endsWith(suffix)) return parseInt(storage) * multiplier;
    }
    return parseInt(storage);
  }

  bind(pvcName, pvcNamespace, pvcUid) {
    this.phase = 'Bound';
    this.claimRef = { name: pvcName, namespace: pvcNamespace, uid: pvcUid };
    this.setStatus('Bound');
    this.addEvent('Normal', 'Bound', `Bound to PVC ${pvcNamespace}/${pvcName}`);
  }

  release() {
    this.phase = 'Released';
    this.setStatus('Released');
    this.addEvent('Normal', 'Released', `Released from claim`);
  }

  reclaim() {
    if (this.spec.persistentVolumeReclaimPolicy === 'Delete') {
      this.phase = 'Failed';
      this.setStatus('Failed');
    } else {
      this.phase = 'Available';
      this.claimRef = null;
      this.setStatus('Available');
    }
  }

  markFailed(reason) {
    this.phase = 'Failed';
    this.setStatus('Failed');
    this.addEvent('Warning', 'VolumeFailed', reason || 'Volume is in a failed state');
  }

  tick(deltaTime) {
    super.tick(deltaTime);
  }

  getShape() { return 'cylinder-tall'; }
  getColor() { return '#4b5563'; }

  toYAML() {
    const source = this.spec.hostPath
      ? `  hostPath:\n    path: ${this.spec.hostPath.path}`
      : this.spec.nfs
        ? `  nfs:\n    server: ${this.spec.nfs.server}\n    path: ${this.spec.nfs.path}`
        : `  local:\n    path: /mnt/data`;
    return `apiVersion: v1
kind: PersistentVolume
metadata:
  name: ${this.metadata.name}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
spec:
  capacity:
    storage: ${this.spec.capacity.storage}
  accessModes:
${this.spec.accessModes.map(m => `  - ${m}`).join('\n')}
  persistentVolumeReclaimPolicy: ${this.spec.persistentVolumeReclaimPolicy}
  storageClassName: ${this.spec.storageClassName}
  volumeMode: ${this.spec.volumeMode}
${source}
${this.spec.mountOptions.length > 0 ? `  mountOptions:\n${this.spec.mountOptions.map(o => `  - ${o}`).join('\n')}` : ''}
status:
  phase: ${this.phase}
${this.claimRef ? `  claimRef:\n    name: ${this.claimRef.name}\n    namespace: ${this.claimRef.namespace}` : ''}`;
  }

  toDescribe() {
    return `Name:            ${this.metadata.name}
Labels:          ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:     ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
StorageClass:    ${this.spec.storageClassName}
Status:          ${this.phase}
Claim:           ${this.claimRef ? `${this.claimRef.namespace}/${this.claimRef.name}` : ''}
Reclaim Policy:  ${this.spec.persistentVolumeReclaimPolicy}
Access Modes:    ${this.spec.accessModes.join(', ')}
VolumeMode:      ${this.spec.volumeMode}
Capacity:        ${this.spec.capacity.storage}
Mount Options:   ${this.spec.mountOptions.join(', ') || '<none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class StorageClass extends ResourceBase {
  constructor(metadata = {}) {
    super('StorageClass', { ...metadata, namespace: '' });
    this.apiVersion = 'storage.k8s.io/v1';
    this.spec = {
      provisioner: metadata.provisioner || 'kubernetes.io/no-provisioner',
      reclaimPolicy: metadata.reclaimPolicy || 'Delete',
      volumeBindingMode: metadata.volumeBindingMode || 'WaitForFirstConsumer',
      allowVolumeExpansion: metadata.allowVolumeExpansion || false,
      parameters: metadata.parameters || {},
      mountOptions: metadata.mountOptions || [],
    };
    this.isDefault = metadata.isDefault || false;
    if (this.isDefault) {
      this.metadata.annotations['storageclass.kubernetes.io/is-default-class'] = 'true';
    }
    this.setStatus('Active');
  }

  tick(deltaTime) {
    super.tick(deltaTime);
  }

  getShape() { return 'database'; }
  getColor() { return '#6366f1'; }

  toYAML() {
    return `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ${this.metadata.name}
  uid: ${this.uid}
${this.isDefault ? `  annotations:\n    storageclass.kubernetes.io/is-default-class: "true"` : ''}
provisioner: ${this.spec.provisioner}
reclaimPolicy: ${this.spec.reclaimPolicy}
volumeBindingMode: ${this.spec.volumeBindingMode}
allowVolumeExpansion: ${this.spec.allowVolumeExpansion}
${Object.keys(this.spec.parameters).length > 0 ? `parameters:\n${Object.entries(this.spec.parameters).map(([k, v]) => `  ${k}: "${v}"`).join('\n')}` : ''}
${this.spec.mountOptions.length > 0 ? `mountOptions:\n${this.spec.mountOptions.map(o => `- ${o}`).join('\n')}` : ''}`;
  }

  toDescribe() {
    return `Name:                  ${this.metadata.name}
IsDefaultClass:        ${this.isDefault ? 'Yes' : 'No'}
Annotations:           ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Provisioner:           ${this.spec.provisioner}
Parameters:            ${Object.entries(this.spec.parameters).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
AllowVolumeExpansion:  ${this.spec.allowVolumeExpansion}
MountOptions:          ${this.spec.mountOptions.join(', ') || '<none>'}
ReclaimPolicy:         ${this.spec.reclaimPolicy}
VolumeBindingMode:     ${this.spec.volumeBindingMode}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class PersistentVolumeClaim extends ResourceBase {
  constructor(metadata = {}) {
    super('PersistentVolumeClaim', metadata);
    this.spec = {
      accessModes: metadata.accessModes || ['ReadWriteOnce'],
      resources: {
        requests: { storage: metadata.storageRequest || '10Gi' },
        limits: metadata.storageLimit ? { storage: metadata.storageLimit } : {}
      },
      storageClassName: metadata.storageClassName || 'standard',
      volumeName: metadata.volumeName || null,
      volumeMode: metadata.volumeMode || 'Filesystem',
      selector: metadata.selector || null
    };
    this.phase = 'Pending';
    this.boundVolume = null;
    this.capacity = null;
    this.bindingTimer = 0;
    this.bindingDelay = 1 + Math.random() * 3;
    this.mountedBy = [];
    this.usedBytes = 0;
    this.capacityBytes = this._parseStorage(this.spec.resources.requests.storage);
    this.conditions = [];
    this.setStatus('Pending');
  }

  _parseStorage(storage) {
    if (typeof storage === 'number') return storage;
    const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 };
    for (const [suffix, multiplier] of Object.entries(units)) {
      if (storage.endsWith(suffix)) return parseInt(storage) * multiplier;
    }
    return parseInt(storage);
  }

  _formatBytes(bytes) {
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)}Ti`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)}Gi`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)}Mi`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}Ki`;
    return `${bytes}`;
  }

  bind(volumeName) {
    this.phase = 'Bound';
    this.boundVolume = volumeName;
    this.capacity = { storage: this.spec.resources.requests.storage };
    this.conditions.push({
      type: 'Bound',
      status: 'True',
      lastTransitionTime: new Date().toISOString(),
      reason: 'Bound',
      message: `Bound to ${volumeName}`
    });
    this.addEvent('Normal', 'ProvisioningSucceeded', `Successfully provisioned volume ${volumeName}`);
    this.setStatus('Bound');
  }

  release() {
    this.phase = 'Released';
    this.boundVolume = null;
    this.setStatus('Released');
    this.addEvent('Normal', 'Released', `PVC released`);
  }

  markLost() {
    this.phase = 'Lost';
    this.setStatus('Lost');
    this.addEvent('Warning', 'VolumeLost', `Bound volume is no longer available`);
  }

  addMountReference(podName) {
    if (!this.mountedBy.includes(podName)) this.mountedBy.push(podName);
  }

  removeMountReference(podName) {
    this.mountedBy = this.mountedBy.filter(n => n !== podName);
  }

  getUsagePercent() {
    if (!this.capacityBytes) return 0;
    return (this.usedBytes / this.capacityBytes) * 100;
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    if (this.phase === 'Pending') {
      this.bindingTimer += deltaTime;
      if (this.bindingTimer >= this.bindingDelay) {
        const pvName = `pv-${this.uid.substring(0, 8)}`;
        this.bind(pvName);
      }
    }

    if (this.phase === 'Bound' && this.mountedBy.length > 0) {
      this.usedBytes = Math.min(
        this.capacityBytes,
        Math.max(0, this.usedBytes + (Math.random() - 0.3) * this.capacityBytes * 0.005)
      );

      if (this.usedBytes >= this.capacityBytes * 0.9) {
        this.addEvent('Warning', 'VolumeNearFull', `Volume usage at ${this.getUsagePercent().toFixed(1)}%`);
      }
    }
  }

  getShape() { return 'cylinder'; }
  getColor() { return '#6b7280'; }

  toYAML() {
    return `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
spec:
  accessModes:
${this.spec.accessModes.map(m => `  - ${m}`).join('\n')}
  resources:
    requests:
      storage: ${this.spec.resources.requests.storage}
  storageClassName: ${this.spec.storageClassName}
  volumeMode: ${this.spec.volumeMode}
${this.spec.volumeName ? `  volumeName: ${this.spec.volumeName}` : ''}
status:
  phase: ${this.phase}
  accessModes:
${this.spec.accessModes.map(m => `  - ${m}`).join('\n')}
${this.capacity ? `  capacity:
    storage: ${this.capacity.storage}` : ''}`;
  }

  toDescribe() {
    return `Name:          ${this.metadata.name}
Namespace:     ${this.metadata.namespace}
StorageClass:  ${this.spec.storageClassName}
Status:        ${this.phase}
Volume:        ${this.boundVolume || '<none>'}
Labels:        ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ')}
Annotations:   ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Finalizers:    [kubernetes.io/pvc-protection]
Capacity:      ${this.capacity ? this.capacity.storage : '<pending>'}
Access Modes:  ${this.spec.accessModes.join(', ')}
VolumeMode:    ${this.spec.volumeMode}
Used By:       ${this.mountedBy.join(', ') || '<none>'}
Usage:         ${this._formatBytes(this.usedBytes)} / ${this.spec.resources.requests.storage} (${this.getUsagePercent().toFixed(1)}%)
Conditions:
${this.conditions.map(c => `  Type: ${c.type}  Status: ${c.status}  Reason: ${c.reason}`).join('\n') || '  <none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}
