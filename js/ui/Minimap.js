const NAMESPACE_COLORS = {
  default: '#60a5fa',
  'kube-system': '#34d399',
  'kube-public': '#a78bfa',
  monitoring: '#fbbf24',
  ingress: '#f87171',
  logging: '#fb923c',
};

const KIND_SIZES = {
  Node: 5,
  Deployment: 3.5,
  Pod: 2,
  Service: 3,
  ConfigMap: 1.5,
  Secret: 1.5,
  Ingress: 3,
  StatefulSet: 3.5,
  DaemonSet: 3.5,
};

export class Minimap {
  constructor() {
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.visible = true;
    this.viewport = { x: 0, y: 0, w: 1, h: 1 };
    this.resourcePositions = new Map();
    this.incidentResources = new Set();
    this.pulsePhase = 0;
    this._animFrameId = null;
    this._boundTick = this._onTick.bind(this);
    this._boundIncident = this._onIncident.bind(this);
    this._boundResolve = this._onIncidentResolved.bind(this);
    this._boundViewport = this._onViewportChange.bind(this);
    this._dragging = false;
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'minimap';
    this.container.className = 'fixed bottom-4 right-4 z-20';
    this.container.innerHTML = this._buildHTML();
    document.body.appendChild(this.container);

    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._setupCanvas();
    this._bindEvents();
    this._startAnimation();
  }

  _buildHTML() {
    return `
      <div class="backdrop-blur-xl bg-white/5 border border-white/10 rounded-lg overflow-hidden shadow-xl" style="width: 180px; height: 140px;">
        <div class="flex items-center justify-between px-2 py-1 border-b border-white/5">
          <span class="text-white/30 text-[10px] font-mono">Cluster Map</span>
          <button id="minimap-toggle" class="text-white/20 hover:text-white/40 text-[10px] transition-colors">-</button>
        </div>
        <canvas id="minimap-canvas" style="width: 180px; height: 118px;"></canvas>
      </div>
    `;
  }

  _setupCanvas() {
    const dpr = window.devicePixelRatio;
    this.canvas.width = 180 * dpr;
    this.canvas.height = 118 * dpr;
    this.ctx.scale(dpr, dpr);
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this._onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this._onMouseUp());

    document.getElementById('minimap-toggle').addEventListener('click', () => {
      const body = this.canvas;
      if (body.style.display === 'none') {
        body.style.display = '';
        this.container.querySelector('div').style.height = '';
        document.getElementById('minimap-toggle').textContent = '-';
      } else {
        body.style.display = 'none';
        document.getElementById('minimap-toggle').textContent = '+';
      }
    });

    const engine = window.game?.engine;
    if (engine) {
      engine.on('tick', this._boundTick);
      engine.on('incident:created', this._boundIncident);
      engine.on('incident:resolved', this._boundResolve);
      engine.on('viewport:change', this._boundViewport);
    }
  }

  _onMouseDown(e) {
    this._dragging = true;
    this._navigateTo(e);
  }

  _onMouseMove(e) {
    if (this._dragging) this._navigateTo(e);
  }

  _onMouseUp() {
    this._dragging = false;
  }

  _navigateTo(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    window.game?.engine.emit('minimap:navigate', { x, y });
    window.game?.renderer?.focusResource?.(null, x, y);
  }

  _onTick() {
    this._updatePositions();
  }

  _onIncident(data) {
    if (data.uid) this.incidentResources.add(data.uid);
  }

  _onIncidentResolved(data) {
    if (data.uid) this.incidentResources.delete(data.uid);
  }

  _onViewportChange(data) {
    this.viewport = { x: data.x ?? 0, y: data.y ?? 0, w: data.w ?? 1, h: data.h ?? 1 };
  }

  _updatePositions() {
    const cluster = window.game?.cluster;
    if (!cluster) return;

    const all = cluster.getAllResources?.() || [];
    this.resourcePositions.clear();

    for (const r of all) {
      const uid = r.metadata?.uid;
      if (!uid) continue;

      if (r._position) {
        this.resourcePositions.set(uid, {
          x: r._position.x,
          y: r._position.y,
          kind: r.kind,
          namespace: r.metadata?.namespace || 'default',
          status: r.status?.phase || 'Active',
        });
      } else {
        const hash = this._hashString(uid);
        this.resourcePositions.set(uid, {
          x: (hash % 1000) / 1000,
          y: ((hash >> 10) % 1000) / 1000,
          kind: r.kind,
          namespace: r.metadata?.namespace || 'default',
          status: r.status?.phase || 'Active',
        });
      }
    }
  }

  _startAnimation() {
    const animate = () => {
      this.pulsePhase += 0.05;
      this._draw();
      this._animFrameId = requestAnimationFrame(animate);
    };
    this._animFrameId = requestAnimationFrame(animate);
  }

  _draw() {
    const w = 180;
    const h = 118;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, w, h);

    const padding = 8;
    const drawW = w - padding * 2;
    const drawH = h - padding * 2;

    for (const [uid, pos] of this.resourcePositions) {
      const x = padding + pos.x * drawW;
      const y = padding + pos.y * drawH;
      const size = KIND_SIZES[pos.kind] || 2;
      const color = NAMESPACE_COLORS[pos.namespace] || '#60a5fa';

      const isIncident = this.incidentResources.has(uid);

      if (isIncident) {
        const pulse = Math.sin(this.pulsePhase * 3) * 0.5 + 0.5;
        const pulseRadius = size + 3 + pulse * 4;
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(248, 113, 113, ${0.15 + pulse * 0.15})`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);

      if (pos.status === 'Failed' || pos.status === 'CrashLoopBackOff') {
        ctx.fillStyle = '#f87171';
      } else if (pos.status === 'Pending') {
        ctx.fillStyle = '#fbbf24';
      } else {
        ctx.fillStyle = color;
      }

      ctx.globalAlpha = isIncident ? 1 : 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(96, 165, 250, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(
      padding + this.viewport.x * drawW,
      padding + this.viewport.y * drawH,
      this.viewport.w * drawW,
      this.viewport.h * drawH
    );
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(96, 165, 250, 0.05)';
    ctx.fillRect(
      padding + this.viewport.x * drawW,
      padding + this.viewport.y * drawH,
      this.viewport.w * drawW,
      this.viewport.h * drawH
    );
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  show() {
    this.visible = true;
    this.container.classList.remove('hidden');
  }

  hide() {
    this.visible = false;
    this.container.classList.add('hidden');
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  destroy() {
    const engine = window.game?.engine;
    if (engine) {
      engine.off?.('tick', this._boundTick);
      engine.off?.('incident:created', this._boundIncident);
      engine.off?.('incident:resolved', this._boundResolve);
      engine.off?.('viewport:change', this._boundViewport);
    }
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    this.container?.remove();
  }
}
