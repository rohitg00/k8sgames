const CHAOS_STATE = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameOver'
};

const INITIAL_CLUSTER = {
  nodes: [
    { kind: 'Node', name: 'chaos-node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
    { kind: 'Node', name: 'chaos-node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
    { kind: 'Node', name: 'chaos-node-3', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } }
  ],
  workloads: [
    { kind: 'Deployment', name: 'web-frontend', spec: { replicas: 2, image: 'nginx:latest' } },
    { kind: 'Deployment', name: 'api-backend', spec: { replicas: 2, image: 'node:18' } },
    { kind: 'Deployment', name: 'worker', spec: { replicas: 1, image: 'python:3.11' } },
    { kind: 'Service', name: 'web-svc', spec: { type: 'ClusterIP', port: 80 } },
    { kind: 'Service', name: 'api-svc', spec: { type: 'ClusterIP', port: 3000 } }
  ]
};

class ChaosMode {
  constructor(gameEngine, incidentEngine, scoringEngine) {
    this.gameEngine = gameEngine;
    this.incidentEngine = incidentEngine;
    this.scoringEngine = scoringEngine;
    this.ticker = null;
    this.pauseStart = 0;
    this.gameOverThreshold = 0;
    this.resetState();
  }

  resetState() {
    this.state = CHAOS_STATE.IDLE;
    this.survivalTime = 0;
    this.startTime = 0;
    this.pausedTime = 0;
    this.chaosBudget = 1;
    this.difficultyLevel = 1;
    this.totalXP = 0;
    this.incidentsResolved = 0;
    this.highestCombo = 0;
    this.clusterHealth = 100;
    this.healthDecayRate = 0;
    this.waveNumber = 0;
    this.waveIncidentCount = 0;
    this.waveCooldown = false;
    this.waveCooldownTimer = 0;
  }

  start() {
    this.resetState();
    this.state = CHAOS_STATE.PLAYING;
    this.startTime = Date.now();

    this.setupCluster();
    this.incidentEngine.reset();
    this.incidentEngine.start('chaos');

    this.ticker = setInterval(() => this.update(), 1000);

    this.gameEngine.on('incident:resolved', (data) => {
      if (this.state !== CHAOS_STATE.PLAYING) return;
      this.onIncidentResolved(data);
    });

    this.gameEngine.emit('chaos:started', {
      initialCluster: INITIAL_CLUSTER,
      difficultyLevel: this.difficultyLevel
    });
  }

  setupCluster() {
    const clusterState = this.gameEngine.getState();
    if (!clusterState) return;

    clusterState.clear();

    const allResources = [...INITIAL_CLUSTER.nodes, ...INITIAL_CLUSTER.workloads];
    for (const resource of allResources) {
      clusterState.addResource({
        kind: resource.kind,
        name: resource.name,
        metadata: { name: resource.name, namespace: 'default', labels: {} },
        spec: resource.spec,
        status: { phase: 'Running' },
      });
    }
  }

  update() {
    if (this.state !== CHAOS_STATE.PLAYING) return;

    this.survivalTime = (Date.now() - this.startTime - this.pausedTime) / 1000;
    this.updateDifficulty();
    this.updateHealth();
    this.updateWaves();
    this.checkGameOver();

    this.gameEngine.emit('chaos:update', {
      survivalTime: Math.round(this.survivalTime),
      difficultyLevel: this.difficultyLevel,
      chaosBudget: Math.round(this.chaosBudget * 10) / 10,
      clusterHealth: Math.round(this.clusterHealth),
      activeIncidents: this.incidentEngine.getActiveIncidents().length,
      incidentsResolved: this.incidentsResolved,
      currentCombo: this.incidentEngine.comboCount,
      highestCombo: this.highestCombo,
      totalXP: this.totalXP,
      waveNumber: this.waveNumber
    });
  }

  updateDifficulty() {
    const minutesElapsed = this.survivalTime / 60;
    this.difficultyLevel = Math.min(10, 1 + Math.floor(minutesElapsed / 2));
    this.chaosBudget = 1 + (minutesElapsed * 0.5);
    this.healthDecayRate = this.difficultyLevel * 0.1;
  }

  updateHealth() {
    const activeIncidents = this.incidentEngine.getActiveIncidents();
    let penalty = 0;

    for (const incident of activeIncidents) {
      const severityPenalty = incident.severity * 2;
      const timeFactor = 1 + ((Date.now() - incident.createdAt) / 60000) * 0.5;
      penalty += severityPenalty * timeFactor;
    }

    penalty += this.healthDecayRate;

    const regenRate = this.incidentsResolved > 0 ? 0.5 : 0;
    this.clusterHealth = Math.max(0, Math.min(100, this.clusterHealth - (penalty / 60) + regenRate / 60));
  }

  updateWaves() {
    if (this.waveCooldown) {
      this.waveCooldownTimer -= 1;
      if (this.waveCooldownTimer <= 0) {
        this.waveCooldown = false;
        this.startNewWave();
      }
      return;
    }

    const minutesElapsed = this.survivalTime / 60;
    const waveInterval = Math.max(1, 3 - (this.difficultyLevel * 0.2));
    const expectedWave = Math.floor(minutesElapsed / waveInterval) + 1;

    if (expectedWave > this.waveNumber) {
      this.startNewWave();
    }
  }

  startNewWave() {
    this.waveNumber++;
    this.waveIncidentCount = Math.min(5, 1 + Math.floor(this.waveNumber / 3));

    this.gameEngine.emit('chaos:wave', {
      waveNumber: this.waveNumber,
      incidentCount: this.waveIncidentCount,
      difficultyLevel: this.difficultyLevel
    });

    this.waveCooldown = true;
    this.waveCooldownTimer = Math.max(5, 15 - this.difficultyLevel);
  }

  onIncidentResolved(data) {
    this.incidentsResolved++;
    this.totalXP += data.xpEarned || 0;
    this.highestCombo = Math.max(this.highestCombo, data.combo);

    const healthBonus = Math.min(10, data.severity * 2);
    this.clusterHealth = Math.min(100, this.clusterHealth + healthBonus);

    this.gameEngine.emit('chaos:incident-resolved', {
      xpEarned: data.xpEarned,
      combo: data.combo,
      healthRecovered: healthBonus,
      clusterHealth: Math.round(this.clusterHealth)
    });
  }

  checkGameOver() {
    if (this.clusterHealth <= this.gameOverThreshold) {
      this.gameOver();
    }
  }

  gameOver() {
    this.state = CHAOS_STATE.GAME_OVER;
    this.stopTicking();
    this.incidentEngine.stop();

    this.scoringEngine.recordChaosSurvival(this.survivalTime);

    const finalStats = {
      survivalTime: Math.round(this.survivalTime),
      difficultyReached: this.difficultyLevel,
      incidentsResolved: this.incidentsResolved,
      highestCombo: this.highestCombo,
      totalXP: this.totalXP,
      wavesReached: this.waveNumber,
      incidentBreakdown: this.incidentEngine.getStats()
    };

    this.gameEngine.emit('chaos:game-over', finalStats);

    return finalStats;
  }

  pause() {
    if (this.state !== CHAOS_STATE.PLAYING) return;
    this.state = CHAOS_STATE.PAUSED;
    this.pauseStart = Date.now();
    this.incidentEngine.pause();
    this.gameEngine.emit('chaos:paused', { survivalTime: Math.round(this.survivalTime) });
  }

  resume() {
    if (this.state !== CHAOS_STATE.PAUSED) return;
    this.state = CHAOS_STATE.PLAYING;
    this.pausedTime += Date.now() - this.pauseStart;
    this.incidentEngine.resume();
    this.gameEngine.emit('chaos:resumed', {});
  }

  getStatus() {
    return {
      state: this.state,
      survivalTime: Math.round(this.survivalTime),
      difficultyLevel: this.difficultyLevel,
      chaosBudget: Math.round(this.chaosBudget * 10) / 10,
      clusterHealth: Math.round(this.clusterHealth),
      activeIncidents: this.incidentEngine.getActiveIncidents(),
      incidentsResolved: this.incidentsResolved,
      currentCombo: this.incidentEngine.comboCount,
      highestCombo: this.highestCombo,
      totalXP: this.totalXP,
      waveNumber: this.waveNumber
    };
  }

  stopTicking() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  restart() {
    this.stopTicking();
    this.incidentEngine.reset();
    this.start();
  }

  exit() {
    this.stopTicking();
    this.incidentEngine.stop();
    this.state = CHAOS_STATE.IDLE;
    this.gameEngine.emit('chaos:exited', {});
  }

  destroy() {
    this.stopTicking();
    this.gameEngine = null;
    this.incidentEngine = null;
    this.scoringEngine = null;
  }
}

export { ChaosMode, CHAOS_STATE };
