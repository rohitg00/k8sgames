import { ClusterState } from './ClusterState.js';
import { SimulationTick } from './SimulationTick.js';
import { ResourceBase } from '../resources/ResourceBase.js';

class EventBus {
  constructor() {
    this._handlers = new Map();
    this._onceHandlers = new Map();
    this._history = [];
    this._maxHistory = 200;
    this._wildcardHandlers = [];
  }

  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, []);
    }
    this._handlers.get(event).push(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    if (!this._onceHandlers.has(event)) {
      this._onceHandlers.set(event, []);
    }
    this._onceHandlers.get(event).push(handler);
    return () => {
      const list = this._onceHandlers.get(event);
      if (list) {
        this._onceHandlers.set(event, list.filter((h) => h !== handler));
      }
    };
  }

  off(event, handler) {
    const list = this._handlers.get(event);
    if (list) {
      this._handlers.set(event, list.filter((h) => h !== handler));
    }
  }

  emit(event, data) {
    const entry = { event, data, timestamp: Date.now() };
    this._history.push(entry);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`EventBus handler error for "${event}":`, err);
        }
      }
    }

    const onceHandlers = this._onceHandlers.get(event);
    if (onceHandlers && onceHandlers.length > 0) {
      this._onceHandlers.set(event, []);
      for (const handler of onceHandlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`EventBus once handler error for "${event}":`, err);
        }
      }
    }

    for (const wh of this._wildcardHandlers) {
      try {
        wh(event, data);
      } catch (err) {
        console.error('EventBus wildcard handler error:', err);
      }
    }
  }

  onAny(handler) {
    this._wildcardHandlers.push(handler);
    return () => {
      this._wildcardHandlers = this._wildcardHandlers.filter((h) => h !== handler);
    };
  }

  getHistory(filter) {
    if (!filter) return [...this._history];
    if (typeof filter === 'string') {
      return this._history.filter((e) => e.event === filter);
    }
    if (filter instanceof RegExp) {
      return this._history.filter((e) => filter.test(e.event));
    }
    return [...this._history];
  }

  clearHistory() {
    this._history = [];
  }

  removeAllListeners(event) {
    if (event) {
      this._handlers.delete(event);
      this._onceHandlers.delete(event);
    } else {
      this._handlers.clear();
      this._onceHandlers.clear();
      this._wildcardHandlers = [];
    }
  }

  listenerCount(event) {
    const regular = this._handlers.get(event)?.length || 0;
    const once = this._onceHandlers.get(event)?.length || 0;
    return regular + once;
  }
}

const GAME_MODES = {
  CAMPAIGN: 'campaign',
  SANDBOX: 'sandbox',
  CHAOS: 'chaos',
  CHALLENGE: 'challenge',
};

const GAME_STATES = {
  INIT: 'init',
  LOADING: 'loading',
  RUNNING: 'running',
  PAUSED: 'paused',
  GAME_OVER: 'game_over',
  VICTORY: 'victory',
  MENU: 'menu',
};

export class GameEngine {
  constructor(options = {}) {
    this.eventBus = new EventBus();
    this.cluster = new ClusterState(this.eventBus);
    this.simulation = new SimulationTick(this.cluster, this.eventBus);

    this.state = GAME_STATES.INIT;
    this.mode = options.mode || GAME_MODES.SANDBOX;
    this.difficulty = options.difficulty || 'normal';

    this._rafId = null;
    this._lastTimestamp = 0;
    this._accumulator = 0;
    this._fixedTimeStep = 1000 / (options.ticksPerSecond || 20);
    this._maxDeltaTime = 100;

    this._fps = 0;
    this._frameCount = 0;
    this._fpsTimestamp = 0;
    this._fpsUpdateInterval = 500;
    this._frameTimes = [];
    this._maxFrameTimes = 60;

    this._gameTime = 0;
    this._realTime = 0;
    this._timeScale = 1;
    this._startTime = 0;

    this._score = 0;
    this._level = 1;
    this._experience = 0;
    this._currency = 1000;
    this._reputation = 100;

    this._achievements = new Map();
    this._completedObjectives = new Set();
    this._activeObjectives = new Map();
    this._notifications = [];
    this._maxNotifications = 50;

    this._inputQueue = [];
    this._commandHistory = [];
    this._maxCommandHistory = 100;

    this._plugins = new Map();
    this._renderCallbacks = [];
    this._updateCallbacks = [];

    this._difficultyMultipliers = {
      easy: { failureRate: 0.5, resourceMultiplier: 1.5, scoreMultiplier: 0.75 },
      normal: { failureRate: 1, resourceMultiplier: 1, scoreMultiplier: 1 },
      hard: { failureRate: 2, resourceMultiplier: 0.75, scoreMultiplier: 1.5 },
      nightmare: { failureRate: 3, resourceMultiplier: 0.5, scoreMultiplier: 2 },
    };

    this._applyDifficulty();
    this._setupEngineEvents();
  }

  _applyDifficulty() {
    const mult = this._difficultyMultipliers[this.difficulty] || this._difficultyMultipliers.normal;
    this.simulation.randomFailureRate = 0.002 * mult.failureRate;
    this._scoreMultiplier = mult.scoreMultiplier;
    this._resourceMultiplier = mult.resourceMultiplier;
  }

  _setupEngineEvents() {
    this.eventBus.on('incident:oomkill', (data) => {
      this._addNotification('warning', `OOMKill: ${data.container} in ${data.namespace}/${data.pod}`);
      this._score -= 10;
      this._reputation = Math.max(0, this._reputation - 5);
    });

    this.eventBus.on('hpa:scaled', (data) => {
      this._addNotification('info', `HPA scaled ${data.target} ${data.direction} to ${data.to} replicas`);
      if (data.direction === 'up') {
        this._score += 5 * this._scoreMultiplier;
      }
    });

    this.eventBus.on('chaos:podkill', (data) => {
      this._addNotification('danger', `Chaos: Pod ${data.namespace}/${data.pod} killed`);
    });

    this.eventBus.on('chaos:nodefailure', (data) => {
      this._addNotification('danger', `Chaos: Node ${data.node} failed, ${data.podsEvicted} pods evicted`);
      this._reputation = Math.max(0, this._reputation - 10);
    });

    this.eventBus.on('quota:exceeded', (data) => {
      this._addNotification('warning', `Quota exceeded in namespace ${data.namespace}`);
    });

    this.eventBus.on('cluster:added:Pod', () => {
      this._score += 1 * this._scoreMultiplier;
    });

    this.eventBus.on('cluster:deleted:Pod', (data) => {
      if (data.resource && data.resource.status.phase === 'Failed') {
        this._score -= 5;
      }
    });
  }

  start() {
    if (this.state === GAME_STATES.RUNNING) return;

    this.state = GAME_STATES.RUNNING;
    this._startTime = performance.now();
    this._lastTimestamp = performance.now();
    this._fpsTimestamp = performance.now();
    this._accumulator = 0;

    this.eventBus.emit('engine:started', {
      mode: this.mode,
      difficulty: this.difficulty,
      timestamp: Date.now(),
    });

    this._rafId = requestAnimationFrame((ts) => this._gameLoop(ts));
  }

  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.state = GAME_STATES.INIT;
    this.eventBus.emit('engine:stopped', { timestamp: Date.now() });
  }

  pause() {
    if (this.state !== GAME_STATES.RUNNING) return;
    this.state = GAME_STATES.PAUSED;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.eventBus.emit('engine:paused', { gameTime: this._gameTime });
  }

  resume() {
    if (this.state !== GAME_STATES.PAUSED) return;
    this.state = GAME_STATES.RUNNING;
    this._lastTimestamp = performance.now();
    this._accumulator = 0;
    this._rafId = requestAnimationFrame((ts) => this._gameLoop(ts));
    this.eventBus.emit('engine:resumed', { gameTime: this._gameTime });
  }

  togglePause() {
    if (this.state === GAME_STATES.RUNNING) {
      this.pause();
    } else if (this.state === GAME_STATES.PAUSED) {
      this.resume();
    }
  }

  _gameLoop(timestamp) {
    if (this.state !== GAME_STATES.RUNNING) return;

    const rawDelta = timestamp - this._lastTimestamp;
    const delta = Math.min(rawDelta, this._maxDeltaTime);
    this._lastTimestamp = timestamp;
    this._realTime += delta;

    this._updateFPS(timestamp);

    this._accumulator += delta * this._timeScale;

    while (this._accumulator >= this._fixedTimeStep) {
      this._processInputQueue();

      const dt = this._fixedTimeStep / 1000;
      this.simulation.tick(dt);
      this._gameTime += this._fixedTimeStep;

      for (const cb of this._updateCallbacks) {
        cb(dt, this._gameTime);
      }

      this._checkObjectives();
      this._accumulator -= this._fixedTimeStep;
    }

    const alpha = this._accumulator / this._fixedTimeStep;
    for (const cb of this._renderCallbacks) {
      cb(alpha, this._gameTime);
    }

    this.eventBus.emit('engine:frame', {
      fps: this._fps,
      gameTime: this._gameTime,
      realTime: this._realTime,
      alpha,
    });

    this._rafId = requestAnimationFrame((ts) => this._gameLoop(ts));
  }

  _updateFPS(timestamp) {
    this._frameCount++;
    this._frameTimes.push(timestamp);
    if (this._frameTimes.length > this._maxFrameTimes) {
      this._frameTimes.shift();
    }

    if (timestamp - this._fpsTimestamp >= this._fpsUpdateInterval) {
      this._fps = Math.round((this._frameCount * 1000) / (timestamp - this._fpsTimestamp));
      this._frameCount = 0;
      this._fpsTimestamp = timestamp;
    }
  }

  getAverageFPS() {
    if (this._frameTimes.length < 2) return 0;
    const elapsed = this._frameTimes[this._frameTimes.length - 1] - this._frameTimes[0];
    return elapsed > 0 ? Math.round(((this._frameTimes.length - 1) * 1000) / elapsed) : 0;
  }

  getFrameTime() {
    if (this._frameTimes.length < 2) return 0;
    const last = this._frameTimes[this._frameTimes.length - 1];
    const prev = this._frameTimes[this._frameTimes.length - 2];
    return last - prev;
  }

  _processInputQueue() {
    while (this._inputQueue.length > 0) {
      const input = this._inputQueue.shift();
      this._executeCommand(input);
    }
  }

  queueCommand(command) {
    this._inputQueue.push({
      ...command,
      timestamp: Date.now(),
    });
  }

  _executeCommand(command) {
    this._commandHistory.push(command);
    if (this._commandHistory.length > this._maxCommandHistory) {
      this._commandHistory.shift();
    }

    this.eventBus.emit('command:execute', command);

    switch (command.type) {
      case 'create':
        return this._handleCreate(command);
      case 'delete':
        return this._handleDelete(command);
      case 'scale':
        return this._handleScale(command);
      case 'apply':
        return this._handleApply(command);
      case 'cordon':
        return this._handleCordon(command);
      case 'uncordon':
        return this._handleUncordon(command);
      case 'drain':
        return this._handleDrain(command);
      case 'rollout':
        return this._handleRollout(command);
      case 'exec':
        return this._handleExec(command);
      case 'logs':
        return this._handleLogs(command);
      default:
        this.eventBus.emit('command:unknown', command);
        return { success: false, message: `Unknown command: ${command.type}` };
    }
  }

  _handleCreate(command) {
    const { kind, name, namespace, spec } = command;
    const existing = this.cluster.getByName(kind, name, namespace);
    if (existing) {
      return { success: false, message: `${kind} "${name}" already exists in namespace "${namespace}"` };
    }

    const { ResourceBase } = this._requireResourceBase();
    const resource = new ResourceBase(kind, this._apiVersionForKind(kind), name, namespace || 'default');
    if (spec) {
      resource.updateSpec(spec);
    }
    if (command.labels) {
      for (const [key, value] of Object.entries(command.labels)) {
        resource.setLabel(key, value);
      }
    }

    this.cluster.add(resource);
    this._addNotification('success', `Created ${kind} "${name}"`);
    this._score += 2 * this._scoreMultiplier;
    return { success: true, resource };
  }

  _handleDelete(command) {
    const { kind, name, namespace } = command;
    const resource = this.cluster.getByName(kind, name, namespace || 'default');
    if (!resource) {
      return { success: false, message: `${kind} "${name}" not found` };
    }
    this.cluster.remove(resource.uid);
    this._addNotification('info', `Deleted ${kind} "${name}"`);
    return { success: true };
  }

  _handleScale(command) {
    const { kind, name, namespace, replicas } = command;
    const resource = this.cluster.getByName(kind, name, namespace || 'default');
    if (!resource) {
      return { success: false, message: `${kind} "${name}" not found` };
    }
    const oldReplicas = resource.spec.replicas || 1;
    resource.updateSpec({ replicas });
    this._addNotification('info', `Scaled ${kind} "${name}" from ${oldReplicas} to ${replicas} replicas`);
    this._score += 3 * this._scoreMultiplier;
    return { success: true, oldReplicas, newReplicas: replicas };
  }

  _handleApply(command) {
    const { kind, name, namespace, spec, labels } = command;
    let resource = this.cluster.getByName(kind, name, namespace || 'default');

    if (resource) {
      if (spec) resource.updateSpec(spec);
      if (labels) {
        for (const [key, value] of Object.entries(labels)) {
          resource.setLabel(key, value);
        }
      }
      this.cluster.update(resource.uid, resource);
      this._addNotification('info', `Updated ${kind} "${name}"`);
      return { success: true, action: 'updated', resource };
    }

    return this._handleCreate(command);
  }

  _handleCordon(command) {
    const node = this.cluster.getByName('Node', command.name, '');
    if (!node) return { success: false, message: `Node "${command.name}" not found` };
    node.spec.unschedulable = true;
    node.setLabel('node.kubernetes.io/unschedulable', 'true');
    this._addNotification('warning', `Cordoned node "${command.name}"`);
    return { success: true };
  }

  _handleUncordon(command) {
    const node = this.cluster.getByName('Node', command.name, '');
    if (!node) return { success: false, message: `Node "${command.name}" not found` };
    node.spec.unschedulable = false;
    node.removeLabel('node.kubernetes.io/unschedulable');
    this._addNotification('info', `Uncordoned node "${command.name}"`);
    return { success: true };
  }

  _handleDrain(command) {
    const node = this.cluster.getByName('Node', command.name, '');
    if (!node) return { success: false, message: `Node "${command.name}" not found` };

    node.spec.unschedulable = true;
    const pods = this.cluster.getByKind('Pod').filter(
      (p) => p.spec.nodeName === command.name && p.status.phase === 'Running'
    );

    let evicted = 0;
    for (const pod of pods) {
      const isDaemonSet = pod.metadata.ownerReferences.some((r) => r.kind === 'DaemonSet');
      if (isDaemonSet && !command.force) continue;
      pod.markForDeletion();
      evicted++;
    }

    this._addNotification('warning', `Draining node "${command.name}", evicting ${evicted} pods`);
    this._score += 5 * this._scoreMultiplier;
    return { success: true, evictedPods: evicted };
  }

  _handleRollout(command) {
    const { subcommand, kind, name, namespace } = command;
    const resource = this.cluster.getByName(kind || 'Deployment', name, namespace || 'default');
    if (!resource) return { success: false, message: `${kind || 'Deployment'} "${name}" not found` };

    switch (subcommand) {
      case 'restart': {
        resource.spec.template = resource.spec.template || {};
        resource.spec.template.metadata = resource.spec.template.metadata || {};
        resource.spec.template.metadata.annotations = resource.spec.template.metadata.annotations || {};
        resource.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();
        resource.metadata.generation++;
        this._addNotification('info', `Restarting rollout for ${kind || 'Deployment'} "${name}"`);
        return { success: true };
      }
      case 'status': {
        return {
          success: true,
          status: {
            replicas: resource.status.replicas || 0,
            readyReplicas: resource.status.readyReplicas || 0,
            availableReplicas: resource.status.availableReplicas || 0,
            updatedReplicas: resource.status.updatedReplicas || 0,
          },
        };
      }
      default:
        return { success: false, message: `Unknown rollout subcommand: ${subcommand}` };
    }
  }

  _handleExec(command) {
    const { podName, namespace, containerName, cmd } = command;
    const pod = this.cluster.getByName('Pod', podName, namespace || 'default');
    if (!pod) return { success: false, message: `Pod "${podName}" not found` };
    if (pod.status.phase !== 'Running') return { success: false, message: `Pod "${podName}" is not running` };

    this.eventBus.emit('command:exec', { pod: podName, container: containerName, command: cmd });
    return { success: true, output: `[simulated exec output for ${cmd}]` };
  }

  _handleLogs(command) {
    const { podName, namespace, containerName } = command;
    const pod = this.cluster.getByName('Pod', podName, namespace || 'default');
    if (!pod) return { success: false, message: `Pod "${podName}" not found` };

    const events = pod.getEvents(20);
    const logs = events.map((e) => `${e.timestamp} [${e.type}] ${e.reason}: ${e.message}`);
    return { success: true, logs };
  }

  _requireResourceBase() {
    return { ResourceBase };
  }

  _apiVersionForKind(kind) {
    const apiVersions = {
      Pod: 'v1', Node: 'v1', Namespace: 'v1', Service: 'v1',
      ConfigMap: 'v1', Secret: 'v1', PersistentVolume: 'v1', PersistentVolumeClaim: 'v1',
      Deployment: 'apps/v1', ReplicaSet: 'apps/v1', StatefulSet: 'apps/v1', DaemonSet: 'apps/v1',
      Job: 'batch/v1', CronJob: 'batch/v1',
      Ingress: 'networking.k8s.io/v1', NetworkPolicy: 'networking.k8s.io/v1',
      StorageClass: 'storage.k8s.io/v1',
      HorizontalPodAutoscaler: 'autoscaling/v2',
    };
    return apiVersions[kind] || 'v1';
  }

  setMode(mode) {
    const oldMode = this.mode;
    this.mode = mode;

    if (mode === GAME_MODES.CHAOS) {
      this.simulation.setChaosConfig({
        podKillRate: 0.01,
        nodeFailRate: 0.002,
        cpuStress: 0.2,
        memoryStress: 0.1,
      });
    } else {
      this.simulation.setChaosConfig({
        podKillRate: 0,
        nodeFailRate: 0,
        cpuStress: 0,
        memoryStress: 0,
      });
    }

    this.eventBus.emit('engine:mode-changed', { from: oldMode, to: mode });
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this._applyDifficulty();
    this.eventBus.emit('engine:difficulty-changed', { difficulty });
  }

  setTimeScale(scale) {
    this._timeScale = Math.max(0, Math.min(10, scale));
    this.simulation.setTickRate(this._timeScale);
    this.eventBus.emit('engine:timescale-changed', { timeScale: this._timeScale });
  }

  addObjective(id, objective) {
    this._activeObjectives.set(id, {
      ...objective,
      id,
      startTime: this._gameTime,
      completed: false,
    });
    this._addNotification('info', `New objective: ${objective.description}`);
    this.eventBus.emit('objective:added', { id, objective });
  }

  _checkObjectives() {
    for (const [id, objective] of this._activeObjectives) {
      if (objective.completed) continue;

      let met = false;
      if (typeof objective.condition === 'function') {
        met = objective.condition(this.cluster, this);
      }

      if (objective.timeout && this._gameTime - objective.startTime > objective.timeout) {
        objective.failed = true;
        this._activeObjectives.delete(id);
        this._addNotification('danger', `Objective failed: ${objective.description}`);
        this.eventBus.emit('objective:failed', { id, objective });
        this._reputation = Math.max(0, this._reputation - 10);
        continue;
      }

      if (met) {
        objective.completed = true;
        this._completedObjectives.add(id);
        this._activeObjectives.delete(id);
        this._score += (objective.reward || 50) * this._scoreMultiplier;
        this._experience += objective.xp || 25;
        this._addNotification('success', `Objective completed: ${objective.description}`);
        this.eventBus.emit('objective:completed', { id, objective, score: this._score });
      }
    }
  }

  unlockAchievement(id, achievement) {
    if (this._achievements.has(id)) return false;
    this._achievements.set(id, {
      ...achievement,
      id,
      unlockedAt: Date.now(),
    });
    this._addNotification('success', `Achievement unlocked: ${achievement.title}`);
    this._score += (achievement.points || 100) * this._scoreMultiplier;
    this.eventBus.emit('achievement:unlocked', { id, achievement });
    return true;
  }

  addScore(points, reason) {
    this._score += points * this._scoreMultiplier;
    this.eventBus.emit('score:changed', { score: this._score, delta: points, reason });
  }

  addCurrency(amount) {
    this._currency += amount * this._resourceMultiplier;
  }

  spendCurrency(amount) {
    if (this._currency < amount) return false;
    this._currency -= amount;
    return true;
  }

  _addNotification(type, message) {
    const notification = {
      id: Date.now() + Math.random(),
      type,
      message,
      timestamp: Date.now(),
      gameTime: this._gameTime,
      read: false,
    };
    this._notifications.push(notification);
    if (this._notifications.length > this._maxNotifications) {
      this._notifications.shift();
    }
    this.eventBus.emit('notification', notification);
  }

  getNotifications(limit) {
    if (limit) return this._notifications.slice(-limit);
    return [...this._notifications];
  }

  getUnreadNotifications() {
    return this._notifications.filter((n) => !n.read);
  }

  markNotificationRead(id) {
    const notification = this._notifications.find((n) => n.id === id);
    if (notification) notification.read = true;
  }

  markAllNotificationsRead() {
    for (const n of this._notifications) {
      n.read = true;
    }
  }

  onRender(callback) {
    this._renderCallbacks.push(callback);
    return () => {
      this._renderCallbacks = this._renderCallbacks.filter((cb) => cb !== callback);
    };
  }

  onUpdate(callback) {
    this._updateCallbacks.push(callback);
    return () => {
      this._updateCallbacks = this._updateCallbacks.filter((cb) => cb !== callback);
    };
  }

  registerPlugin(name, plugin) {
    this._plugins.set(name, plugin);
    if (typeof plugin.init === 'function') {
      plugin.init(this);
    }
    this.eventBus.emit('plugin:registered', { name });
  }

  getPlugin(name) {
    return this._plugins.get(name) || null;
  }

  getState() {
    return {
      state: this.state,
      mode: this.mode,
      difficulty: this.difficulty,
      score: this._score,
      level: this._level,
      experience: this._experience,
      currency: Math.floor(this._currency),
      reputation: this._reputation,
      gameTime: this._gameTime,
      realTime: this._realTime,
      timeScale: this._timeScale,
      fps: this._fps,
      tickCount: this.simulation.tickCount,
      activeObjectives: this._activeObjectives.size,
      completedObjectives: this._completedObjectives.size,
      achievements: this._achievements.size,
      unreadNotifications: this.getUnreadNotifications().length,
      cluster: this.cluster.getClusterStats(),
    };
  }

  getCommandHistory(limit) {
    if (limit) return this._commandHistory.slice(-limit);
    return [...this._commandHistory];
  }

  reset() {
    this.stop();
    this.cluster.clear();
    this.simulation.reset();
    this.eventBus.clearHistory();

    this._gameTime = 0;
    this._realTime = 0;
    this._score = 0;
    this._level = 1;
    this._experience = 0;
    this._currency = 1000;
    this._reputation = 100;
    this._achievements.clear();
    this._completedObjectives.clear();
    this._activeObjectives.clear();
    this._notifications = [];
    this._inputQueue = [];
    this._commandHistory = [];

    this._applyDifficulty();
    this.state = GAME_STATES.INIT;
    this.eventBus.emit('engine:reset', { timestamp: Date.now() });
  }

  saveState() {
    return {
      mode: this.mode,
      difficulty: this.difficulty,
      score: this._score,
      level: this._level,
      experience: this._experience,
      currency: this._currency,
      reputation: this._reputation,
      gameTime: this._gameTime,
      timeScale: this._timeScale,
      achievements: Array.from(this._achievements.entries()),
      completedObjectives: Array.from(this._completedObjectives),
      notifications: this._notifications.slice(-20),
      clusterSnapshot: this.cluster.snapshot(),
      simulationState: {
        tickCount: this.simulation.tickCount,
        tickRate: this.simulation.tickRate,
        chaosConfig: { ...this.simulation.chaosConfig },
        enableChaos: this.simulation.enableChaos,
      },
      savedAt: Date.now(),
    };
  }

  loadState(savedState) {
    if (!savedState) return false;

    this.reset();
    this.mode = savedState.mode || GAME_MODES.SANDBOX;
    this.difficulty = savedState.difficulty || 'normal';
    this._score = savedState.score || 0;
    this._level = savedState.level || 1;
    this._experience = savedState.experience || 0;
    this._currency = savedState.currency || 1000;
    this._reputation = savedState.reputation || 100;
    this._gameTime = savedState.gameTime || 0;
    this._timeScale = savedState.timeScale || 1;

    if (savedState.achievements) {
      for (const [key, value] of savedState.achievements) {
        this._achievements.set(key, value);
      }
    }
    if (savedState.completedObjectives) {
      for (const obj of savedState.completedObjectives) {
        this._completedObjectives.add(obj);
      }
    }
    if (savedState.notifications) {
      this._notifications = savedState.notifications;
    }
    if (savedState.simulationState) {
      this.simulation.tickCount = savedState.simulationState.tickCount || 0;
      this.simulation.tickRate = savedState.simulationState.tickRate || 1;
      if (savedState.simulationState.chaosConfig) {
        this.simulation.setChaosConfig(savedState.simulationState.chaosConfig);
      }
    }

    this._applyDifficulty();
    this.eventBus.emit('engine:loaded', { savedAt: savedState.savedAt });
    return true;
  }

  destroy() {
    this.stop();
    for (const [name, plugin] of this._plugins) {
      if (typeof plugin.destroy === 'function') {
        plugin.destroy();
      }
    }
    this._plugins.clear();
    this._renderCallbacks = [];
    this._updateCallbacks = [];
    this.eventBus.removeAllListeners();
  }
}

GameEngine.MODES = GAME_MODES;
GameEngine.STATES = GAME_STATES;

export { EventBus, GAME_MODES, GAME_STATES };
export default GameEngine;
