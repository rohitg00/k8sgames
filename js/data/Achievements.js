const ACHIEVEMENTS = [
  {
    id: 'first-pod',
    name: 'First Pod',
    description: 'Deploy your very first Pod.',
    icon: 'seedling',
    category: 'Beginner',
    condition: (stats) => stats.totalPodsDeployed >= 1,
    xpReward: 25
  },
  {
    id: 'namespace-creator',
    name: 'Namespace Creator',
    description: 'Create your first Namespace.',
    icon: 'folder',
    category: 'Beginner',
    condition: (stats) => stats.namespacesCreated >= 1,
    xpReward: 25
  },
  {
    id: 'first-deployment',
    name: 'Deployer',
    description: 'Create your first Deployment.',
    icon: 'rocket',
    category: 'Beginner',
    condition: (stats) => stats.deploymentsCreated >= 1,
    xpReward: 25
  },
  {
    id: 'first-service',
    name: 'Service Provider',
    description: 'Create your first Service.',
    icon: 'link',
    category: 'Beginner',
    condition: (stats) => stats.servicesCreated >= 1,
    xpReward: 25
  },
  {
    id: 'first-incident',
    name: 'First Responder',
    description: 'Resolve your first incident.',
    icon: 'shield',
    category: 'Beginner',
    condition: (stats) => stats.incidentsResolved >= 1,
    xpReward: 50
  },
  {
    id: 'five-pods',
    name: 'Pod Farmer',
    description: 'Have 5 running Pods simultaneously.',
    icon: 'sprout',
    category: 'Beginner',
    condition: (stats) => stats.maxConcurrentPods >= 5,
    xpReward: 50
  },
  {
    id: 'level-complete',
    name: 'Graduate',
    description: 'Complete your first campaign level.',
    icon: 'graduation',
    category: 'Beginner',
    condition: (stats) => stats.levelsCompleted >= 1,
    xpReward: 50
  },
  {
    id: 'three-stars',
    name: 'Star Collector',
    description: 'Earn 3 stars on any campaign level.',
    icon: 'star',
    category: 'Beginner',
    condition: (stats) => stats.threeStarLevels >= 1,
    xpReward: 75
  },
  {
    id: 'command-user',
    name: 'Command Line Hero',
    description: 'Execute 10 commands in the command bar.',
    icon: 'terminal',
    category: 'Beginner',
    condition: (stats) => stats.commandsExecuted >= 10,
    xpReward: 50
  },
  {
    id: 'yaml-viewer',
    name: 'YAML Reader',
    description: 'View the YAML output of 5 resources.',
    icon: 'document',
    category: 'Beginner',
    condition: (stats) => stats.yamlViewed >= 5,
    xpReward: 25
  },
  {
    id: 'twenty-pods',
    name: 'Pod Rancher',
    description: 'Have 20 running Pods simultaneously.',
    icon: 'herd',
    category: 'Intermediate',
    condition: (stats) => stats.maxConcurrentPods >= 20,
    xpReward: 100
  },
  {
    id: 'full-house',
    name: 'Full House',
    description: 'Have 100 running Pods simultaneously.',
    icon: 'house',
    category: 'Intermediate',
    condition: (stats) => stats.maxConcurrentPods >= 100,
    xpReward: 250
  },
  {
    id: 'incident-hunter',
    name: 'Incident Hunter',
    description: 'Resolve 10 incidents.',
    icon: 'crosshair',
    category: 'Intermediate',
    condition: (stats) => stats.incidentsResolved >= 10,
    xpReward: 150
  },
  {
    id: 'multi-node',
    name: 'Cluster Builder',
    description: 'Run a cluster with 5 or more nodes.',
    icon: 'server-stack',
    category: 'Intermediate',
    condition: (stats) => stats.maxNodes >= 5,
    xpReward: 100
  },
  {
    id: 'network-admin',
    name: 'Network Admin',
    description: 'Create 5 NetworkPolicies.',
    icon: 'firewall',
    category: 'Intermediate',
    condition: (stats) => stats.networkPoliciesCreated >= 5,
    xpReward: 100
  },
  {
    id: 'storage-guru',
    name: 'Storage Guru',
    description: 'Create 5 PersistentVolumeClaims.',
    icon: 'database',
    category: 'Intermediate',
    condition: (stats) => stats.pvcsCreated >= 5,
    xpReward: 100
  },
  {
    id: 'chapter-complete',
    name: 'Chapter Master',
    description: 'Complete all levels in any chapter.',
    icon: 'book',
    category: 'Intermediate',
    condition: (stats) => stats.chaptersCompleted >= 1,
    xpReward: 200
  },
  {
    id: 'quick-fix',
    name: 'Quick Fix',
    description: 'Resolve an incident within 30 seconds.',
    icon: 'lightning',
    category: 'Intermediate',
    condition: (stats) => stats.fastestIncidentResolve <= 30 && stats.fastestIncidentResolve > 0,
    xpReward: 150
  },
  {
    id: 'scaling-master',
    name: 'Scaling Master',
    description: 'Use HPA to autoscale 3 different Deployments.',
    icon: 'expand',
    category: 'Intermediate',
    condition: (stats) => stats.hpasCreated >= 3,
    xpReward: 100
  },
  {
    id: 'ten-stars',
    name: 'Star Hoarder',
    description: 'Earn a total of 10 stars across campaign levels.',
    icon: 'stars',
    category: 'Intermediate',
    condition: (stats) => stats.totalStars >= 10,
    xpReward: 150
  },
  {
    id: 'campaign-complete',
    name: 'CKA Ready',
    description: 'Complete all 20 campaign levels.',
    icon: 'trophy',
    category: 'Advanced',
    condition: (stats) => stats.levelsCompleted >= 20,
    xpReward: 500
  },
  {
    id: 'perfect-campaign',
    name: 'Perfectionist',
    description: 'Earn 3 stars on all 20 campaign levels.',
    icon: 'crown',
    category: 'Advanced',
    condition: (stats) => stats.threeStarLevels >= 20,
    xpReward: 1000
  },
  {
    id: 'chaos-survivor',
    name: 'Chaos Survivor',
    description: 'Survive 10 minutes in Chaos Mode.',
    icon: 'fire',
    category: 'Advanced',
    condition: (stats) => stats.longestChaosSurvival >= 600,
    xpReward: 300
  },
  {
    id: 'chaos-master',
    name: 'Chaos Master',
    description: 'Survive 30 minutes in Chaos Mode.',
    icon: 'tornado',
    category: 'Advanced',
    condition: (stats) => stats.longestChaosSurvival >= 1800,
    xpReward: 750
  },
  {
    id: 'incident-slayer',
    name: 'Incident Slayer',
    description: 'Resolve 50 incidents total.',
    icon: 'sword',
    category: 'Advanced',
    condition: (stats) => stats.incidentsResolved >= 50,
    xpReward: 400
  },
  {
    id: 'architecture-expert',
    name: 'Architecture Expert',
    description: 'Achieve an Architecture Advisor score of 90+ in Sandbox.',
    icon: 'blueprint',
    category: 'Advanced',
    condition: (stats) => stats.highestArchitectureScore >= 90,
    xpReward: 500
  },
  {
    id: 'challenge-ace',
    name: 'Challenge Ace',
    description: 'Complete all 10 challenges with 3 stars.',
    icon: 'medal',
    category: 'Advanced',
    condition: (stats) => stats.threeStarChallenges >= 10,
    xpReward: 750
  },
  {
    id: 'all-resources',
    name: 'Resource Collector',
    description: 'Deploy every type of Kubernetes resource at least once.',
    icon: 'collection',
    category: 'Advanced',
    condition: (stats) => stats.uniqueResourceTypesDeployed >= 15,
    xpReward: 300
  },
  {
    id: 'fifty-commands',
    name: 'Kubectl Expert',
    description: 'Execute 50 commands in the command bar.',
    icon: 'terminal-advanced',
    category: 'Advanced',
    condition: (stats) => stats.commandsExecuted >= 50,
    xpReward: 200
  },
  {
    id: 'zero-downtime',
    name: 'Zero Downtime',
    description: 'Complete a rolling update with zero Pod failures.',
    icon: 'check-circle',
    category: 'Advanced',
    condition: (stats) => stats.zeroDowntimeUpdates >= 1,
    xpReward: 200
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Complete campaign level 1 in under 30 seconds.',
    icon: 'zap',
    category: 'Secret',
    condition: (stats) => stats.levelTimes && stats.levelTimes[1] && stats.levelTimes[1] < 30,
    xpReward: 200
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Play between midnight and 4 AM.',
    icon: 'moon',
    category: 'Secret',
    condition: (stats) => stats.playedLateNight === true,
    xpReward: 50
  },
  {
    id: 'yaml-master',
    name: 'YAML Master',
    description: 'View 50 YAML outputs.',
    icon: 'scroll',
    category: 'Secret',
    condition: (stats) => stats.yamlViewed >= 50,
    xpReward: 150
  },
  {
    id: 'cascade-handler',
    name: 'Cascade Handler',
    description: 'Resolve a cascading failure involving 3 or more incidents.',
    icon: 'domino',
    category: 'Secret',
    condition: (stats) => stats.cascadingFailuresResolved >= 1,
    xpReward: 300
  },
  {
    id: 'combo-king',
    name: 'Combo King',
    description: 'Achieve a 5x combo in Chaos Mode.',
    icon: 'fire-combo',
    category: 'Secret',
    condition: (stats) => stats.highestCombo >= 5,
    xpReward: 250
  },
  {
    id: 'secret-finder',
    name: 'Secret Finder',
    description: 'Find and fix the exposed password in campaign level 14.',
    icon: 'key',
    category: 'Secret',
    condition: (stats) => stats.foundExposedSecret === true,
    xpReward: 200
  },
  {
    id: 'no-hints',
    name: 'Self Taught',
    description: 'Complete any campaign level without using hints.',
    icon: 'brain',
    category: 'Secret',
    condition: (stats) => stats.completedWithoutHints >= 1,
    xpReward: 150
  },
  {
    id: 'restart-warrior',
    name: 'Restart Warrior',
    description: 'Fail and retry a campaign level 5 times.',
    icon: 'loop',
    category: 'Secret',
    condition: (stats) => stats.levelRetries >= 5,
    xpReward: 100
  },
  {
    id: 'sandbox-builder',
    name: 'Sandbox Architect',
    description: 'Deploy 50 resources in Sandbox mode.',
    icon: 'castle',
    category: 'Secret',
    condition: (stats) => stats.sandboxResourcesDeployed >= 50,
    xpReward: 200
  },
  {
    id: 'ten-x-combo',
    name: 'Unstoppable',
    description: 'Achieve a 10x combo in Chaos Mode.',
    icon: 'explosion',
    category: 'Secret',
    condition: (stats) => stats.highestCombo >= 10,
    xpReward: 500
  }
];

const ACHIEVEMENT_CATEGORIES = {
  Beginner: { color: '#22c55e', minLevel: 0 },
  Intermediate: { color: '#3b82f6', minLevel: 5 },
  Advanced: { color: '#a855f7', minLevel: 15 },
  Secret: { color: '#f59e0b', minLevel: 0 }
};

export { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES };
