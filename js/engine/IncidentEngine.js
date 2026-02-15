import { INCIDENT_DEFS, SEVERITY_LEVELS } from '../data/IncidentDefs.js';

const INCIDENT_STATE = {
  CREATED: 'Created',
  ACTIVE: 'Active',
  INVESTIGATING: 'Investigating',
  RESOLVED: 'Resolved'
};

class Incident {
  constructor(def, target, id) {
    this.id = id;
    this.defId = def.id;
    this.name = def.name;
    this.category = def.category;
    this.severity = def.severity;
    this.description = def.description;
    this.visualEffect = def.visualEffect;
    this.affectedResourceTypes = def.affectedResourceTypes;
    this.investigationSteps = def.investigationSteps.map((s) => ({ ...s, completed: false }));
    this.resolutionActions = [...def.resolutionActions];
    this.kubectlCommands = [...def.kubectlCommands];
    this.autoResolveTime = def.autoResolveTime;
    this.target = target;
    this.state = INCIDENT_STATE.CREATED;
    this.createdAt = Date.now();
    this.activatedAt = null;
    this.resolvedAt = null;
    this.investigationProgress = 0;
    this.cascadeChildren = [];
    this.cascadeParent = null;
    this.comboEligible = true;
  }

  activate() {
    this.state = INCIDENT_STATE.ACTIVE;
    this.activatedAt = Date.now();
  }

  startInvestigation() {
    if (this.state === INCIDENT_STATE.ACTIVE) {
      this.state = INCIDENT_STATE.INVESTIGATING;
    }
  }

  completeInvestigationStep(index) {
    if (index >= 0 && index < this.investigationSteps.length) {
      this.investigationSteps[index].completed = true;
      this.investigationProgress = this.investigationSteps.filter((s) => s.completed).length / this.investigationSteps.length;
    }
  }

  resolve() {
    this.state = INCIDENT_STATE.RESOLVED;
    this.resolvedAt = Date.now();
  }

  getResolutionTime() {
    if (!this.activatedAt || !this.resolvedAt) return null;
    return (this.resolvedAt - this.activatedAt) / 1000;
  }

  isExpired(currentTime) {
    if (!this.autoResolveTime || !this.activatedAt) return false;
    return (currentTime - this.activatedAt) / 1000 >= this.autoResolveTime;
  }
}

class IncidentEngine {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.activeIncidents = new Map();
    this.resolvedIncidents = [];
    this.incidentCounter = 0;
    this.difficultyLevel = 1;
    this.spawnTimer = null;
    this.scriptedQueue = [];
    this.elapsedTime = 0;
    this.comboCount = 0;
    this.lastResolveTime = 0;
    this.comboWindow = 10000;
    this.maxCascadeDepth = 3;
    this.paused = false;

    this.cascadeRules = new Map([
      ['NodeNotReady', [
        { incident: 'PodEviction', probability: 0.8, delay: 5000, severity: 2 },
        { incident: 'ServiceEndpointMissing', probability: 0.5, delay: 8000, severity: 3 }
      ]],
      ['OOMKilled', [
        { incident: 'ReadinessProbeFailure', probability: 0.6, delay: 3000, severity: 2 }
      ]],
      ['DNSResolutionFailure', [
        { incident: 'ServiceEndpointMissing', probability: 0.7, delay: 4000, severity: 3 },
        { incident: 'ReadinessProbeFailure', probability: 0.4, delay: 6000, severity: 2 }
      ]],
      ['EtcdLatency', [
        { incident: 'APIServerOverloaded', probability: 0.6, delay: 5000, severity: 5 },
        { incident: 'SchedulerFailure', probability: 0.4, delay: 8000, severity: 4 }
      ]],
      ['NodeDiskPressure', [
        { incident: 'PodEviction', probability: 0.7, delay: 10000, severity: 2 }
      ]],
      ['NodeMemoryPressure', [
        { incident: 'OOMKilled', probability: 0.6, delay: 5000, severity: 3 },
        { incident: 'PodEviction', probability: 0.5, delay: 8000, severity: 2 }
      ]]
    ]);

    this.difficultyWeights = this.buildDifficultyWeights();
  }

  buildDifficultyWeights() {
    const weights = new Map();
    for (let level = 1; level <= 10; level++) {
      const maxSeverity = Math.min(5, Math.ceil(level / 2));
      const eligible = INCIDENT_DEFS.filter((d) => d.severity <= maxSeverity);
      const totalWeight = eligible.reduce((sum, d) => sum + this._incidentWeight(level, d), 0);
      weights.set(level, eligible.map((d) => ({
        def: d,
        weight: this._incidentWeight(level, d) / totalWeight,
      })));
    }
    return weights;
  }

  _incidentWeight(level, def) {
    if (level >= def.severity * 2) return 3;
    if (level >= def.severity) return 2;
    return 1;
  }

  loadScriptedIncidents(incidents) {
    this.scriptedQueue = incidents
      .map((inc) => ({
        ...inc,
        def: INCIDENT_DEFS.find((d) => d.name === inc.type),
        triggered: false
      }))
      .filter((inc) => inc.def)
      .sort((a, b) => a.triggerTime - b.triggerTime);
  }

  start(mode) {
    this.mode = mode;
    this.elapsedTime = 0;
    this.paused = false;
    this.activeIncidents.clear();
    this.resolvedIncidents = [];
    this.comboCount = 0;
    this.incidentCounter = 0;

    if (this.spawnTimer) {
      clearInterval(this.spawnTimer);
    }

    this.spawnTimer = setInterval(() => this.tick(1000), 1000);
  }

  stop() {
    if (this.spawnTimer) {
      clearInterval(this.spawnTimer);
      this.spawnTimer = null;
    }
    this.paused = true;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  tick(deltaMs) {
    if (this.paused) return;

    this.elapsedTime += deltaMs;
    const elapsedSeconds = this.elapsedTime / 1000;

    this.processScriptedIncidents(elapsedSeconds);
    this.processAutoResolve();
    this.updateActiveIncidents();

    if (this.mode === 'chaos') {
      this.processChaosTick(elapsedSeconds);
    }
  }

  processScriptedIncidents(elapsedSeconds) {
    for (const scripted of this.scriptedQueue) {
      if (scripted.triggered) continue;
      if (elapsedSeconds >= scripted.triggerTime) {
        scripted.triggered = true;
        this.spawnIncident(scripted.def, scripted.target, scripted.severity || scripted.def.severity);
      }
    }
  }

  processAutoResolve() {
    const now = Date.now();
    for (const [id, incident] of this.activeIncidents) {
      if (incident.isExpired(now)) {
        this.resolveIncident(id, 'auto');
      }
    }
  }

  updateActiveIncidents() {
    for (const [, incident] of this.activeIncidents) {
      if (incident.state === INCIDENT_STATE.CREATED) {
        incident.activate();
        this.gameEngine.emit('incident:activated', {
          id: incident.id,
          name: incident.name,
          severity: incident.severity,
          target: incident.target,
          visualEffect: incident.visualEffect
        });
      }
    }
  }

  processChaosTick(elapsedSeconds) {
    const minutesElapsed = elapsedSeconds / 60;
    this.difficultyLevel = Math.min(10, 1 + Math.floor(minutesElapsed / 2));

    const baseInterval = 15;
    const interval = Math.max(3, baseInterval - this.difficultyLevel * 1.2);
    const shouldSpawn = Math.random() < (1 / interval);

    if (shouldSpawn && this.activeIncidents.size < 5 + this.difficultyLevel) {
      const def = this.selectRandomIncident();
      if (def) {
        const target = this.selectRandomTarget(def);
        this.spawnIncident(def, target);
      }
    }
  }

  selectRandomIncident() {
    const level = Math.min(10, this.difficultyLevel);
    const pool = this.difficultyWeights.get(level);
    if (!pool || pool.length === 0) return null;

    const roll = Math.random();
    let cumulative = 0;
    for (const entry of pool) {
      cumulative += entry.weight;
      if (roll <= cumulative) return entry.def;
    }
    return pool[pool.length - 1].def;
  }

  selectRandomTarget(def) {
    const state = this.gameEngine.getState();
    if (!state) return 'unknown';

    const candidates = [];
    for (const kind of def.affectedResourceTypes) {
      const resources = state.getResourcesByKind(kind);
      if (resources) {
        candidates.push(...resources);
      }
    }

    if (candidates.length === 0) return 'unknown';
    return candidates[Math.floor(Math.random() * candidates.length)].name || 'unknown';
  }

  spawnIncident(def, target, overrideSeverity) {
    this.incidentCounter++;
    const id = `inc-${this.incidentCounter}`;

    const incident = new Incident(def, target, id);
    if (overrideSeverity) {
      incident.severity = overrideSeverity;
    }

    this.activeIncidents.set(id, incident);

    this.gameEngine.emit('incident:created', {
      id: incident.id,
      name: incident.name,
      category: incident.category,
      severity: incident.severity,
      description: incident.description,
      target: incident.target,
      visualEffect: incident.visualEffect,
      investigationSteps: incident.investigationSteps.map((s) => ({ command: s.command, hint: s.hint })),
      resolutionActions: incident.resolutionActions
    });

    this.checkCascade(incident, 0);

    return id;
  }

  checkCascade(parentIncident, depth) {
    if (depth >= this.maxCascadeDepth) return;

    const rules = this.cascadeRules.get(parentIncident.name);
    if (!rules) return;

    for (const rule of rules) {
      if (Math.random() > rule.probability) continue;

      setTimeout(() => {
        if (this.paused) return;
        if (parentIncident.state === INCIDENT_STATE.RESOLVED) return;

        const childDef = INCIDENT_DEFS.find((d) => d.name === rule.incident);
        if (!childDef) return;

        const childId = this.spawnIncident(childDef, parentIncident.target, rule.severity);
        const child = this.activeIncidents.get(childId);
        if (child) {
          child.cascadeParent = parentIncident.id;
          parentIncident.cascadeChildren.push(childId);
          this.gameEngine.emit('incident:cascade', {
            parentId: parentIncident.id,
            childId: childId,
            parentName: parentIncident.name,
            childName: child.name
          });
          this.checkCascade(child, depth + 1);
        }
      }, rule.delay);
    }
  }

  investigateIncident(incidentId) {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) return null;

    incident.startInvestigation();

    this.gameEngine.emit('incident:investigating', {
      id: incident.id,
      name: incident.name,
      steps: incident.investigationSteps,
      commands: incident.kubectlCommands
    });

    return {
      steps: incident.investigationSteps,
      commands: incident.kubectlCommands,
      progress: incident.investigationProgress
    };
  }

  completeStep(incidentId, stepIndex) {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) return null;

    incident.completeInvestigationStep(stepIndex);

    this.gameEngine.emit('incident:step-completed', {
      id: incident.id,
      stepIndex,
      progress: incident.investigationProgress
    });

    return incident.investigationProgress;
  }

  resolveIncident(incidentId, actionId) {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) return null;

    incident.resolve();
    this.activeIncidents.delete(incidentId);
    this.resolvedIncidents.push(incident);

    const resolutionTime = incident.getResolutionTime();
    const severityInfo = SEVERITY_LEVELS.find((s) => s.level === incident.severity) || SEVERITY_LEVELS[0];
    let xpEarned = severityInfo.xpReward;

    const now = Date.now();
    if (now - this.lastResolveTime < this.comboWindow) {
      this.comboCount++;
      xpEarned = Math.floor(xpEarned * (1 + this.comboCount * 0.25));
    } else {
      this.comboCount = 1;
    }
    this.lastResolveTime = now;

    if (resolutionTime !== null && resolutionTime < 30) {
      xpEarned = Math.floor(xpEarned * 1.5);
    }

    const cascadeChildren = incident.cascadeChildren.filter((cid) => this.activeIncidents.has(cid));

    this.gameEngine.emit('incident:resolved', {
      id: incident.id,
      name: incident.name,
      severity: incident.severity,
      resolutionTime,
      action: actionId,
      xpEarned,
      combo: this.comboCount,
      cascadeChildrenRemaining: cascadeChildren.length
    });

    this.applyResolutionEffects(incident, actionId);

    return { xpEarned, combo: this.comboCount, resolutionTime };
  }

  applyResolutionEffects(incident, actionId) {
    const state = this.gameEngine.getState();
    if (!state) return;

    switch (incident.name) {
      case 'CrashLoopBackOff':
      case 'ImagePullBackOff':
      case 'OOMKilled':
        this.gameEngine.emit('resource:healed', { target: incident.target, kind: 'Pod' });
        break;
      case 'NodeNotReady':
        this.gameEngine.emit('resource:healed', { target: incident.target, kind: 'Node' });
        break;
      case 'PodEviction':
        this.gameEngine.emit('resource:rescheduled', { target: incident.target });
        break;
      case 'DNSResolutionFailure':
        this.gameEngine.emit('cluster:dns-restored', {});
        break;
      case 'SecretExposed':
        this.gameEngine.emit('security:credential-rotated', { target: incident.target });
        break;
    }
  }

  getActiveIncidents() {
    return Array.from(this.activeIncidents.values()).map((inc) => ({
      id: inc.id,
      name: inc.name,
      category: inc.category,
      severity: inc.severity,
      state: inc.state,
      target: inc.target,
      visualEffect: inc.visualEffect,
      investigationProgress: inc.investigationProgress,
      createdAt: inc.createdAt,
      hasCascade: inc.cascadeChildren.length > 0
    }));
  }

  getIncidentDetails(incidentId) {
    const incident = this.activeIncidents.get(incidentId);
    if (!incident) return null;

    return {
      id: incident.id,
      name: incident.name,
      category: incident.category,
      severity: incident.severity,
      description: incident.description,
      state: incident.state,
      target: incident.target,
      visualEffect: incident.visualEffect,
      investigationSteps: incident.investigationSteps,
      resolutionActions: incident.resolutionActions,
      kubectlCommands: incident.kubectlCommands,
      investigationProgress: incident.investigationProgress,
      cascadeParent: incident.cascadeParent,
      cascadeChildren: incident.cascadeChildren,
      createdAt: incident.createdAt,
      activatedAt: incident.activatedAt
    };
  }

  getStats() {
    const total = this.resolvedIncidents.length;
    const avgResolveTime = total > 0
      ? this.resolvedIncidents.reduce((sum, inc) => sum + (inc.getResolutionTime() || 0), 0) / total
      : 0;

    const bySeverity = {};
    for (const inc of this.resolvedIncidents) {
      bySeverity[inc.severity] = (bySeverity[inc.severity] || 0) + 1;
    }

    const byCategory = {};
    for (const inc of this.resolvedIncidents) {
      byCategory[inc.category] = (byCategory[inc.category] || 0) + 1;
    }

    const cascadeCount = this.resolvedIncidents.filter((inc) => inc.cascadeChildren.length > 0).length;

    return {
      totalResolved: total,
      activeCount: this.activeIncidents.size,
      averageResolveTime: Math.round(avgResolveTime * 10) / 10,
      bySeverity,
      byCategory,
      cascadeCount,
      currentCombo: this.comboCount,
      difficultyLevel: this.difficultyLevel
    };
  }

  getClusterHealth() {
    let healthPenalty = 0;
    for (const [, incident] of this.activeIncidents) {
      const severityInfo = SEVERITY_LEVELS.find((s) => s.level === incident.severity);
      const multiplier = severityInfo ? (incident.severity / 5) : 0.2;
      healthPenalty += multiplier * 15;
    }
    return Math.max(0, Math.min(100, 100 - healthPenalty));
  }

  reset() {
    this.stop();
    this.activeIncidents.clear();
    this.resolvedIncidents = [];
    this.incidentCounter = 0;
    this.difficultyLevel = 1;
    this.comboCount = 0;
    this.lastResolveTime = 0;
    this.scriptedQueue = [];
    this.elapsedTime = 0;
  }

  destroy() {
    this.reset();
    this.gameEngine = null;
  }
}

export { IncidentEngine, Incident, INCIDENT_STATE };
