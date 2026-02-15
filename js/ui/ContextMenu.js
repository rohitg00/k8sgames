const ACTION_MAP = {
  Pod: [
    { group: 'inspect', actions: [
      { label: 'View Logs', event: 'pod:logs', shortcut: 'L' },
      { label: 'Describe', event: 'resource:describe', shortcut: 'D' },
    ]},
    { group: 'manage', actions: [
      { label: 'Exec Into', event: 'pod:exec', shortcut: 'E' },
      { label: 'Port Forward', event: 'pod:port-forward', shortcut: 'F' },
    ]},
    { group: 'danger', actions: [
      { label: 'Delete', event: 'resource:delete', shortcut: 'Del', danger: true },
    ]},
  ],
  Deployment: [
    { group: 'inspect', actions: [
      { label: 'Describe', event: 'resource:describe', shortcut: 'D' },
    ]},
    { group: 'manage', actions: [
      { label: 'Scale', event: 'deployment:scale', shortcut: 'S' },
      { label: 'Restart', event: 'deployment:restart', shortcut: 'R' },
      { label: 'Rollback', event: 'deployment:rollback', shortcut: 'B' },
    ]},
    { group: 'danger', actions: [
      { label: 'Delete', event: 'resource:delete', shortcut: 'Del', danger: true },
    ]},
  ],
  Service: [
    { group: 'inspect', actions: [
      { label: 'Describe', event: 'resource:describe', shortcut: 'D' },
      { label: 'View Endpoints', event: 'service:endpoints', shortcut: 'E' },
    ]},
    { group: 'danger', actions: [
      { label: 'Delete', event: 'resource:delete', shortcut: 'Del', danger: true },
    ]},
  ],
  Node: [
    { group: 'inspect', actions: [
      { label: 'Describe', event: 'resource:describe', shortcut: 'D' },
      { label: 'Top', event: 'node:top', shortcut: 'T' },
    ]},
    { group: 'manage', actions: [
      { label: 'Cordon', event: 'node:cordon', shortcut: 'C' },
      { label: 'Uncordon', event: 'node:uncordon', shortcut: 'U' },
      { label: 'Drain', event: 'node:drain', shortcut: 'N' },
    ]},
  ],
};

const DEFAULT_ACTIONS = [
  { group: 'inspect', actions: [
    { label: 'Describe', event: 'resource:describe', shortcut: 'D' },
  ]},
  { group: 'danger', actions: [
    { label: 'Delete', event: 'resource:delete', shortcut: 'Del', danger: true },
  ]},
];

export class ContextMenu {
  constructor() {
    this.container = null;
    this.visible = false;
    this.resource = null;
    this._boundClose = this._onClickOutside.bind(this);
    this._boundKeydown = this._onKeydown.bind(this);
    this._boundContextMenu = this._onContextMenu.bind(this);
  }

  init() {
    this.container = document.createElement('div');
    this.container.id = 'context-menu';
    this.container.className = 'fixed z-50 hidden';
    document.body.appendChild(this.container);

    const engine = window.game?.engine;
    if (engine) {
      engine.on('resource:contextmenu', (data) => {
        this.resource = window.game?.cluster?.getResource(data.uid);
        if (this.resource) this.show(data.x, data.y);
      });
    }

    document.addEventListener('contextmenu', this._boundContextMenu);
  }

  _onContextMenu(e) {
    if (e.target.closest('#context-menu')) return;
    if (this.visible) {
      e.preventDefault();
      this.hide();
    }
  }

  show(x, y) {
    if (!this.resource) return;

    const kind = this.resource.kind || 'Unknown';
    const name = this.resource.metadata?.name || 'unnamed';
    const groups = ACTION_MAP[kind] || DEFAULT_ACTIONS;

    this.container.innerHTML = `
      <div class="backdrop-blur-xl bg-gray-900/95 border border-white/10 rounded-lg shadow-2xl overflow-hidden min-w-[180px]">
        <div class="px-3 py-2 border-b border-white/5">
          <div class="text-white/90 text-xs font-medium truncate">${this._escapeHTML(name)}</div>
          <div class="text-white/30 text-[10px]">${this._escapeHTML(kind)}</div>
        </div>
        ${groups.map((group, gi) => `
          ${gi > 0 ? '<div class="h-px bg-white/5"></div>' : ''}
          <div class="py-1">
            ${group.actions.map(action => `
              <button class="w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${action.danger ? 'text-red-400 hover:bg-red-400/10' : 'text-white/70 hover:bg-white/5'}" data-event="${action.event}">
                <span>${this._escapeHTML(action.label)}</span>
                <span class="text-white/20 text-[10px] ml-4">${action.shortcut}</span>
              </button>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;

    const rect = this.container.firstElementChild.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    const finalX = x + 200 > viewW ? x - 200 : x;
    const finalY = y + (rect.height || 200) > viewH ? y - (rect.height || 200) : y;

    this.container.style.left = `${Math.max(0, finalX)}px`;
    this.container.style.top = `${Math.max(0, finalY)}px`;
    this.container.classList.remove('hidden');
    this.visible = true;

    this.container.querySelectorAll('[data-event]').forEach(btn => {
      btn.addEventListener('click', () => {
        const event = btn.dataset.event;
        this._executeAction(event);
        this.hide();
      });
    });

    document.addEventListener('click', this._boundClose);
    document.addEventListener('keydown', this._boundKeydown);
  }

  hide() {
    this.container.classList.add('hidden');
    this.visible = false;
    this.resource = null;
    document.removeEventListener('click', this._boundClose);
    document.removeEventListener('keydown', this._boundKeydown);
  }

  _onClickOutside(e) {
    if (!this.container.contains(e.target)) {
      this.hide();
    }
  }

  _onKeydown(e) {
    if (e.key === 'Escape') {
      this.hide();
      return;
    }

    if (!this.resource) return;
    const kind = this.resource.kind || 'Unknown';
    const groups = ACTION_MAP[kind] || DEFAULT_ACTIONS;

    for (const group of groups) {
      for (const action of group.actions) {
        if (action.shortcut.toLowerCase() === e.key.toLowerCase() ||
            (action.shortcut === 'Del' && (e.key === 'Delete' || e.key === 'Backspace'))) {
          e.preventDefault();
          this._executeAction(action.event);
          this.hide();
          return;
        }
      }
    }
  }

  _executeAction(event) {
    if (!this.resource) return;
    const engine = window.game?.engine;
    if (!engine) return;

    const data = {
      uid: this.resource.metadata?.uid,
      kind: this.resource.kind,
      name: this.resource.metadata?.name,
      namespace: this.resource.metadata?.namespace || 'default',
    };

    engine.emit(event, data);
  }

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  destroy() {
    document.removeEventListener('contextmenu', this._boundContextMenu);
    document.removeEventListener('click', this._boundClose);
    document.removeEventListener('keydown', this._boundKeydown);
    this.container?.remove();
  }
}
