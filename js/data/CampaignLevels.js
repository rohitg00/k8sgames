const CAMPAIGN_LEVELS = [
  {
    id: 1,
    title: 'Hello, Cluster',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'Welcome to K8s Games! Deploy your first Pod and learn the basics of Kubernetes resource management.',
    objectives: [
      { type: 'deploy', kind: 'Pod', count: 1, label: 'Deploy a Pod' },
      { type: 'deploy', kind: 'Namespace', count: 1, label: 'Create a namespace' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Namespace'],
    incidents: [],
    hints: [
      'Click the + button or use the command bar to deploy resources',
      'Namespaces help organize your cluster resources',
      'Pods are the smallest deployable unit in Kubernetes'
    ],
    starCriteria: { time: 120, efficiency: 0.8, noFailures: true },
    nextLevel: 2,
    tutorial: {
      steps: [
        { target: 'command-bar', text: 'Type "create pod" in the command bar to deploy your first Pod' },
        { target: 'cluster-view', text: 'Watch your Pod appear in the cluster visualization' },
        { target: 'inspector', text: 'Click on the Pod to inspect its details' }
      ]
    }
  },
  {
    id: 2,
    title: 'Deployment Basics',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'Learn about Deployments and how they manage Pod replicas for you.',
    objectives: [
      { type: 'deploy', kind: 'Deployment', count: 1, label: 'Create a Deployment' },
      { type: 'scale', kind: 'Deployment', replicas: 3, label: 'Scale to 3 replicas' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Namespace', name: 'default', spec: {} }
    ],
    availableResources: ['Pod', 'Deployment', 'Namespace'],
    incidents: [],
    hints: [
      'Deployments manage ReplicaSets which manage Pods',
      'Use the scale command to change replica count'
    ],
    starCriteria: { time: 180, efficiency: 0.7, noFailures: true },
    nextLevel: 3,
    tutorial: {
      steps: [
        { target: 'command-bar', text: 'Create a Deployment using "create deployment"' },
        { target: 'inspector', text: 'Select the Deployment and use "scale" to set replicas to 3' }
      ]
    }
  },
  {
    id: 3,
    title: 'Node Management',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'Add more nodes to your cluster and understand scheduling.',
    objectives: [
      { type: 'deploy', kind: 'Node', count: 3, label: 'Have 3 nodes running' },
      { type: 'deploy', kind: 'Pod', count: 6, label: 'Run 6 Pods across nodes' },
      { type: 'distribute', minNodes: 2, label: 'Pods on at least 2 different nodes' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Deployment', 'Node', 'Namespace'],
    incidents: [],
    hints: [
      'Add nodes to increase cluster capacity',
      'The scheduler automatically distributes Pods across nodes'
    ],
    starCriteria: { time: 240, efficiency: 0.7, noFailures: true },
    nextLevel: 4,
    tutorial: null
  },
  {
    id: 4,
    title: 'First Incident',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'A Pod is crashing! Learn to investigate and resolve your first incident.',
    objectives: [
      { type: 'resolve', incidentType: 'CrashLoopBackOff', count: 1, label: 'Fix the crashing Pod' },
      { type: 'uptime', percentage: 95, label: 'Maintain 95% cluster health' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'web-app', spec: { replicas: 3, image: 'nginx:latest' } }
    ],
    availableResources: ['Pod', 'Deployment', 'Node'],
    incidents: [
      { type: 'CrashLoopBackOff', triggerTime: 10, target: 'web-app', severity: 2 }
    ],
    hints: [
      'Click on the red-glowing Pod to investigate',
      'Check the logs to find the root cause',
      'Apply the fix action from the investigation panel'
    ],
    starCriteria: { time: 180, efficiency: 0.8, noFailures: false },
    nextLevel: 5
  },
  {
    id: 5,
    title: 'ReplicaSet Reliability',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'Deploy workloads with proper replica counts and self-healing.',
    objectives: [
      { type: 'deploy', kind: 'Deployment', count: 3, label: 'Run 3 Deployments' },
      { type: 'replicas', minPerDeployment: 2, label: 'At least 2 replicas per Deployment' },
      { type: 'resolve', incidentType: 'PodEviction', count: 2, label: 'Handle 2 Pod evictions' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Deployment', 'ReplicaSet', 'Node'],
    incidents: [
      { type: 'PodEviction', triggerTime: 30, target: 'random', severity: 2 },
      { type: 'PodEviction', triggerTime: 60, target: 'random', severity: 2 }
    ],
    hints: [
      'Deployments with multiple replicas survive Pod failures',
      'Kubernetes automatically reschedules evicted Pods'
    ],
    starCriteria: { time: 300, efficiency: 0.75, noFailures: false },
    nextLevel: 6
  },
  {
    id: 6,
    title: 'DaemonSet Deployment',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'Deploy a DaemonSet to run monitoring agents on every node.',
    objectives: [
      { type: 'deploy', kind: 'DaemonSet', count: 1, label: 'Create a DaemonSet' },
      { type: 'coverage', kind: 'DaemonSet', allNodes: true, label: 'DaemonSet running on all nodes' },
      { type: 'deploy', kind: 'Node', count: 4, label: 'Scale to 4 nodes' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Deployment', 'DaemonSet', 'Node'],
    incidents: [],
    hints: [
      'DaemonSets ensure one Pod per node',
      'Adding a new node automatically gets a DaemonSet Pod'
    ],
    starCriteria: { time: 240, efficiency: 0.8, noFailures: true },
    nextLevel: 7
  },
  {
    id: 7,
    title: 'Job Scheduler',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'Run batch workloads with Jobs and CronJobs.',
    objectives: [
      { type: 'deploy', kind: 'Job', count: 2, label: 'Run 2 Jobs to completion' },
      { type: 'deploy', kind: 'CronJob', count: 1, label: 'Create a CronJob' },
      { type: 'complete', kind: 'Job', count: 2, label: 'Jobs finish successfully' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Namespace', name: 'batch', spec: {} }
    ],
    availableResources: ['Pod', 'Job', 'CronJob', 'Node'],
    incidents: [
      { type: 'JobDeadlineExceeded', triggerTime: 45, target: 'batch-job', severity: 1 }
    ],
    hints: [
      'Jobs run tasks to completion, unlike Deployments',
      'CronJobs schedule Jobs on a time-based schedule'
    ],
    starCriteria: { time: 300, efficiency: 0.7, noFailures: false },
    nextLevel: 8
  },
  {
    id: 8,
    title: 'Rolling Updates',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'Perform a rolling update and handle a failed rollout.',
    objectives: [
      { type: 'update', kind: 'Deployment', count: 1, label: 'Perform a rolling update' },
      { type: 'rollback', count: 1, label: 'Rollback a failed deployment' },
      { type: 'uptime', percentage: 90, label: 'Maintain 90% availability during updates' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'api-server', spec: { replicas: 4, image: 'api:v1', strategy: 'RollingUpdate' } }
    ],
    availableResources: ['Pod', 'Deployment', 'ReplicaSet'],
    incidents: [
      { type: 'ImagePullBackOff', triggerTime: 20, target: 'api-server', severity: 3 }
    ],
    hints: [
      'Rolling updates gradually replace old Pods with new ones',
      'Use rollback when a new version has issues'
    ],
    starCriteria: { time: 240, efficiency: 0.8, noFailures: false },
    nextLevel: 9
  },
  {
    id: 9,
    title: 'Service Discovery',
    chapter: 3,
    chapterName: 'Networking',
    description: 'Expose your Deployments with Services and learn about ClusterIP vs NodePort.',
    objectives: [
      { type: 'deploy', kind: 'Service', count: 2, label: 'Create 2 Services' },
      { type: 'connect', from: 'frontend', to: 'backend', label: 'Connect frontend to backend via Service' },
      { type: 'serviceType', kind: 'NodePort', count: 1, label: 'Create a NodePort Service' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'frontend', spec: { replicas: 2, image: 'nginx:latest' } },
      { kind: 'Deployment', name: 'backend', spec: { replicas: 2, image: 'node:18' } }
    ],
    availableResources: ['Pod', 'Deployment', 'Service'],
    incidents: [],
    hints: [
      'Services provide stable DNS names for Pods',
      'ClusterIP is internal, NodePort exposes externally'
    ],
    starCriteria: { time: 300, efficiency: 0.75, noFailures: true },
    nextLevel: 10
  },
  {
    id: 10,
    title: 'Ingress Gateway',
    chapter: 3,
    chapterName: 'Networking',
    description: 'Set up Ingress routing to expose multiple services through a single entry point.',
    objectives: [
      { type: 'deploy', kind: 'Ingress', count: 1, label: 'Create an Ingress' },
      { type: 'route', paths: ['/api', '/web'], label: 'Route /api and /web to different services' },
      { type: 'tls', enabled: true, label: 'Enable TLS on Ingress' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'web', spec: { replicas: 2, image: 'nginx:latest' } },
      { kind: 'Service', name: 'web-svc', spec: { type: 'ClusterIP', port: 80, targetPort: 80 } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, image: 'node:18' } },
      { kind: 'Service', name: 'api-svc', spec: { type: 'ClusterIP', port: 3000, targetPort: 3000 } }
    ],
    availableResources: ['Service', 'Ingress', 'Secret'],
    incidents: [],
    hints: [
      'Ingress routes external HTTP traffic to internal Services',
      'Create a TLS Secret for HTTPS support'
    ],
    starCriteria: { time: 360, efficiency: 0.7, noFailures: true },
    nextLevel: 11
  },
  {
    id: 11,
    title: 'Network Lockdown',
    chapter: 3,
    chapterName: 'Networking',
    description: 'Implement NetworkPolicies to control traffic between namespaces.',
    objectives: [
      { type: 'deploy', kind: 'NetworkPolicy', count: 2, label: 'Create 2 NetworkPolicies' },
      { type: 'isolate', namespace: 'database', label: 'Isolate database namespace' },
      { type: 'allow', from: 'backend', to: 'database', label: 'Allow only backend to reach database' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Namespace', name: 'frontend', spec: {} },
      { kind: 'Namespace', name: 'backend', spec: {} },
      { kind: 'Namespace', name: 'database', spec: {} },
      { kind: 'Deployment', name: 'web', spec: { replicas: 2, namespace: 'frontend' } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, namespace: 'backend' } },
      { kind: 'Deployment', name: 'postgres', spec: { replicas: 1, namespace: 'database' } }
    ],
    availableResources: ['NetworkPolicy', 'Service'],
    incidents: [
      { type: 'UnauthorizedAccess', triggerTime: 30, target: 'database', severity: 4 }
    ],
    hints: [
      'Default deny policies block all traffic, then allow specific routes',
      'Use namespace selectors in NetworkPolicy rules'
    ],
    starCriteria: { time: 360, efficiency: 0.7, noFailures: false },
    nextLevel: 12
  },
  {
    id: 12,
    title: 'DNS Debugging',
    chapter: 3,
    chapterName: 'Networking',
    description: 'CoreDNS is misbehaving! Fix DNS resolution across the cluster.',
    objectives: [
      { type: 'resolve', incidentType: 'DNSResolutionFailure', count: 1, label: 'Fix DNS resolution' },
      { type: 'verify', kind: 'Service', dnsWorking: true, label: 'All Services resolvable by DNS' },
      { type: 'deploy', kind: 'NetworkPolicy', count: 1, label: 'Allow DNS traffic in policies' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'coredns', spec: { replicas: 2, namespace: 'kube-system' } },
      { kind: 'Service', name: 'kube-dns', spec: { namespace: 'kube-system', port: 53 } },
      { kind: 'Deployment', name: 'app', spec: { replicas: 3 } },
      { kind: 'Service', name: 'app-svc', spec: { port: 8080 } },
      { kind: 'NetworkPolicy', name: 'deny-all', spec: { policyTypes: ['Ingress', 'Egress'] } }
    ],
    availableResources: ['NetworkPolicy', 'Service', 'Pod'],
    incidents: [
      { type: 'DNSResolutionFailure', triggerTime: 5, target: 'kube-dns', severity: 4 }
    ],
    hints: [
      'DNS runs as a Service in kube-system namespace',
      'NetworkPolicies might be blocking DNS traffic on port 53',
      'Check CoreDNS Pod logs for errors'
    ],
    starCriteria: { time: 300, efficiency: 0.7, noFailures: false },
    nextLevel: 13
  },
  {
    id: 13,
    title: 'ConfigMap Essentials',
    chapter: 4,
    chapterName: 'State & Config',
    description: 'Manage application configuration with ConfigMaps and environment variables.',
    objectives: [
      { type: 'deploy', kind: 'ConfigMap', count: 2, label: 'Create 2 ConfigMaps' },
      { type: 'mount', kind: 'ConfigMap', count: 1, label: 'Mount a ConfigMap as volume' },
      { type: 'envFrom', kind: 'ConfigMap', count: 1, label: 'Use ConfigMap as env vars' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'app', spec: { replicas: 2, image: 'app:v1' } }
    ],
    availableResources: ['ConfigMap', 'Secret', 'Pod', 'Deployment'],
    incidents: [],
    hints: [
      'ConfigMaps store non-sensitive configuration data',
      'Mount as volume or inject as environment variables'
    ],
    starCriteria: { time: 240, efficiency: 0.8, noFailures: true },
    nextLevel: 14
  },
  {
    id: 14,
    title: 'Secret Operations',
    chapter: 4,
    chapterName: 'State & Config',
    description: 'Handle sensitive data with Kubernetes Secrets and protect database credentials.',
    objectives: [
      { type: 'deploy', kind: 'Secret', count: 2, label: 'Create 2 Secrets' },
      { type: 'mount', kind: 'Secret', count: 1, label: 'Mount Secret to a Pod' },
      { type: 'noConfigMap', sensitive: true, label: 'No passwords in ConfigMaps' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2 } },
      { kind: 'Deployment', name: 'database', spec: { replicas: 1 } },
      { kind: 'ConfigMap', name: 'db-config', spec: { data: { DB_HOST: 'postgres', DB_PORT: '5432', DB_PASSWORD: 'exposed123' } } }
    ],
    availableResources: ['ConfigMap', 'Secret', 'Pod', 'Deployment'],
    incidents: [
      { type: 'SecretExposed', triggerTime: 15, target: 'db-config', severity: 4 }
    ],
    hints: [
      'Secrets are base64 encoded (not encrypted!) — use encryption at rest for true security',
      'Move sensitive data from ConfigMaps to Secrets',
      'The password in db-config ConfigMap is a security issue'
    ],
    starCriteria: { time: 300, efficiency: 0.75, noFailures: false },
    nextLevel: 15
  },
  {
    id: 15,
    title: 'Persistent Storage',
    chapter: 4,
    chapterName: 'State & Config',
    description: 'Set up PersistentVolumes and PersistentVolumeClaims for stateful workloads.',
    objectives: [
      { type: 'deploy', kind: 'PersistentVolume', count: 2, label: 'Create 2 PersistentVolumes' },
      { type: 'deploy', kind: 'PersistentVolumeClaim', count: 2, label: 'Create 2 PVCs' },
      { type: 'bound', kind: 'PersistentVolumeClaim', count: 2, label: 'Both PVCs bound to PVs' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'database', spec: { replicas: 1 } }
    ],
    availableResources: ['PersistentVolume', 'PersistentVolumeClaim', 'StorageClass', 'StatefulSet'],
    incidents: [],
    hints: [
      'PVs are cluster resources, PVCs are namespace-scoped requests',
      'PVC storage size must be <= PV capacity'
    ],
    starCriteria: { time: 300, efficiency: 0.75, noFailures: true },
    nextLevel: 16
  },
  {
    id: 16,
    title: 'StatefulSet Database',
    chapter: 4,
    chapterName: 'State & Config',
    description: 'Deploy a StatefulSet with ordered startup, stable network IDs, and persistent storage.',
    objectives: [
      { type: 'deploy', kind: 'StatefulSet', count: 1, label: 'Create a StatefulSet' },
      { type: 'scale', kind: 'StatefulSet', replicas: 3, label: 'Scale to 3 replicas' },
      { type: 'headless', kind: 'Service', count: 1, label: 'Create a headless Service' },
      { type: 'stable', kind: 'StatefulSet', label: 'Pods have stable network identities' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'PersistentVolume', name: 'pv-1', spec: { capacity: '10Gi' } },
      { kind: 'PersistentVolume', name: 'pv-2', spec: { capacity: '10Gi' } },
      { kind: 'PersistentVolume', name: 'pv-3', spec: { capacity: '10Gi' } }
    ],
    availableResources: ['StatefulSet', 'Service', 'PersistentVolumeClaim', 'ConfigMap'],
    incidents: [
      { type: 'PodStuckTerminating', triggerTime: 60, target: 'statefulset-pod', severity: 2 }
    ],
    hints: [
      'StatefulSets provide stable, unique network identifiers',
      'Headless Services (clusterIP: None) enable direct Pod DNS',
      'StatefulSet Pods are created in order: pod-0, pod-1, pod-2'
    ],
    starCriteria: { time: 360, efficiency: 0.7, noFailures: false },
    nextLevel: 17
  },
  {
    id: 17,
    title: 'Production Readiness',
    chapter: 5,
    chapterName: 'Production',
    description: 'Configure resource requests, limits, liveness and readiness probes.',
    objectives: [
      { type: 'resources', kind: 'Deployment', configured: true, label: 'Set resource requests and limits' },
      { type: 'probes', kind: 'Deployment', liveness: true, readiness: true, label: 'Configure liveness and readiness probes' },
      { type: 'hpa', count: 1, label: 'Set up Horizontal Pod Autoscaler' },
      { type: 'resolve', incidentType: 'OOMKilled', count: 1, label: 'Fix OOMKilled Pod' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'web', spec: { replicas: 3, image: 'web:v2' } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, image: 'api:v3' } },
      { kind: 'Service', name: 'web-svc', spec: { port: 80 } },
      { kind: 'Service', name: 'api-svc', spec: { port: 3000 } }
    ],
    availableResources: ['HorizontalPodAutoscaler', 'Pod', 'Deployment'],
    incidents: [
      { type: 'OOMKilled', triggerTime: 20, target: 'api', severity: 3 },
      { type: 'ReadinessProbeFailure', triggerTime: 45, target: 'web', severity: 2 }
    ],
    hints: [
      'Resource requests guarantee minimum CPU/memory',
      'Resource limits cap maximum usage',
      'Liveness probes restart unhealthy containers',
      'Readiness probes remove Pods from Service endpoints'
    ],
    starCriteria: { time: 420, efficiency: 0.7, noFailures: false },
    nextLevel: 18
  },
  {
    id: 18,
    title: 'RBAC Fortress',
    chapter: 5,
    chapterName: 'Production',
    description: 'Implement Role-Based Access Control to secure your cluster.',
    objectives: [
      { type: 'deploy', kind: 'Role', count: 2, label: 'Create 2 Roles' },
      { type: 'deploy', kind: 'RoleBinding', count: 2, label: 'Create 2 RoleBindings' },
      { type: 'deploy', kind: 'ServiceAccount', count: 2, label: 'Create 2 ServiceAccounts' },
      { type: 'leastPrivilege', label: 'No Role grants wildcard permissions' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Namespace', name: 'dev', spec: {} },
      { kind: 'Namespace', name: 'prod', spec: {} },
      { kind: 'Deployment', name: 'app', spec: { replicas: 2, namespace: 'prod' } },
      { kind: 'ServiceAccount', name: 'admin', spec: { namespace: 'default', wildcard: true } }
    ],
    availableResources: ['Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding', 'ServiceAccount'],
    incidents: [
      { type: 'UnauthorizedAccess', triggerTime: 25, target: 'admin-sa', severity: 5 }
    ],
    hints: [
      'Principle of least privilege: grant only needed permissions',
      'Roles are namespace-scoped, ClusterRoles are cluster-wide',
      'RoleBindings connect Roles to ServiceAccounts'
    ],
    starCriteria: { time: 420, efficiency: 0.7, noFailures: false },
    nextLevel: 19
  },
  {
    id: 19,
    title: 'Multi-Node Outage',
    chapter: 5,
    chapterName: 'Production',
    description: 'A critical incident! Two nodes go down simultaneously. Keep services running.',
    objectives: [
      { type: 'resolve', incidentType: 'NodeNotReady', count: 2, label: 'Recover 2 failed nodes' },
      { type: 'uptime', percentage: 80, label: 'Maintain 80% service availability' },
      { type: 'reschedule', count: 5, label: 'Reschedule 5 evicted Pods' },
      { type: 'pdb', count: 1, label: 'Create a PodDisruptionBudget' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-4', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'web', spec: { replicas: 4 } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 3 } },
      { kind: 'Deployment', name: 'worker', spec: { replicas: 2 } },
      { kind: 'Service', name: 'web-svc', spec: { port: 80 } },
      { kind: 'Service', name: 'api-svc', spec: { port: 3000 } }
    ],
    availableResources: ['Node', 'Pod', 'Deployment', 'PodDisruptionBudget'],
    incidents: [
      { type: 'NodeNotReady', triggerTime: 10, target: 'node-2', severity: 5 },
      { type: 'NodeNotReady', triggerTime: 15, target: 'node-3', severity: 5 },
      { type: 'PodEviction', triggerTime: 20, target: 'multiple', severity: 3 }
    ],
    hints: [
      'Cordon unhealthy nodes to prevent new scheduling',
      'Drain nodes before performing maintenance',
      'PodDisruptionBudgets prevent too many Pods going down at once'
    ],
    starCriteria: { time: 480, efficiency: 0.6, noFailures: false },
    nextLevel: 20
  },
  {
    id: 20,
    title: 'Full Stack Production',
    chapter: 5,
    chapterName: 'Production',
    description: 'The final challenge: build a complete production-grade Kubernetes deployment from scratch.',
    objectives: [
      { type: 'deploy', kind: 'Namespace', count: 3, label: 'Create 3 namespaces (frontend, backend, data)' },
      { type: 'deploy', kind: 'Deployment', count: 4, label: 'Deploy 4 applications' },
      { type: 'deploy', kind: 'Service', count: 4, label: 'Expose all Deployments' },
      { type: 'deploy', kind: 'Ingress', count: 1, label: 'Set up Ingress routing' },
      { type: 'deploy', kind: 'NetworkPolicy', count: 2, label: 'Implement network segmentation' },
      { type: 'deploy', kind: 'Secret', count: 1, label: 'Store credentials in Secrets' },
      { type: 'deploy', kind: 'HorizontalPodAutoscaler', count: 1, label: 'Configure autoscaling' },
      { type: 'probes', kind: 'Deployment', liveness: true, readiness: true, label: 'All Deployments have probes' },
      { type: 'architectureScore', minScore: 75, label: 'Architecture Advisor score >= 75' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '16', memory: '32Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '16', memory: '32Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-3', spec: { cpu: '16', memory: '32Gi', status: 'Ready' } }
    ],
    availableResources: [
      'Namespace', 'Pod', 'Deployment', 'Service', 'Ingress', 'ConfigMap', 'Secret',
      'NetworkPolicy', 'PersistentVolume', 'PersistentVolumeClaim', 'StatefulSet',
      'HorizontalPodAutoscaler', 'Role', 'RoleBinding', 'ServiceAccount'
    ],
    incidents: [
      { type: 'CrashLoopBackOff', triggerTime: 60, target: 'random', severity: 2 },
      { type: 'NodeNotReady', triggerTime: 120, target: 'node-2', severity: 4 },
      { type: 'DNSResolutionFailure', triggerTime: 180, target: 'kube-dns', severity: 3 }
    ],
    hints: [
      'Start with namespaces and core Deployments',
      'Add Services before Ingress',
      'Network Policies and RBAC improve your architecture score'
    ],
    starCriteria: { time: 900, efficiency: 0.6, noFailures: false },
    nextLevel: null
  }
];

const CHAPTERS = [
  { id: 1, name: 'Foundations', levels: [1, 2, 3, 4], description: 'Learn the basics of Kubernetes' },
  { id: 2, name: 'Workloads', levels: [5, 6, 7, 8], description: 'Master workload management' },
  { id: 3, name: 'Networking', levels: [9, 10, 11, 12], description: 'Connect and secure services' },
  { id: 4, name: 'State & Config', levels: [13, 14, 15, 16], description: 'Manage state and configuration' },
  { id: 5, name: 'Production', levels: [17, 18, 19, 20], description: 'Build production-grade clusters' }
];

export { CAMPAIGN_LEVELS, CHAPTERS };
