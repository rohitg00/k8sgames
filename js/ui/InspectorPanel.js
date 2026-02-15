export class InspectorPanel {
  constructor() {
    this.container = null;
    this.resource = null;
    this.activeTab = 'overview';
    this.visible = false;
    this._boundSelect = this._onResourceSelected.bind(this);
    this._boundDeselect = this._onDeselect.bind(this);
    this._boundUpdate = this._onResourceUpdate.bind(this);
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'inspector-panel';
    this.container.className = 'fixed top-12 right-0 w-96 bottom-0 z-30 transform translate-x-full transition-transform duration-300 ease-out';
    this.container.innerHTML = this._buildShell();
    document.body.appendChild(this.container);
    this._bindGameEvents();
  }

  _buildShell() {
    return `
      <div class="h-full flex flex-col backdrop-blur-xl bg-white/5 border-l border-white/10 shadow-2xl">
        <div id="inspector-header" class="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div class="flex items-center gap-2 min-w-0">
            <div id="inspector-icon" class="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 text-sm font-bold shrink-0">P</div>
            <div class="min-w-0">
              <div id="inspector-name" class="text-white/90 text-sm font-semibold truncate">No Selection</div>
              <div id="inspector-subtitle" class="text-white/40 text-xs truncate">Select a resource</div>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button id="inspector-edit" class="hidden px-2 py-1 text-xs text-sky-400 hover:bg-sky-400/10 rounded transition-colors">Edit</button>
            <button id="inspector-close" class="p-1 text-white/30 hover:text-white/60 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <div id="inspector-tabs" class="flex border-b border-white/5 px-2">
          <button data-tab="overview" class="px-3 py-2 text-xs text-sky-400 border-b-2 border-sky-400 font-medium transition-colors">Overview</button>
          <button data-tab="yaml" class="px-3 py-2 text-xs text-white/40 border-b-2 border-transparent hover:text-white/60 transition-colors">YAML</button>
          <button data-tab="events" class="px-3 py-2 text-xs text-white/40 border-b-2 border-transparent hover:text-white/60 transition-colors">Events</button>
          <button data-tab="describe" class="px-3 py-2 text-xs text-white/40 border-b-2 border-transparent hover:text-white/60 transition-colors">Describe</button>
        </div>

        <div id="inspector-body" class="flex-1 overflow-y-auto scrollbar-thin p-4">
          <div class="text-white/30 text-sm text-center mt-8">Select a resource to inspect</div>
        </div>
      </div>
    `;
  }

  _bindGameEvents() {
    document.getElementById('inspector-close').addEventListener('click', () => this.hide());

    document.getElementById('inspector-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) this._switchTab(tab.dataset.tab);
    });

    document.getElementById('inspector-edit').addEventListener('click', () => this._onEdit());

    const engine = window.game?.engine;
    if (engine) {
      engine.on('resource:selected', this._boundSelect);
      engine.on('resource:deselected', this._boundDeselect);
      engine.on('tick', this._boundUpdate);
    }
  }

  _onResourceSelected(data) {
    const cluster = window.game?.cluster;
    if (!cluster) return;
    this.resource = cluster.getResource(data.uid);
    if (this.resource) {
      this.show();
      this._renderHeader();
      this._renderTab();
    }
  }

  _onDeselect() {
    this.hide();
  }

  _onResourceUpdate() {
    if (!this.visible || !this.resource) return;
    const cluster = window.game?.cluster;
    if (!cluster) return;
    const updated = cluster.getResource(this.resource.metadata?.uid);
    if (updated) {
      this.resource = updated;
      if (this.activeTab === 'overview') this._renderTab();
    }
  }

  _renderHeader() {
    const r = this.resource;
    if (!r) return;
    const kind = r.kind || 'Unknown';
    const name = r.metadata?.name || 'unnamed';
    const ns = r.metadata?.namespace || 'default';
    const status = r.status?.phase || r.status?.state || 'Active';

    const iconMap = { Pod: 'P', Deployment: 'D', Service: 'S', Node: 'N', ConfigMap: 'C', Secret: 'K', Ingress: 'I', StatefulSet: 'SS', DaemonSet: 'DS' };
    const colorMap = { Pod: 'sky', Deployment: 'blue', Service: 'purple', Node: 'green', ConfigMap: 'amber', Secret: 'red', Ingress: 'orange' };
    const color = colorMap[kind] || 'sky';

    document.getElementById('inspector-icon').className = `w-8 h-8 rounded-lg bg-${color}-500/20 flex items-center justify-center text-${color}-400 text-sm font-bold shrink-0`;
    document.getElementById('inspector-icon').textContent = iconMap[kind] || kind[0];
    document.getElementById('inspector-name').textContent = name;
    document.getElementById('inspector-subtitle').textContent = `${kind} / ${ns} / ${status}`;

    const editBtn = document.getElementById('inspector-edit');
    if (kind === 'Deployment' || kind === 'Service' || kind === 'ConfigMap') {
      editBtn.classList.remove('hidden');
    } else {
      editBtn.classList.add('hidden');
    }
  }

  _switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('#inspector-tabs [data-tab]').forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.className = 'px-3 py-2 text-xs text-sky-400 border-b-2 border-sky-400 font-medium transition-colors';
      } else {
        btn.className = 'px-3 py-2 text-xs text-white/40 border-b-2 border-transparent hover:text-white/60 transition-colors';
      }
    });
    this._renderTab();
  }

  _renderTab() {
    const body = document.getElementById('inspector-body');
    if (!this.resource) {
      body.innerHTML = '<div class="text-white/30 text-sm text-center mt-8">Select a resource to inspect</div>';
      return;
    }

    switch (this.activeTab) {
      case 'overview': body.innerHTML = this._renderOverview(); break;
      case 'yaml': body.innerHTML = this._renderYAML(); break;
      case 'events': body.innerHTML = this._renderEvents(); break;
      case 'describe': body.innerHTML = this._renderDescribe(); break;
    }
  }

  _renderOverview() {
    const r = this.resource;
    const kind = r.kind || 'Unknown';
    const statusColor = this._getStatusColor(r.status?.phase);

    let sections = `
      <div class="space-y-4">
        <div>
          <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Status</div>
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full ${statusColor}"></div>
            <span class="text-white/80 text-sm">${r.status?.phase || r.status?.state || 'Active'}</span>
          </div>
        </div>

        <div>
          <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Metadata</div>
          <div class="space-y-1.5">
            ${this._metaRow('Name', r.metadata?.name)}
            ${this._metaRow('Namespace', r.metadata?.namespace || 'default')}
            ${this._metaRow('UID', r.metadata?.uid)}
            ${this._metaRow('Created', this._formatTimestamp(r.metadata?.creationTimestamp))}
          </div>
        </div>

        <div>
          <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Labels</div>
          <div class="flex flex-wrap gap-1">
            ${Object.entries(r.metadata?.labels || {}).map(([k, v]) =>
              `<span class="px-2 py-0.5 text-xs bg-white/5 border border-white/10 rounded text-white/60">${this._escapeHTML(k)}=${this._escapeHTML(v)}</span>`
            ).join('') || '<span class="text-white/20 text-xs">No labels</span>'}
          </div>
        </div>

        <div>
          <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Annotations</div>
          <div class="space-y-1">
            ${Object.entries(r.metadata?.annotations || {}).map(([k, v]) =>
              `<div class="text-xs"><span class="text-white/40">${this._escapeHTML(k)}</span><span class="text-white/20">: </span><span class="text-white/60">${this._escapeHTML(v)}</span></div>`
            ).join('') || '<span class="text-white/20 text-xs">No annotations</span>'}
          </div>
        </div>
    `;

    if (kind === 'Pod') {
      sections += this._renderPodDetails(r);
    } else if (kind === 'Deployment') {
      sections += this._renderDeploymentDetails(r);
    } else if (kind === 'Service') {
      sections += this._renderServiceDetails(r);
    } else if (kind === 'Node') {
      sections += this._renderNodeDetails(r);
    }

    sections += '</div>';
    return sections;
  }

  _renderPodDetails(r) {
    const containers = r.spec?.containers || [{ name: 'main', image: 'unknown:latest' }];
    return `
      <div>
        <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Containers</div>
        <div class="space-y-2">
          ${containers.map(c => `
            <div class="p-2 bg-white/5 rounded-lg border border-white/5">
              <div class="text-white/80 text-xs font-medium">${this._escapeHTML(c.name)}</div>
              <div class="text-white/40 text-xs mt-0.5">${this._escapeHTML(c.image || 'unknown')}</div>
              ${c.ports ? `<div class="text-white/30 text-xs mt-0.5">Ports: ${c.ports.map(p => p.containerPort).join(', ')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <div>
        <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Pod Info</div>
        <div class="space-y-1.5">
          ${this._metaRow('Node', r.spec?.nodeName || 'unscheduled')}
          ${this._metaRow('IP', r.status?.podIP || 'pending')}
          ${this._metaRow('Restarts', r.status?.restartCount || 0)}
          ${this._metaRow('QoS Class', r.status?.qosClass || 'BestEffort')}
        </div>
      </div>
    `;
  }

  _renderDeploymentDetails(r) {
    return `
      <div>
        <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Deployment Info</div>
        <div class="space-y-1.5">
          ${this._metaRow('Replicas', `${r.status?.readyReplicas || 0}/${r.spec?.replicas || 0} ready`)}
          ${this._metaRow('Strategy', r.spec?.strategy?.type || 'RollingUpdate')}
          ${this._metaRow('Available', r.status?.availableReplicas || 0)}
          ${this._metaRow('Updated', r.status?.updatedReplicas || 0)}
        </div>
      </div>
    `;
  }

  _renderServiceDetails(r) {
    return `
      <div>
        <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Service Info</div>
        <div class="space-y-1.5">
          ${this._metaRow('Type', r.spec?.type || 'ClusterIP')}
          ${this._metaRow('Cluster IP', r.spec?.clusterIP || '10.96.0.1')}
          ${this._metaRow('Ports', (r.spec?.ports || []).map(p => `${p.port}/${p.protocol || 'TCP'}`).join(', ') || '<none>')}
          ${this._metaRow('Selector', Object.entries(r.spec?.selector || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>')}
        </div>
      </div>
    `;
  }

  _renderNodeDetails(r) {
    return `
      <div>
        <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Node Info</div>
        <div class="space-y-1.5">
          ${this._metaRow('OS', r.status?.nodeInfo?.operatingSystem || 'linux')}
          ${this._metaRow('Architecture', r.status?.nodeInfo?.architecture || 'amd64')}
          ${this._metaRow('Kubelet', r.status?.nodeInfo?.kubeletVersion || 'v1.29.0')}
          ${this._metaRow('Container Runtime', r.status?.nodeInfo?.containerRuntimeVersion || 'containerd://1.7.0')}
        </div>
      </div>
      <div>
        <div class="text-white/30 text-xs uppercase tracking-wider mb-2">Capacity</div>
        <div class="space-y-1.5">
          ${this._metaRow('CPU', r.status?.capacity?.cpu || '4 cores')}
          ${this._metaRow('Memory', r.status?.capacity?.memory || '16Gi')}
          ${this._metaRow('Pods', r.status?.capacity?.pods || '110')}
        </div>
      </div>
    `;
  }

  _renderYAML() {
    const yaml = this._toYAML(this.resource, 0);
    return `
      <div class="bg-black/30 rounded-lg p-3 border border-white/5 overflow-x-auto">
        <pre class="text-xs font-mono leading-5 text-white/70">${yaml}</pre>
      </div>
    `;
  }

  _toYAML(obj, indent) {
    if (obj === null || obj === undefined) return `<span class="text-white/30">null</span>`;
    if (typeof obj === 'string') return `<span class="text-green-400">${this._escapeHTML(obj)}</span>`;
    if (typeof obj === 'number' || typeof obj === 'boolean') return `<span class="text-amber-400">${obj}</span>`;

    const prefix = '  '.repeat(indent);
    if (Array.isArray(obj)) {
      if (obj.length === 0) return `<span class="text-white/30">[]</span>`;
      return obj.map(item => `\n${prefix}<span class="text-white/30">-</span> ${this._toYAML(item, indent + 1)}`).join('');
    }

    const entries = Object.entries(obj);
    if (entries.length === 0) return `<span class="text-white/30">{}</span>`;

    return entries.map(([key, val]) => {
      const isComplex = val !== null && typeof val === 'object';
      if (isComplex) {
        return `\n${prefix}<span class="text-sky-400">${this._escapeHTML(key)}</span><span class="text-white/30">:</span>${this._toYAML(val, indent + 1)}`;
      }
      return `\n${prefix}<span class="text-sky-400">${this._escapeHTML(key)}</span><span class="text-white/30">:</span> ${this._toYAML(val, indent + 1)}`;
    }).join('');
  }

  _renderEvents() {
    const events = this.resource._events || this._generateSampleEvents();
    if (events.length === 0) {
      return '<div class="text-white/30 text-sm text-center mt-4">No events recorded</div>';
    }

    return `
      <div class="space-y-2">
        ${events.map(ev => `
          <div class="p-2 bg-white/5 rounded-lg border border-white/5">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-1.5 h-1.5 rounded-full ${ev.type === 'Warning' ? 'bg-yellow-400' : 'bg-green-400'}"></div>
              <span class="text-white/60 text-xs font-medium">${this._escapeHTML(ev.reason)}</span>
              <span class="text-white/20 text-xs ml-auto">${this._escapeHTML(ev.timestamp)}</span>
            </div>
            <div class="text-white/40 text-xs pl-3.5">${this._escapeHTML(ev.message)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _generateSampleEvents() {
    const kind = this.resource.kind || 'Pod';
    const name = this.resource.metadata?.name || 'unknown';
    const now = new Date();

    if (kind === 'Pod') {
      return [
        { type: 'Normal', reason: 'Scheduled', message: `Successfully assigned default/${name} to node-1`, timestamp: this._timeAgo(now, 5) },
        { type: 'Normal', reason: 'Pulling', message: `Pulling image "${this.resource.spec?.containers?.[0]?.image || 'nginx:latest'}"`, timestamp: this._timeAgo(now, 4) },
        { type: 'Normal', reason: 'Pulled', message: 'Container image pulled successfully', timestamp: this._timeAgo(now, 3) },
        { type: 'Normal', reason: 'Created', message: 'Created container main', timestamp: this._timeAgo(now, 2) },
        { type: 'Normal', reason: 'Started', message: 'Started container main', timestamp: this._timeAgo(now, 1) },
      ];
    }
    if (kind === 'Deployment') {
      return [
        { type: 'Normal', reason: 'ScalingReplicaSet', message: `Scaled up replica set ${name}-7d6f4c8b to ${this.resource.spec?.replicas || 1}`, timestamp: this._timeAgo(now, 3) },
      ];
    }
    return [
      { type: 'Normal', reason: 'Created', message: `${kind} ${name} created successfully`, timestamp: this._timeAgo(now, 2) },
    ];
  }

  _renderDescribe() {
    const r = this.resource;
    const kind = r.kind || 'Unknown';
    const lines = [];

    lines.push(`Name:         ${r.metadata?.name}`);
    lines.push(`Namespace:    ${r.metadata?.namespace || 'default'}`);
    lines.push(`Kind:         ${kind}`);
    lines.push(`API Version:  v1`);
    lines.push(``);
    lines.push(`Labels:`);
    for (const [k, v] of Object.entries(r.metadata?.labels || {})) {
      lines.push(`              ${k}=${v}`);
    }
    if (!r.metadata?.labels || Object.keys(r.metadata.labels).length === 0) lines.push(`              <none>`);
    lines.push(`Annotations:`);
    for (const [k, v] of Object.entries(r.metadata?.annotations || {})) {
      lines.push(`              ${k}: ${v}`);
    }
    if (!r.metadata?.annotations || Object.keys(r.metadata.annotations).length === 0) lines.push(`              <none>`);
    lines.push(``);

    if (kind === 'Pod') {
      lines.push(`Status:       ${r.status?.phase || 'Pending'}`);
      lines.push(`IP:           ${r.status?.podIP || 'None'}`);
      lines.push(`Node:         ${r.spec?.nodeName || '<none>'}`);
      lines.push(``);
      lines.push(`Containers:`);
      for (const c of r.spec?.containers || [{ name: 'main', image: 'unknown' }]) {
        lines.push(`  ${c.name}:`);
        lines.push(`    Image:          ${c.image || 'unknown'}`);
        lines.push(`    Port:           ${c.ports ? c.ports.map(p => `${p.containerPort}/TCP`).join(', ') : '<none>'}`);
        lines.push(`    State:          ${r.status?.phase === 'Running' ? 'Running' : 'Waiting'}`);
        lines.push(`    Ready:          ${r.status?.phase === 'Running' ? 'True' : 'False'}`);
        lines.push(`    Restart Count:  ${r.status?.restartCount || 0}`);
      }
    } else if (kind === 'Deployment') {
      lines.push(`Replicas:     ${r.spec?.replicas || 0} desired | ${r.status?.readyReplicas || 0} ready | ${r.status?.availableReplicas || 0} available`);
      lines.push(`Strategy:     ${r.spec?.strategy?.type || 'RollingUpdate'}`);
      lines.push(`Selector:     ${Object.entries(r.spec?.selector?.matchLabels || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}`);
    } else if (kind === 'Service') {
      lines.push(`Type:         ${r.spec?.type || 'ClusterIP'}`);
      lines.push(`IP:           ${r.spec?.clusterIP || 'None'}`);
      lines.push(`Port:         ${(r.spec?.ports || []).map(p => `${p.name || '<unnamed>'} ${p.port}/${p.protocol || 'TCP'}`).join(', ') || '<none>'}`);
      lines.push(`Selector:     ${Object.entries(r.spec?.selector || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '<none>'}`);
    } else if (kind === 'Node') {
      const ready = r.status?.conditions?.find(c => c.type === 'Ready');
      lines.push(`Status:       ${ready?.status === 'True' ? 'Ready' : 'NotReady'}`);
      lines.push(`Unschedulable: ${r.spec?.unschedulable ? 'true' : 'false'}`);
      lines.push(`Capacity:`);
      lines.push(`  cpu:        ${r.status?.capacity?.cpu || '4'}`);
      lines.push(`  memory:     ${r.status?.capacity?.memory || '16Gi'}`);
      lines.push(`  pods:       ${r.status?.capacity?.pods || '110'}`);
    }

    lines.push(``);
    lines.push(`Events:`);
    const events = this.resource._events || this._generateSampleEvents();
    lines.push(`  Type     Reason              Age    Message`);
    lines.push(`  ----     ------              ----   -------`);
    for (const ev of events) {
      lines.push(`  ${(ev.type || 'Normal').padEnd(9)}${(ev.reason || '').padEnd(20)}${(ev.timestamp || '').padEnd(7)}${ev.message || ''}`);
    }

    return `
      <div class="bg-black/30 rounded-lg p-3 border border-white/5 overflow-x-auto">
        <pre class="text-xs font-mono leading-5 text-white/70">${lines.map(l => this._escapeHTML(l)).join('\n')}</pre>
      </div>
    `;
  }

  _metaRow(label, value) {
    return `
      <div class="flex items-center text-xs">
        <span class="text-white/30 w-24 shrink-0">${this._escapeHTML(label)}</span>
        <span class="text-white/70 truncate">${this._escapeHTML(String(value ?? ''))}</span>
      </div>
    `;
  }

  _getStatusColor(phase) {
    const colors = { Running: 'bg-green-400', Ready: 'bg-green-400', Active: 'bg-green-400', Pending: 'bg-yellow-400', Failed: 'bg-red-400', CrashLoopBackOff: 'bg-red-400', Terminating: 'bg-orange-400' };
    return colors[phase] || 'bg-white/40';
  }

  _formatTimestamp(ts) {
    if (!ts) return 'Unknown';
    return new Date(ts).toLocaleString();
  }

  _timeAgo(now, minutesAgo) {
    return `${minutesAgo}m ago`;
  }

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _onEdit() {
    if (!this.resource) return;
    const kind = this.resource.kind;
    const name = this.resource.metadata?.name;
    window.game?.engine.emit('ui:edit-resource', { uid: this.resource.metadata?.uid, kind, name });
  }

  show() {
    this.visible = true;
    this.container.classList.remove('translate-x-full');
    this.container.classList.add('translate-x-0');
  }

  hide() {
    this.visible = false;
    this.container.classList.remove('translate-x-0');
    this.container.classList.add('translate-x-full');
    this.resource = null;
    window.game?.renderer?.deselectAll();
  }

  destroy() {
    const engine = window.game?.engine;
    if (engine) {
      engine.off?.('resource:selected', this._boundSelect);
      engine.off?.('resource:deselected', this._boundDeselect);
      engine.off?.('tick', this._boundUpdate);
    }
    this.container?.remove();
  }
}
