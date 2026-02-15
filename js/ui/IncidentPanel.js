const SEVERITY_CONFIG = {
  critical: { icon: '\u26a0', color: 'red', bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  warning: { icon: '\u26a0', color: 'yellow', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400' },
  info: { icon: '\u2139', color: 'blue', bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
};

const INVESTIGATION_STEPS = {
  PodCrashLoop: [
    { label: 'Check pod logs', cmd: 'kubectl logs {name} --previous' },
    { label: 'Describe pod', cmd: 'kubectl describe pod {name}' },
    { label: 'Check events', cmd: 'kubectl get events --field-selector involvedObject.name={name}' },
  ],
  NodeNotReady: [
    { label: 'Check node status', cmd: 'kubectl describe node {name}' },
    { label: 'Check kubelet', cmd: 'kubectl get node {name} -o yaml' },
    { label: 'Check system pods', cmd: 'kubectl get pods -n kube-system -o wide' },
  ],
  HighCPU: [
    { label: 'Check resource usage', cmd: 'kubectl top pods' },
    { label: 'Check HPA status', cmd: 'kubectl get hpa' },
    { label: 'Scale deployment', cmd: 'kubectl scale deploy {name} --replicas=3' },
  ],
  HighMemory: [
    { label: 'Check memory usage', cmd: 'kubectl top pods --sort-by=memory' },
    { label: 'Describe pod limits', cmd: 'kubectl describe pod {name}' },
    { label: 'Check OOM events', cmd: 'kubectl get events --field-selector reason=OOMKilling' },
  ],
  ImagePullBackOff: [
    { label: 'Check image name', cmd: 'kubectl describe pod {name}' },
    { label: 'Check registry secrets', cmd: 'kubectl get secrets' },
    { label: 'Delete and recreate', cmd: 'kubectl delete pod {name}' },
  ],
  ServiceDown: [
    { label: 'Check endpoints', cmd: 'kubectl get endpoints {name}' },
    { label: 'Check service', cmd: 'kubectl describe svc {name}' },
    { label: 'Check selector pods', cmd: 'kubectl get pods -l app={name}' },
  ],
};

export class IncidentPanel {
  constructor() {
    this.container = null;
    this.visible = false;
    this.incidents = [];
    this.nextId = 1;
    this.filter = 'active';
    this._boundToggle = this._onToggle.bind(this);
    this._boundIncident = this._onNewIncident.bind(this);
    this._timerInterval = null;
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'incident-panel';
    this.container.className = 'fixed top-12 left-0 w-80 bottom-0 z-30 transform -translate-x-full transition-transform duration-300 ease-out';
    this.container.innerHTML = this._buildHTML();
    document.body.appendChild(this.container);
    this._bindEvents();
    this._startTimers();
  }

  _buildHTML() {
    return `
      <div class="h-full flex flex-col backdrop-blur-xl bg-white/5 border-r border-white/10 shadow-2xl">
        <div class="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
            <span class="text-white/90 text-sm font-semibold">Incidents</span>
            <span id="incident-count" class="text-xs text-white/30 font-mono">0</span>
          </div>
          <button id="incident-close" class="p-1 text-white/30 hover:text-white/60 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="flex border-b border-white/5">
          <button data-filter="active" class="flex-1 px-3 py-2 text-xs text-sky-400 border-b-2 border-sky-400 font-medium transition-colors">Active</button>
          <button data-filter="resolved" class="flex-1 px-3 py-2 text-xs text-white/40 border-b-2 border-transparent hover:text-white/60 transition-colors">Resolved</button>
          <button data-filter="all" class="flex-1 px-3 py-2 text-xs text-white/40 border-b-2 border-transparent hover:text-white/60 transition-colors">All</button>
        </div>

        <div id="incident-list" class="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
          <div class="text-white/20 text-sm text-center mt-8">No incidents reported</div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    document.getElementById('incident-close').addEventListener('click', () => this.hide());

    this.container.querySelector('[data-filter]').parentElement.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (btn) this._setFilter(btn.dataset.filter);
    });

    const engine = window.game?.engine;
    if (engine) {
      engine.on('ui:toggle-incidents', this._boundToggle);
      engine.on('incident:created', this._boundIncident);
    }
  }

  _startTimers() {
    this._timerInterval = setInterval(() => {
      if (this.visible) this._updateTimers();
    }, 1000);
  }

  _onToggle() {
    this.toggle();
  }

  _onNewIncident(data) {
    const incident = {
      id: this.nextId++,
      type: data.type || 'Unknown',
      severity: data.severity || 'warning',
      resource: data.resource || 'unknown',
      resourceUid: data.uid,
      message: data.message || 'An incident occurred',
      timestamp: Date.now(),
      status: 'active',
      resolvedAt: null,
      expanded: false,
    };
    this.incidents.unshift(incident);
    window.game?.engine.emit('incident:count', { count: this._getActiveCount() });
    if (this.visible) this._renderList();
  }

  addIncident(type, severity, resource, message, uid) {
    this._onNewIncident({ type, severity, resource, message, uid });
  }

  resolveIncident(id) {
    const incident = this.incidents.find(i => i.id === id);
    if (!incident || incident.status === 'resolved') return;
    incident.status = 'resolved';
    incident.resolvedAt = Date.now();
    window.game?.engine.emit('incident:resolved', { id, type: incident.type });
    window.game?.engine.emit('incident:count', { count: this._getActiveCount() });
    window.game?.engine.emit('xp:gain', { amount: this._getXPForResolve(incident) });
    if (this.visible) this._renderList();
  }

  _getXPForResolve(incident) {
    const elapsed = (incident.resolvedAt - incident.timestamp) / 1000;
    if (elapsed < 30) return 50;
    if (elapsed < 60) return 30;
    if (elapsed < 120) return 20;
    return 10;
  }

  _getActiveCount() {
    return this.incidents.filter(i => i.status === 'active').length;
  }

  _setFilter(filter) {
    this.filter = filter;
    this.container.querySelectorAll('[data-filter]').forEach(btn => {
      if (btn.dataset.filter === filter) {
        btn.className = 'flex-1 px-3 py-2 text-xs text-sky-400 border-b-2 border-sky-400 font-medium transition-colors';
      } else {
        btn.className = 'flex-1 px-3 py-2 text-xs text-white/40 border-b-2 border-transparent hover:text-white/60 transition-colors';
      }
    });
    this._renderList();
  }

  _emptyMessage() {
    if (this.filter === 'active') return 'No active incidents';
    if (this.filter === 'resolved') return 'No resolved incidents';
    return 'No incidents recorded';
  }

  _getFilteredIncidents() {
    if (this.filter === 'active') return this.incidents.filter(i => i.status === 'active');
    if (this.filter === 'resolved') return this.incidents.filter(i => i.status === 'resolved');
    return this.incidents;
  }

  _renderList() {
    const list = document.getElementById('incident-list');
    const filtered = this._getFilteredIncidents();

    document.getElementById('incident-count').textContent = this._getActiveCount();

    if (filtered.length === 0) {
      list.innerHTML = `<div class="text-white/20 text-sm text-center mt-8">${this._emptyMessage()}</div>`;
      return;
    }

    list.innerHTML = filtered.map(i => this._renderCard(i)).join('');
    this._bindCardEvents(list);
  }

  _renderCard(incident) {
    const config = SEVERITY_CONFIG[incident.severity] || SEVERITY_CONFIG.info;
    const steps = INVESTIGATION_STEPS[incident.type] || [];
    const elapsed = this._formatElapsed(Date.now() - incident.timestamp);
    const stars = this._getStarRating(incident);

    return `
      <div class="rounded-lg border ${config.border} ${config.bg} overflow-hidden" data-incident-id="${incident.id}">
        <div class="px-3 py-2.5">
          <div class="flex items-start gap-2">
            <span class="text-sm ${config.text} mt-0.5">${config.icon}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-white/80 text-xs font-medium">${this._escapeHTML(incident.type)}</span>
                ${incident.status === 'active' ? `<span class="flex items-center gap-1"><svg class="w-3 h-3 text-amber-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg></span>` : ''}
              </div>
              <div class="text-white/40 text-xs mt-0.5 truncate">${this._escapeHTML(incident.resource)}</div>
              <div class="text-white/30 text-[10px] mt-1">${this._escapeHTML(incident.message)}</div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-white/20 text-[10px] font-mono incident-timer">${elapsed}</div>
              ${incident.status === 'resolved' ? `<div class="text-[10px] mt-0.5">${stars}</div>` : ''}
            </div>
          </div>

          ${incident.expanded && steps.length > 0 ? `
            <div class="mt-2 pt-2 border-t border-white/5">
              <div class="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Investigation</div>
              <div class="space-y-1">
                ${steps.map(step => {
                  const cmd = step.cmd.replace('{name}', incident.resource);
                  return `
                    <div class="flex items-center gap-2 group">
                      <button class="flex-1 text-left px-2 py-1 text-[11px] font-mono text-white/40 hover:text-white/60 bg-white/5 rounded hover:bg-white/10 transition-colors run-cmd" data-cmd="${this._escapeHTML(cmd)}">
                        ${this._escapeHTML(step.label)}
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <div class="flex items-center gap-2 mt-2">
            ${steps.length > 0 ? `
              <button class="toggle-expand text-[10px] text-white/30 hover:text-white/50 transition-colors">
                ${incident.expanded ? 'Hide steps' : 'Investigate'}
              </button>
            ` : ''}
            ${incident.status === 'active' ? `
              <button class="resolve-btn ml-auto px-2 py-0.5 text-[10px] text-green-400 hover:bg-green-400/10 rounded transition-colors">
                Resolve
              </button>
            ` : `
              <span class="ml-auto text-[10px] text-green-400/50">Resolved</span>
            `}
          </div>
        </div>
      </div>
    `;
  }

  _bindCardEvents(list) {
    list.querySelectorAll('.toggle-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[data-incident-id]');
        const id = parseInt(card.dataset.incidentId);
        const incident = this.incidents.find(i => i.id === id);
        if (incident) {
          incident.expanded = !incident.expanded;
          this._renderList();
        }
      });
    });

    list.querySelectorAll('.resolve-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('[data-incident-id]');
        const id = parseInt(card.dataset.incidentId);
        this.resolveIncident(id);
      });
    });

    list.querySelectorAll('.run-cmd').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        window.game?.engine.emit('ui:run-command', { command: cmd });
      });
    });
  }

  _getStarRating(incident) {
    if (incident.status !== 'resolved' || !incident.resolvedAt) return '';
    const elapsed = (incident.resolvedAt - incident.timestamp) / 1000;
    let stars = 1;
    if (elapsed < 30) stars = 3;
    else if (elapsed < 60) stars = 2;
    const filled = '\u2605'.repeat(stars);
    const empty = '\u2605'.repeat(3 - stars);
    return `<span class="text-amber-400">${filled}</span><span class="text-white/10">${empty}</span>`;
  }

  _formatElapsed(ms) {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  _updateTimers() {
    const cards = this.container.querySelectorAll('[data-incident-id]');
    cards.forEach(card => {
      const id = parseInt(card.dataset.incidentId);
      const incident = this.incidents.find(i => i.id === id);
      if (incident && incident.status === 'active') {
        const timer = card.querySelector('.incident-timer');
        if (timer) timer.textContent = this._formatElapsed(Date.now() - incident.timestamp);
      }
    });
  }

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  show() {
    this.visible = true;
    this.container.classList.remove('-translate-x-full');
    this.container.classList.add('translate-x-0');
    this._renderList();
  }

  hide() {
    this.visible = false;
    this.container.classList.remove('translate-x-0');
    this.container.classList.add('-translate-x-full');
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  destroy() {
    const engine = window.game?.engine;
    if (engine) {
      engine.off?.('ui:toggle-incidents', this._boundToggle);
      engine.off?.('incident:created', this._boundIncident);
    }
    if (this._timerInterval) clearInterval(this._timerInterval);
    this.container?.remove();
  }
}
