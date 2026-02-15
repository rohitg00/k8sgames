import { ResourceBase } from './ResourceBase.js';

export class Service extends ResourceBase {
  constructor(metadata = {}) {
    super('Service', metadata);
    this.spec = {
      type: metadata.serviceType || 'ClusterIP',
      selector: metadata.selector || { app: metadata.name },
      ports: metadata.ports || [{ name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }],
      clusterIP: metadata.clusterIP || this._generateClusterIP(),
      externalIPs: metadata.externalIPs || [],
      sessionAffinity: metadata.sessionAffinity || 'None',
      loadBalancerIP: null,
      nodePort: null
    };

    if (this.spec.type === 'NodePort' || this.spec.type === 'LoadBalancer') {
      this.spec.ports = this.spec.ports.map(p => ({
        ...p,
        nodePort: p.nodePort || (30000 + Math.floor(Math.random() * 2767)),
      }));
    }

    if (this.spec.type === 'LoadBalancer') {
      this.loadBalancerPending = true;
      this.loadBalancerTimer = 0;
    }

    this.endpoints = [];
    this.trafficRate = 0;
    this.totalRequests = 0;
    this.setStatus('Active');
  }

  _generateClusterIP() {
    return `10.${96 + Math.floor(Math.random() * 16)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
  }

  updateEndpoints(pods) {
    this.endpoints = pods
      .filter(p => p.isReady() && this._matchesSelector(p))
      .map(p => ({
        ip: p.ip,
        nodeName: p.spec.nodeName,
        targetRef: { kind: 'Pod', name: p.metadata.name, uid: p.uid }
      }));
  }

  _matchesSelector(pod) {
    return Object.entries(this.spec.selector).every(([k, v]) => pod.metadata.labels[k] === v);
  }

  routeTraffic() {
    if (this.endpoints.length === 0) return null;
    this.totalRequests++;
    const idx = Math.floor(Math.random() * this.endpoints.length);
    return this.endpoints[idx];
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    if (this.spec.type === 'LoadBalancer' && this.loadBalancerPending) {
      this.loadBalancerTimer += deltaTime;
      if (this.loadBalancerTimer >= 5) {
        this.loadBalancerPending = false;
        this.spec.loadBalancerIP = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
        this.addEvent('Normal', 'EnsuringLoadBalancer', 'Ensuring load balancer');
        this.addEvent('Normal', 'EnsuredLoadBalancer', `Ensured load balancer with IP ${this.spec.loadBalancerIP}`);
      }
    }

    this.trafficRate = Math.max(0, this.trafficRate + (Math.random() - 0.5) * 5);
  }

  getShape() {
    if (this.spec.type === 'LoadBalancer') return 'circle-cloud';
    if (this.spec.type === 'NodePort') return 'circle-port';
    return 'circle';
  }

  getColor() { return '#326CE5'; }

  toYAML() {
    let portSection = this.spec.ports.map(p => {
      let s = `  - name: ${p.name}
    port: ${p.port}
    targetPort: ${p.targetPort}
    protocol: ${p.protocol}`;
      if (p.nodePort) s += `\n    nodePort: ${p.nodePort}`;
      return s;
    }).join('\n');

    let statusSection = `  loadBalancer: {}`;
    if (this.spec.type === 'LoadBalancer' && this.spec.loadBalancerIP) {
      statusSection = `  loadBalancer:
    ingress:
    - ip: ${this.spec.loadBalancerIP}`;
    }

    return `apiVersion: v1
kind: Service
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  labels:
${Object.entries(this.metadata.labels).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
spec:
  type: ${this.spec.type}
  selector:
${Object.entries(this.spec.selector).map(([k, v]) => `    ${k}: "${v}"`).join('\n')}
  ports:
${portSection}
  clusterIP: ${this.spec.clusterIP}
  sessionAffinity: ${this.spec.sessionAffinity}
status:
${statusSection}`;
  }

  toDescribe() {
    const externalIP = this.spec.type === 'LoadBalancer'
      ? (this.spec.loadBalancerIP || '<pending>')
      : '<none>';

    const endpointsList = this.endpoints.map(e => `${e.ip}:${this.spec.ports[0].targetPort}`).join(', ') || '<none>';

    const lines = [
      `Name:              ${this.metadata.name}`,
      `Namespace:         ${this.metadata.namespace}`,
      `Labels:            ${Object.entries(this.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ')}`,
      `Selector:          ${Object.entries(this.spec.selector).map(([k, v]) => `${k}=${v}`).join(',')}`,
      `Type:              ${this.spec.type}`,
      `IP:                ${this.spec.clusterIP}`,
      `External IP:       ${externalIP}`,
      `Port:              ${this.spec.ports.map(p => `${p.name} ${p.port}/${p.protocol}`).join(', ')}`,
      `TargetPort:        ${this.spec.ports.map(p => `${p.targetPort}/${p.protocol}`).join(', ')}`,
    ];

    if (this.spec.ports[0]?.nodePort) {
      lines.push(`NodePort:          ${this.spec.ports.map(p => `${p.name} ${p.nodePort}/${p.protocol}`).join(', ')}`);
    }

    lines.push(
      `Endpoints:         ${endpointsList}`,
      `Session Affinity:  ${this.spec.sessionAffinity}`,
      `Events:`,
      ...this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`),
    );

    return lines.join('\n');
  }
}

export class Ingress extends ResourceBase {
  constructor(metadata = {}) {
    super('Ingress', metadata);
    this.spec = {
      ingressClassName: metadata.ingressClassName || 'nginx',
      tls: metadata.tls || [],
      rules: metadata.rules || [
        {
          host: metadata.host || 'app.example.com',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: metadata.backendService || 'web-service', port: { number: 80 } }
                }
              }
            ]
          }
        }
      ],
      defaultBackend: metadata.defaultBackend || null
    };
    this.loadBalancerIP = null;
    this.loadBalancerTimer = 0;
    this.loadBalancerPending = true;
    this.backendServices = new Map();
    this.requestCount = 0;
    this.setStatus('Active');
  }

  addTLS(hosts, secretName) {
    this.spec.tls.push({ hosts, secretName });
    this.addEvent('Normal', 'UpdatedTLS', `TLS configured for ${hosts.join(', ')}`);
  }

  addRule(host, path, serviceName, servicePort) {
    const existingRule = this.spec.rules.find(r => r.host === host);
    const pathEntry = {
      path,
      pathType: 'Prefix',
      backend: { service: { name: serviceName, port: { number: servicePort } } }
    };
    if (existingRule) {
      existingRule.http.paths.push(pathEntry);
    } else {
      this.spec.rules.push({ host, http: { paths: [pathEntry] } });
    }
    this.addEvent('Normal', 'UpdatedIngress', `Added rule: ${host}${path} -> ${serviceName}:${servicePort}`);
  }

  routeRequest(host, path) {
    this.requestCount++;
    const rule = this.spec.rules.find(r => r.host === host);
    if (!rule) return this.spec.defaultBackend;

    const matchedPath = rule.http.paths
      .sort((a, b) => b.path.length - a.path.length)
      .find(p => path.startsWith(p.path));

    return matchedPath ? matchedPath.backend : this.spec.defaultBackend;
  }

  tick(deltaTime) {
    super.tick(deltaTime);

    if (this.loadBalancerPending) {
      this.loadBalancerTimer += deltaTime;
      if (this.loadBalancerTimer >= 3) {
        this.loadBalancerPending = false;
        this.loadBalancerIP = `203.0.113.${Math.floor(Math.random() * 254) + 1}`;
        this.addEvent('Normal', 'Sync', `Scheduled for sync`);
      }
    }
  }

  getShape() { return 'diamond'; }
  getColor() { return '#8b5cf6'; }

  toYAML() {
    return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
  annotations:
    kubernetes.io/ingress.class: ${this.spec.ingressClassName}
spec:
  ingressClassName: ${this.spec.ingressClassName}
${this.spec.tls.length > 0 ? `  tls:
${this.spec.tls.map(t => `  - hosts:
${t.hosts.map(h => `    - ${h}`).join('\n')}
    secretName: ${t.secretName}`).join('\n')}` : ''}
  rules:
${this.spec.rules.map(r => `  - host: ${r.host}
    http:
      paths:
${r.http.paths.map(p => `      - path: ${p.path}
        pathType: ${p.pathType}
        backend:
          service:
            name: ${p.backend.service.name}
            port:
              number: ${p.backend.service.port.number}`).join('\n')}`).join('\n')}
status:
  loadBalancer:
${this.loadBalancerIP ? `    ingress:
    - ip: ${this.loadBalancerIP}` : '    {}'}`;
  }

  toDescribe() {
    return `Name:             ${this.metadata.name}
Namespace:        ${this.metadata.namespace}
Address:          ${this.loadBalancerIP || '<pending>'}
Ingress Class:    ${this.spec.ingressClassName}
Default backend:  ${this.spec.defaultBackend ? `${this.spec.defaultBackend.service.name}:${this.spec.defaultBackend.service.port.number}` : '<default>'}
TLS:
${this.spec.tls.length > 0 ? this.spec.tls.map(t => `  ${t.secretName} terminates ${t.hosts.join(',')}`).join('\n') : '  <none>'}
Rules:
  Host              Path  Backends
  ----              ----  --------
${this.spec.rules.map(r => r.http.paths.map(p => `  ${r.host}  ${p.path}  ${p.backend.service.name}:${p.backend.service.port.number}`).join('\n')).join('\n')}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}

export class NetworkPolicy extends ResourceBase {
  constructor(metadata = {}) {
    super('NetworkPolicy', metadata);
    this.spec = {
      podSelector: { matchLabels: metadata.podSelector || { app: metadata.name } },
      policyTypes: metadata.policyTypes || ['Ingress', 'Egress'],
      ingress: metadata.ingress || [
        {
          from: [
            { podSelector: { matchLabels: { role: 'frontend' } } }
          ],
          ports: [{ protocol: 'TCP', port: 80 }]
        }
      ],
      egress: metadata.egress || [
        {
          to: [
            { podSelector: { matchLabels: { role: 'database' } } }
          ],
          ports: [{ protocol: 'TCP', port: 5432 }]
        }
      ]
    };
    this.affectedPods = [];
    this.blockedConnections = 0;
    this.allowedConnections = 0;
    this.setStatus('Active');
  }

  evaluateIngress(sourcePod, destPod, port) {
    if (!this._matchesPodSelector(destPod)) return true;

    for (const rule of this.spec.ingress) {
      const portMatch = !rule.ports || rule.ports.some(p => p.port === port);
      if (!portMatch) continue;

      for (const from of rule.from) {
        if (from.podSelector && this._labelsMatch(sourcePod.metadata.labels, from.podSelector.matchLabels)) {
          this.allowedConnections++;
          return true;
        }
        if (from.namespaceSelector && this._labelsMatch({ name: sourcePod.metadata.namespace }, from.namespaceSelector.matchLabels)) {
          this.allowedConnections++;
          return true;
        }
      }
    }

    this.blockedConnections++;
    return false;
  }

  evaluateEgress(sourcePod, destPod, port) {
    if (!this._matchesPodSelector(sourcePod)) return true;

    for (const rule of this.spec.egress) {
      const portMatch = !rule.ports || rule.ports.some(p => p.port === port);
      if (!portMatch) continue;

      for (const to of rule.to) {
        if (to.podSelector && this._labelsMatch(destPod.metadata.labels, to.podSelector.matchLabels)) {
          this.allowedConnections++;
          return true;
        }
        if (to.namespaceSelector && this._labelsMatch({ name: destPod.metadata.namespace }, to.namespaceSelector.matchLabels)) {
          this.allowedConnections++;
          return true;
        }
      }
    }

    this.blockedConnections++;
    return false;
  }

  _matchesPodSelector(pod) {
    return this._labelsMatch(pod.metadata.labels, this.spec.podSelector.matchLabels);
  }

  _labelsMatch(labels, selector) {
    return Object.entries(selector).every(([k, v]) => labels[k] === v);
  }

  updateAffectedPods(pods) {
    this.affectedPods = pods.filter(p => this._matchesPodSelector(p));
  }

  getShape() { return 'shield'; }

  getColor() {
    const hasBoth = this.spec.policyTypes.includes('Ingress') && this.spec.policyTypes.includes('Egress');
    return hasBoth ? '#ef4444' : '#22c55e';
  }

  toYAML() {
    return `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ${this.metadata.name}
  namespace: ${this.metadata.namespace}
  uid: ${this.uid}
spec:
  podSelector:
    matchLabels:
${Object.entries(this.spec.podSelector.matchLabels).map(([k, v]) => `      ${k}: "${v}"`).join('\n')}
  policyTypes:
${this.spec.policyTypes.map(t => `  - ${t}`).join('\n')}
  ingress:
${this.spec.ingress.map(rule => `  - from:
${rule.from.map(f => {
  if (f.podSelector) return `    - podSelector:\n        matchLabels:\n${Object.entries(f.podSelector.matchLabels).map(([k, v]) => `          ${k}: "${v}"`).join('\n')}`;
  if (f.namespaceSelector) return `    - namespaceSelector:\n        matchLabels:\n${Object.entries(f.namespaceSelector.matchLabels).map(([k, v]) => `          ${k}: "${v}"`).join('\n')}`;
  return '';
}).join('\n')}
    ports:
${rule.ports.map(p => `    - protocol: ${p.protocol}\n      port: ${p.port}`).join('\n')}`).join('\n')}
  egress:
${this.spec.egress.map(rule => `  - to:
${rule.to.map(t => {
  if (t.podSelector) return `    - podSelector:\n        matchLabels:\n${Object.entries(t.podSelector.matchLabels).map(([k, v]) => `          ${k}: "${v}"`).join('\n')}`;
  return '';
}).join('\n')}
    ports:
${rule.ports.map(p => `    - protocol: ${p.protocol}\n      port: ${p.port}`).join('\n')}`).join('\n')}`;
  }

  toDescribe() {
    return `Name:         ${this.metadata.name}
Namespace:    ${this.metadata.namespace}
Spec:
  PodSelector:     ${Object.entries(this.spec.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}
  Allowing ingress traffic:
${this.spec.ingress.map(rule => `    To Port: ${rule.ports.map(p => `${p.port}/${p.protocol}`).join(', ')}
    From:
${rule.from.map(f => {
  if (f.podSelector) return `      PodSelector: ${Object.entries(f.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}`;
  if (f.namespaceSelector) return `      NamespaceSelector: ${Object.entries(f.namespaceSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}`;
  return '';
}).join('\n')}`).join('\n')}
  Allowing egress traffic:
${this.spec.egress.map(rule => `    To Port: ${rule.ports.map(p => `${p.port}/${p.protocol}`).join(', ')}
    To:
${rule.to.map(t => {
  if (t.podSelector) return `      PodSelector: ${Object.entries(t.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')}`;
  return '';
}).join('\n')}`).join('\n')}
  Policy Types: ${this.spec.policyTypes.join(', ')}
Affected Pods: ${this.affectedPods.length}
Blocked:       ${this.blockedConnections}
Allowed:       ${this.allowedConnections}
Events:
${this.events.slice(-10).map(e => `  ${e.type}\t${e.reason}\t${e.message}`).join('\n')}`;
  }
}
