export class HUD {
  constructor() {
    this.container = null;
    this.elements = {};
    this.speed = 1;
    this.paused = false;
    this.elapsedTime = 0;
    this.incidentCount = 0;
    this.xp = 0;
    this.level = 1;
    this.xpToNextLevel = 100;
    this._boundTick = this._onTick.bind(this);
    this._boundIncident = this._onIncident.bind(this);
    this._boundResolve = this._onResolve.bind(this);
    this._boundXP = this._onXPGain.bind(this);
    this._boundSelect = this._onResourceSelect.bind(this);
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'hud';
    this.container.className = 'fixed top-0 left-0 right-0 z-40 pointer-events-none';
    this.container.innerHTML = this._buildHTML();
    document.body.appendChild(this.container);
    this._cacheElements();
    this._bindEvents();
    this._bindGameEvents();
    this._updateAll();
  }

  _buildHTML() {
    return `
      <div class="flex items-center justify-between px-4 py-2 backdrop-blur-xl bg-white/5 border-b border-white/10 pointer-events-auto">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <div id="hud-health" class="w-3 h-3 rounded-full bg-green-400 shadow-lg shadow-green-400/50 transition-colors duration-500"></div>
            <span class="text-white/90 text-sm font-semibold tracking-wide">K8s Games</span>
          </div>
          <div class="h-5 w-px bg-white/10"></div>
          <div class="flex items-center gap-3 text-xs text-white/60">
            <div class="flex items-center gap-1">
              <span class="text-white/40">Nodes</span>
              <span id="hud-nodes" class="text-white/90 font-mono">0</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-white/40">Pods</span>
              <span id="hud-pods-running" class="text-green-400 font-mono">0</span>
              <span class="text-white/20">/</span>
              <span id="hud-pods-pending" class="text-yellow-400 font-mono">0</span>
              <span class="text-white/20">/</span>
              <span id="hud-pods-failed" class="text-red-400 font-mono">0</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-white/40">Deploy</span>
              <span id="hud-deployments" class="text-white/90 font-mono">0</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-white/40">Svc</span>
              <span id="hud-services" class="text-white/90 font-mono">0</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 min-w-[140px]">
            <span class="text-white/40 text-xs">CPU</span>
            <div class="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div id="hud-cpu-bar" class="h-full bg-blue-400 rounded-full transition-all duration-500" style="width: 0%"></div>
            </div>
            <span id="hud-cpu-text" class="text-white/60 text-xs font-mono w-8 text-right">0%</span>
          </div>
          <div class="flex items-center gap-2 min-w-[140px]">
            <span class="text-white/40 text-xs">MEM</span>
            <div class="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div id="hud-mem-bar" class="h-full bg-purple-400 rounded-full transition-all duration-500" style="width: 0%"></div>
            </div>
            <span id="hud-mem-text" class="text-white/60 text-xs font-mono w-8 text-right">0%</span>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span id="hud-timer" class="text-white/60 text-xs font-mono">00:00</span>
            <div class="h-5 w-px bg-white/10"></div>
            <span id="hud-mode" class="text-xs text-sky-400 font-medium uppercase tracking-wider">Sandbox</span>
          </div>

          <div class="flex items-center gap-1.5">
            <div class="relative">
              <div id="hud-xp-container" class="flex items-center gap-1.5">
                <span id="hud-level" class="text-xs text-amber-400 font-bold">L1</span>
                <div class="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div id="hud-xp-bar" class="h-full bg-amber-400 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="h-5 w-px bg-white/10"></div>

          <div class="flex items-center gap-1">
            <button id="hud-pause" class="px-1.5 py-0.5 text-xs text-white/60 hover:text-white/90 hover:bg-white/10 rounded transition-colors">
              <span id="hud-pause-icon">&#9646;&#9646;</span>
            </button>
            <button id="hud-speed-1" class="px-1.5 py-0.5 text-xs text-sky-400 bg-sky-400/10 rounded font-mono">1x</button>
            <button id="hud-speed-2" class="px-1.5 py-0.5 text-xs text-white/40 hover:text-white/60 rounded font-mono transition-colors">2x</button>
            <button id="hud-speed-4" class="px-1.5 py-0.5 text-xs text-white/40 hover:text-white/60 rounded font-mono transition-colors">4x</button>
          </div>

          <div class="h-5 w-px bg-white/10"></div>

          <button id="hud-alerts" class="relative px-2 py-0.5 text-xs text-white/60 hover:text-white/90 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
            </svg>
            <span id="hud-alert-badge" class="absolute -top-1 -right-1 hidden min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">0</span>
          </button>
        </div>
      </div>
    `;
  }

  _cacheElements() {
    const ids = [
      'hud-health', 'hud-nodes', 'hud-pods-running', 'hud-pods-pending',
      'hud-pods-failed', 'hud-deployments', 'hud-services', 'hud-cpu-bar',
      'hud-cpu-text', 'hud-mem-bar', 'hud-mem-text', 'hud-timer', 'hud-mode',
      'hud-level', 'hud-xp-bar', 'hud-pause', 'hud-pause-icon', 'hud-speed-1',
      'hud-speed-2', 'hud-speed-4', 'hud-alert-badge', 'hud-alerts', 'hud-xp-container'
    ];
    for (const id of ids) {
      this.elements[id] = document.getElementById(id);
    }
  }

  _bindEvents() {
    this.elements['hud-pause'].addEventListener('click', () => this._togglePause());
    this.elements['hud-speed-1'].addEventListener('click', () => this._setSpeed(1));
    this.elements['hud-speed-2'].addEventListener('click', () => this._setSpeed(2));
    this.elements['hud-speed-4'].addEventListener('click', () => this._setSpeed(4));
    this.elements['hud-alerts'].addEventListener('click', () => {
      window.game?.engine.emit('ui:toggle-incidents');
    });
  }

  _bindGameEvents() {
    const engine = window.game?.engine;
    if (!engine) return;
    engine.on('tick', this._boundTick);
    engine.on('incident:created', this._boundIncident);
    engine.on('incident:resolved', this._boundResolve);
    engine.on('xp:gain', this._boundXP);
    engine.on('resource:selected', this._boundSelect);
  }

  _onTick(state) {
    this.elapsedTime = state.elapsed || 0;
    this._updateResourceCounts(state);
    this._updateMetrics(state);
    this._updateTimer();
    this._updateHealth(state);
  }

  _onIncident() {
    this.incidentCount++;
    this._updateAlertBadge();
  }

  _onResolve() {
    this.incidentCount = Math.max(0, this.incidentCount - 1);
    this._updateAlertBadge();
  }

  _onXPGain(data) {
    this.xp += data.amount || 0;
    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);
      window.game?.engine.emit('level:up', { level: this.level });
    }
    this._updateXP();
  }

  _onResourceSelect() {
    this._updateAll();
  }

  _updateResourceCounts(state) {
    const cluster = window.game?.cluster;
    if (!cluster) return;

    const nodes = cluster.getResourcesByKind('Node');
    const pods = cluster.getResourcesByKind('Pod');
    const deployments = cluster.getResourcesByKind('Deployment');
    const services = cluster.getResourcesByKind('Service');

    this.elements['hud-nodes'].textContent = nodes.length;
    this.elements['hud-deployments'].textContent = deployments.length;
    this.elements['hud-services'].textContent = services.length;

    let running = 0, pending = 0, failed = 0;
    for (const pod of pods) {
      const phase = pod.status?.phase || 'Pending';
      if (phase === 'Running') running++;
      else if (phase === 'Pending') pending++;
      else if (phase === 'Failed' || phase === 'CrashLoopBackOff') failed++;
    }
    this.elements['hud-pods-running'].textContent = running;
    this.elements['hud-pods-pending'].textContent = pending;
    this.elements['hud-pods-failed'].textContent = failed;
  }

  _updateMetrics(state) {
    const cpu = state?.metrics?.cpu ?? 0;
    const mem = state?.metrics?.memory ?? 0;
    const cpuPct = Math.min(100, Math.round(cpu));
    const memPct = Math.min(100, Math.round(mem));

    this.elements['hud-cpu-bar'].style.width = `${cpuPct}%`;
    this.elements['hud-cpu-text'].textContent = `${cpuPct}%`;
    this.elements['hud-mem-bar'].style.width = `${memPct}%`;
    this.elements['hud-mem-text'].textContent = `${memPct}%`;

    this.elements['hud-cpu-bar'].className = `h-full rounded-full transition-all duration-500 ${this._metricBarColor(cpuPct, 'bg-blue-400')}`;
    this.elements['hud-mem-bar'].className = `h-full rounded-full transition-all duration-500 ${this._metricBarColor(memPct, 'bg-purple-400')}`;
  }

  _updateTimer() {
    const totalSeconds = Math.floor(this.elapsedTime / 1000);
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    this.elements['hud-timer'].textContent = `${mins}:${secs}`;
  }

  _updateHealth(state) {
    const el = this.elements['hud-health'];
    const health = state?.clusterHealth ?? 'healthy';
    if (health === 'critical') {
      el.className = 'w-3 h-3 rounded-full bg-red-400 shadow-lg shadow-red-400/50 animate-pulse transition-colors duration-500';
    } else if (health === 'warning') {
      el.className = 'w-3 h-3 rounded-full bg-yellow-400 shadow-lg shadow-yellow-400/50 transition-colors duration-500';
    } else {
      el.className = 'w-3 h-3 rounded-full bg-green-400 shadow-lg shadow-green-400/50 transition-colors duration-500';
    }
  }

  _updateAlertBadge() {
    const badge = this.elements['hud-alert-badge'];
    if (this.incidentCount > 0) {
      badge.classList.remove('hidden');
      badge.textContent = this.incidentCount > 99 ? '99+' : this.incidentCount;
    } else {
      badge.classList.add('hidden');
    }
  }

  _updateXP() {
    this.elements['hud-level'].textContent = `L${this.level}`;
    const pct = Math.min(100, Math.round((this.xp / this.xpToNextLevel) * 100));
    this.elements['hud-xp-bar'].style.width = `${pct}%`;
  }

  _updateAll() {
    const state = window.game?.engine.getState?.() || {};
    this._updateResourceCounts(state);
    this._updateMetrics(state);
    this._updateTimer();
    this._updateHealth(state);
    this._updateAlertBadge();
    this._updateXP();
    this._updateMode(state);
  }

  _metricBarColor(pct, normalColor) {
    if (pct > 80) return 'bg-red-400';
    if (pct > 60) return 'bg-yellow-400';
    return normalColor;
  }

  _updateMode(state) {
    const mode = state?.mode || 'Sandbox';
    this.elements['hud-mode'].textContent = mode;
  }

  _togglePause() {
    this.paused = !this.paused;
    const ge = window.game?.gameEngine;
    if (this.paused) {
      ge?.pause();
      this.elements['hud-pause-icon'].innerHTML = '&#9654;';
    } else {
      ge?.resume();
      this.elements['hud-pause-icon'].innerHTML = '&#9646;&#9646;';
    }
  }

  _setSpeed(multiplier) {
    this.speed = multiplier;
    const ge = window.game?.gameEngine;
    if (ge?.setTimeScale) {
      ge.setTimeScale(multiplier);
    }
    const buttons = { 1: 'hud-speed-1', 2: 'hud-speed-2', 4: 'hud-speed-4' };
    for (const [spd, id] of Object.entries(buttons)) {
      const el = this.elements[id];
      if (parseInt(spd) === multiplier) {
        el.className = 'px-1.5 py-0.5 text-xs text-sky-400 bg-sky-400/10 rounded font-mono';
      } else {
        el.className = 'px-1.5 py-0.5 text-xs text-white/40 hover:text-white/60 rounded font-mono transition-colors';
      }
    }
  }

  destroy() {
    const engine = window.game?.engine;
    if (engine) {
      engine.off?.('tick', this._boundTick);
      engine.off?.('incident:created', this._boundIncident);
      engine.off?.('incident:resolved', this._boundResolve);
      engine.off?.('xp:gain', this._boundXP);
      engine.off?.('resource:selected', this._boundSelect);
    }
    this.container?.remove();
  }
}
