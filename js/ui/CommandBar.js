const RESOURCE_TYPES = [
  'pods', 'po', 'deployments', 'deploy', 'services', 'svc', 'nodes', 'no',
  'configmaps', 'cm', 'secrets', 'ingress', 'ing', 'namespaces', 'ns',
  'persistentvolumeclaims', 'pvc', 'persistentvolumes', 'pv',
  'statefulsets', 'sts', 'daemonsets', 'ds', 'replicasets', 'rs',
  'jobs', 'cronjobs', 'cj', 'endpoints', 'ep', 'events', 'ev',
  'horizontalpodautoscalers', 'hpa', 'networkpolicies', 'netpol',
  'serviceaccounts', 'sa', 'roles', 'role', 'rolebindings', 'rolebinding',
  'clusterroles', 'clusterrolebindings', 'resourcequotas', 'quota',
  'poddisruptionbudgets', 'pdb', 'storageclasses', 'sc', 'limitranges'
];

const KIND_ALIASES = {
  po: 'Pod', pods: 'Pod', pod: 'Pod',
  deploy: 'Deployment', deployments: 'Deployment', deployment: 'Deployment',
  svc: 'Service', services: 'Service', service: 'Service',
  no: 'Node', nodes: 'Node', node: 'Node',
  cm: 'ConfigMap', configmaps: 'ConfigMap', configmap: 'ConfigMap',
  secret: 'Secret', secrets: 'Secret',
  ing: 'Ingress', ingress: 'Ingress', ingresses: 'Ingress',
  ns: 'Namespace', namespaces: 'Namespace', namespace: 'Namespace',
  pvc: 'PersistentVolumeClaim', persistentvolumeclaims: 'PersistentVolumeClaim',
  pv: 'PersistentVolume', persistentvolumes: 'PersistentVolume',
  sts: 'StatefulSet', statefulsets: 'StatefulSet', statefulset: 'StatefulSet',
  ds: 'DaemonSet', daemonsets: 'DaemonSet', daemonset: 'DaemonSet',
  rs: 'ReplicaSet', replicasets: 'ReplicaSet', replicaset: 'ReplicaSet',
  job: 'Job', jobs: 'Job',
  cj: 'CronJob', cronjobs: 'CronJob', cronjob: 'CronJob',
  ep: 'Endpoints', endpoints: 'Endpoints',
  ev: 'Event', events: 'Event',
  hpa: 'HorizontalPodAutoscaler', horizontalpodautoscalers: 'HorizontalPodAutoscaler',
  netpol: 'NetworkPolicy', networkpolicies: 'NetworkPolicy', networkpolicy: 'NetworkPolicy',
  sa: 'ServiceAccount', serviceaccounts: 'ServiceAccount', serviceaccount: 'ServiceAccount',
  role: 'Role', roles: 'Role',
  rolebinding: 'RoleBinding', rolebindings: 'RoleBinding',
  clusterrole: 'ClusterRole', clusterroles: 'ClusterRole',
  clusterrolebinding: 'ClusterRoleBinding', clusterrolebindings: 'ClusterRoleBinding',
  quota: 'ResourceQuota', resourcequotas: 'ResourceQuota', resourcequota: 'ResourceQuota',
  pdb: 'PodDisruptionBudget', poddisruptionbudgets: 'PodDisruptionBudget',
  sc: 'StorageClass', storageclasses: 'StorageClass', storageclass: 'StorageClass',
  limitrange: 'LimitRange', limitranges: 'LimitRange'
};

const COMMANDS = ['get', 'describe', 'logs', 'scale', 'delete', 'apply', 'create', 'rollout', 'drain', 'cordon', 'uncordon', 'top', 'exec', 'label', 'run'];

export class CommandBar {
  constructor() {
    this.container = null;
    this.input = null;
    this.output = null;
    this.suggestionsEl = null;
    this.visible = false;
    this.history = [];
    this.historyIndex = -1;
    this.suggestions = [];
    this.selectedSuggestion = -1;
    this._boundKeydown = this._onGlobalKeydown.bind(this);
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'command-bar';
    this.container.className = 'fixed bottom-0 left-0 right-0 z-50 transform translate-y-full transition-transform duration-300 ease-out';
    this.container.innerHTML = this._buildHTML();
    document.body.appendChild(this.container);

    this.input = document.getElementById('cmd-input');
    this.output = document.getElementById('cmd-output');
    this.suggestionsEl = document.getElementById('cmd-suggestions');

    this._bindEvents();
  }

  _buildHTML() {
    return `
      <div class="backdrop-blur-xl bg-white/5 border-t border-white/10 shadow-2xl">
        <div class="flex items-center justify-between px-4 py-2 border-b border-white/5">
          <span class="text-white/40 text-xs font-mono">Terminal</span>
          <div class="flex items-center gap-2">
            <span class="text-white/20 text-xs">Press / to toggle</span>
            <button id="cmd-close" class="text-white/30 hover:text-white/60 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="cmd-output" class="px-4 py-2 max-h-64 overflow-y-auto font-mono text-sm scrollbar-thin"></div>
        <div class="relative px-4 py-3 border-t border-white/5">
          <div class="flex items-center gap-2">
            <span class="text-green-400 text-sm font-mono shrink-0">$ kubectl</span>
            <input id="cmd-input" type="text" class="flex-1 bg-transparent text-white/90 text-sm font-mono outline-none placeholder:text-white/20" placeholder="enter command..." autocomplete="off" spellcheck="false" />
          </div>
          <div id="cmd-suggestions" class="absolute bottom-full left-0 right-0 hidden"></div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    document.addEventListener('keydown', this._boundKeydown);

    document.getElementById('cmd-close').addEventListener('click', () => this.hide());

    this.input.addEventListener('keydown', (e) => this._onInputKeydown(e));
    this.input.addEventListener('input', () => this._onInputChange());
  }

  _onGlobalKeydown(e) {
    if (e.key === '/' && !this.visible && !e.ctrlKey && !e.metaKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      this.show();
    } else if (e.key === 'Escape' && this.visible) {
      this.hide();
    }
  }

  _onInputKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selectedSuggestion >= 0 && this.suggestions.length > 0) {
        this._applySuggestion(this.suggestions[this.selectedSuggestion]);
        return;
      }
      this._executeCommand(this.input.value.trim());
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this._tabComplete();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.suggestions.length > 0) {
        this.selectedSuggestion = Math.max(0, this.selectedSuggestion - 1);
        this._renderSuggestions();
      } else {
        this._navigateHistory(-1);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.suggestions.length > 0) {
        this.selectedSuggestion = Math.min(this.suggestions.length - 1, this.selectedSuggestion + 1);
        this._renderSuggestions();
      } else {
        this._navigateHistory(1);
      }
    }
  }

  _onInputChange() {
    this._updateSuggestions();
  }

  _navigateHistory(direction) {
    if (this.history.length === 0) return;
    this.historyIndex += direction;
    this.historyIndex = Math.max(-1, Math.min(this.history.length - 1, this.historyIndex));
    this.input.value = this.historyIndex >= 0 ? this.history[this.historyIndex] : '';
  }

  _updateSuggestions() {
    const val = this.input.value.trim();
    const parts = val.split(/\s+/);
    this.suggestions = [];
    this.selectedSuggestion = -1;

    if (parts.length === 1 && parts[0]) {
      this.suggestions = COMMANDS.filter(c => c.startsWith(parts[0])).map(c => ({ type: 'command', value: c }));
    } else if (parts.length === 2 && parts[1]) {
      this.suggestions = RESOURCE_TYPES.filter(r => r.startsWith(parts[1])).slice(0, 8).map(r => ({ type: 'resource', value: `${parts[0]} ${r}` }));
    } else if (parts.length >= 3) {
      const kind = KIND_ALIASES[parts[1]?.toLowerCase()];
      if (kind) {
        const resources = window.game?.cluster?.getResourcesByKind(kind) || [];
        const prefix = parts[2]?.toLowerCase() || '';
        this.suggestions = resources
          .filter(r => (r.metadata?.name || '').toLowerCase().startsWith(prefix))
          .slice(0, 8)
          .map(r => ({ type: 'name', value: `${parts[0]} ${parts[1]} ${r.metadata.name}` }));
      }
    }

    this._renderSuggestions();
  }

  _renderSuggestions() {
    if (this.suggestions.length === 0) {
      this.suggestionsEl.classList.add('hidden');
      return;
    }
    this.suggestionsEl.classList.remove('hidden');
    this.suggestionsEl.innerHTML = `
      <div class="mx-4 mb-1 backdrop-blur-xl bg-gray-900/90 border border-white/10 rounded-lg overflow-hidden shadow-xl">
        ${this.suggestions.map((s, i) => `
          <div class="px-3 py-1.5 text-sm font-mono cursor-pointer transition-colors ${i === this.selectedSuggestion ? 'bg-sky-500/20 text-sky-300' : 'text-white/60 hover:bg-white/5'}" data-idx="${i}">
            ${this._escapeHTML(s.value)}
          </div>
        `).join('')}
      </div>
    `;
    this.suggestionsEl.querySelectorAll('[data-idx]').forEach(el => {
      el.addEventListener('click', () => {
        this._applySuggestion(this.suggestions[parseInt(el.dataset.idx)]);
      });
    });
  }

  _applySuggestion(suggestion) {
    this.input.value = suggestion.value + ' ';
    this.suggestions = [];
    this.selectedSuggestion = -1;
    this.suggestionsEl.classList.add('hidden');
    this.input.focus();
  }

  _tabComplete() {
    if (this.suggestions.length === 1) {
      this._applySuggestion(this.suggestions[0]);
    } else if (this.suggestions.length > 1) {
      this.selectedSuggestion = (this.selectedSuggestion + 1) % this.suggestions.length;
      this._renderSuggestions();
    }
  }

  _executeCommand(raw) {
    if (!raw) return;
    this.history.unshift(raw);
    if (this.history.length > 50) this.history.pop();
    this.historyIndex = -1;
    this.input.value = '';
    this.suggestions = [];
    this.suggestionsEl.classList.add('hidden');

    this._appendOutput(`$ kubectl ${raw}`, 'text-green-400/80');

    const parts = raw.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const result = this._dispatch(cmd, parts.slice(1));

    if (result.error) {
      this._appendOutput(result.message, 'text-red-400');
    } else {
      this._appendOutput(result.message, 'text-white/70');
    }
  }

  _dispatch(cmd, args) {
    const cluster = window.game?.cluster;
    const engine = window.game?.engine;
    if (!cluster || !engine) return { error: true, message: 'Error: Game not initialized' };

    switch (cmd) {
      case 'get': return this._cmdGet(args, cluster);
      case 'describe': return this._cmdDescribe(args, cluster);
      case 'logs': return this._cmdLogs(args, cluster);
      case 'scale': return this._cmdScale(args, cluster, engine);
      case 'delete': return this._cmdDelete(args, cluster, engine);
      case 'apply': return this._cmdApply(args, cluster, engine);
      case 'create': return this._cmdCreate(args, cluster, engine);
      case 'run': return this._cmdRun(args, cluster, engine);
      case 'label': return this._cmdLabel(args, cluster, engine);
      case 'rollout': return this._cmdRollout(args, cluster, engine);
      case 'drain': return this._cmdDrain(args, cluster, engine);
      case 'cordon': return this._cmdCordon(args, cluster, engine, true);
      case 'uncordon': return this._cmdCordon(args, cluster, engine, false);
      case 'top': return this._cmdTop(args, cluster);
      case 'exec': return this._cmdExec(args, cluster);
      default: return { error: true, message: `error: unknown command "${cmd}"\nKnown commands: ${COMMANDS.join(', ')}` };
    }
  }

  _cmdGet(args, cluster) {
    if (args.length === 0) return { error: true, message: 'error: Required resource not specified.\nUse "kubectl get <resource>" to see resources.' };

    const kind = KIND_ALIASES[args[0]?.toLowerCase()];
    if (!kind) return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };

    const name = args[1];
    const wide = args.includes('-o') && args.includes('wide');
    const resources = cluster.getResourcesByKind(kind);

    if (name) {
      const res = resources.find(r => r.metadata?.name === name);
      if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };
      return { error: false, message: this._formatResourceRow(res, kind, true) };
    }

    if (resources.length === 0) return { error: false, message: `No resources found in default namespace.` };

    const header = this._getHeaderForKind(kind, wide);
    const rows = resources.map(r => this._formatResourceRow(r, kind, wide));
    return { error: false, message: `${header}\n${rows.join('\n')}` };
  }

  _getHeaderForKind(kind, wide) {
    const base = { Pod: 'NAME                     READY   STATUS    RESTARTS   AGE', Deployment: 'NAME                     READY   UP-TO-DATE   AVAILABLE   AGE', Service: 'NAME                     TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE', Node: 'NAME                     STATUS   ROLES    AGE   VERSION' };
    return base[kind] || 'NAME                     STATUS   AGE';
  }

  _formatResourceRow(r, kind, wide) {
    const name = (r.metadata?.name || 'unknown').padEnd(25);
    const age = this._formatAge(r.metadata?.creationTimestamp);

    if (kind === 'Pod') {
      const status = r.status?.phase || 'Unknown';
      const ready = r.status?.phase === 'Running' ? '1/1' : '0/1';
      const restarts = r.status?.restartCount || 0;
      return `${name}${ready.padEnd(8)}${status.padEnd(10)}${String(restarts).padEnd(11)}${age}`;
    }
    if (kind === 'Deployment') {
      const replicas = r.spec?.replicas || 0;
      const ready = r.status?.readyReplicas || 0;
      return `${name}${(ready + '/' + replicas).padEnd(8)}${String(replicas).padEnd(13)}${String(ready).padEnd(12)}${age}`;
    }
    if (kind === 'Service') {
      const type = r.spec?.type || 'ClusterIP';
      const ip = r.spec?.clusterIP || '10.0.0.' + Math.floor(Math.random() * 255);
      const ports = (r.spec?.ports || []).map(p => `${p.port}/${p.protocol || 'TCP'}`).join(',') || '<none>';
      return `${name}${type.padEnd(12)}${ip.padEnd(17)}${'<none>'.padEnd(14)}${ports.padEnd(10)}${age}`;
    }
    if (kind === 'Node') {
      const status = r.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady';
      const roles = r.metadata?.labels?.['node-role.kubernetes.io/control-plane'] !== undefined ? 'control-plane' : '<none>';
      return `${name}${status.padEnd(9)}${roles.padEnd(9)}${age.padEnd(6)}v1.29.0`;
    }
    const status = r.status?.phase || r.status?.state || 'Active';
    return `${name}${status.padEnd(9)}${age}`;
  }

  _formatAge(timestamp) {
    if (!timestamp) return '<unknown>';
    const elapsed = Date.now() - new Date(timestamp).getTime();
    const secs = Math.floor(elapsed / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  _cmdDescribe(args, cluster) {
    if (args.length < 2) return { error: true, message: 'error: You must specify a resource name.' };
    const kind = KIND_ALIASES[args[0]?.toLowerCase()];
    if (!kind) return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };

    const resources = cluster.getResourcesByKind(kind);
    const res = resources.find(r => r.metadata?.name === args[1]);
    if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${args[1]}" not found` };

    if (typeof res.toDescribe === 'function') {
      return { error: false, message: res.toDescribe() };
    }

    const lines = [
      `Name:         ${res.metadata.name}`,
      `Namespace:    ${res.metadata.namespace || 'default'}`,
      `Kind:         ${kind}`,
      `Labels:       ${Object.entries(res.metadata.labels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}`,
      `Annotations:  ${Object.entries(res.metadata.annotations || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}`,
      `Status:       ${res.status?.phase || res.status?.state || 'Active'}`,
      `Created:      ${res.metadata.creationTimestamp || 'Unknown'}`
    ];

    if (kind === 'Pod') {
      lines.push(`IP:           ${res.status?.podIP || '<none>'}`);
      lines.push(`Node:         ${res.spec?.nodeName || '<none>'}`);
    }
    if (kind === 'Deployment') {
      lines.push(`Replicas:     ${res.status?.readyReplicas || 0} ready / ${res.spec?.replicas || 0} desired`);
      lines.push(`Strategy:     ${res.spec?.strategy?.type || 'RollingUpdate'}`);
    }
    return { error: false, message: lines.join('\n') };
  }

  _cmdLogs(args, cluster) {
    const name = args[0];
    if (!name) return { error: true, message: 'error: You must specify a pod name' };

    const pods = cluster.getResourcesByKind('Pod');
    const pod = pods.find(p => p.metadata?.name === name);
    if (!pod) return { error: true, message: `Error from server (NotFound): pods "${name}" not found` };
    if (pod.status?.phase !== 'Running') return { error: true, message: `Error from server: container in pod "${name}" is not running` };

    const sampleLogs = [
      `[${new Date().toISOString()}] Starting application...`,
      `[${new Date().toISOString()}] Listening on port ${pod.spec?.containers?.[0]?.ports?.[0]?.containerPort || 8080}`,
      `[${new Date().toISOString()}] Health check passed`,
      `[${new Date().toISOString()}] Ready to serve traffic`,
    ];
    return { error: false, message: sampleLogs.join('\n') };
  }

  _cmdScale(args, cluster, engine) {
    const kindArg = args[0];
    const name = args[1];
    const replicasFlag = args.find(a => a.startsWith('--replicas='));

    if (!kindArg || !name || !replicasFlag) return { error: true, message: 'usage: kubectl scale <resource> <name> --replicas=<count>' };

    const kind = KIND_ALIASES[kindArg.toLowerCase()];
    const scalable = ['Deployment', 'StatefulSet', 'ReplicaSet'];
    if (!kind || !scalable.includes(kind)) return { error: true, message: `error: cannot scale ${kindArg}` };

    const replicas = parseInt(replicasFlag.split('=')[1]);
    if (isNaN(replicas) || replicas < 0) return { error: true, message: 'error: invalid replicas value' };

    const resources = cluster.getResourcesByKind(kind);
    const res = resources.find(r => r.metadata?.name === name);
    if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };

    const oldReplicas = res.spec?.replicas || 0;
    if (res.spec) res.spec.replicas = replicas;
    engine.emit('resource:scaled', { uid: res.metadata.uid, kind, name, replicas, oldReplicas });
    engine.emit('xp:gain', { amount: 10 });
    return { error: false, message: `${kind.toLowerCase()}.apps/${name} scaled` };
  }

  _cmdDelete(args, cluster, engine) {
    if (args.length < 2) return { error: true, message: 'error: You must specify a resource type and name' };
    const kind = KIND_ALIASES[args[0]?.toLowerCase()];
    if (!kind) return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };

    const name = args[1];
    const resources = cluster.getResourcesByKind(kind);
    const res = resources.find(r => r.metadata?.name === name);
    if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };

    cluster.removeResource(res.metadata.uid);
    engine.emit('resource:deleted', { uid: res.metadata.uid, kind, name });
    engine.emit('xp:gain', { amount: 5 });
    return { error: false, message: `${kind.toLowerCase()} "${name}" deleted` };
  }

  _cmdApply(args, cluster, engine) {
    const fFlag = args.indexOf('-f');
    if (fFlag === -1 || !args[fFlag + 1]) return { error: true, message: 'error: must specify -f <filename>' };

    const filename = args[fFlag + 1];
    let kind = 'Pod';
    if (filename.includes('deploy')) kind = 'Deployment';
    else if (filename.includes('svc')) kind = 'Service';
    const name = filename.replace(/\.(yaml|yml|json)$/, '').replace(/^.*\//, '');

    const uid = `${kind.toLowerCase()}-${name}-${Date.now()}`;
    cluster.addResource(kind, {
      metadata: { uid, name, namespace: 'default', creationTimestamp: new Date().toISOString(), labels: {}, annotations: {} },
      spec: kind === 'Deployment' ? { replicas: 1, strategy: { type: 'RollingUpdate' } } : {},
      status: kind === 'Pod' ? { phase: 'Pending' } : kind === 'Deployment' ? { readyReplicas: 0, availableReplicas: 0 } : {}
    });

    engine.emit('resource:applied', { uid, kind, name });
    engine.emit('xp:gain', { amount: 15 });
    return { error: false, message: `${kind.toLowerCase()}/${name} created` };
  }

  _cmdCreate(args, cluster, engine) {
    if (args.length === 0) return { error: true, message: 'error: must specify a resource type.\nUsage: kubectl create <resource> <name> [options]' };

    const kind = KIND_ALIASES[args[0]?.toLowerCase()];
    if (!kind) return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };

    const name = args[1] || `${kind.toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
    const ns = args.includes('--namespace') ? args[args.indexOf('--namespace') + 1] : 'default';
    const uid = `${kind.toLowerCase()}-${name}-${Date.now()}`;

    const defaults = {
      Pod: { spec: { containers: [{ name: 'main', image: 'nginx:latest' }] }, status: { phase: 'Pending' } },
      Deployment: { spec: { replicas: 1, strategy: { type: 'RollingUpdate' } }, status: { readyReplicas: 0 } },
      Service: { spec: { type: 'ClusterIP', ports: [{ port: 80, targetPort: 80 }] }, status: {} },
      Namespace: { spec: {}, status: { phase: 'Active' } },
      ConfigMap: { spec: { data: {} }, status: {} },
      Secret: { spec: { type: 'Opaque', data: {} }, status: {} },
      Job: { spec: { completions: 1, parallelism: 1 }, status: { active: 0, succeeded: 0, failed: 0 } },
      DaemonSet: { spec: {}, status: {} },
      StatefulSet: { spec: { replicas: 1 }, status: {} },
      NetworkPolicy: { spec: { podSelector: {}, policyTypes: ['Ingress'] }, status: {} },
    };

    const def = defaults[kind] || { spec: {}, status: {} };
    cluster.addResource({
      kind,
      name,
      metadata: { uid, name, namespace: ns, creationTimestamp: new Date().toISOString(), labels: { app: name }, annotations: {} },
      spec: def.spec,
      status: def.status
    });

    engine.emit('resource:created', { uid, kind, name });
    engine.emit('xp:gain', { amount: 15 });
    return { error: false, message: `${kind.toLowerCase()}/${name} created` };
  }

  _cmdRun(args, cluster, engine) {
    const name = args[0];
    if (!name) return { error: true, message: 'error: must specify pod name.\nUsage: kubectl run <name> --image=<image>' };

    const imageFlag = args.find(a => a.startsWith('--image='));
    const image = imageFlag ? imageFlag.split('=')[1] : 'nginx:latest';
    const uid = `pod-${name}-${Date.now()}`;

    cluster.addResource({
      kind: 'Pod',
      name,
      metadata: { uid, name, namespace: 'default', creationTimestamp: new Date().toISOString(), labels: { run: name }, annotations: {} },
      spec: { containers: [{ name, image }] },
      status: { phase: 'Pending' }
    });

    engine.emit('resource:created', { uid, kind: 'Pod', name });
    engine.emit('xp:gain', { amount: 10 });
    return { error: false, message: `pod/${name} created` };
  }

  _cmdLabel(args, cluster, engine) {
    if (args.length < 3) return { error: true, message: 'usage: kubectl label <resource> <name> key=value [key=value...]' };

    const kind = KIND_ALIASES[args[0]?.toLowerCase()];
    if (!kind) return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };

    const name = args[1];
    const resources = cluster.getResourcesByKind(kind);
    const res = resources.find(r => r.metadata?.name === name);
    if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };

    if (!res.metadata.labels) res.metadata.labels = {};
    const applied = [];
    for (let i = 2; i < args.length; i++) {
      const parts = args[i].split('=');
      if (parts.length === 2) {
        res.metadata.labels[parts[0]] = parts[1];
        applied.push(args[i]);
      } else if (args[i].endsWith('-')) {
        const key = args[i].slice(0, -1);
        delete res.metadata.labels[key];
        applied.push(`${key}-`);
      }
    }
    engine.emit('xp:gain', { amount: 5 });
    return { error: false, message: `${kind.toLowerCase()}/${name} labeled\n${applied.join('\n')}` };
  }

  _cmdRollout(args, cluster, engine) {
    const action = args[0];
    if (!action) return { error: true, message: 'usage: kubectl rollout [status|restart|undo] <resource> <name>' };

    const kind = KIND_ALIASES[args[1]?.toLowerCase()];
    const name = args[2];

    if (!kind || !name) return { error: true, message: 'error: must specify resource type and name' };

    const resources = cluster.getResourcesByKind(kind);
    const res = resources.find(r => r.metadata?.name === name);
    if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };

    if (action === 'status') {
      return { error: false, message: `deployment "${name}" successfully rolled out` };
    }
    if (action === 'restart') {
      engine.emit('resource:restarted', { uid: res.metadata.uid, kind, name });
      engine.emit('xp:gain', { amount: 10 });
      return { error: false, message: `deployment.apps/${name} restarted` };
    }
    if (action === 'undo') {
      engine.emit('resource:rollback', { uid: res.metadata.uid, kind, name });
      engine.emit('xp:gain', { amount: 10 });
      return { error: false, message: `deployment.apps/${name} rolled back` };
    }
    if (action === 'history') {
      const revisions = res._revisionHistory || [{ revision: 1, image: res.spec?.template?.spec?.containers?.[0]?.image || 'unknown' }];
      const header = 'REVISION  CHANGE-CAUSE';
      const rows = revisions.map((r, i) => `${String(r.revision || i + 1).padEnd(10)}${r.changeCause || r.image || '<none>'}`);
      return { error: false, message: `${header}\n${rows.join('\n')}` };
    }
    return { error: true, message: `error: unknown rollout action "${action}"\nValid actions: status, restart, undo, history` };
  }

  _cmdDrain(args, cluster, engine) {
    const name = args[0];
    if (!name) return { error: true, message: 'error: must specify node name' };

    const nodes = cluster.getResourcesByKind('Node');
    const node = nodes.find(n => n.metadata?.name === name);
    if (!node) return { error: true, message: `Error from server (NotFound): nodes "${name}" not found` };

    engine.emit('node:drain', { uid: node.metadata.uid, name });
    engine.emit('xp:gain', { amount: 20 });
    return { error: false, message: `node/${name} cordoned\nnode/${name} drained` };
  }

  _cmdCordon(args, cluster, engine, cordon) {
    const name = args[0];
    if (!name) return { error: true, message: 'error: must specify node name' };

    const nodes = cluster.getResourcesByKind('Node');
    const node = nodes.find(n => n.metadata?.name === name);
    if (!node) return { error: true, message: `Error from server (NotFound): nodes "${name}" not found` };

    engine.emit(cordon ? 'node:cordon' : 'node:uncordon', { uid: node.metadata.uid, name });
    engine.emit('xp:gain', { amount: 5 });
    return { error: false, message: `node/${name} ${cordon ? 'cordoned' : 'uncordoned'}` };
  }

  _cmdTop(args, cluster) {
    const type = args[0];
    if (type === 'nodes' || type === 'node') {
      const nodes = cluster.getResourcesByKind('Node');
      if (nodes.length === 0) return { error: false, message: 'No resources found.' };
      const header = 'NAME                     CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%';
      const rows = nodes.map(n => {
        const name = (n.metadata?.name || 'unknown').padEnd(25);
        const cpuUsed = n.cpuUsage ?? n.status?.allocatedCPU ?? 0;
        const cpuCap = parseInt(n.spec?.cpu || n.status?.capacity?.cpu || '4') * 1000;
        const memUsed = n.memoryUsage ?? n.status?.allocatedMemory ?? 0;
        const memCapStr = n.spec?.memory || n.status?.capacity?.memory || '8Gi';
        const memCap = parseInt(memCapStr) * (memCapStr.includes('Gi') ? 1024 : 1);
        const cpuPct = cpuCap > 0 ? Math.round((cpuUsed / cpuCap) * 100) : 0;
        const memPct = memCap > 0 ? Math.round((memUsed / memCap) * 100) : 0;
        return `${name}${`${cpuUsed}m`.padEnd(13)}${`${cpuPct}%`.padEnd(7)}${`${memUsed}Mi`.padEnd(16)}${memPct}%`;
      });
      return { error: false, message: `${header}\n${rows.join('\n')}` };
    }
    if (type === 'pods' || type === 'pod') {
      const pods = cluster.getResourcesByKind('Pod');
      if (pods.length === 0) return { error: false, message: 'No resources found.' };
      const header = 'NAME                     CPU(cores)   MEMORY(bytes)';
      const rows = pods.map(p => {
        const name = (p.metadata?.name || 'unknown').padEnd(25);
        const cpu = p.cpuUsage ?? p.status?.cpuUsage ?? 0;
        const mem = p.memoryUsage ?? p.status?.memoryUsage ?? 0;
        return `${name}${`${cpu}m`.padEnd(13)}${mem}Mi`;
      });
      return { error: false, message: `${header}\n${rows.join('\n')}` };
    }
    return { error: true, message: 'error: You must specify "nodes" or "pods"' };
  }

  _cmdExec(args, cluster) {
    const itIdx = args.findIndex(a => a === '-it');
    const name = itIdx >= 0 ? args[itIdx + 1] : args[0];
    if (!name) return { error: true, message: 'error: must specify pod name' };

    const pods = cluster.getResourcesByKind('Pod');
    const pod = pods.find(p => p.metadata?.name === name);
    if (!pod) return { error: true, message: `Error from server (NotFound): pods "${name}" not found` };

    const cmdParts = args.slice(args.indexOf('--') + 1);
    const command = cmdParts.length > 0 && cmdParts[0] !== name ? cmdParts.join(' ') : '/bin/sh';
    return { error: false, message: `Defaulting container to "${pod.spec?.containers?.[0]?.name || 'main'}"\n(simulated) exec into ${name}: ${command}` };
  }

  _appendOutput(text, colorClass = 'text-white/70') {
    const line = document.createElement('div');
    line.className = `${colorClass} text-xs font-mono whitespace-pre leading-5`;
    line.textContent = text;
    this.output.appendChild(line);
    this.output.scrollTop = this.output.scrollHeight;
  }

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  show() {
    this.visible = true;
    this.container.classList.remove('translate-y-full');
    this.container.classList.add('translate-y-0');
    requestAnimationFrame(() => this.input.focus());
  }

  hide() {
    this.visible = false;
    this.container.classList.remove('translate-y-0');
    this.container.classList.add('translate-y-full');
    this.input.blur();
    this.suggestions = [];
    this.suggestionsEl.classList.add('hidden');
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  destroy() {
    document.removeEventListener('keydown', this._boundKeydown);
    this.container?.remove();
  }
}
