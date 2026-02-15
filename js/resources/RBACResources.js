import { ResourceBase } from './ResourceBase.js';

export class ServiceAccount extends ResourceBase {
  constructor(metadata = {}) {
    super('ServiceAccount', metadata);
    this.apiVersion = 'v1';
    this.spec = {};
    this.secrets = metadata.secrets || [];
    this.imagePullSecrets = metadata.imagePullSecrets || [];
    this.automountServiceAccountToken = metadata.automountServiceAccountToken !== false;
    this.setStatus('Active');
  }

  addSecret(secretName) {
    if (!this.secrets.includes(secretName)) {
      this.secrets.push(secretName);
      this.addEvent('Normal', 'SecretAdded', `Secret ${secretName} added`);
    }
  }

  removeSecret(secretName) {
    this.secrets = this.secrets.filter(s => s !== secretName);
  }


  getShape() { return 'person'; }
  getColor() { return '#8b5cf6'; }

  toYAML() {
    return `apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
automountServiceAccountToken: ${this.automountServiceAccountToken}
${this.secrets.length > 0 ? `secrets:\n${this.secrets.map(s => `- name: ${s}`).join('\n')}` : ''}
${this.imagePullSecrets.length > 0 ? `imagePullSecrets:\n${this.imagePullSecrets.map(s => `- name: ${s}`).join('\n')}` : ''}`;
  }

  toDescribe() {
    return `Name:                ${this.metadata.name}
Namespace:           ${this.metadata.namespace}
Labels:              ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:         ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Image pull secrets:  ${this.imagePullSecrets.join(', ') || '<none>'}
Mountable secrets:   ${this.secrets.join(', ') || '<none>'}
Tokens:              ${this.secrets.filter(s => s.includes('token')).join(', ') || '<none>'}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class Role extends ResourceBase {
  constructor(metadata = {}) {
    super('Role', metadata);
    this.apiVersion = 'rbac.authorization.k8s.io/v1';
    this.spec = {
      rules: metadata.rules || [],
    };
    this.setStatus('Active');
  }

  addRule(apiGroups, resources, verbs) {
    this.spec.rules.push({
      apiGroups: Array.isArray(apiGroups) ? apiGroups : [apiGroups],
      resources: Array.isArray(resources) ? resources : [resources],
      verbs: Array.isArray(verbs) ? verbs : [verbs],
    });
    this.addEvent('Normal', 'RuleAdded', `Rule added: ${verbs} on ${resources}`);
  }

  removeRule(index) {
    if (index >= 0 && index < this.spec.rules.length) {
      this.spec.rules.splice(index, 1);
    }
  }

  hasWildcard() {
    return this.spec.rules.some(r =>
      r.verbs?.includes('*') || r.resources?.includes('*') || r.apiGroups?.includes('*')
    );
  }


  getShape() { return 'key'; }
  getColor() { return '#f59e0b'; }

  toYAML() {
    return `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
rules:
${this.spec.rules.map(r => `- apiGroups: [${(r.apiGroups || ['']).map(g => `"${g}"`).join(', ')}]
  resources: [${(r.resources || []).map(res => `"${res}"`).join(', ')}]
  verbs: [${(r.verbs || []).map(v => `"${v}"`).join(', ')}]`).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Namespace:    ${this.metadata.namespace}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:  ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
PolicyRule:
  Resources           Verbs             API Groups
  ---------           -----             ----------
${this.spec.rules.map(r => `  ${(r.resources || []).join(', ').padEnd(20)} ${(r.verbs || []).join(', ').padEnd(18)} ${(r.apiGroups || ['']).join(', ')}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class ClusterRole extends ResourceBase {
  constructor(metadata = {}) {
    super('ClusterRole', { ...metadata, namespace: '' });
    this.apiVersion = 'rbac.authorization.k8s.io/v1';
    this.spec = {
      rules: metadata.rules || [],
      aggregationRule: metadata.aggregationRule || null,
    };
    this.setStatus('Active');
  }

  addRule(apiGroups, resources, verbs) {
    this.spec.rules.push({
      apiGroups: Array.isArray(apiGroups) ? apiGroups : [apiGroups],
      resources: Array.isArray(resources) ? resources : [resources],
      verbs: Array.isArray(verbs) ? verbs : [verbs],
    });
    this.addEvent('Normal', 'RuleAdded', `Rule added: ${verbs} on ${resources}`);
  }

  hasWildcard() {
    return this.spec.rules.some(r =>
      r.verbs?.includes('*') || r.resources?.includes('*') || r.apiGroups?.includes('*')
    );
  }


  getShape() { return 'key-cluster'; }
  getColor() { return '#d97706'; }

  toYAML() {
    return `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ${this.metadata.name}
  uid: ${this.uid}
rules:
${this.spec.rules.map(r => `- apiGroups: [${(r.apiGroups || ['']).map(g => `"${g}"`).join(', ')}]
  resources: [${(r.resources || []).map(res => `"${res}"`).join(', ')}]
  verbs: [${(r.verbs || []).map(v => `"${v}"`).join(', ')}]`).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:  ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
PolicyRule:
  Resources           Verbs             API Groups
  ---------           -----             ----------
${this.spec.rules.map(r => `  ${(r.resources || []).join(', ').padEnd(20)} ${(r.verbs || []).join(', ').padEnd(18)} ${(r.apiGroups || ['']).join(', ')}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class RoleBinding extends ResourceBase {
  constructor(metadata = {}) {
    super('RoleBinding', metadata);
    this.apiVersion = 'rbac.authorization.k8s.io/v1';
    this.spec = {
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: metadata.roleRefKind || 'Role',
        name: metadata.roleRefName || '',
      },
      subjects: metadata.subjects || [],
    };
    this.setStatus('Active');
  }

  addSubject(kind, name, namespace) {
    const subject = { kind, name, apiGroup: kind === 'ServiceAccount' ? '' : 'rbac.authorization.k8s.io' };
    if (namespace) subject.namespace = namespace;
    this.spec.subjects.push(subject);
    this.addEvent('Normal', 'SubjectAdded', `Subject ${kind}/${name} added`);
  }

  removeSubject(name) {
    this.spec.subjects = this.spec.subjects.filter(s => s.name !== name);
  }


  getShape() { return 'link'; }
  getColor() { return '#10b981'; }

  toYAML() {
    return `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
roleRef:
  apiGroup: ${this.spec.roleRef.apiGroup}
  kind: ${this.spec.roleRef.kind}
  name: ${this.spec.roleRef.name}
subjects:
${this.spec.subjects.map(s => `- kind: ${s.kind}
  name: ${s.name}
  ${s.namespace ? `namespace: ${s.namespace}` : `apiGroup: ${s.apiGroup}`}`).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Namespace:    ${this.metadata.namespace}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:  ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Role:
  Kind:       ${this.spec.roleRef.kind}
  Name:       ${this.spec.roleRef.name}
Subjects:
  Kind              Name              Namespace
  ----              ----              ---------
${this.spec.subjects.map(s => `  ${(s.kind || '').padEnd(18)} ${(s.name || '').padEnd(18)} ${s.namespace || ''}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class ClusterRoleBinding extends ResourceBase {
  constructor(metadata = {}) {
    super('ClusterRoleBinding', { ...metadata, namespace: '' });
    this.apiVersion = 'rbac.authorization.k8s.io/v1';
    this.spec = {
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: metadata.roleRefKind || 'ClusterRole',
        name: metadata.roleRefName || '',
      },
      subjects: metadata.subjects || [],
    };
    this.setStatus('Active');
  }

  addSubject(kind, name, namespace) {
    const subject = { kind, name, apiGroup: kind === 'ServiceAccount' ? '' : 'rbac.authorization.k8s.io' };
    if (namespace) subject.namespace = namespace;
    this.spec.subjects.push(subject);
    this.addEvent('Normal', 'SubjectAdded', `Subject ${kind}/${name} added`);
  }

  removeSubject(name) {
    this.spec.subjects = this.spec.subjects.filter(s => s.name !== name);
  }


  getShape() { return 'link-cluster'; }
  getColor() { return '#059669'; }

  toYAML() {
    return `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${this.metadata.name}
  uid: ${this.uid}
roleRef:
  apiGroup: ${this.spec.roleRef.apiGroup}
  kind: ${this.spec.roleRef.kind}
  name: ${this.spec.roleRef.name}
subjects:
${this.spec.subjects.map(s => `- kind: ${s.kind}
  name: ${s.name}
  ${s.namespace ? `namespace: ${s.namespace}` : `apiGroup: ${s.apiGroup}`}`).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Labels:       ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Annotations:  ${Object.entries(this.metadata.annotations).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}
Role:
  Kind:       ${this.spec.roleRef.kind}
  Name:       ${this.spec.roleRef.name}
Subjects:
  Kind              Name              Namespace
  ----              ----              ---------
${this.spec.subjects.map(s => `  ${(s.kind || '').padEnd(18)} ${(s.name || '').padEnd(18)} ${s.namespace || ''}`).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}
