import { INCIDENT_DEFS } from '../data/IncidentDefs.js';

const SEVERITY_CONFIG = {
  critical: { icon: '\u26a0', color: 'red', bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  warning: { icon: '\u26a0', color: 'yellow', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400' },
  info: { icon: '\u2139', color: 'blue', bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
};

const INVESTIGATION_STEPS = {};
for (const def of INCIDENT_DEFS) {
  if (def.investigationSteps && def.investigationSteps.length > 0) {
    INVESTIGATION_STEPS[def.name] = def.investigationSteps.map(step => ({
      label: step.hint,
      cmd: step.command.replace('<pod>', '{name}').replace('<node>', '{name}').replace('<service>', '{name}').replace('<policy>', '{name}').replace('<ingress>', '{name}').replace('<namespace>', '{name}'),
    }));
  }
}

export class IncidentPanel {
  constructor() {
    this.container = null;
    this.visible = false;
    this.incidents = [];
    this.nextId = 1;
    this.filter = 'active';
    this._boundToggle = this._onToggle.bind(this);
    this._boundIncident = this._onNewIncident.bind(this);
    this._boundCommandExecuted = this._onCommandExecuted.bind(this);
    this._requiredSteps = 2;
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
    this._loadInvestigationProgress();
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
      engine.on('command:raw', this._boundCommandExecuted);
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
      engineIncidentId: data.id || null,
      type: data.type || data.name || 'Unknown',
      severity: data.severity || 'warning',
      resource: data.resource || data.target || 'unknown',
      resourceUid: data.uid,
      message: data.message || data.description || 'An incident occurred',
      timestamp: Date.now(),
      status: 'active',
      resolvedAt: null,
      expanded: true,
      completedSteps: new Set(),
    };
    this.incidents.unshift(incident);
    window.game?.engine.emit('incident:count', { count: this._getActiveCount() });
    this.show();
    this._renderList();
  }

  addIncident(type, severity, resource, message, uid) {
    this._onNewIncident({ type, severity, resource, message, uid });
  }

  resolveIncident(id) {
    const incident = this.incidents.find(i => i.id === id);
    if (!incident || incident.status === 'resolved') return;
    incident.status = 'resolved';
    incident.resolvedAt = Date.now();

    const incidentEngine = window.game?.incidentEngine;
    if (incidentEngine && incident.engineIncidentId) {
      incidentEngine.resolveIncident(incident.engineIncidentId, 'manual');
    }

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
    const completedCount = incident.completedSteps?.size || 0;
    const canResolve = steps.length === 0 || completedCount >= this._requiredSteps;

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
              <div class="flex items-center justify-between mb-1.5">
                <div class="text-white/30 text-[10px] uppercase tracking-wider">Investigation</div>
                ${incident.status === 'active' ? `<div class="text-[10px] font-mono ${completedCount >= this._requiredSteps ? 'text-green-400' : 'text-white/30'}">${completedCount}/${steps.length} investigated</div>` : ''}
              </div>
              <div class="space-y-1">
                ${steps.map((step, idx) => {
                  const cmd = step.cmd.replace('{name}', incident.resource);
                  const done = incident.completedSteps?.has(idx);
                  return `
                    <div class="flex items-center gap-2 group">
                      <span class="text-[11px] w-4 text-center ${done ? 'text-green-400' : 'text-white/15'}">${done ? '\u2713' : '\u25CB'}</span>
                      <button class="flex-1 text-left px-2 py-1 text-[11px] font-mono ${done ? 'text-green-400/60 bg-green-400/5' : 'text-white/40 hover:text-white/60 bg-white/5 hover:bg-white/10'} rounded transition-colors run-cmd" data-cmd="${this._escapeHTML(cmd)}" title="Click to copy to command bar">
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
            ${incident.status === 'active' ? (
              canResolve ? `
                <button class="resolve-btn ml-auto px-2 py-0.5 text-[10px] text-green-400 hover:bg-green-400/10 rounded transition-colors">
                  Resolve
                </button>
              ` : `
                <span class="ml-auto flex items-center gap-1 text-[10px] text-white/20" title="Run investigation commands first">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                  Investigate first
                </span>
              `
            ) : `
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
        const cmdInput = document.getElementById('cmd-input');
        if (cmdInput) {
          const stripped = cmd.replace(/^kubectl\s+/, '');
          cmdInput.value = stripped;
          cmdInput.focus();
          const cmdBar = document.getElementById('command-bar');
          if (cmdBar?.classList.contains('translate-y-full')) {
            window.game?.engine.emit('ui:show-command-bar');
          }
        }
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

  _onCommandExecuted(data) {
    const raw = (data.command || '').trim();
    if (!raw) return;
    const activeIncidents = this.incidents.filter(i => i.status === 'active');
    for (const incident of activeIncidents) {
      const steps = INVESTIGATION_STEPS[incident.type] || [];
      steps.forEach((step, idx) => {
        if (incident.completedSteps.has(idx)) return;
        const expanded = step.cmd.replace('{name}', incident.resource);
        const stepWithoutKubectl = expanded.replace(/^kubectl\s+/, '');
        if (this._fuzzyMatchCommand(raw, stepWithoutKubectl)) {
          incident.completedSteps.add(idx);
          window.game?.engine.emit('xp:gain', { amount: 10 });
        }
      });
    }
    if (this.visible) this._renderList();
    this._saveInvestigationProgress();
  }

  _fuzzyMatchCommand(userCmd, stepCmd) {
    const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const u = normalize(userCmd);
    const s = normalize(stepCmd);
    if (u === s) return true;
    if (u.startsWith(s) || s.startsWith(u)) return true;
    const uParts = u.split(' ');
    const sParts = s.split(' ');
    if (uParts.length < 2 || sParts.length < 2) return false;
    if (uParts[0] !== sParts[0]) return false;
    if (uParts.length >= 2 && sParts.length >= 2 && uParts[1] === sParts[1]) {
      if (uParts.length >= 3 && sParts.length >= 3) {
        if (uParts[2].startsWith(sParts[2]) || sParts[2].startsWith(uParts[2])) return true;
      }
      if (uParts.length === 2 || sParts.length === 2) return true;
    }
    if (sParts.length >= 3) {
      const uPrefix = uParts.slice(0, sParts.length - 1).join(' ');
      const sPrefix = sParts.slice(0, -1).join(' ');
      if (uPrefix === sPrefix) return true;
    }
    const minLen = Math.min(uParts.length, sParts.length, 3);
    if (minLen >= 2) {
      const uJoined = uParts.slice(0, minLen).join(' ');
      const sJoined = sParts.slice(0, minLen).join(' ');
      if (uJoined === sJoined) return true;
    }
    return false;
  }

  _saveInvestigationProgress() {
    try {
      const data = this.incidents.map(i => ({
        id: i.id,
        completedSteps: Array.from(i.completedSteps || []),
        status: i.status,
      }));
      localStorage.setItem('k8sgames_investigation', JSON.stringify(data));
    } catch (e) {}
  }

  _loadInvestigationProgress() {
    try {
      const stored = localStorage.getItem('k8sgames_investigation');
      if (stored) {
        const data = JSON.parse(stored);
        for (const saved of data) {
          const incident = this.incidents.find(i => i.id === saved.id);
          if (incident && saved.completedSteps) {
            incident.completedSteps = new Set(saved.completedSteps);
          }
        }
      }
    } catch (e) {}
  }

  destroy() {
    const engine = window.game?.engine;
    if (engine) {
      engine.off?.('ui:toggle-incidents', this._boundToggle);
      engine.off?.('incident:created', this._boundIncident);
      engine.off?.('command:raw', this._boundCommandExecuted);
    }
    if (this._timerInterval) clearInterval(this._timerInterval);
    this.container?.remove();
  }
}
