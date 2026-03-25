const CAMPAIGN_LEVELS = [
  {
    id: 1,
    title: 'Your First Pod',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'A Pod is the smallest deployable unit in Kubernetes. It wraps one or more containers that share a network namespace and storage volumes. Every container you run in K8s lives inside a Pod. In this level you will create a Pod, then organize resources using a Namespace.',
    objectives: [
      { type: 'deploy', kind: 'Pod', count: 1, label: 'Deploy a Pod (the atomic unit of K8s)' },
      { type: 'deploy', kind: 'Namespace', count: 1, label: 'Create a Namespace to isolate resources' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Namespace'],
    incidents: [],
    hints: [
      'Type "kubectl run my-pod --image=nginx" — this creates a Pod running the nginx container image',
      'Type "kubectl create namespace staging" — Namespaces are virtual clusters inside your physical cluster',
      'Click a Pod to inspect it: see its phase (Pending -> ContainerCreating -> Running), IP, and conditions'
    ],
    starCriteria: { time: 120, efficiency: 0.8, noFailures: true },
    nextLevel: 2,
    tutorial: {
      steps: [
        { target: 'command-bar', text: 'Press / to open the kubectl command bar. Type "kubectl run web --image=nginx" to create a Pod.' },
        { target: 'cluster-view', text: 'Your Pod transitions through phases: Pending (waiting for a node) -> ContainerCreating (pulling image) -> Running. Watch it happen.' },
        { target: 'inspector', text: 'Click the Pod to open the Inspector. The "Describe" tab shows the same output as "kubectl describe pod".' }
      ]
    }
  },
  {
    id: 2,
    title: 'Deployments & ReplicaSets',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'In production, you never create bare Pods. A Deployment declares a desired state (e.g., "run 3 replicas of nginx") and creates a ReplicaSet to maintain it. The ReplicaSet controller watches actual vs desired Pod count and creates or deletes Pods to converge. This is the reconciliation loop that makes Kubernetes self-healing.',
    objectives: [
      { type: 'deploy', kind: 'Deployment', count: 1, label: 'Create a Deployment (declares desired Pod state)' },
      { type: 'scale', kind: 'Deployment', replicas: 3, label: 'Scale to 3 replicas — the ReplicaSet ensures convergence' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Deployment', 'Namespace'],
    incidents: [],
    hints: [
      'Type "kubectl create deployment web" — notice the ownership chain: Deployment -> ReplicaSet -> Pods',
      'Type "kubectl scale deployment web --replicas=3" — the ReplicaSet controller creates 2 more Pods',
      'Try deleting a Pod ("kubectl delete pod <name>"). The ReplicaSet detects drift and recreates it.'
    ],
    starCriteria: { time: 180, efficiency: 0.7, noFailures: true },
    nextLevel: 3,
    tutorial: {
      steps: [
        { target: 'command-bar', text: 'Create a Deployment. Kubernetes auto-generates a ReplicaSet — click it to see the ownership chain.' },
        { target: 'inspector', text: 'Select the Deployment. The "Describe" tab shows replicas, strategy, and conditions. Scale it to 3.' }
      ]
    }
  },
  {
    id: 3,
    title: 'Scheduling & Multi-Node Clusters',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'The kube-scheduler assigns Pods to Nodes. It scores each Node based on available CPU/memory, affinity rules, and taints/tolerations, then binds the Pod to the best-scoring Node. Spreading Pods across multiple Nodes provides high availability — if one Node dies, Pods on other Nodes keep serving traffic.',
    objectives: [
      { type: 'deploy', kind: 'Node', count: 3, label: 'Expand to 3 Nodes (simulates adding machines)' },
      { type: 'deploy', kind: 'Pod', count: 6, label: 'Run 6 Pods — the scheduler distributes them' },
      { type: 'distribute', minNodes: 2, label: 'Pods scheduled on at least 2 different Nodes' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Deployment', 'Node', 'Namespace'],
    incidents: [],
    hints: [
      'Add Nodes with "kubectl create node" — each Node registers with the API server and reports capacity',
      'Create a Deployment with replicas: 3 — the scheduler places Pods on Nodes with available resources',
      'Click a Node to inspect its allocatable CPU/memory and current Pod count. Pods show their assigned nodeName.'
    ],
    starCriteria: { time: 240, efficiency: 0.7, noFailures: true },
    nextLevel: 4,
    tutorial: null
  },
  {
    id: 4,
    title: 'CrashLoopBackOff',
    chapter: 1,
    chapterName: 'Foundations',
    description: 'CrashLoopBackOff is the most common Pod failure. It means the container starts, crashes, and Kubernetes restarts it with exponential backoff (10s, 20s, 40s... up to 5 minutes). The kubelet tracks restartCount on the container status. You diagnose it with "kubectl describe pod" (Events section) and "kubectl logs --previous" (crash output from the last container run).',
    objectives: [
      { type: 'resolve', incidentType: 'CrashLoopBackOff', count: 1, label: 'Diagnose and resolve the CrashLoopBackOff' },
      { type: 'uptime', percentage: 95, label: 'Keep cluster health above 95%' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'web-app', spec: { replicas: 3, template: { spec: { containers: [{ name: 'main', image: 'nginx:latest' }] } } } }
    ],
    availableResources: ['Pod', 'Deployment', 'Node'],
    incidents: [
      { type: 'CrashLoopBackOff', triggerTime: 10, target: 'web-app', severity: 2 }
    ],
    hints: [
      'Click the red-pulsing Pod — the Inspector shows restartCount incrementing and container state: Waiting (CrashLoopBackOff)',
      'Right-click the Pod -> "Investigate". In real K8s, you would run: kubectl describe pod <name> and kubectl logs <name> --previous',
      'Common CrashLoop causes: wrong image tag, missing env vars, OOM, bad entrypoint command. Apply the fix to resolve.'
    ],
    starCriteria: { time: 180, efficiency: 0.8, noFailures: false },
    nextLevel: 5
  },
  {
    id: 5,
    title: 'Self-Healing & Pod Eviction',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'When a Node runs low on memory or disk, the kubelet evicts Pods in priority order (BestEffort first, then Burstable, then Guaranteed). The ReplicaSet controller detects the Pod count dropped below desired and schedules replacements on healthy Nodes. Running replicas > 1 is the difference between "outage" and "transparent failover".',
    objectives: [
      { type: 'deploy', kind: 'Deployment', count: 3, label: 'Run 3 Deployments (different microservices)' },
      { type: 'replicas', minPerDeployment: 2, label: 'At least 2 replicas each — single replicas have zero fault tolerance' },
      { type: 'resolve', incidentType: 'PodEviction', count: 2, label: 'Survive 2 Pod evictions without downtime' }
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
      'Create 3 Deployments (e.g., web, api, worker) and scale each to 2+ replicas with "kubectl scale"',
      'When eviction hits, the ReplicaSet creates a replacement Pod automatically. Investigate the incident to clear it.',
      'QoS classes (Guaranteed > Burstable > BestEffort) determine eviction priority — set resource requests to avoid BestEffort'
    ],
    starCriteria: { time: 300, efficiency: 0.75, noFailures: false },
    nextLevel: 6
  },
  {
    id: 6,
    title: 'DaemonSets: One Pod Per Node',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'A DaemonSet ensures exactly one Pod runs on every (or selected) Node. When you add a Node, the DaemonSet controller automatically creates a Pod on it. When you remove a Node, that Pod is garbage collected. DaemonSets are used for node-level agents: log collectors (Fluentd), monitoring exporters (node-exporter), CNI plugins, and storage drivers.',
    objectives: [
      { type: 'deploy', kind: 'DaemonSet', count: 1, label: 'Create a DaemonSet (e.g., log-collector)' },
      { type: 'deploy', kind: 'Node', count: 4, label: 'Scale to 4 Nodes — DaemonSet auto-creates Pods on each' },
      { type: 'coverage', kind: 'DaemonSet', allNodes: true, label: 'Verify DaemonSet has a Pod running on every Node' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
    ],
    availableResources: ['Pod', 'Deployment', 'DaemonSet', 'Node'],
    incidents: [],
    hints: [
      'Create a DaemonSet from the + menu. Unlike Deployments, DaemonSets ignore replica count — they match to Nodes.',
      'Add 2 more Nodes with "kubectl create node". The DaemonSet controller schedules a Pod on each new Node automatically.',
      'DaemonSet Pods have tolerations for node taints like NoSchedule. Click the DaemonSet to see desiredNumberScheduled vs currentNumberScheduled.'
    ],
    starCriteria: { time: 240, efficiency: 0.8, noFailures: true },
    nextLevel: 7
  },
  {
    id: 7,
    title: 'Jobs & CronJobs: Batch Processing',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'Jobs run Pods to completion, not continuously. A Job creates Pods, tracks successes against spec.completions, and marks itself Complete when enough Pods finish (exit code 0). If a Pod fails, the Job retries up to spec.backoffLimit. CronJobs extend this with a schedule (cron syntax) to create Jobs periodically — like a Kubernetes-native crontab.',
    objectives: [
      { type: 'deploy', kind: 'Job', count: 2, label: 'Create 2 Jobs (they run Pods to exit 0)' },
      { type: 'complete', kind: 'Job', count: 2, label: 'Both Jobs reach "Complete" phase' },
      { type: 'deploy', kind: 'CronJob', count: 1, label: 'Create a CronJob (scheduled Job creator)' }
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
      'Create Jobs with "kubectl create job". Watch the Pod run through Pending -> Running -> Succeeded. The Job tracks spec.completions vs status.succeeded.',
      'The CronJob spec.schedule uses cron syntax ("*/5 * * * *" = every 5 min). It creates child Jobs on the schedule.',
      'If a Job exceeds activeDeadlineSeconds or Pods fail past backoffLimit (default: 6), the Job fails. Investigate the incident to clear it.'
    ],
    starCriteria: { time: 300, efficiency: 0.7, noFailures: false },
    nextLevel: 8
  },
  {
    id: 8,
    title: 'Rolling Updates & Rollbacks',
    chapter: 2,
    chapterName: 'Workloads',
    description: 'When you update a Deployment (e.g., change the container image), K8s creates a new ReplicaSet and gradually scales it up while scaling the old one down. The strategy.rollingUpdate.maxSurge controls how many extra Pods can exist, and maxUnavailable controls how many can be missing. If the new Pods fail (ImagePullBackOff, CrashLoop), you rollback with "kubectl rollout undo" which switches back to the previous ReplicaSet.',
    objectives: [
      { type: 'update', kind: 'Deployment', count: 1, label: 'Trigger a rolling update (new ReplicaSet created)' },
      { type: 'rollback', count: 1, label: 'Rollback when the new image fails to pull' },
      { type: 'uptime', percentage: 90, label: 'Maintain 90% availability during the rollout' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'api-server', spec: { replicas: 4, strategy: { type: 'RollingUpdate' }, template: { spec: { containers: [{ name: 'main', image: 'api:v1' }] } } } }
    ],
    availableResources: ['Pod', 'Deployment', 'ReplicaSet'],
    incidents: [
      { type: 'ImagePullBackOff', triggerTime: 20, target: 'api-server', severity: 3 }
    ],
    hints: [
      'Right-click api-server -> "Rolling Update". K8s creates a new ReplicaSet and gradually shifts Pods. Watch the old RS scale down as the new RS scales up.',
      'ImagePullBackOff means the image tag does not exist in the registry. Run "kubectl rollout undo deployment api-server" to revert to the previous ReplicaSet.',
      'Check "kubectl rollout status" and "kubectl rollout history" to monitor. The Deployment keeps spec.revisionHistoryLimit old ReplicaSets for rollback.'
    ],
    starCriteria: { time: 240, efficiency: 0.8, noFailures: false },
    nextLevel: 9
  },
  {
    id: 9,
    title: 'Services & Service Discovery',
    chapter: 3,
    chapterName: 'Networking',
    description: 'Pods get random IPs that change on restart. A Service provides a stable virtual IP (ClusterIP) and DNS name (svc-name.namespace.svc.cluster.local) that routes to a set of Pods matched by label selector. ClusterIP is internal-only. NodePort opens a port (30000-32767) on every Node to expose the Service externally. LoadBalancer provisions a cloud load balancer in front.',
    objectives: [
      { type: 'deploy', kind: 'Service', count: 2, label: 'Create 2 Services (stable endpoints for Pods)' },
      { type: 'connect', from: 'frontend', to: 'backend', label: 'Wire a Service to the backend Deployment via label selector' },
      { type: 'serviceType', kind: 'NodePort', count: 1, label: 'Create a NodePort Service (externally accessible)' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'frontend', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'nginx:latest' }] } } } },
      { kind: 'Deployment', name: 'backend', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'node:18' }] } } } }
    ],
    availableResources: ['Pod', 'Deployment', 'Service'],
    incidents: [],
    hints: [
      'Create a Service named "backend" or "backend-svc" with spec.selector matching the backend Pod labels (e.g., app=backend). The Service discovers Pods via label matching.',
      'For NodePort, create a Service with spec.type: "NodePort". K8s assigns a random port in 30000-32767. Pods are reachable at <NodeIP>:<NodePort>.',
      'Watch the connection lines in the cluster view — they show Service-to-Pod routing based on selectors. No selector match = no endpoints.'
    ],
    starCriteria: { time: 300, efficiency: 0.75, noFailures: true },
    nextLevel: 10
  },
  {
    id: 10,
    title: 'Ingress: L7 HTTP Routing',
    chapter: 3,
    chapterName: 'Networking',
    description: 'Ingress is an L7 (HTTP) routing layer that sits in front of Services. Instead of exposing each Service via NodePort, you define routing rules: host-based (api.example.com -> api-svc) or path-based (/api -> api-svc, /web -> web-svc). An Ingress Controller (nginx, traefik, envoy) reads the Ingress resource and configures the reverse proxy. TLS termination happens at the Ingress using a kubernetes.io/tls Secret.',
    objectives: [
      { type: 'deploy', kind: 'Ingress', count: 1, label: 'Create an Ingress resource (L7 routing rules)' },
      { type: 'route', paths: ['/api', '/web'], label: 'Define path-based routing: /api -> api-svc, /web -> web-svc' },
      { type: 'tls', enabled: true, label: 'Enable HTTPS by adding TLS with a Secret' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'web', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'nginx:latest' }] } } } },
      { kind: 'Service', name: 'web-svc', spec: { type: 'ClusterIP', port: 80, targetPort: 80 } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'node:18' }] } } } },
      { kind: 'Service', name: 'api-svc', spec: { type: 'ClusterIP', port: 3000, targetPort: 3000 } }
    ],
    availableResources: ['Service', 'Ingress', 'Secret'],
    incidents: [],
    hints: [
      'Create an Ingress with spec.rules containing paths /api (backend: api-svc:3000) and /web (backend: web-svc:80). This is path-based routing via the Ingress Controller.',
      'For TLS, first create a Secret of type kubernetes.io/tls, then reference it in the Ingress spec.tls section with the matching host.',
      'Without an Ingress, every Service needs its own NodePort or LoadBalancer. Ingress consolidates all HTTP routing behind one IP.'
    ],
    starCriteria: { time: 360, efficiency: 0.7, noFailures: true },
    nextLevel: 11
  },
  {
    id: 11,
    title: 'NetworkPolicies: Zero Trust',
    chapter: 3,
    chapterName: 'Networking',
    description: 'By default, all Pods can talk to all other Pods (flat network). NetworkPolicy implements "zero trust" — deny everything, then explicitly allow needed paths. A policy with an empty podSelector ({}) selects all Pods in the namespace. The policyTypes field (Ingress, Egress) determines what is restricted. Without any NetworkPolicy, all traffic is allowed. The moment you create one, everything not explicitly allowed is denied.',
    objectives: [
      { type: 'deploy', kind: 'NetworkPolicy', count: 2, label: 'Create 2 NetworkPolicies (deny-all + allow rule)' },
      { type: 'isolate', namespace: 'database', label: 'Isolate the database namespace (deny all ingress)' },
      { type: 'allow', from: 'backend', to: 'database', label: 'Allow only backend namespace to reach database' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Namespace', name: 'frontend', spec: {} },
      { kind: 'Namespace', name: 'backend', spec: {} },
      { kind: 'Namespace', name: 'database', spec: {} },
      { kind: 'Deployment', name: 'web', spec: { replicas: 2, namespace: 'frontend', template: { spec: { containers: [{ name: 'main', image: 'nginx:latest' }] } } } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, namespace: 'backend', template: { spec: { containers: [{ name: 'main', image: 'node:18' }] } } } },
      { kind: 'Deployment', name: 'postgres', spec: { replicas: 1, namespace: 'database', template: { spec: { containers: [{ name: 'main', image: 'postgres:15' }] } } } }
    ],
    availableResources: ['NetworkPolicy', 'Service'],
    incidents: [
      { type: 'UnauthorizedAccess', triggerTime: 30, target: 'database', severity: 4 }
    ],
    hints: [
      'Create a default-deny NetworkPolicy in the database namespace: podSelector: {}, policyTypes: ["Ingress"]. This blocks ALL inbound traffic to every Pod in that namespace.',
      'Create a second policy that allows ingress from namespace "backend" using a namespaceSelector in the "from" field. This is allowlisting.',
      'The frontend -> database path stays blocked. Only backend -> database is allowed. This is the "least privilege" network model required for PCI-DSS and SOC2.'
    ],
    starCriteria: { time: 360, efficiency: 0.7, noFailures: false },
    nextLevel: 12
  },
  {
    id: 12,
    title: 'DNS Debugging',
    chapter: 3,
    chapterName: 'Networking',
    description: 'CoreDNS runs as a Deployment in kube-system and backs the kube-dns Service (ClusterIP 10.96.0.10, port 53). Every Pod gets /etc/resolv.conf pointing to this IP. When a Pod resolves "app-svc", it becomes "app-svc.default.svc.cluster.local" via the search domains. If a NetworkPolicy blocks egress to kube-dns on UDP 53, all DNS lookups fail and Service discovery breaks silently.',
    objectives: [
      { type: 'resolve', incidentType: 'DNSResolutionFailure', count: 1, label: 'Fix the DNS resolution failure' },
      { type: 'verify', kind: 'Service', dnsWorking: true, label: 'All Services resolvable by DNS' },
      { type: 'deploy', kind: 'NetworkPolicy', count: 1, label: 'Create a policy allowing DNS egress on UDP port 53' }
    ],
    startingResources: [
      { kind: 'Node', name: 'node-1', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Node', name: 'node-2', spec: { cpu: '8', memory: '16Gi', status: 'Ready' } },
      { kind: 'Deployment', name: 'coredns', spec: { replicas: 2, namespace: 'kube-system', template: { spec: { containers: [{ name: 'coredns', image: 'coredns:1.11' }] } } } },
      { kind: 'Service', name: 'kube-dns', spec: { namespace: 'kube-system', port: 53 } },
      { kind: 'Deployment', name: 'app', spec: { replicas: 3, template: { spec: { containers: [{ name: 'main', image: 'app:v1' }] } } } },
      { kind: 'Service', name: 'app-svc', spec: { port: 8080 } },
      { kind: 'NetworkPolicy', name: 'deny-all', spec: { policyTypes: ['Ingress', 'Egress'] } }
    ],
    availableResources: ['NetworkPolicy', 'Service', 'Pod'],
    incidents: [
      { type: 'DNSResolutionFailure', triggerTime: 5, target: 'kube-dns', severity: 4 }
    ],
    hints: [
      'The deny-all policy blocks ALL egress, including DNS. Create a new NetworkPolicy that allows egress to kube-dns (UDP port 53) in the kube-system namespace.',
      'In real K8s, you debug this with: kubectl exec <pod> -- nslookup kubernetes.default. If it times out, DNS is blocked.',
      'Every namespace that uses NetworkPolicies must explicitly allow DNS egress, or all Service discovery breaks. This is the #1 NetworkPolicy debugging scenario.'
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
      { kind: 'Deployment', name: 'app', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'app:v1' }] } } } }
    ],
    availableResources: ['ConfigMap', 'Secret', 'Pod', 'Deployment'],
    incidents: [],
    hints: [
      'Create ConfigMaps with "kubectl create configmap" — add key-value data in the spec',
      'The "mount" objective requires a ConfigMap referenced in a Pod volume mount',
      'The "envFrom" objective requires a ConfigMap used as environment variables in a Pod'
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
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'node:18' }] } } } },
      { kind: 'Deployment', name: 'database', spec: { replicas: 1, template: { spec: { containers: [{ name: 'main', image: 'postgres:15' }] } } } },
      { kind: 'ConfigMap', name: 'db-config', spec: { data: { DB_HOST: 'postgres', DB_PORT: '5432', DB_PASSWORD: 'exposed123' } } }
    ],
    availableResources: ['ConfigMap', 'Secret', 'Pod', 'Deployment'],
    incidents: [
      { type: 'SecretExposed', triggerTime: 15, target: 'db-config', severity: 4 }
    ],
    hints: [
      'The db-config ConfigMap has DB_PASSWORD exposed — delete or edit it to remove the password',
      'Create a Secret to store the password instead: "kubectl create secret db-secret"',
      'Mount the Secret to the database Deployment and create a second Secret for the API'
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
      { kind: 'Deployment', name: 'database', spec: { replicas: 1, template: { spec: { containers: [{ name: 'main', image: 'postgres:15' }] } } } }
    ],
    availableResources: ['PersistentVolume', 'PersistentVolumeClaim', 'StorageClass', 'StatefulSet'],
    incidents: [],
    hints: [
      'Create 2 PersistentVolumes (cluster-scoped) with "kubectl create pv"',
      'Create 2 PersistentVolumeClaims — they auto-bind to available PVs matching the storage class',
      'PVC storage request must be <= the PV capacity for binding to succeed'
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
      'Create a StatefulSet from the + menu, then scale it to 3 with "kubectl scale statefulset"',
      'Create a headless Service with spec.clusterIP set to "None" for direct Pod DNS',
      'StatefulSet Pods deploy in order (pod-0, pod-1, pod-2) — each gets a stable hostname'
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
      { kind: 'Deployment', name: 'web', spec: { replicas: 3, template: { spec: { containers: [{ name: 'main', image: 'web:v2' }] } } } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'api:v3' }] } } } },
      { kind: 'Service', name: 'web-svc', spec: { port: 80 } },
      { kind: 'Service', name: 'api-svc', spec: { port: 3000 } }
    ],
    availableResources: ['HorizontalPodAutoscaler', 'Pod', 'Deployment'],
    incidents: [
      { type: 'OOMKilled', triggerTime: 20, target: 'api', severity: 3 },
      { type: 'ReadinessProbeFailure', triggerTime: 45, target: 'web', severity: 2 }
    ],
    hints: [
      'Edit Deployments to add spec.resources.requests and spec.resources.limits',
      'Add spec.livenessProbe and spec.readinessProbe to Deployment containers',
      'Create an HPA targeting a Deployment with "kubectl create hpa"',
      'When OOMKilled incident appears, right-click to investigate and increase memory limits'
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
      { kind: 'Deployment', name: 'app', spec: { replicas: 2, namespace: 'prod', template: { spec: { containers: [{ name: 'main', image: 'app:v1' }] } } } },
      { kind: 'ServiceAccount', name: 'admin', spec: { namespace: 'default', wildcard: true } }
    ],
    availableResources: ['Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding', 'ServiceAccount'],
    incidents: [
      { type: 'UnauthorizedAccess', triggerTime: 25, target: 'admin-sa', severity: 5 }
    ],
    hints: [
      'Create Roles with specific verbs (get, list, watch) — avoid using "*" wildcard',
      'Create RoleBindings to connect Roles to ServiceAccounts in each namespace',
      'Create ServiceAccounts for each namespace — the "admin" SA has wildcard permissions to fix'
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
      { kind: 'Deployment', name: 'web', spec: { replicas: 4, template: { spec: { containers: [{ name: 'main', image: 'nginx:latest' }] } } } },
      { kind: 'Deployment', name: 'api', spec: { replicas: 3, template: { spec: { containers: [{ name: 'main', image: 'node:18' }] } } } },
      { kind: 'Deployment', name: 'worker', spec: { replicas: 2, template: { spec: { containers: [{ name: 'main', image: 'worker:v1' }] } } } },
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
      'When nodes fail, right-click incidents to investigate and resolve them',
      'Type "kubectl cordon node-name" then "kubectl drain node-name" for node maintenance',
      'Create a PodDisruptionBudget with the + menu to protect availability during disruptions'
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
      'Create 3 namespaces first (frontend, backend, data), then Deployments in each',
      'Create Services for each Deployment, then add an Ingress to route external traffic',
      'Add NetworkPolicies, Secrets, HPA, and probes to push your Architecture score above 75'
    ],
    starCriteria: { time: 900, efficiency: 0.6, noFailures: false },
    nextLevel: null
  }
];

const CHAPTERS = [
  { id: 1, name: 'Foundations', levels: [1, 2, 3, 4], description: 'Pods, Deployments, scheduling, and your first incident response' },
  { id: 2, name: 'Workloads', levels: [5, 6, 7, 8], description: 'Self-healing, DaemonSets, batch Jobs, and rolling update strategy' },
  { id: 3, name: 'Networking', levels: [9, 10, 11, 12], description: 'Services, Ingress L7 routing, NetworkPolicies, and DNS debugging' },
  { id: 4, name: 'State & Config', levels: [13, 14, 15, 16], description: 'Manage state and configuration' },
  { id: 5, name: 'Production', levels: [17, 18, 19, 20], description: 'Build production-grade clusters' }
];

export { CAMPAIGN_LEVELS, CHAPTERS };
