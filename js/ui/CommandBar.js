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

const COMMANDS = ['get', 'describe', 'logs', 'scale', 'delete', 'apply', 'create', 'rollout', 'drain', 'cordon', 'uncordon', 'top', 'exec', 'label', 'run', 'explain'];

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

    this.suggestionsEl.addEventListener('click', (e) => {
      const el = e.target.closest('[data-idx]');
      if (!el) return;
      this._applySuggestion(this.suggestions[parseInt(el.dataset.idx)]);
    });

    this._boundShowCommandBar = () => this.show();
    const engine = window.game?.engine;
    if (engine) { engine.on('ui:show-command-bar', this._boundShowCommandBar); }
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

  _checkEasterEggs(raw) {
    const lower = raw.toLowerCase().trim();
    if (lower === 'get coffee') {
      return { message: "Error: resource type 'coffee' not found. But here's a \u2615 for your effort! +5 XP", xp: 5, achievement: 'coffee-break' };
    }
    if (lower === 'explain life') {
      return { message: "KIND:     Life\nVERSION:  v1\nDESCRIPTION:\n  42. That's it. That's the explanation.", color: 'text-sky-400' };
    }
    if (lower.startsWith('run') && lower.includes('--image=doom')) {
      return { message: "Nice try. We only run containers here, not demons. +10 XP", xp: 10, achievement: 'doom-runner' };
    }
    if (lower.match(/^delete\s+(ns|namespace|namespaces)\s+kube-system/)) {
      return { message: "WHOA! You just tried to nuke the control plane. In production, this would page every SRE on the planet. +25 XP", xp: 25, achievement: 'chaos-monkey', color: 'text-red-400' };
    }
    return null;
  }

  _executeCommand(raw) {
    if (!raw) return;

    if (raw.toLowerCase().startsWith('sudo ')) {
      this.history.unshift(raw);
      if (this.history.length > 50) this.history.pop();
      this.historyIndex = -1;
      this.input.value = '';
      this.suggestions = [];
      this.suggestionsEl.classList.add('hidden');
      this._appendOutput(`$ kubectl ${raw}`, 'text-green-400/80');
      this._appendOutput("Permission denied. Just kidding \u2014 you're already root in this cluster.", 'text-purple-400');
      return;
    }

    this.history.unshift(raw);
    if (this.history.length > 50) this.history.pop();
    this.historyIndex = -1;
    this.input.value = '';
    this.suggestions = [];
    this.suggestionsEl.classList.add('hidden');

    this._appendOutput(`$ kubectl ${raw}`, 'text-green-400/80');

    window.game?.engine.emit('command:raw', { command: raw });
    window.game?.engine.emit('command:executed', { command: raw });

    const easterEgg = this._checkEasterEggs(raw);
    if (easterEgg) {
      this._appendOutput(easterEgg.message, easterEgg.color || 'text-amber-400');
      if (easterEgg.xp) window.game?.engine.emit('xp:gain', { amount: easterEgg.xp });
      if (easterEgg.achievement) window.game?.engine.emit('easter-egg:triggered', { id: easterEgg.achievement });
      return;
    }

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
      case 'explain': return this._cmdExplain(args);
      default: return { error: true, message: `error: unknown command "${cmd}"\nKnown commands: ${COMMANDS.join(', ')}` };
    }
  }

  _cmdGet(args, cluster) {
    if (args.length === 0) return { error: true, message: 'error: Required resource not specified.\nUse "kubectl get <resource>" to see resources.' };

    const kind = KIND_ALIASES[args[0]?.toLowerCase()];
    if (!kind) return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };

    const wide = args.includes('-o') && args.includes('wide');
    const nsIdx = args.indexOf('-n');
    const ns = nsIdx >= 0 ? args[nsIdx + 1] : undefined;
    const fieldSelectorIdx = args.indexOf('--field-selector');
    const fieldSelector = fieldSelectorIdx >= 0 ? args[fieldSelectorIdx + 1] : null;
    const labelIdx = args.indexOf('-l');
    const labelSelector = labelIdx >= 0 ? args[labelIdx + 1] : null;
    const hasJsonpath = args.some(a => a.startsWith('jsonpath=') || a.includes('jsonpath'));
    const hasYaml = args.includes('-o') && args.includes('yaml');
    const flagArgs = new Set(['--field-selector', fieldSelector, '-o', 'wide', 'yaml', '-A', '--all-namespaces', '-w', '--watch', '-l', labelSelector, '-n', ns].filter(Boolean));
    args.forEach(a => { if (a.startsWith('--sort-by') || a.startsWith('jsonpath')) flagArgs.add(a); });
    const name = args.slice(1).find(a => !flagArgs.has(a) && !a.startsWith('--'));
    let resources = cluster.getResourcesByKind(kind);

    if (ns) {
      resources = resources.filter(r => r.metadata?.namespace === ns || r.namespace === ns);
    }

    if (fieldSelector) {
      const involvedMatch = fieldSelector.match(/involvedObject\.name=(.+)/);
      const nodeMatch = fieldSelector.match(/spec\.nodeName=(.+)/);
      if (involvedMatch) {
        const targetName = involvedMatch[1];
        const lines = [
          'LAST SEEN   TYPE      REASON              OBJECT                MESSAGE',
          `2m          Normal    Scheduled           pod/${targetName}     Successfully assigned default/${targetName} to node-1`,
          `2m          Normal    Pulling             pod/${targetName}     Pulling image "nginx:latest"`,
          `1m          Normal    Pulled              pod/${targetName}     Successfully pulled image`,
          `1m          Normal    Created             pod/${targetName}     Created container main`,
          `30s         Warning   BackOff             pod/${targetName}     Back-off restarting failed container`,
        ];
        return { error: false, message: lines.join('\n') };
      }
      if (nodeMatch) {
        const nodeName = nodeMatch[1];
        const pods = cluster.getResourcesByKind('Pod').filter(p => p.spec?.nodeName === nodeName);
        if (pods.length === 0) return { error: false, message: `No resources found on node ${nodeName}.` };
        const header = this._getHeaderForKind('Pod', wide);
        const rows = pods.map(r => this._formatResourceRow(r, 'Pod', wide));
        return { error: false, message: `${header}\n${rows.join('\n')}` };
      }
    }

    if (labelSelector) {
      const [lk, lv] = labelSelector.split('=');
      if (lk) {
        resources = resources.filter(r => {
          const labels = r.metadata?.labels || {};
          return lv ? labels[lk] === lv : lk in labels;
        });
      }
    }

    if (hasJsonpath && name) {
      let res = resources.find(r => r.metadata?.name === name);
      if (!res) res = resources.find(r => r.metadata?.name?.startsWith(name));
      if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };
      return { error: false, message: JSON.stringify(res.spec || {}, null, 2) };
    }

    if (hasYaml) {
      const target = name ? resources.find(r => r.metadata?.name === name || r.metadata?.name?.startsWith(name)) : resources[0];
      if (!target && name) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };
      if (target) {
        const yaml = [`apiVersion: ${target.apiVersion || 'v1'}`, `kind: ${kind}`, `metadata:`, `  name: ${target.metadata?.name}`, `  namespace: ${target.metadata?.namespace || 'default'}`, `spec:`, `  ${JSON.stringify(target.spec || {})}`];
        return { error: false, message: yaml.join('\n') };
      }
    }

    if (name) {
      let res = resources.find(r => r.metadata?.name === name);
      if (!res) {
        res = resources.find(r => r.metadata?.name?.startsWith(name));
      }
      if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };
      return { error: false, message: this._formatResourceRow(res, kind, true) };
    }

    if (resources.length === 0) return { error: false, message: `No resources found in ${ns || 'default'} namespace.` };

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
    let res = resources.find(r => r.metadata?.name === args[1]);
    if (!res) {
      res = resources.find(r => r.metadata?.name?.startsWith(args[1]));
    }
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
    const nsIdx = args.indexOf('-n');
    const ns = nsIdx >= 0 ? args[nsIdx + 1] : undefined;
    const previous = args.includes('--previous') || args.includes('-p');
    const flags = new Set(['-n', ns, '--previous', '-p', '-f', '--follow', '--tail'].filter(Boolean));
    const name = args.find(a => !flags.has(a) && !a.startsWith('--tail='));
    if (!name) return { error: true, message: 'error: You must specify a pod name' };

    const pods = cluster.getResourcesByKind('Pod');
    let pod = pods.find(p => p.metadata?.name === name && (!ns || p.metadata?.namespace === ns));
    if (!pod) {
      pod = pods.find(p => p.metadata?.name?.startsWith(name) && (!ns || p.metadata?.namespace === ns));
    }
    if (!pod) return { error: true, message: `Error from server (NotFound): pods "${name}" not found` };

    if (!previous && pod.status?.phase !== 'Running') {
      return { error: true, message: `Error from server: container in pod "${name}" is not running` };
    }

    if (previous) {
      const crashLogs = [
        `[${new Date().toISOString()}] Starting application...`,
        `[${new Date().toISOString()}] Error: Cannot connect to database`,
        `[${new Date().toISOString()}] Fatal: Unhandled exception — shutting down`,
        `[${new Date().toISOString()}] Exit code: 1`,
      ];
      return { error: false, message: crashLogs.join('\n') };
    }

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

    const gameEngine = window.game?.gameEngine;
    if (gameEngine) {
      gameEngine.queueCommand({ type: 'scale', kind, name, namespace: res.metadata?.namespace || 'default', replicas });
    } else {
      if (res.spec) res.spec.replicas = replicas;
    }
    engine.emit('xp:gain', { amount: 10 });
    return { error: false, message: `${kind.toLowerCase()}.apps/${name} scaled` };
  }

  _cmdDelete(args, cluster, engine) {
    if (args.length < 2) return { error: true, message: 'error: You must specify a resource type and name' };
    const kind = KIND_ALIASES[args[0]?.toLowerCase()];
    if (!kind) return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };

    const name = args[1];
    const ns = args.includes('-n') ? args[args.indexOf('-n') + 1] : undefined;
    const resources = cluster.getResourcesByKind(kind);
    const res = resources.find(r => r.metadata?.name === name && (!ns || r.metadata?.namespace === ns));
    if (!res) return { error: true, message: `Error from server (NotFound): ${kind.toLowerCase()}s "${name}" not found` };

    const gameEngine = window.game?.gameEngine;
    if (gameEngine) {
      gameEngine.queueCommand({ type: 'delete', kind, name, namespace: res.metadata?.namespace ?? '' });
    } else {
      cluster.remove(res.uid);
    }
    engine.emit('xp:gain', { amount: 5 });
    return { error: false, message: `${kind.toLowerCase()} "${name}" deleted` };
  }

  _cmdApply(args, cluster, engine) {
    const fFlag = args.indexOf('-f');
    if (fFlag === -1 || !args[fFlag + 1]) return { error: true, message: 'error: must specify -f <filename>' };

    const filename = args[fFlag + 1];
    let kind = 'Pod';
    if (filename.includes('deploy')) kind = 'Deployment';
    else if (filename.includes('svc') || filename.includes('service')) kind = 'Service';
    else if (filename.includes('node')) kind = 'Node';
    const name = filename.replace(/\.(yaml|yml|json)$/, '').replace(/^.*\//, '');

    const added = cluster.addResource({
      kind,
      name,
      metadata: { name, namespace: 'default', labels: { app: name }, annotations: {} },
      spec: kind === 'Deployment' ? { replicas: 1, strategy: { type: 'RollingUpdate' }, selector: { matchLabels: { app: name } }, template: { metadata: { labels: { app: name } }, spec: { containers: [{ name: 'main', image: 'nginx:latest' }] } } } : kind === 'Node' ? { cpu: '4', memory: '8Gi' } : {},
      status: kind === 'Pod' ? { phase: 'Pending' } : kind === 'Node' ? { phase: 'Running' } : {}
    });

    if (kind === 'Node' && added) {
      added.setCondition('Ready', 'True', 'KubeletReady');
    }

    engine.emit('resource:created', {
      kind, name, mode: 'palette',
      concurrentPods: kind === 'Pod' ? (cluster.getResourcesByKind('Pod') || []).length : undefined,
      nodeCount: kind === 'Node' ? (cluster.getResourcesByKind('Node') || []).length : undefined,
    });
    engine.emit('resource:applied', { kind, name });
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
      Deployment: { spec: { replicas: 1, strategy: { type: 'RollingUpdate' }, selector: { matchLabels: { app: name } }, template: { metadata: { labels: { app: name } }, spec: { containers: [{ name: 'main', image: 'nginx:latest' }] } } }, status: { readyReplicas: 0 } },
      Service: { spec: { type: 'ClusterIP', ports: [{ port: 80, targetPort: 80 }] }, status: {} },
      Namespace: { spec: {}, status: { phase: 'Active' } },
      Node: { spec: { cpu: '4', memory: '8Gi' }, status: { phase: 'Running' } },
      ConfigMap: { spec: { data: {} }, status: {} },
      Secret: { spec: { type: 'Opaque', data: {} }, status: {} },
      Job: { spec: { completions: 1, parallelism: 1 }, status: { active: 0, succeeded: 0, failed: 0 } },
      DaemonSet: { spec: {}, status: {} },
      StatefulSet: { spec: { replicas: 1 }, status: {} },
      Ingress: { spec: { rules: [{ host: `${name}.example.com`, http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: name, port: { number: 80 } } } }] } }] }, status: {} },
      NetworkPolicy: { spec: { podSelector: {}, policyTypes: ['Ingress'] }, status: {} },
      Role: { spec: { rules: [] }, status: {} },
      ClusterRole: { spec: { rules: [] }, status: {} },
      RoleBinding: { spec: { roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: '' }, subjects: [] }, status: {} },
      ClusterRoleBinding: { spec: { roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: '' }, subjects: [] }, status: {} },
      ServiceAccount: { spec: {}, status: {} },
      PodDisruptionBudget: { spec: { selector: { matchLabels: {} }, maxUnavailable: 1 }, status: {} },
    };

    const def = defaults[kind] || { spec: {}, status: {} };
    const added = cluster.addResource({
      kind,
      name,
      metadata: { uid, name, namespace: ns, creationTimestamp: new Date().toISOString(), labels: { app: name }, annotations: {} },
      spec: def.spec,
      status: def.status
    });

    if (kind === 'Node' && added) {
      added.setCondition('Ready', 'True', 'KubeletReady');
    }

    engine.emit('resource:created', {
      kind, name, mode: 'command',
      concurrentPods: kind === 'Pod' ? (cluster.getResourcesByKind('Pod') || []).length : undefined,
      nodeCount: kind === 'Node' ? (cluster.getResourcesByKind('Node') || []).length : undefined,
    });
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

    engine.emit('resource:created', {
      kind: 'Pod', name, mode: 'command',
      concurrentPods: (cluster.getResourcesByKind('Pod') || []).length,
    });
    engine.emit('xp:gain', { amount: 10 });

    if (name.toLowerCase() === 'konami') {
      engine.emit('easter-egg:triggered', { id: 'konami-code' });
      engine.emit('xp:gain', { amount: 100 });
    }

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

    const gameEngine = window.game?.gameEngine;
    if (gameEngine) {
      gameEngine.queueCommand({ type: 'drain', name, force: args.includes('--force') });
    } else {
      node.spec.unschedulable = true;
    }
    engine.emit('xp:gain', { amount: 20 });
    return { error: false, message: `node/${name} cordoned\nnode/${name} drained` };
  }

  _cmdCordon(args, cluster, engine, cordon) {
    const name = args[0];
    if (!name) return { error: true, message: 'error: must specify node name' };

    const nodes = cluster.getResourcesByKind('Node');
    const node = nodes.find(n => n.metadata?.name === name);
    if (!node) return { error: true, message: `Error from server (NotFound): nodes "${name}" not found` };

    const gameEngine = window.game?.gameEngine;
    if (gameEngine) {
      gameEngine.queueCommand({ type: cordon ? 'cordon' : 'uncordon', name });
    } else {
      node.spec.unschedulable = cordon;
    }
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
      let pods = cluster.getResourcesByKind('Pod');
      const podName = args[1];
      if (podName && !podName.startsWith('--')) {
        let pod = pods.find(p => p.metadata?.name === podName);
        if (!pod) pod = pods.find(p => p.metadata?.name?.startsWith(podName));
        if (!pod) return { error: true, message: `Error from server (NotFound): pods "${podName}" not found` };
        pods = [pod];
      }
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
    const nsIdx = args.indexOf('-n');
    const ns = nsIdx >= 0 ? args[nsIdx + 1] : undefined;
    const itIdx = args.findIndex(a => a === '-it');
    const name = itIdx >= 0 ? args[itIdx + 1] : args.find(a => a !== '-n' && a !== ns);
    if (!name) return { error: true, message: 'error: must specify pod name' };

    const pods = cluster.getResourcesByKind('Pod');
    const pod = pods.find(p => p.metadata?.name === name && (!ns || p.metadata?.namespace === ns));
    if (!pod) return { error: true, message: `Error from server (NotFound): pods "${name}" not found` };

    const cmdParts = args.slice(args.indexOf('--') + 1);
    const command = cmdParts.length > 0 && cmdParts[0] !== name ? cmdParts.join(' ') : '/bin/sh';
    return { error: false, message: `Defaulting container to "${pod.spec?.containers?.[0]?.name || 'main'}"\n(simulated) exec into ${name}: ${command}` };
  }

  _cmdExplain(args) {
    if (args.length === 0) return { error: true, message: 'error: You must specify a resource type.\nUsage: kubectl explain <resource>[.field]' };

    const input = args[0].toLowerCase();
    const parts = input.split('.');

    const EXPLAIN_DATA = {
      pod: {
        kind: 'Pod',
        version: 'v1',
        description: 'Pod is a collection of containers that can run on a host. This resource is\ncreated by clients and scheduled onto hosts.',
        fields: {
          'spec': 'PodSpec - Specification of the desired behavior of the pod.',
          'spec.containers': 'Container[] - List of containers belonging to the pod.',
          'spec.containers.image': 'string - Docker image name.',
          'spec.containers.name': 'string - Name of the container.',
          'spec.containers.ports': 'ContainerPort[] - List of ports to expose from the container.',
          'spec.containers.resources': 'ResourceRequirements - Compute resources required by this container.',
          'spec.containers.resources.requests': 'map[string]Quantity - Minimum resources required.',
          'spec.containers.resources.limits': 'map[string]Quantity - Maximum resources allowed.',
          'spec.containers.livenessProbe': 'Probe - Periodic probe of container liveness.',
          'spec.containers.readinessProbe': 'Probe - Periodic probe of container service readiness.',
          'spec.nodeName': 'string - NodeName requests scheduling on a specific node.',
          'spec.nodeSelector': 'map[string]string - Selector for node scheduling.',
          'spec.tolerations': 'Toleration[] - Pod tolerations for node taints.',
          'spec.restartPolicy': 'string - Restart policy: Always, OnFailure, Never. Default: Always.',
          'spec.serviceAccountName': 'string - Name of the ServiceAccount to use.',
          'spec.volumes': 'Volume[] - List of volumes that can be mounted by containers.',
          'status': 'PodStatus - Most recently observed status of the pod.',
          'status.phase': 'string - Current phase: Pending, Running, Succeeded, Failed, Unknown.',
          'status.conditions': 'PodCondition[] - Current service state of pod.',
          'status.podIP': 'string - IP address allocated to the pod.',
          'metadata': 'ObjectMeta - Standard object metadata.',
          'metadata.name': 'string - Name must be unique within a namespace.',
          'metadata.namespace': 'string - Namespace of the object. Default: "default".',
          'metadata.labels': 'map[string]string - Map of string keys and values for organization.',
          'metadata.annotations': 'map[string]string - Unstructured key-value data.',
        }
      },
      deployment: {
        kind: 'Deployment',
        version: 'apps/v1',
        description: 'Deployment enables declarative updates for Pods and ReplicaSets.',
        fields: {
          'spec': 'DeploymentSpec - Specification of the desired behavior.',
          'spec.replicas': 'integer - Number of desired pods. Default: 1.',
          'spec.selector': 'LabelSelector - Label selector for pods managed by this deployment.',
          'spec.strategy': 'DeploymentStrategy - The deployment strategy to replace existing pods.',
          'spec.strategy.type': 'string - Type of strategy: RollingUpdate or Recreate.',
          'spec.strategy.rollingUpdate': 'RollingUpdateDeployment - Config for RollingUpdate.',
          'spec.strategy.rollingUpdate.maxSurge': 'IntOrString - Max pods above desired count during update.',
          'spec.strategy.rollingUpdate.maxUnavailable': 'IntOrString - Max unavailable pods during update.',
          'spec.template': 'PodTemplateSpec - Template describes pods that will be created.',
          'spec.revisionHistoryLimit': 'integer - Number of old ReplicaSets to retain. Default: 10.',
          'status': 'DeploymentStatus - Most recently observed status.',
          'status.replicas': 'integer - Total number of non-terminated pods.',
          'status.readyReplicas': 'integer - Number of ready pods.',
          'status.availableReplicas': 'integer - Number of available pods.',
        }
      },
      service: {
        kind: 'Service',
        version: 'v1',
        description: 'Service is a named abstraction of software service consisting of local port\nthat the proxy listens on, and the selector that determines which pods will\nanswer requests sent through the proxy.',
        fields: {
          'spec': 'ServiceSpec - Specification of the desired behavior.',
          'spec.type': 'string - Type: ClusterIP (default), NodePort, LoadBalancer, ExternalName.',
          'spec.selector': 'map[string]string - Route traffic to pods matching these labels.',
          'spec.ports': 'ServicePort[] - List of ports exposed by this service.',
          'spec.ports.port': 'integer - Port that will be exposed by this service.',
          'spec.ports.targetPort': 'IntOrString - Port to access on the pods targeted by the service.',
          'spec.ports.protocol': 'string - Protocol: TCP (default), UDP, SCTP.',
          'spec.clusterIP': 'string - clusterIP is the IP address of the service. "None" = headless.',
        }
      },
      node: {
        kind: 'Node',
        version: 'v1',
        description: 'Node is a worker machine in Kubernetes. Each node is managed by the control\nplane and contains the services necessary to run Pods.',
        fields: {
          'spec': 'NodeSpec - Specification of the node.',
          'spec.taints': 'Taint[] - Taints applied to the node for scheduling.',
          'spec.unschedulable': 'boolean - Marks node as unschedulable (cordon).',
          'status': 'NodeStatus - Most recently observed status.',
          'status.conditions': 'NodeCondition[] - Current condition observations. Key: Ready.',
          'status.capacity': 'map[string]Quantity - Total resources (cpu, memory, pods).',
          'status.allocatable': 'map[string]Quantity - Resources available for scheduling.',
          'status.addresses': 'NodeAddress[] - Addresses reachable to the node.',
        }
      },
      namespace: {
        kind: 'Namespace',
        version: 'v1',
        description: 'Namespace provides a scope for Names. Use of multiple namespaces is optional.',
        fields: {
          'status': 'NamespaceStatus - Status of the namespace.',
          'status.phase': 'string - Phase: Active or Terminating.',
        }
      },
      configmap: {
        kind: 'ConfigMap',
        version: 'v1',
        description: 'ConfigMap holds non-confidential configuration data as key-value pairs.\nPods can consume ConfigMaps as environment variables, command-line arguments,\nor as configuration files in a volume.',
        fields: {
          'data': 'map[string]string - Key-value pairs of configuration data.',
          'binaryData': 'map[string][]byte - Binary data as base64-encoded strings.',
          'immutable': 'boolean - If true, disables data updates.',
        }
      },
      secret: {
        kind: 'Secret',
        version: 'v1',
        description: 'Secret holds sensitive data such as passwords, OAuth tokens, and ssh keys.\nValues are base64 encoded. Use Secrets instead of ConfigMaps for sensitive data.',
        fields: {
          'type': 'string - Type: Opaque (default), kubernetes.io/tls, kubernetes.io/dockerconfigjson.',
          'data': 'map[string][]byte - Key-value pairs. Values must be base64 encoded.',
          'stringData': 'map[string]string - Write-only convenience field (auto-encoded).',
          'immutable': 'boolean - If true, disables data updates.',
        }
      },
      networkpolicy: {
        kind: 'NetworkPolicy',
        version: 'networking.k8s.io/v1',
        description: 'NetworkPolicy describes what network traffic is allowed for a set of Pods.\nBy default all traffic is allowed. Creating a NetworkPolicy that selects\na Pod will deny all traffic not explicitly allowed.',
        fields: {
          'spec': 'NetworkPolicySpec - Specification of desired network restrictions.',
          'spec.podSelector': 'LabelSelector - Selects pods this policy applies to.',
          'spec.policyTypes': 'string[] - Types of rules: Ingress, Egress, or both.',
          'spec.ingress': 'NetworkPolicyIngressRule[] - Allowed ingress traffic rules.',
          'spec.egress': 'NetworkPolicyEgressRule[] - Allowed egress traffic rules.',
        }
      },
      hpa: {
        kind: 'HorizontalPodAutoscaler',
        version: 'autoscaling/v2',
        description: 'HorizontalPodAutoscaler automatically scales the number of pod replicas\nbased on observed CPU utilization or custom metrics.',
        fields: {
          'spec': 'HorizontalPodAutoscalerSpec - Behavior of the autoscaler.',
          'spec.scaleTargetRef': 'CrossVersionObjectReference - Target resource to scale.',
          'spec.minReplicas': 'integer - Lower limit for pod count. Default: 1.',
          'spec.maxReplicas': 'integer - Upper limit for pod count. Required.',
          'spec.metrics': 'MetricSpec[] - Metrics to use for scaling decisions.',
          'spec.behavior': 'HorizontalPodAutoscalerBehavior - Scaling policies.',
        }
      },
      statefulset: {
        kind: 'StatefulSet',
        version: 'apps/v1',
        description: 'StatefulSet represents a set of pods with consistent identities. Identities\nare defined as: stable network identity (pod-0, pod-1) and stable storage.',
        fields: {
          'spec': 'StatefulSetSpec - Specification of the desired behavior.',
          'spec.replicas': 'integer - Desired number of pods.',
          'spec.serviceName': 'string - Required. Name of governing headless Service.',
          'spec.template': 'PodTemplateSpec - Template for pods.',
          'spec.volumeClaimTemplates': 'PersistentVolumeClaim[] - PVCs for each pod.',
          'spec.podManagementPolicy': 'string - OrderedReady (default) or Parallel.',
        }
      },
      daemonset: {
        kind: 'DaemonSet',
        version: 'apps/v1',
        description: 'DaemonSet ensures that all (or some) Nodes run a copy of a Pod.\nAs nodes are added to the cluster, Pods are added. Common uses:\nlog collection, node monitoring, cluster storage.',
        fields: {
          'spec': 'DaemonSetSpec - Specification of the desired behavior.',
          'spec.selector': 'LabelSelector - Label selector for pods.',
          'spec.template': 'PodTemplateSpec - Template for pods.',
          'spec.updateStrategy': 'DaemonSetUpdateStrategy - Strategy for replacing pods.',
        }
      },
      job: {
        kind: 'Job',
        version: 'batch/v1',
        description: 'Job creates one or more Pods and ensures that a specified number of them\nsuccessfully terminate. As pods complete, the Job tracks completions.',
        fields: {
          'spec': 'JobSpec - Specification of the desired behavior.',
          'spec.completions': 'integer - Number of completions needed. Default: 1.',
          'spec.parallelism': 'integer - Max pods running in parallel. Default: 1.',
          'spec.backoffLimit': 'integer - Number of retries before marking failed. Default: 6.',
          'spec.activeDeadlineSeconds': 'integer - Max seconds for the Job to be active.',
          'spec.template': 'PodTemplateSpec - Template for pods.',
        }
      },
      cronjob: {
        kind: 'CronJob',
        version: 'batch/v1',
        description: 'CronJob manages time-based Jobs. Creates Job objects at the scheduled time.',
        fields: {
          'spec': 'CronJobSpec - Specification of the desired behavior.',
          'spec.schedule': 'string - Cron format schedule: "*/5 * * * *".',
          'spec.jobTemplate': 'JobTemplateSpec - Template for Jobs to be created.',
          'spec.successfulJobsHistoryLimit': 'integer - Keep N successful jobs. Default: 3.',
          'spec.failedJobsHistoryLimit': 'integer - Keep N failed jobs. Default: 1.',
          'spec.concurrencyPolicy': 'string - Allow, Forbid, or Replace.',
        }
      },
      ingress: {
        kind: 'Ingress',
        version: 'networking.k8s.io/v1',
        description: 'Ingress is a collection of rules that allow inbound connections to reach\ncluster Services. Provides load balancing, SSL termination, and HTTP routing.',
        fields: {
          'spec': 'IngressSpec - Specification of the desired behavior.',
          'spec.rules': 'IngressRule[] - Host and path-based routing rules.',
          'spec.rules.host': 'string - Hostname to match (e.g., "app.example.com").',
          'spec.rules.http.paths': 'HTTPIngressPath[] - Path-based routing.',
          'spec.tls': 'IngressTLS[] - TLS configuration.',
          'spec.tls.secretName': 'string - Name of Secret with TLS cert and key.',
        }
      },
      pvc: {
        kind: 'PersistentVolumeClaim',
        version: 'v1',
        description: 'PersistentVolumeClaim is a user request for and claim to a persistent volume.',
        fields: {
          'spec': 'PersistentVolumeClaimSpec - Specification of the desired behavior.',
          'spec.accessModes': 'string[] - ReadWriteOnce, ReadOnlyMany, ReadWriteMany.',
          'spec.resources.requests.storage': 'Quantity - Requested storage size (e.g., "10Gi").',
          'spec.storageClassName': 'string - Name of StorageClass. Empty = default.',
        }
      },
      role: {
        kind: 'Role',
        version: 'rbac.authorization.k8s.io/v1',
        description: 'Role is a namespaced set of permissions. Use RoleBinding to grant to users.',
        fields: {
          'rules': 'PolicyRule[] - List of permissions.',
          'rules.verbs': 'string[] - Actions: get, list, watch, create, update, delete, patch.',
          'rules.apiGroups': 'string[] - API groups: "" (core), "apps", "batch", etc.',
          'rules.resources': 'string[] - Resources: pods, deployments, services, etc.',
        }
      },
      rolebinding: {
        kind: 'RoleBinding',
        version: 'rbac.authorization.k8s.io/v1',
        description: 'RoleBinding grants permissions defined in a Role to a user or ServiceAccount.',
        fields: {
          'roleRef': 'RoleRef - Reference to the Role.',
          'roleRef.kind': 'string - "Role" or "ClusterRole".',
          'roleRef.name': 'string - Name of the Role to bind.',
          'subjects': 'Subject[] - Users, groups, or ServiceAccounts.',
          'subjects.kind': 'string - "User", "Group", or "ServiceAccount".',
          'subjects.name': 'string - Name of the subject.',
        }
      },
      serviceaccount: {
        kind: 'ServiceAccount',
        version: 'v1',
        description: 'ServiceAccount provides an identity for processes that run in a Pod.\nPods can use ServiceAccount tokens for API authentication.',
        fields: {
          'automountServiceAccountToken': 'boolean - Mount API token automatically. Default: true.',
          'secrets': 'ObjectReference[] - Secrets allowed to be used by pods.',
        }
      },
      pdb: {
        kind: 'PodDisruptionBudget',
        version: 'policy/v1',
        description: 'PodDisruptionBudget limits the number of pods that are down simultaneously\nfrom voluntary disruptions (drain, updates). Protects availability.',
        fields: {
          'spec': 'PodDisruptionBudgetSpec - Specification of the budget.',
          'spec.minAvailable': 'IntOrString - Minimum pods that must be available.',
          'spec.maxUnavailable': 'IntOrString - Maximum pods that can be unavailable.',
          'spec.selector': 'LabelSelector - Pods this budget applies to.',
        }
      },
      replicaset: {
        kind: 'ReplicaSet',
        version: 'apps/v1',
        description: 'ReplicaSet ensures that a specified number of pod replicas are running.\nNote: Use Deployments instead of directly managing ReplicaSets.',
        fields: {
          'spec': 'ReplicaSetSpec - Specification of the desired behavior.',
          'spec.replicas': 'integer - Number of desired pods.',
          'spec.selector': 'LabelSelector - Label selector for pods.',
          'spec.template': 'PodTemplateSpec - Template for pods.',
        }
      },
    };

    const EXPLAIN_ALIASES = {
      po: 'pod', pods: 'pod',
      deploy: 'deployment', deployments: 'deployment',
      svc: 'service', services: 'service',
      no: 'node', nodes: 'node',
      ns: 'namespace', namespaces: 'namespace',
      cm: 'configmap', configmaps: 'configmap',
      secrets: 'secret',
      netpol: 'networkpolicy', networkpolicies: 'networkpolicy',
      horizontalpodautoscaler: 'hpa', horizontalpodautoscalers: 'hpa',
      sts: 'statefulset', statefulsets: 'statefulset',
      ds: 'daemonset', daemonsets: 'daemonset',
      jobs: 'job',
      cj: 'cronjob', cronjobs: 'cronjob',
      ing: 'ingress', ingresses: 'ingress',
      persistentvolumeclaim: 'pvc', persistentvolumeclaims: 'pvc',
      roles: 'role',
      rolebindings: 'rolebinding',
      sa: 'serviceaccount', serviceaccounts: 'serviceaccount',
      poddisruptionbudget: 'pdb', poddisruptionbudgets: 'pdb',
      rs: 'replicaset', replicasets: 'replicaset',
    };

    const resourceKey = EXPLAIN_ALIASES[parts[0]] || parts[0];
    const resource = EXPLAIN_DATA[resourceKey];

    if (!resource) {
      return { error: true, message: `error: the server doesn't have a resource type "${args[0]}"` };
    }

    if (parts.length === 1 || (parts.length === 2 && parts[1] === '')) {
      const fieldList = Object.entries(resource.fields)
        .filter(([k]) => !k.includes('.') || k.split('.').length === 2)
        .filter(([k]) => k.split('.').length <= 2)
        .map(([k, v]) => `   ${k.padEnd(30)} ${v}`)
        .join('\n');

      return {
        error: false,
        message: `KIND:     ${resource.kind}\nVERSION:  ${resource.version}\n\nDESCRIPTION:\n  ${resource.description}\n\nFIELDS:\n${fieldList}`
      };
    }

    const fieldPath = parts.slice(1).join('.');
    const fullPath = `${fieldPath}`;

    const exactMatch = resource.fields[fullPath];
    if (exactMatch) {
      const children = Object.entries(resource.fields)
        .filter(([k]) => k.startsWith(fullPath + '.') && k.split('.').length === fullPath.split('.').length + 1)
        .map(([k, v]) => `   ${k.split('.').pop().padEnd(30)} ${v}`)
        .join('\n');

      return {
        error: false,
        message: `KIND:     ${resource.kind}\nVERSION:  ${resource.version}\nFIELD:    ${fullPath}\n\n${exactMatch}${children ? `\n\nFIELDS:\n${children}` : ''}`
      };
    }

    return { error: true, message: `error: field "${fullPath}" does not exist on ${resource.kind}` };
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
    window.game?.engine?.off?.('ui:show-command-bar', this._boundShowCommandBar);
    this.container?.remove();
  }
}
