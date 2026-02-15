import { ACHIEVEMENTS } from '../data/Achievements.js';

const XP_LEVELS = [
  { level: 1, title: 'Novice', xpRequired: 0 },
  { level: 2, title: 'Novice II', xpRequired: 100 },
  { level: 3, title: 'Novice III', xpRequired: 250 },
  { level: 4, title: 'Apprentice', xpRequired: 450 },
  { level: 5, title: 'Apprentice II', xpRequired: 700 },
  { level: 6, title: 'Apprentice III', xpRequired: 1000 },
  { level: 7, title: 'Operator', xpRequired: 1400 },
  { level: 8, title: 'Operator II', xpRequired: 1900 },
  { level: 9, title: 'Operator III', xpRequired: 2500 },
  { level: 10, title: 'Administrator', xpRequired: 3200 },
  { level: 11, title: 'Administrator II', xpRequired: 4000 },
  { level: 12, title: 'Administrator III', xpRequired: 5000 },
  { level: 13, title: 'Engineer', xpRequired: 6200 },
  { level: 14, title: 'Engineer II', xpRequired: 7600 },
  { level: 15, title: 'Engineer III', xpRequired: 9200 },
  { level: 16, title: 'Architect', xpRequired: 11000 },
  { level: 17, title: 'Architect II', xpRequired: 13000 },
  { level: 18, title: 'Architect III', xpRequired: 15500 },
  { level: 19, title: 'SRE', xpRequired: 18500 },
  { level: 20, title: 'SRE II', xpRequired: 22000 },
  { level: 21, title: 'SRE III', xpRequired: 26000 },
  { level: 22, title: 'Principal', xpRequired: 30500 },
  { level: 23, title: 'Principal II', xpRequired: 35500 },
  { level: 24, title: 'Principal III', xpRequired: 41000 },
  { level: 25, title: 'Staff', xpRequired: 47500 },
  { level: 26, title: 'Staff II', xpRequired: 55000 },
  { level: 27, title: 'Staff III', xpRequired: 63500 },
  { level: 28, title: 'CKA Candidate', xpRequired: 73000 },
  { level: 29, title: 'CKA Certified', xpRequired: 84000 },
  { level: 30, title: 'CKA Master', xpRequired: 100000 }
];

const STORAGE_KEY = 'kubeops_progress';

class ScoringEngine {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.progress = this.loadProgress();
    this.sessionStats = this.createEmptySessionStats();
    this.unlockedAchievements = new Set(this.progress.achievements || []);

    this.bindEvents();
  }

  createEmptySessionStats() {
    return {
      totalPodsDeployed: 0,
      deploymentsCreated: 0,
      servicesCreated: 0,
      namespacesCreated: 0,
      networkPoliciesCreated: 0,
      pvcsCreated: 0,
      hpasCreated: 0,
      incidentsResolved: 0,
      commandsExecuted: 0,
      yamlViewed: 0,
      maxConcurrentPods: 0,
      maxNodes: 0,
      uniqueResourceTypesDeployed: 0,
      sandboxResourcesDeployed: 0,
      fastestIncidentResolve: Infinity,
      resourceTypesUsed: new Set()
    };
  }

  bindEvents() {
    if (!this.gameEngine) return;

    this.gameEngine.on('resource:created', (data) => {
      this.trackResourceCreated(data);
    });

    this.gameEngine.on('incident:resolved', (data) => {
      this.trackIncidentResolved(data);
    });

    this.gameEngine.on('command:executed', () => {
      this.sessionStats.commandsExecuted++;
      this.progress.stats.commandsExecuted = (this.progress.stats.commandsExecuted || 0) + 1;
      this.checkAchievements();
    });

    this.gameEngine.on('yaml:viewed', () => {
      this.sessionStats.yamlViewed++;
      this.progress.stats.yamlViewed = (this.progress.stats.yamlViewed || 0) + 1;
      this.checkAchievements();
    });
  }

  trackResourceCreated(data) {
    const kind = data.kind;
    this.sessionStats.resourceTypesUsed.add(kind);
    this.progress.stats.uniqueResourceTypesDeployed = Math.max(
      this.progress.stats.uniqueResourceTypesDeployed || 0,
      this.sessionStats.resourceTypesUsed.size
    );

    switch (kind) {
      case 'Pod':
        this.sessionStats.totalPodsDeployed++;
        this.progress.stats.totalPodsDeployed = (this.progress.stats.totalPodsDeployed || 0) + 1;
        break;
      case 'Deployment':
        this.sessionStats.deploymentsCreated++;
        this.progress.stats.deploymentsCreated = (this.progress.stats.deploymentsCreated || 0) + 1;
        break;
      case 'Service':
        this.sessionStats.servicesCreated++;
        this.progress.stats.servicesCreated = (this.progress.stats.servicesCreated || 0) + 1;
        break;
      case 'Namespace':
        this.sessionStats.namespacesCreated++;
        this.progress.stats.namespacesCreated = (this.progress.stats.namespacesCreated || 0) + 1;
        break;
      case 'NetworkPolicy':
        this.sessionStats.networkPoliciesCreated++;
        this.progress.stats.networkPoliciesCreated = (this.progress.stats.networkPoliciesCreated || 0) + 1;
        break;
      case 'PersistentVolumeClaim':
        this.sessionStats.pvcsCreated++;
        this.progress.stats.pvcsCreated = (this.progress.stats.pvcsCreated || 0) + 1;
        break;
      case 'HorizontalPodAutoscaler':
        this.sessionStats.hpasCreated++;
        this.progress.stats.hpasCreated = (this.progress.stats.hpasCreated || 0) + 1;
        break;
    }

    if (data.concurrentPods) {
      this.sessionStats.maxConcurrentPods = Math.max(this.sessionStats.maxConcurrentPods, data.concurrentPods);
      this.progress.stats.maxConcurrentPods = Math.max(
        this.progress.stats.maxConcurrentPods || 0,
        data.concurrentPods
      );
    }

    if (data.nodeCount) {
      this.sessionStats.maxNodes = Math.max(this.sessionStats.maxNodes, data.nodeCount);
      this.progress.stats.maxNodes = Math.max(this.progress.stats.maxNodes || 0, data.nodeCount);
    }

    if (data.mode === 'sandbox') {
      this.sessionStats.sandboxResourcesDeployed++;
      this.progress.stats.sandboxResourcesDeployed = (this.progress.stats.sandboxResourcesDeployed || 0) + 1;
    }

    this.checkAchievements();
    this.saveProgress();
  }

  trackIncidentResolved(data) {
    this.sessionStats.incidentsResolved++;
    this.progress.stats.incidentsResolved = (this.progress.stats.incidentsResolved || 0) + 1;

    if (data.resolutionTime && data.resolutionTime < this.sessionStats.fastestIncidentResolve) {
      this.sessionStats.fastestIncidentResolve = data.resolutionTime;
    }
    if (data.resolutionTime) {
      this.progress.stats.fastestIncidentResolve = Math.min(
        this.progress.stats.fastestIncidentResolve || Infinity,
        data.resolutionTime
      );
    }

    if (data.combo) {
      this.progress.stats.highestCombo = Math.max(this.progress.stats.highestCombo || 0, data.combo);
    }

    if (data.xpEarned) {
      this.addXP(data.xpEarned);
    }

    this.checkAchievements();
    this.saveProgress();
  }

  addXP(amount) {
    this.progress.xp = (this.progress.xp || 0) + amount;
    const oldLevel = this.progress.level || 1;
    this.progress.level = this.calculateLevel(this.progress.xp);

    if (this.progress.level > oldLevel) {
      const levelInfo = XP_LEVELS.find((l) => l.level === this.progress.level);
      this.gameEngine.emit('player:level-up', {
        level: this.progress.level,
        title: levelInfo ? levelInfo.title : 'Unknown',
        totalXP: this.progress.xp
      });
    }

    this.gameEngine.emit('xp:gained', { amount, totalXP: this.progress.xp, level: this.progress.level });
    this.saveProgress();
  }

  calculateLevel(xp) {
    let level = 1;
    for (const entry of XP_LEVELS) {
      if (xp >= entry.xpRequired) {
        level = entry.level;
      } else {
        break;
      }
    }
    return level;
  }

  getLevelInfo() {
    const currentXP = this.progress.xp || 0;
    const currentLevel = this.calculateLevel(currentXP);
    const currentEntry = XP_LEVELS.find((l) => l.level === currentLevel);
    const nextEntry = XP_LEVELS.find((l) => l.level === currentLevel + 1);

    return {
      level: currentLevel,
      title: currentEntry ? currentEntry.title : 'Novice',
      currentXP: currentXP,
      xpForCurrentLevel: currentEntry ? currentEntry.xpRequired : 0,
      xpForNextLevel: nextEntry ? nextEntry.xpRequired : null,
      xpProgress: nextEntry ? (currentXP - currentEntry.xpRequired) / (nextEntry.xpRequired - currentEntry.xpRequired) : 1
    };
  }

  calculateStarRating(levelId, completionTime, efficiency, hadFailures) {
    const levels = this.gameEngine.campaignLevels || [];
    const level = levels.find((l) => l.id === levelId);
    if (!level) return 1;

    let stars = 1;

    const timeMet = completionTime <= level.starCriteria.time;
    const efficiencyMet = efficiency >= level.starCriteria.efficiency;
    const noFailuresMet = !level.starCriteria.noFailures || !hadFailures;

    if (timeMet && efficiencyMet) stars = 2;
    if (timeMet && efficiencyMet && noFailuresMet) stars = 3;

    return stars;
  }

  completeCampaignLevel(levelId, completionTime, efficiency, hadFailures, usedHints) {
    const stars = this.calculateStarRating(levelId, completionTime, efficiency, hadFailures);

    if (!this.progress.campaignProgress) {
      this.progress.campaignProgress = {};
    }

    const existing = this.progress.campaignProgress[levelId];
    if (!existing || stars > existing.stars) {
      this.progress.campaignProgress[levelId] = {
        completed: true,
        stars: stars,
        bestTime: existing ? Math.min(existing.bestTime, completionTime) : completionTime,
        completedAt: Date.now()
      };
    } else if (existing) {
      existing.bestTime = Math.min(existing.bestTime, completionTime);
    }

    const completedLevels = Object.keys(this.progress.campaignProgress).filter(
      (id) => this.progress.campaignProgress[id].completed
    );
    this.progress.stats.levelsCompleted = completedLevels.length;

    this.progress.stats.threeStarLevels = Object.values(this.progress.campaignProgress).filter(
      (p) => p.stars === 3
    ).length;

    this.progress.stats.totalStars = Object.values(this.progress.campaignProgress).reduce(
      (sum, p) => sum + p.stars, 0
    );

    if (!this.progress.stats.levelTimes) {
      this.progress.stats.levelTimes = {};
    }
    this.progress.stats.levelTimes[levelId] = Math.min(
      this.progress.stats.levelTimes[levelId] || Infinity,
      completionTime
    );

    if (!usedHints) {
      this.progress.stats.completedWithoutHints = (this.progress.stats.completedWithoutHints || 0) + 1;
    }

    const chapters = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12],
      [13, 14, 15, 16],
      [17, 18, 19, 20]
    ];
    this.progress.stats.chaptersCompleted = chapters.filter((ch) =>
      ch.every((lid) => this.progress.campaignProgress[lid]?.completed)
    ).length;

    const baseXP = 100 + (levelId * 25);
    const starBonus = stars * 50;
    this.addXP(baseXP + starBonus);

    this.checkAchievements();
    this.saveProgress();

    return { stars, xpEarned: baseXP + starBonus };
  }

  completeChallenge(challengeId, completionTime, completionPercentage) {
    if (!this.progress.challengeProgress) {
      this.progress.challengeProgress = {};
    }

    let stars = 0;
    if (completionPercentage >= 100) stars = 1;
    if (completionPercentage >= 100 && completionTime <= 180) stars = 2;
    if (completionPercentage >= 100 && completionTime <= 120) stars = 3;

    const existing = this.progress.challengeProgress[challengeId];
    if (!existing || stars > existing.stars) {
      this.progress.challengeProgress[challengeId] = {
        completed: completionPercentage >= 100,
        stars,
        bestTime: existing ? Math.min(existing.bestTime, completionTime) : completionTime,
        completionPercentage
      };
    }

    this.progress.stats.threeStarChallenges = Object.values(this.progress.challengeProgress).filter(
      (p) => p.stars === 3
    ).length;

    const xp = Math.floor(completionPercentage * 2) + (stars * 75);
    this.addXP(xp);
    this.checkAchievements();
    this.saveProgress();

    return { stars, xpEarned: xp };
  }

  recordChaosSurvival(survivalTimeSeconds) {
    this.progress.stats.longestChaosSurvival = Math.max(
      this.progress.stats.longestChaosSurvival || 0,
      survivalTimeSeconds
    );
    this.checkAchievements();
    this.saveProgress();
  }

  calculateArchitectureScore(clusterState) {
    const scores = {
      highAvailability: this.scoreHighAvailability(clusterState),
      security: this.scoreSecurity(clusterState),
      scalability: this.scoreScalability(clusterState),
      costEfficiency: this.scoreCostEfficiency(clusterState),
      reliability: this.scoreReliability(clusterState),
      networking: this.scoreNetworking(clusterState),
      storage: this.scoreStorage(clusterState),
      configuration: this.scoreConfiguration(clusterState),
      observability: this.scoreObservability(clusterState),
      organization: this.scoreOrganization(clusterState)
    };

    const total = Math.round(
      Object.values(scores).reduce((sum, s) => sum + s.score, 0) / Object.keys(scores).length
    );

    this.progress.stats.highestArchitectureScore = Math.max(
      this.progress.stats.highestArchitectureScore || 0,
      total
    );
    this.checkAchievements();
    this.saveProgress();

    return { total, categories: scores };
  }

  scoreHighAvailability(state) {
    let score = 0;
    const recommendations = [];
    const deployments = state.getResourcesByKind('Deployment') || [];
    const multiReplica = deployments.filter((d) => (d.spec?.replicas || 1) > 1);

    if (deployments.length === 0) {
      return { score: 0, recommendations: ['Deploy at least one Deployment'] };
    }

    score += Math.min(40, (multiReplica.length / Math.max(1, deployments.length)) * 40);
    if (multiReplica.length < deployments.length) {
      recommendations.push('Set replicas > 1 for all Deployments');
    }

    const nodes = state.getResourcesByKind('Node') || [];
    score += Math.min(30, nodes.length * 10);
    if (nodes.length < 3) {
      recommendations.push('Add more nodes for high availability (minimum 3 recommended)');
    }

    const pdbs = state.getResourcesByKind('PodDisruptionBudget') || [];
    score += Math.min(30, pdbs.length * 15);
    if (pdbs.length === 0) {
      recommendations.push('Create PodDisruptionBudgets to protect availability during maintenance');
    }

    return { score: Math.min(100, Math.round(score)), recommendations };
  }

  scoreSecurity(state) {
    let score = 0;
    const recommendations = [];

    const netpols = state.getResourcesByKind('NetworkPolicy') || [];
    score += Math.min(30, netpols.length * 10);
    if (netpols.length === 0) {
      recommendations.push('Create NetworkPolicies to control traffic between Pods');
    }

    const roles = state.getResourcesByKind('Role') || [];
    const bindings = state.getResourcesByKind('RoleBinding') || [];
    score += Math.min(25, (roles.length + bindings.length) * 5);
    if (roles.length === 0) {
      recommendations.push('Set up RBAC Roles and RoleBindings');
    }

    const secrets = state.getResourcesByKind('Secret') || [];
    const configMaps = state.getResourcesByKind('ConfigMap') || [];
    const hasSensitiveConfigMap = configMaps.some((cm) => {
      const data = cm.spec?.data || {};
      return Object.keys(data).some((k) => /password|secret|key|token/i.test(k));
    });

    score += Math.min(25, secrets.length * 10);
    if (hasSensitiveConfigMap) {
      score -= 15;
      recommendations.push('Move sensitive data from ConfigMaps to Secrets');
    }

    const sas = state.getResourcesByKind('ServiceAccount') || [];
    score += Math.min(20, sas.length * 5);
    if (sas.length === 0) {
      recommendations.push('Create ServiceAccounts for workloads instead of using default');
    }

    return { score: Math.max(0, Math.min(100, Math.round(score))), recommendations };
  }

  scoreScalability(state) {
    let score = 0;
    const recommendations = [];

    const hpas = state.getResourcesByKind('HorizontalPodAutoscaler') || [];
    const deployments = state.getResourcesByKind('Deployment') || [];

    score += Math.min(50, hpas.length * 15);
    if (hpas.length === 0 && deployments.length > 0) {
      recommendations.push('Configure HorizontalPodAutoscaler for auto-scaling');
    }

    const withResources = deployments.filter((d) => d.spec?.resources?.requests);
    score += Math.min(30, (withResources.length / Math.max(1, deployments.length)) * 30);
    if (withResources.length < deployments.length) {
      recommendations.push('Set resource requests on all Deployments for scheduler efficiency');
    }

    const nodes = state.getResourcesByKind('Node') || [];
    score += Math.min(20, nodes.length * 5);

    return { score: Math.min(100, Math.round(score)), recommendations };
  }

  scoreCostEfficiency(state) {
    let score = 60;
    const recommendations = [];

    const deployments = state.getResourcesByKind('Deployment') || [];
    const overProvisioned = deployments.filter((d) => {
      const replicas = d.spec?.replicas || 1;
      return replicas > 5;
    });

    if (overProvisioned.length > 0) {
      score -= overProvisioned.length * 10;
      recommendations.push('Review Deployments with more than 5 replicas for cost optimization');
    }

    const hpas = state.getResourcesByKind('HorizontalPodAutoscaler') || [];
    score += Math.min(20, hpas.length * 10);
    if (hpas.length === 0 && deployments.length > 0) {
      recommendations.push('Use HPA to scale down during low traffic');
    }

    const limits = deployments.filter((d) => d.spec?.resources?.limits);
    score += Math.min(20, (limits.length / Math.max(1, deployments.length)) * 20);
    if (limits.length < deployments.length) {
      recommendations.push('Set resource limits to prevent waste');
    }

    return { score: Math.max(0, Math.min(100, Math.round(score))), recommendations };
  }

  scoreReliability(state) {
    let score = 0;
    const recommendations = [];
    const deployments = state.getResourcesByKind('Deployment') || [];

    const withProbes = deployments.filter((d) => d.spec?.livenessProbe || d.spec?.readinessProbe);
    score += Math.min(50, (withProbes.length / Math.max(1, deployments.length)) * 50);
    if (withProbes.length < deployments.length) {
      recommendations.push('Add liveness and readiness probes to all Deployments');
    }

    const multiReplica = deployments.filter((d) => (d.spec?.replicas || 1) > 1);
    score += Math.min(30, (multiReplica.length / Math.max(1, deployments.length)) * 30);

    const pdbs = state.getResourcesByKind('PodDisruptionBudget') || [];
    score += Math.min(20, pdbs.length * 10);
    if (pdbs.length === 0 && multiReplica.length > 0) {
      recommendations.push('Add PodDisruptionBudgets for critical workloads');
    }

    return { score: Math.min(100, Math.round(score)), recommendations };
  }

  scoreNetworking(state) {
    let score = 0;
    const recommendations = [];

    const deployments = state.getResourcesByKind('Deployment') || [];
    const services = state.getResourcesByKind('Service') || [];

    score += Math.min(40, (services.length / Math.max(1, deployments.length)) * 40);
    if (services.length < deployments.length) {
      recommendations.push('Create Services for all Deployments');
    }

    const ingresses = state.getResourcesByKind('Ingress') || [];
    score += Math.min(30, ingresses.length * 15);
    if (ingresses.length === 0 && services.length > 0) {
      recommendations.push('Set up Ingress for external traffic routing');
    }

    const netpols = state.getResourcesByKind('NetworkPolicy') || [];
    score += Math.min(30, netpols.length * 10);

    return { score: Math.min(100, Math.round(score)), recommendations };
  }

  scoreStorage(state) {
    let score = 50;
    const recommendations = [];

    const statefulSets = state.getResourcesByKind('StatefulSet') || [];
    const pvcs = state.getResourcesByKind('PersistentVolumeClaim') || [];

    if (statefulSets.length > 0) {
      score += Math.min(25, (pvcs.length / Math.max(1, statefulSets.length)) * 25);
      if (pvcs.length < statefulSets.length) {
        recommendations.push('Ensure PVCs are created for all StatefulSets');
      }
    }

    const pvs = state.getResourcesByKind('PersistentVolume') || [];
    score += Math.min(25, pvs.length * 10);

    if (statefulSets.length === 0 && pvcs.length === 0) {
      score = 50;
      recommendations.push('Consider using StatefulSets with PVCs for stateful workloads');
    }

    return { score: Math.max(0, Math.min(100, Math.round(score))), recommendations };
  }

  scoreConfiguration(state) {
    let score = 0;
    const recommendations = [];

    const configMaps = state.getResourcesByKind('ConfigMap') || [];
    const secrets = state.getResourcesByKind('Secret') || [];

    score += Math.min(40, (configMaps.length + secrets.length) * 10);
    if (configMaps.length === 0 && secrets.length === 0) {
      recommendations.push('Use ConfigMaps and Secrets for configuration instead of hardcoding');
    }

    const hasSensitiveConfigMap = configMaps.some((cm) => {
      const data = cm.spec?.data || {};
      return Object.keys(data).some((k) => /password|secret|key|token/i.test(k));
    });
    if (hasSensitiveConfigMap) {
      score -= 20;
      recommendations.push('Move sensitive data from ConfigMaps to Secrets');
    }

    score += Math.min(30, secrets.length * 15);

    const deployments = state.getResourcesByKind('Deployment') || [];
    const withEnv = deployments.filter((d) => d.spec?.envFrom || d.spec?.env);
    score += Math.min(30, (withEnv.length / Math.max(1, deployments.length)) * 30);

    return { score: Math.max(0, Math.min(100, Math.round(score))), recommendations };
  }

  scoreObservability(state) {
    let score = 20;
    const recommendations = [];

    const deployments = state.getResourcesByKind('Deployment') || [];
    const withProbes = deployments.filter((d) => d.spec?.livenessProbe && d.spec?.readinessProbe);
    score += Math.min(40, (withProbes.length / Math.max(1, deployments.length)) * 40);
    if (withProbes.length < deployments.length) {
      recommendations.push('Add both liveness and readiness probes for observability');
    }

    const daemonSets = state.getResourcesByKind('DaemonSet') || [];
    const hasMonitoring = daemonSets.some((ds) => /monitor|metric|log|fluentd|prometheus/i.test(ds.name));
    if (hasMonitoring) {
      score += 30;
    } else {
      recommendations.push('Deploy monitoring agents as DaemonSets');
    }

    const hpas = state.getResourcesByKind('HorizontalPodAutoscaler') || [];
    score += Math.min(10, hpas.length * 5);

    return { score: Math.min(100, Math.round(score)), recommendations };
  }

  scoreOrganization(state) {
    let score = 0;
    const recommendations = [];

    const namespaces = state.getResourcesByKind('Namespace') || [];
    score += Math.min(40, namespaces.length * 10);
    if (namespaces.length <= 1) {
      recommendations.push('Use multiple Namespaces to organize workloads');
    }

    const quotas = state.getResourcesByKind('ResourceQuota') || [];
    score += Math.min(30, quotas.length * 15);
    if (quotas.length === 0 && namespaces.length > 1) {
      recommendations.push('Add ResourceQuotas to namespaces');
    }

    const allResources = state.getAllResources ? state.getAllResources() : [];
    const labeled = allResources.filter((r) => r.metadata?.labels && Object.keys(r.metadata.labels).length > 0);
    score += Math.min(30, (labeled.length / Math.max(1, allResources.length)) * 30);
    if (labeled.length < allResources.length * 0.5) {
      recommendations.push('Add labels to resources for better organization');
    }

    return { score: Math.min(100, Math.round(score)), recommendations };
  }

  checkAchievements() {
    const stats = { ...this.progress.stats };
    let newUnlocks = [];

    for (const achievement of ACHIEVEMENTS) {
      if (this.unlockedAchievements.has(achievement.id)) continue;

      try {
        if (achievement.condition(stats)) {
          this.unlockedAchievements.add(achievement.id);
          newUnlocks.push(achievement);
          this.addXP(achievement.xpReward);

          this.gameEngine.emit('achievement:unlocked', {
            id: achievement.id,
            name: achievement.name,
            description: achievement.description,
            icon: achievement.icon,
            category: achievement.category,
            xpReward: achievement.xpReward
          });
        }
      } catch (e) {
        // skip broken conditions
      }
    }

    this.progress.achievements = Array.from(this.unlockedAchievements);
    if (newUnlocks.length > 0) {
      this.saveProgress();
    }

    return newUnlocks;
  }

  getAchievements() {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      condition: undefined,
      unlocked: this.unlockedAchievements.has(a.id)
    }));
  }

  getProgress() {
    return {
      xp: this.progress.xp || 0,
      level: this.progress.level || 1,
      levelInfo: this.getLevelInfo(),
      stats: { ...this.progress.stats },
      campaignProgress: { ...this.progress.campaignProgress },
      challengeProgress: { ...this.progress.challengeProgress },
      achievementsUnlocked: this.unlockedAchievements.size,
      achievementsTotal: ACHIEVEMENTS.length
    };
  }

  loadProgress() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        return {
          xp: data.xp || 0,
          level: data.level || 1,
          stats: data.stats || {},
          achievements: data.achievements || [],
          campaignProgress: data.campaignProgress || {},
          challengeProgress: data.challengeProgress || {}
        };
      }
    } catch (e) {
      // fall through to defaults
    }
    return {
      xp: 0,
      level: 1,
      stats: {},
      achievements: [],
      campaignProgress: {},
      challengeProgress: {}
    };
  }

  saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        xp: this.progress.xp,
        level: this.progress.level,
        stats: this.progress.stats,
        achievements: Array.from(this.unlockedAchievements),
        campaignProgress: this.progress.campaignProgress,
        challengeProgress: this.progress.challengeProgress
      }));
    } catch (e) {
      // localStorage unavailable
    }
  }

  resetProgress() {
    this.progress = {
      xp: 0,
      level: 1,
      stats: {},
      achievements: [],
      campaignProgress: {},
      challengeProgress: {}
    };
    this.unlockedAchievements.clear();
    this.sessionStats = this.createEmptySessionStats();
    this.saveProgress();
  }

  destroy() {
    this.saveProgress();
    this.gameEngine = null;
  }
}

export { ScoringEngine, XP_LEVELS };
