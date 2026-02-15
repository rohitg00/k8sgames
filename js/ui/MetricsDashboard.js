const CHART_COLORS = {
  cpu: { line: '#60a5fa', fill: 'rgba(96, 165, 250, 0.1)' },
  memory: { line: '#c084fc', fill: 'rgba(192, 132, 252, 0.1)' },
  network: { line: '#34d399', fill: 'rgba(52, 211, 153, 0.1)' },
  pods: { line: '#fbbf24', fill: 'rgba(251, 191, 36, 0.1)' },
};

const WINDOW_SIZE = 60;

export class MetricsDashboard {
  constructor() {
    this.container = null;
    this.visible = false;
    this.canvases = {};
    this.contexts = {};
    this.data = {
      cpu: [],
      memory: [],
      network: [],
      pods: [],
    };
    this.selectedResource = null;
    this._animFrameId = null;
    this._boundKeydown = this._onKeydown.bind(this);
    this._boundTick = this._onTick.bind(this);
    this._boundSelect = this._onResourceSelect.bind(this);
    this._boundResize = this._onResize.bind(this);
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'metrics-dashboard';
    this.container.className = 'fixed bottom-0 left-0 right-0 z-30 transform translate-y-full transition-transform duration-300 ease-out';
    this.container.innerHTML = this._buildHTML();
    document.body.appendChild(this.container);
    this._initCanvases();
    this._bindEvents();
  }

  _buildHTML() {
    return `
      <div class="backdrop-blur-xl bg-white/5 border-t border-white/10 shadow-2xl" style="height: 240px;">
        <div class="flex items-center justify-between px-4 py-2 border-b border-white/5">
          <div class="flex items-center gap-3">
            <span class="text-white/40 text-xs font-mono">Metrics</span>
            <span id="metrics-scope" class="text-white/20 text-xs">Cluster-wide</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-white/20 text-xs">Press M to toggle</span>
            <button id="metrics-close" class="p-1 text-white/30 hover:text-white/60 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-3 p-3 h-[calc(100%-40px)]">
          <div class="relative">
            <div class="absolute top-0 left-0 text-[10px] text-white/30 z-10 px-1">CPU %</div>
            <div class="absolute top-0 right-0 text-[10px] font-mono z-10 px-1" id="metrics-cpu-val" style="color: ${CHART_COLORS.cpu.line}">0%</div>
            <canvas id="metrics-canvas-cpu" class="w-full h-full rounded-lg bg-white/5 border border-white/5"></canvas>
          </div>
          <div class="relative">
            <div class="absolute top-0 left-0 text-[10px] text-white/30 z-10 px-1">Memory %</div>
            <div class="absolute top-0 right-0 text-[10px] font-mono z-10 px-1" id="metrics-mem-val" style="color: ${CHART_COLORS.memory.line}">0%</div>
            <canvas id="metrics-canvas-memory" class="w-full h-full rounded-lg bg-white/5 border border-white/5"></canvas>
          </div>
          <div class="relative">
            <div class="absolute top-0 left-0 text-[10px] text-white/30 z-10 px-1">Network KB/s</div>
            <div class="absolute top-0 right-0 text-[10px] font-mono z-10 px-1" id="metrics-net-val" style="color: ${CHART_COLORS.network.line}">0</div>
            <canvas id="metrics-canvas-network" class="w-full h-full rounded-lg bg-white/5 border border-white/5"></canvas>
          </div>
          <div class="relative">
            <div class="absolute top-0 left-0 text-[10px] text-white/30 z-10 px-1">Pod Count</div>
            <div class="absolute top-0 right-0 text-[10px] font-mono z-10 px-1" id="metrics-pods-val" style="color: ${CHART_COLORS.pods.line}">0</div>
            <canvas id="metrics-canvas-pods" class="w-full h-full rounded-lg bg-white/5 border border-white/5"></canvas>
          </div>
        </div>
      </div>
    `;
  }

  _initCanvases() {
    for (const key of ['cpu', 'memory', 'network', 'pods']) {
      const canvas = document.getElementById(`metrics-canvas-${key}`);
      this.canvases[key] = canvas;
      this.contexts[key] = canvas.getContext('2d');
    }
    this._resizeCanvases();
  }

  _resizeCanvases() {
    for (const key of Object.keys(this.canvases)) {
      const canvas = this.canvases[key];
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      this.contexts[key].scale(window.devicePixelRatio, window.devicePixelRatio);
    }
  }

  _bindEvents() {
    document.addEventListener('keydown', this._boundKeydown);
    document.getElementById('metrics-close').addEventListener('click', () => this.hide());
    window.addEventListener('resize', this._boundResize);

    const engine = window.game?.engine;
    if (engine) {
      engine.on('tick', this._boundTick);
      engine.on('resource:selected', this._boundSelect);
      engine.on('resource:deselected', () => {
        this.selectedResource = null;
        document.getElementById('metrics-scope').textContent = 'Cluster-wide';
      });
    }
  }

  _onKeydown(e) {
    if (e.key === 'm' || e.key === 'M') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.toggle();
    }
  }

  _onTick(state) {
    const cpu = state?.metrics?.cpu ?? Math.random() * 60 + 10;
    const memory = state?.metrics?.memory ?? Math.random() * 50 + 20;
    const network = state?.metrics?.networkKBps ?? Math.random() * 200;
    const pods = state?.metrics?.podCount ?? (window.game?.cluster?.getResourcesByKind('Pod')?.length ?? 0);

    if (this.selectedResource) {
      const r = this.selectedResource;
      this.data.cpu.push(r.metrics?.cpu ?? cpu * (0.5 + Math.random() * 0.5));
      this.data.memory.push(r.metrics?.memory ?? memory * (0.5 + Math.random() * 0.5));
      this.data.network.push(r.metrics?.network ?? network * Math.random());
      this.data.pods.push(pods);
    } else {
      this.data.cpu.push(cpu);
      this.data.memory.push(memory);
      this.data.network.push(network);
      this.data.pods.push(pods);
    }

    for (const key of Object.keys(this.data)) {
      while (this.data[key].length > WINDOW_SIZE) this.data[key].shift();
    }

    if (this.visible) this._draw();
  }

  _onResourceSelect(data) {
    this.selectedResource = window.game?.cluster?.getResource(data.uid) || null;
    const name = this.selectedResource?.metadata?.name || 'Unknown';
    document.getElementById('metrics-scope').textContent = this.selectedResource ? `Resource: ${name}` : 'Cluster-wide';
  }

  _onResize() {
    if (this.visible) {
      this._resizeCanvases();
      this._draw();
    }
  }

  _draw() {
    this._drawChart('cpu', this.data.cpu, CHART_COLORS.cpu, '%', 100);
    this._drawChart('memory', this.data.memory, CHART_COLORS.memory, '%', 100);
    this._drawChart('network', this.data.network, CHART_COLORS.network, '', null);
    this._drawChart('pods', this.data.pods, CHART_COLORS.pods, '', null);

    const lastCpu = this.data.cpu[this.data.cpu.length - 1] ?? 0;
    const lastMem = this.data.memory[this.data.memory.length - 1] ?? 0;
    const lastNet = this.data.network[this.data.network.length - 1] ?? 0;
    const lastPods = this.data.pods[this.data.pods.length - 1] ?? 0;

    document.getElementById('metrics-cpu-val').textContent = `${Math.round(lastCpu)}%`;
    document.getElementById('metrics-mem-val').textContent = `${Math.round(lastMem)}%`;
    document.getElementById('metrics-net-val').textContent = `${Math.round(lastNet)}`;
    document.getElementById('metrics-pods-val').textContent = `${Math.round(lastPods)}`;
  }

  _drawChart(key, data, colors, suffix, fixedMax) {
    const ctx = this.contexts[key];
    const canvas = this.canvases[key];
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) return;

    const padding = { top: 18, right: 4, bottom: 4, left: 4 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    let maxVal = fixedMax;
    if (maxVal === null) {
      maxVal = Math.max(...data) * 1.2;
      if (maxVal < 1) maxVal = 1;
      maxVal = this._niceMax(maxVal);
    }

    const gridLines = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < gridLines; i++) {
      const gy = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, gy);
      ctx.lineTo(w - padding.right, gy);
      ctx.stroke();
    }

    const points = data.map((val, i) => ({
      x: padding.left + (i / (WINDOW_SIZE - 1)) * chartW,
      y: padding.top + chartH - (val / maxVal) * chartH,
    }));

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const lastPoint = points[points.length - 1];
    ctx.lineTo(lastPoint.x, padding.top + chartH);
    ctx.lineTo(points[0].x, padding.top + chartH);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, colors.fill);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = colors.line;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  _niceMax(val) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
    const normalized = val / magnitude;
    if (normalized <= 1) return magnitude;
    if (normalized <= 2) return 2 * magnitude;
    if (normalized <= 5) return 5 * magnitude;
    return 10 * magnitude;
  }

  show() {
    this.visible = true;
    this.container.classList.remove('translate-y-full');
    this.container.classList.add('translate-y-0');
    this._resizeCanvases();
    this._draw();
  }

  hide() {
    this.visible = false;
    this.container.classList.remove('translate-y-0');
    this.container.classList.add('translate-y-full');
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  destroy() {
    document.removeEventListener('keydown', this._boundKeydown);
    window.removeEventListener('resize', this._boundResize);
    const engine = window.game?.engine;
    if (engine) {
      engine.off?.('tick', this._boundTick);
      engine.off?.('resource:selected', this._boundSelect);
    }
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    this.container?.remove();
  }
}
