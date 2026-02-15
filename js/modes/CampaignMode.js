import { CAMPAIGN_LEVELS, CHAPTERS } from '../data/CampaignLevels.js';

const CAMPAIGN_STATE = {
  MENU: 'menu',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

class CampaignMode {
  constructor(gameEngine, incidentEngine, scoringEngine) {
    this.gameEngine = gameEngine;
    this.incidentEngine = incidentEngine;
    this.scoringEngine = scoringEngine;
    this.state = CAMPAIGN_STATE.MENU;
    this.currentLevel = null;
    this.currentLevelDef = null;
    this.objectiveProgress = [];
    this.startTime = 0;
    this.elapsedTime = 0;
    this.pausedTime = 0;
    this.pauseStart = 0;
    this.ticker = null;
    this.hadFailures = false;
    this.usedHints = false;
    this.tutorialStep = 0;
    this.tutorialActive = false;
    this.levelRetryCount = 0;

    this.gameEngine.campaignLevels = CAMPAIGN_LEVELS;
  }

  getLevels() {
    const progress = this.scoringEngine.getProgress();
    return CAMPAIGN_LEVELS.map((level) => {
      const levelProgress = progress.campaignProgress[level.id];
      const previousCompleted = level.id === 1 ||
        (progress.campaignProgress[level.id - 1]?.completed);

      const locked = !previousCompleted;
      const completed = levelProgress?.completed || false;
      const stars = levelProgress?.stars || 0;
      const bestTime = levelProgress?.bestTime || null;

      return {
        id: level.id,
        title: level.title,
        chapter: level.chapter,
        chapterName: level.chapterName,
        description: level.description,
        objectives: level.objectives,
        locked,
        completed,
        stars,
        bestTime,
      };
    });
  }

  getChapters() {
    const progress = this.scoringEngine.getProgress();
    return CHAPTERS.map((chapter) => {
      const levels = chapter.levels.map((lid) => {
        const lp = progress.campaignProgress[lid];
        return { id: lid, completed: lp?.completed || false, stars: lp?.stars || 0 };
      });

      const totalStars = levels.reduce((sum, l) => sum + l.stars, 0);
      const maxStars = levels.length * 3;
      const completed = levels.every((l) => l.completed);

      return {
        id: chapter.id,
        name: chapter.name,
        description: chapter.description,
        levels,
        totalStars,
        maxStars,
        completed,
      };
    });
  }

  startLevel(levelId) {
    const levelDef = CAMPAIGN_LEVELS.find((l) => l.id === levelId);
    if (!levelDef) return false;

    const progress = this.scoringEngine.getProgress();
    if (levelId > 1 && !progress.campaignProgress[levelId - 1]?.completed) {
      return false;
    }

    this.currentLevel = levelId;
    this.currentLevelDef = levelDef;
    this.state = CAMPAIGN_STATE.LOADING;
    this.hadFailures = false;
    this.usedHints = false;
    this.tutorialStep = 0;
    this.tutorialActive = false;
    this.pausedTime = 0;

    this.objectiveProgress = levelDef.objectives.map((obj) => ({
      ...obj,
      current: 0,
      target: obj.count || 1,
      completed: false
    }));

    this.setupCluster(levelDef);
    this.incidentEngine.reset();

    if (levelDef.incidents.length > 0) {
      this.incidentEngine.loadScriptedIncidents(levelDef.incidents);
    }

    if (levelDef.tutorial) {
      this.tutorialActive = true;
      this.tutorialStep = 0;
    }

    this.state = CAMPAIGN_STATE.PLAYING;
    this.startTime = Date.now();
    this.incidentEngine.start('campaign');

    this.ticker = setInterval(() => this.update(), 1000);

    const objectives = this.objectiveProgress;

    this.gameEngine.emit('campaign:level-started', {
      levelId: levelDef.id,
      title: levelDef.title,
      chapter: levelDef.chapter,
      chapterName: levelDef.chapterName,
      objectives,
      availableResources: levelDef.availableResources,
      tutorial: levelDef.tutorial,
    });

    return true;
  }

  setupCluster(levelDef) {
    const clusterState = this.gameEngine.getState();
    if (!clusterState) return;

    clusterState.clear();

    for (const resource of levelDef.startingResources) {
      clusterState.addResource({
        kind: resource.kind,
        name: resource.name,
        metadata: {
          name: resource.name,
          namespace: resource.spec?.namespace || 'default',
          labels: {}
        },
        spec: resource.spec || {},
        status: { phase: 'Running' }
      });
    }
  }

  update() {
    if (this.state !== CAMPAIGN_STATE.PLAYING) return;

    this.elapsedTime = (Date.now() - this.startTime - this.pausedTime) / 1000;
    this.updateObjectives();
    this.checkCompletion();
    this.checkFailure();

    this.gameEngine.emit('campaign:update', {
      levelId: this.currentLevel,
      elapsedTime: this.elapsedTime,
      objectives: this.objectiveProgress,
      clusterHealth: this.incidentEngine.getClusterHealth()
    });
  }

  updateObjectives() {
    const state = this.gameEngine.getState();
    if (!state) return;

    for (const obj of this.objectiveProgress) {
      if (obj.completed) continue;

      switch (obj.type) {
        case 'deploy': {
          const resources = state.getResourcesByKind(obj.kind) || [];
          obj.current = resources.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'scale': {
          const deployments = state.getResourcesByKind(obj.kind) || [];
          const scaled = deployments.find((d) => (d.spec?.replicas || 0) >= obj.replicas);
          obj.current = scaled ? obj.replicas : 0;
          obj.target = obj.replicas;
          obj.completed = !!scaled;
          break;
        }
        case 'resolve': {
          const stats = this.incidentEngine.getStats();
          const resolved = stats.totalResolved;
          obj.current = Math.min(resolved, obj.target);
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'uptime': {
          const health = this.incidentEngine.getClusterHealth();
          obj.current = Math.round(health);
          obj.target = obj.percentage;
          obj.completed = health >= obj.percentage;
          break;
        }
        case 'distribute': {
          const pods = state.getResourcesByKind('Pod') || [];
          const nodeSet = new Set(pods.map((p) => p.spec?.nodeName).filter(Boolean));
          obj.current = nodeSet.size;
          obj.target = obj.minNodes;
          obj.completed = nodeSet.size >= obj.minNodes;
          break;
        }
        case 'replicas': {
          const deps = state.getResourcesByKind('Deployment') || [];
          const allMeetMin = deps.every((d) => (d.spec?.replicas || 0) >= obj.minPerDeployment);
          obj.current = allMeetMin ? obj.target : 0;
          obj.completed = allMeetMin && deps.length > 0;
          break;
        }
        case 'coverage': {
          const nodes = state.getResourcesByKind('Node') || [];
          const daemonSets = state.getResourcesByKind('DaemonSet') || [];
          if (daemonSets.length > 0 && nodes.length > 0) {
            obj.current = nodes.length;
            obj.target = nodes.length;
            obj.completed = true;
          }
          break;
        }
        case 'complete': {
          const jobs = state.getResourcesByKind(obj.kind) || [];
          const completed = jobs.filter((j) => j.status?.phase === 'Completed');
          obj.current = completed.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'update': {
          const deps = state.getResourcesByKind(obj.kind) || [];
          const updated = deps.filter((d) => d.status?.updatedReplicas > 0);
          obj.current = updated.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'rollback': {
          obj.current = state._rollbackCount || 0;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'connect': {
          const services = state.getResourcesByKind('Service') || [];
          const hasConnection = services.some((s) =>
            s.spec?.selector && (s.name === obj.to + '-svc' || s.name === obj.to)
          );
          obj.current = hasConnection ? 1 : 0;
          obj.completed = hasConnection;
          break;
        }
        case 'serviceType': {
          const services = state.getResourcesByKind('Service') || [];
          const matching = services.filter((s) => s.spec?.type === obj.kind);
          obj.current = matching.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'route': {
          const ingresses = state.getResourcesByKind('Ingress') || [];
          const paths = ingresses.flatMap((i) => i.spec?.rules?.flatMap((r) => r.paths?.map((p) => p.path)) || []);
          const matched = obj.paths.filter((p) => paths.includes(p));
          obj.current = matched.length;
          obj.target = obj.paths.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'tls': {
          const ingresses = state.getResourcesByKind('Ingress') || [];
          const hasTLS = ingresses.some((i) => i.spec?.tls && i.spec.tls.length > 0);
          obj.current = hasTLS ? 1 : 0;
          obj.completed = hasTLS;
          break;
        }
        case 'isolate': {
          const policies = state.getResourcesByKind('NetworkPolicy') || [];
          const isolated = policies.some((p) => p.spec?.namespace === obj.namespace || p.metadata?.namespace === obj.namespace);
          obj.current = isolated ? 1 : 0;
          obj.completed = isolated;
          break;
        }
        case 'allow': {
          const policies = state.getResourcesByKind('NetworkPolicy') || [];
          obj.current = policies.length > 0 ? 1 : 0;
          obj.completed = policies.length > 0;
          break;
        }
        case 'verify': {
          const health = this.incidentEngine.getClusterHealth();
          obj.current = health >= 90 ? 1 : 0;
          obj.completed = health >= 90;
          break;
        }
        case 'mount':
        case 'envFrom': {
          const resources = state.getResourcesByKind(obj.kind) || [];
          obj.current = Math.min(resources.length, obj.target);
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'noConfigMap': {
          const cms = state.getResourcesByKind('ConfigMap') || [];
          const hasSensitive = cms.some((cm) => {
            const data = cm.spec?.data || {};
            return Object.keys(data).some((k) => /password|secret|key|token/i.test(k));
          });
          obj.current = hasSensitive ? 0 : 1;
          obj.completed = !hasSensitive;
          break;
        }
        case 'bound': {
          const pvcs = state.getResourcesByKind(obj.kind) || [];
          const bound = pvcs.filter((p) => p.status?.phase === 'Bound');
          obj.current = bound.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'headless': {
          const services = state.getResourcesByKind('Service') || [];
          const headless = services.filter((s) => s.spec?.clusterIP === 'None');
          obj.current = headless.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'stable': {
          const sts = state.getResourcesByKind('StatefulSet') || [];
          obj.current = sts.length > 0 ? 1 : 0;
          obj.completed = sts.length > 0;
          break;
        }
        case 'resources': {
          const deps = state.getResourcesByKind('Deployment') || [];
          const configured = deps.filter((d) => d.spec?.resources?.requests && d.spec?.resources?.limits);
          obj.current = configured.length;
          obj.target = deps.length;
          obj.completed = configured.length === deps.length && deps.length > 0;
          break;
        }
        case 'probes': {
          const deps = state.getResourcesByKind('Deployment') || [];
          const withProbes = deps.filter((d) => d.spec?.livenessProbe && d.spec?.readinessProbe);
          obj.current = withProbes.length;
          obj.target = deps.length;
          obj.completed = withProbes.length === deps.length && deps.length > 0;
          break;
        }
        case 'hpa': {
          const hpas = state.getResourcesByKind('HorizontalPodAutoscaler') || [];
          obj.current = hpas.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'leastPrivilege': {
          const roles = state.getResourcesByKind('Role') || [];
          const hasWildcard = roles.some((r) => r.spec?.rules?.some((rule) => rule.verbs?.includes('*')));
          obj.current = hasWildcard ? 0 : 1;
          obj.completed = !hasWildcard;
          break;
        }
        case 'reschedule': {
          obj.current = state._rescheduledCount || 0;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'pdb': {
          const pdbs = state.getResourcesByKind('PodDisruptionBudget') || [];
          obj.current = pdbs.length;
          obj.completed = obj.current >= obj.target;
          break;
        }
        case 'architectureScore': {
          const score = this.scoringEngine.calculateArchitectureScore(state);
          obj.current = score.total;
          obj.target = obj.minScore;
          obj.completed = score.total >= obj.minScore;
          break;
        }
      }
    }
  }

  checkCompletion() {
    if (this.objectiveProgress.every((obj) => obj.completed)) {
      this.completeLevel();
    }
  }

  checkFailure() {
    const health = this.incidentEngine.getClusterHealth();
    if (health <= 0) {
      this.hadFailures = true;
    }

    const activeIncidents = this.incidentEngine.getActiveIncidents();
    if (activeIncidents.some((inc) => inc.severity >= 4)) {
      this.hadFailures = true;
    }
  }

  completeLevel() {
    this.state = CAMPAIGN_STATE.COMPLETED;
    this.stopTicking();
    this.incidentEngine.stop();

    const completionTime = this.elapsedTime;
    const totalObjectives = this.objectiveProgress.length;
    const completedObjectives = this.objectiveProgress.filter((o) => o.completed).length;
    const efficiency = completedObjectives / totalObjectives;

    const result = this.scoringEngine.completeCampaignLevel(
      this.currentLevel,
      completionTime,
      efficiency,
      this.hadFailures,
      this.usedHints
    );

    this.gameEngine.emit('campaign:level-completed', {
      levelId: this.currentLevel,
      title: this.currentLevelDef.title,
      stars: result.stars,
      xpEarned: result.xpEarned,
      completionTime: Math.round(completionTime),
      efficiency: Math.round(efficiency * 100),
      hadFailures: this.hadFailures,
      nextLevel: this.currentLevelDef.nextLevel
    });

    return result;
  }

  failLevel(reason) {
    this.state = CAMPAIGN_STATE.FAILED;
    this.stopTicking();
    this.incidentEngine.stop();
    this.levelRetryCount++;

    this.scoringEngine.progress.stats.levelRetries = (this.scoringEngine.progress.stats.levelRetries || 0) + 1;
    this.scoringEngine.saveProgress();

    this.gameEngine.emit('campaign:level-failed', {
      levelId: this.currentLevel,
      title: this.currentLevelDef.title,
      reason,
      elapsedTime: Math.round(this.elapsedTime),
    });
  }

  retryLevel() {
    if (!this.currentLevel) return false;
    return this.startLevel(this.currentLevel);
  }

  nextLevel() {
    if (!this.currentLevelDef || !this.currentLevelDef.nextLevel) return false;
    return this.startLevel(this.currentLevelDef.nextLevel);
  }

  pause() {
    if (this.state !== CAMPAIGN_STATE.PLAYING) return;
    this.state = CAMPAIGN_STATE.PAUSED;
    this.pauseStart = Date.now();
    this.incidentEngine.pause();
    this.gameEngine.emit('campaign:paused', { levelId: this.currentLevel });
  }

  resume() {
    if (this.state !== CAMPAIGN_STATE.PAUSED) return;
    this.state = CAMPAIGN_STATE.PLAYING;
    this.pausedTime += Date.now() - this.pauseStart;
    this.incidentEngine.resume();
    this.gameEngine.emit('campaign:resumed', { levelId: this.currentLevel });
  }

  useHint(index) {
    if (!this.currentLevelDef) return null;
    if (index < 0 || index >= this.currentLevelDef.hints.length) return null;

    this.usedHints = true;
    const hint = this.currentLevelDef.hints[index];

    this.gameEngine.emit('campaign:hint-used', {
      levelId: this.currentLevel,
      hintIndex: index,
      hint,
    });

    return hint;
  }

  advanceTutorial() {
    if (!this.tutorialActive || !this.currentLevelDef?.tutorial) return null;

    const steps = this.currentLevelDef.tutorial.steps;
    if (this.tutorialStep >= steps.length) {
      this.tutorialActive = false;
      this.gameEngine.emit('campaign:tutorial-completed', { levelId: this.currentLevel });
      return null;
    }

    const step = steps[this.tutorialStep];
    this.tutorialStep++;

    this.gameEngine.emit('campaign:tutorial-step', {
      levelId: this.currentLevel,
      step: this.tutorialStep,
      totalSteps: steps.length,
      target: step.target,
      text: step.text
    });

    return step;
  }

  skipTutorial() {
    this.tutorialActive = false;
    this.gameEngine.emit('campaign:tutorial-skipped', { levelId: this.currentLevel });
  }

  getCompletionPercentage() {
    if (this.objectiveProgress.length === 0) return 0;
    const completed = this.objectiveProgress.filter((o) => o.completed).length;
    return Math.round((completed / this.objectiveProgress.length) * 100);
  }

  getStatus() {
    return {
      state: this.state,
      currentLevel: this.currentLevel,
      levelTitle: this.currentLevelDef?.title || null,
      chapter: this.currentLevelDef?.chapter || null,
      chapterName: this.currentLevelDef?.chapterName || null,
      elapsedTime: Math.round(this.elapsedTime),
      objectives: this.objectiveProgress,
      completionPercentage: this.getCompletionPercentage(),
      clusterHealth: this.incidentEngine.getClusterHealth(),
      activeIncidents: this.incidentEngine.getActiveIncidents().length,
      tutorialActive: this.tutorialActive,
      tutorialStep: this.tutorialStep,
      hints: this.currentLevelDef?.hints || [],
      availableResources: this.currentLevelDef?.availableResources || [],
    };
  }

  stopTicking() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  exitToMenu() {
    this.stopTicking();
    this.incidentEngine.stop();
    this.state = CAMPAIGN_STATE.MENU;
    this.currentLevel = null;
    this.currentLevelDef = null;
    this.gameEngine.emit('campaign:exit-to-menu', {});
  }

  destroy() {
    this.stopTicking();
    this.gameEngine = null;
    this.incidentEngine = null;
    this.scoringEngine = null;
  }
}

export { CampaignMode, CAMPAIGN_STATE };
