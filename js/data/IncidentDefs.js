const INCIDENT_DEFS = [
  {
    id: 'crash-loop-backoff',
    name: 'CrashLoopBackOff',
    category: 'Pod',
    severity: 3,
    description: 'A container is repeatedly crashing and Kubernetes is backing off restart attempts.',
    visualEffect: 'pulse-red',
    affectedResourceTypes: ['Pod', 'Deployment'],
    investigationSteps: [
      { command: 'kubectl logs <pod> --previous', hint: 'Check previous container logs for crash reason' },
      { command: 'kubectl describe pod <pod>', hint: 'Look at Events section for restart count and reasons' },
      { command: 'kubectl get events --field-selector involvedObject.name=<pod>', hint: 'Check cluster events for this Pod' }
    ],
    resolutionActions: [
      { action: 'fix-image', label: 'Fix container image tag', difficulty: 1 },
      { action: 'fix-command', label: 'Correct entrypoint command', difficulty: 2 },
      { action: 'fix-resources', label: 'Increase memory limit', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl logs', 'kubectl describe pod', 'kubectl delete pod'],
    autoResolveTime: null
  },
  {
    id: 'image-pull-backoff',
    name: 'ImagePullBackOff',
    category: 'Pod',
    severity: 2,
    description: 'Kubernetes cannot pull the container image from the registry.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['Pod', 'Deployment'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Check the image name and pull errors in Events' },
      { command: 'kubectl get pod <pod> -o jsonpath="{.spec.containers[*].image}"', hint: 'Verify the image reference' }
    ],
    resolutionActions: [
      { action: 'fix-image-name', label: 'Correct image name/tag', difficulty: 1 },
      { action: 'add-pull-secret', label: 'Add imagePullSecret', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl describe pod', 'kubectl edit deployment'],
    autoResolveTime: null
  },
  {
    id: 'oom-killed',
    name: 'OOMKilled',
    category: 'Pod',
    severity: 3,
    description: 'Container exceeded its memory limit and was terminated by the OOM killer.',
    visualEffect: 'flash-red',
    affectedResourceTypes: ['Pod', 'Deployment'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Look for OOMKilled in Last State' },
      { command: 'kubectl top pod <pod>', hint: 'Check current memory usage' },
      { command: 'kubectl get pod <pod> -o jsonpath="{.spec.containers[*].resources}"', hint: 'Review resource limits' }
    ],
    resolutionActions: [
      { action: 'increase-memory', label: 'Increase memory limit', difficulty: 1 },
      { action: 'fix-memory-leak', label: 'Fix application memory leak', difficulty: 3 },
      { action: 'add-hpa', label: 'Add HPA to scale horizontally', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl describe pod', 'kubectl top pod', 'kubectl edit deployment'],
    autoResolveTime: null
  },
  {
    id: 'pod-eviction',
    name: 'PodEviction',
    category: 'Pod',
    severity: 2,
    description: 'Pod was evicted due to node resource pressure.',
    visualEffect: 'fade-out',
    affectedResourceTypes: ['Pod', 'Node'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Check eviction reason in Status' },
      { command: 'kubectl describe node <node>', hint: 'Check node conditions for resource pressure' },
      { command: 'kubectl top node', hint: 'Review node resource usage' }
    ],
    resolutionActions: [
      { action: 'add-node', label: 'Add a new node', difficulty: 1 },
      { action: 'set-priority', label: 'Set PriorityClass', difficulty: 2 },
      { action: 'reduce-requests', label: 'Optimize resource requests', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl describe pod', 'kubectl describe node', 'kubectl top node'],
    autoResolveTime: null
  },
  {
    id: 'readiness-probe-failure',
    name: 'ReadinessProbeFailure',
    category: 'Pod',
    severity: 2,
    description: 'Readiness probe is failing. Pod removed from Service endpoints.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['Pod', 'Service'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Check readiness probe configuration and failure messages' },
      { command: 'kubectl logs <pod>', hint: 'Look for application startup issues' },
      { command: 'kubectl get endpoints <service>', hint: 'Check if Pod is in Service endpoints' }
    ],
    resolutionActions: [
      { action: 'fix-probe-path', label: 'Correct probe endpoint path', difficulty: 1 },
      { action: 'fix-probe-port', label: 'Fix probe port number', difficulty: 1 },
      { action: 'increase-timeout', label: 'Increase initialDelaySeconds', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl describe pod', 'kubectl get endpoints'],
    autoResolveTime: 60
  },
  {
    id: 'pod-stuck-terminating',
    name: 'PodStuckTerminating',
    category: 'Pod',
    severity: 2,
    description: 'Pod is stuck in Terminating state and not being cleaned up.',
    visualEffect: 'blink-gray',
    affectedResourceTypes: ['Pod'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Check for finalizers preventing deletion' },
      { command: 'kubectl get pod <pod> -o jsonpath="{.metadata.finalizers}"', hint: 'List finalizers' }
    ],
    resolutionActions: [
      { action: 'force-delete', label: 'Force delete the Pod', difficulty: 1 },
      { action: 'remove-finalizer', label: 'Remove blocking finalizer', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl delete pod --force --grace-period=0', 'kubectl patch pod'],
    autoResolveTime: 120
  },
  {
    id: 'node-not-ready',
    name: 'NodeNotReady',
    category: 'Node',
    severity: 5,
    description: 'Node has stopped responding and is marked NotReady. All Pods at risk.',
    visualEffect: 'shake-fade',
    affectedResourceTypes: ['Node', 'Pod'],
    investigationSteps: [
      { command: 'kubectl describe node <node>', hint: 'Check conditions: MemoryPressure, DiskPressure, PIDPressure' },
      { command: 'kubectl get pods --field-selector spec.nodeName=<node>', hint: 'List all Pods on this node' },
      { command: 'kubectl get events --field-selector involvedObject.name=<node>', hint: 'Check node events' }
    ],
    resolutionActions: [
      { action: 'restart-kubelet', label: 'Restart kubelet service', difficulty: 2 },
      { action: 'drain-node', label: 'Drain and reschedule Pods', difficulty: 2 },
      { action: 'replace-node', label: 'Replace the node entirely', difficulty: 3 }
    ],
    kubectlCommands: ['kubectl describe node', 'kubectl drain', 'kubectl cordon'],
    autoResolveTime: null
  },
  {
    id: 'node-disk-pressure',
    name: 'NodeDiskPressure',
    category: 'Node',
    severity: 4,
    description: 'Node is running low on disk space. Pod evictions imminent.',
    visualEffect: 'pulse-orange',
    affectedResourceTypes: ['Node'],
    investigationSteps: [
      { command: 'kubectl describe node <node>', hint: 'Check DiskPressure condition' },
      { command: 'kubectl get pods --field-selector spec.nodeName=<node> --sort-by=.status.startTime', hint: 'Find large or old Pods' }
    ],
    resolutionActions: [
      { action: 'cleanup-images', label: 'Clean unused container images', difficulty: 1 },
      { action: 'delete-old-pods', label: 'Remove completed Job Pods', difficulty: 1 },
      { action: 'expand-disk', label: 'Expand node disk', difficulty: 3 }
    ],
    kubectlCommands: ['kubectl describe node', 'kubectl delete pod'],
    autoResolveTime: null
  },
  {
    id: 'node-memory-pressure',
    name: 'NodeMemoryPressure',
    category: 'Node',
    severity: 4,
    description: 'Node memory is critically low. Pods will be evicted by priority.',
    visualEffect: 'pulse-orange',
    affectedResourceTypes: ['Node', 'Pod'],
    investigationSteps: [
      { command: 'kubectl top node <node>', hint: 'Check node memory usage percentage' },
      { command: 'kubectl top pods --sort-by=memory', hint: 'Find highest memory consumers' }
    ],
    resolutionActions: [
      { action: 'evict-low-priority', label: 'Evict low-priority Pods', difficulty: 1 },
      { action: 'add-node', label: 'Add a new node to the cluster', difficulty: 2 },
      { action: 'set-limits', label: 'Set memory limits on all Pods', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl top node', 'kubectl top pods', 'kubectl cordon'],
    autoResolveTime: null
  },
  {
    id: 'node-pid-pressure',
    name: 'NodePIDPressure',
    category: 'Node',
    severity: 3,
    description: 'Node is running out of process IDs. Fork bomb suspected.',
    visualEffect: 'pulse-orange',
    affectedResourceTypes: ['Node'],
    investigationSteps: [
      { command: 'kubectl describe node <node>', hint: 'Check PIDPressure condition' },
      { command: 'kubectl get pods --field-selector spec.nodeName=<node>', hint: 'List Pods on the affected node' }
    ],
    resolutionActions: [
      { action: 'kill-runaway', label: 'Delete runaway Pod', difficulty: 1 },
      { action: 'set-pid-limit', label: 'Set PID limits on containers', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl describe node', 'kubectl delete pod'],
    autoResolveTime: null
  },
  {
    id: 'service-endpoint-missing',
    name: 'ServiceEndpointMissing',
    category: 'Network',
    severity: 3,
    description: 'Service has no endpoints. No Pods match the selector.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['Service', 'Deployment'],
    investigationSteps: [
      { command: 'kubectl get endpoints <service>', hint: 'Check if endpoints list is empty' },
      { command: 'kubectl describe service <service>', hint: 'Verify selector matches Pod labels' },
      { command: 'kubectl get pods --show-labels', hint: 'Check Pod labels match Service selector' }
    ],
    resolutionActions: [
      { action: 'fix-selector', label: 'Fix Service selector labels', difficulty: 1 },
      { action: 'fix-pod-labels', label: 'Fix Pod labels', difficulty: 1 },
      { action: 'fix-readiness', label: 'Fix readiness probe', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl get endpoints', 'kubectl describe service', 'kubectl get pods --show-labels'],
    autoResolveTime: null
  },
  {
    id: 'dns-resolution-failure',
    name: 'DNSResolutionFailure',
    category: 'Network',
    severity: 4,
    description: 'Cluster DNS resolution is failing. Services cannot be discovered by name.',
    visualEffect: 'screen-static',
    affectedResourceTypes: ['Service', 'Pod'],
    investigationSteps: [
      { command: 'kubectl get pods -n kube-system -l k8s-app=kube-dns', hint: 'Check CoreDNS Pod status' },
      { command: 'kubectl logs -n kube-system -l k8s-app=kube-dns', hint: 'Check CoreDNS logs for errors' },
      { command: 'kubectl get configmap coredns -n kube-system -o yaml', hint: 'Verify CoreDNS configuration' }
    ],
    resolutionActions: [
      { action: 'restart-coredns', label: 'Restart CoreDNS Pods', difficulty: 1 },
      { action: 'fix-coredns-config', label: 'Fix CoreDNS ConfigMap', difficulty: 2 },
      { action: 'fix-network-policy', label: 'Allow DNS traffic in NetworkPolicy', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl get pods -n kube-system', 'kubectl logs', 'kubectl rollout restart deployment coredns -n kube-system'],
    autoResolveTime: null
  },
  {
    id: 'network-policy-blocking',
    name: 'NetworkPolicyBlocking',
    category: 'Network',
    severity: 3,
    description: 'NetworkPolicy is blocking legitimate traffic between services.',
    visualEffect: 'connection-red',
    affectedResourceTypes: ['NetworkPolicy', 'Service', 'Pod'],
    investigationSteps: [
      { command: 'kubectl get networkpolicies', hint: 'List all NetworkPolicies' },
      { command: 'kubectl describe networkpolicy <policy>', hint: 'Check ingress/egress rules' },
      { command: 'kubectl get pods --show-labels -n <namespace>', hint: 'Verify Pod labels match policy selectors' }
    ],
    resolutionActions: [
      { action: 'add-allow-rule', label: 'Add allow rule for legitimate traffic', difficulty: 2 },
      { action: 'fix-selectors', label: 'Fix namespace/pod selectors', difficulty: 2 },
      { action: 'add-dns-egress', label: 'Allow DNS egress', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl get networkpolicies', 'kubectl describe networkpolicy', 'kubectl apply -f'],
    autoResolveTime: null
  },
  {
    id: 'ingress-misconfigured',
    name: 'IngressMisconfigured',
    category: 'Network',
    severity: 3,
    description: 'Ingress rules are not routing traffic correctly to backend Services.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['Ingress', 'Service'],
    investigationSteps: [
      { command: 'kubectl describe ingress <ingress>', hint: 'Check rules and backend configuration' },
      { command: 'kubectl get svc', hint: 'Verify backend Services exist and have endpoints' }
    ],
    resolutionActions: [
      { action: 'fix-backend', label: 'Fix backend Service name/port', difficulty: 1 },
      { action: 'fix-path', label: 'Correct path routing rules', difficulty: 1 },
      { action: 'add-tls', label: 'Configure TLS termination', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl describe ingress', 'kubectl get svc', 'kubectl edit ingress'],
    autoResolveTime: null
  },
  {
    id: 'unauthorized-access',
    name: 'UnauthorizedAccess',
    category: 'Network',
    severity: 5,
    description: 'Suspicious access pattern detected. Potential security breach.',
    visualEffect: 'alert-red-border',
    affectedResourceTypes: ['Pod', 'ServiceAccount', 'Namespace'],
    investigationSteps: [
      { command: 'kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>', hint: 'Check ServiceAccount permissions' },
      { command: 'kubectl get rolebindings,clusterrolebindings --all-namespaces', hint: 'Audit role bindings' },
      { command: 'kubectl logs <pod>', hint: 'Check Pod logs for suspicious activity' }
    ],
    resolutionActions: [
      { action: 'restrict-rbac', label: 'Restrict RBAC permissions', difficulty: 2 },
      { action: 'add-network-policy', label: 'Add restrictive NetworkPolicy', difficulty: 2 },
      { action: 'rotate-credentials', label: 'Rotate ServiceAccount tokens', difficulty: 3 }
    ],
    kubectlCommands: ['kubectl auth can-i', 'kubectl get rolebindings', 'kubectl delete rolebinding'],
    autoResolveTime: null
  },
  {
    id: 'pvc-pending',
    name: 'PVCPending',
    category: 'Storage',
    severity: 3,
    description: 'PersistentVolumeClaim is stuck in Pending state. No matching PV found.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['PersistentVolumeClaim', 'PersistentVolume'],
    investigationSteps: [
      { command: 'kubectl describe pvc <pvc>', hint: 'Check Events for binding errors' },
      { command: 'kubectl get pv', hint: 'List available PersistentVolumes' },
      { command: 'kubectl get storageclass', hint: 'Verify StorageClass exists' }
    ],
    resolutionActions: [
      { action: 'create-pv', label: 'Create a matching PersistentVolume', difficulty: 1 },
      { action: 'fix-storage-class', label: 'Fix StorageClass reference', difficulty: 2 },
      { action: 'resize-pvc', label: 'Reduce PVC size to match available PV', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl describe pvc', 'kubectl get pv', 'kubectl get storageclass'],
    autoResolveTime: null
  },
  {
    id: 'volume-mount-failure',
    name: 'VolumeMountFailure',
    category: 'Storage',
    severity: 3,
    description: 'Pod cannot mount the requested volume. Container start blocked.',
    visualEffect: 'pulse-red',
    affectedResourceTypes: ['Pod', 'PersistentVolumeClaim'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Look for volume mount errors in Events' },
      { command: 'kubectl get pvc', hint: 'Check PVC status is Bound' }
    ],
    resolutionActions: [
      { action: 'fix-mount-path', label: 'Correct volume mount path', difficulty: 1 },
      { action: 'fix-pvc-ref', label: 'Fix PVC reference name', difficulty: 1 },
      { action: 'fix-access-mode', label: 'Change PV access mode (RWO/RWX)', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl describe pod', 'kubectl get pvc', 'kubectl edit deployment'],
    autoResolveTime: null
  },
  {
    id: 'volume-capacity-full',
    name: 'VolumeCapacityFull',
    category: 'Storage',
    severity: 4,
    description: 'PersistentVolume is at capacity. Writes are failing.',
    visualEffect: 'pulse-orange',
    affectedResourceTypes: ['PersistentVolume', 'PersistentVolumeClaim', 'Pod'],
    investigationSteps: [
      { command: 'kubectl exec <pod> -- df -h', hint: 'Check disk usage inside the container' },
      { command: 'kubectl describe pv <pv>', hint: 'Check PV capacity' }
    ],
    resolutionActions: [
      { action: 'expand-pv', label: 'Expand PersistentVolume', difficulty: 2 },
      { action: 'cleanup-data', label: 'Clean up old data in volume', difficulty: 1 },
      { action: 'add-monitoring', label: 'Add volume usage alerts', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl exec', 'kubectl describe pv', 'kubectl edit pvc'],
    autoResolveTime: null
  },
  {
    id: 'etcd-latency',
    name: 'EtcdLatency',
    category: 'ControlPlane',
    severity: 5,
    description: 'etcd is experiencing high latency. API server responses are slow.',
    visualEffect: 'slow-motion',
    affectedResourceTypes: ['Node'],
    investigationSteps: [
      { command: 'kubectl -n kube-system get pods -l component=etcd', hint: 'Check etcd Pod health status' },
      { command: 'kubectl logs -n kube-system etcd-master', hint: 'Check etcd logs for slow operations' }
    ],
    resolutionActions: [
      { action: 'defrag-etcd', label: 'Defragment etcd database', difficulty: 3 },
      { action: 'compact-etcd', label: 'Compact etcd revisions', difficulty: 3 },
      { action: 'add-etcd-member', label: 'Scale etcd cluster', difficulty: 3 }
    ],
    kubectlCommands: ['kubectl get pods -n kube-system -l component=etcd', 'kubectl logs -n kube-system'],
    autoResolveTime: null
  },
  {
    id: 'api-server-overloaded',
    name: 'APIServerOverloaded',
    category: 'ControlPlane',
    severity: 5,
    description: 'API server is overloaded. Requests are being throttled.',
    visualEffect: 'screen-lag',
    affectedResourceTypes: ['Node'],
    investigationSteps: [
      { command: 'kubectl get --raw /metrics | grep apiserver_request', hint: 'Check API server request rates' },
      { command: 'kubectl get events --all-namespaces --sort-by=.lastTimestamp', hint: 'Look for excessive events' }
    ],
    resolutionActions: [
      { action: 'reduce-watches', label: 'Reduce watch connections', difficulty: 2 },
      { action: 'rate-limit', label: 'Apply API priority and fairness', difficulty: 3 },
      { action: 'scale-api-server', label: 'Scale API server replicas', difficulty: 3 }
    ],
    kubectlCommands: ['kubectl get --raw /metrics', 'kubectl get events'],
    autoResolveTime: null
  },
  {
    id: 'scheduler-failure',
    name: 'SchedulerFailure',
    category: 'ControlPlane',
    severity: 4,
    description: 'Pods are stuck in Pending state. Scheduler cannot find suitable nodes.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['Pod', 'Node'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Check Events for scheduling failures' },
      { command: 'kubectl get nodes', hint: 'Verify node availability and capacity' },
      { command: 'kubectl describe nodes | grep -A5 "Allocated resources"', hint: 'Check node resource allocation' }
    ],
    resolutionActions: [
      { action: 'add-node', label: 'Add more nodes', difficulty: 1 },
      { action: 'fix-affinity', label: 'Relax node affinity rules', difficulty: 2 },
      { action: 'remove-taint', label: 'Remove node taints', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl describe pod', 'kubectl get nodes', 'kubectl taint nodes'],
    autoResolveTime: null
  },
  {
    id: 'webhook-timeout',
    name: 'WebhookTimeout',
    category: 'ControlPlane',
    severity: 4,
    description: 'Admission webhook is timing out, blocking resource creation.',
    visualEffect: 'pulse-orange',
    affectedResourceTypes: ['Pod', 'Deployment'],
    investigationSteps: [
      { command: 'kubectl get validatingwebhookconfigurations', hint: 'List validating webhooks' },
      { command: 'kubectl get mutatingwebhookconfigurations', hint: 'List mutating webhooks' },
      { command: 'kubectl logs -n <ns> <webhook-pod>', hint: 'Check webhook Pod logs' }
    ],
    resolutionActions: [
      { action: 'restart-webhook', label: 'Restart webhook Pod', difficulty: 1 },
      { action: 'add-failure-policy', label: 'Set failurePolicy: Ignore', difficulty: 2 },
      { action: 'remove-webhook', label: 'Delete the webhook configuration', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl get validatingwebhookconfigurations', 'kubectl delete validatingwebhookconfiguration'],
    autoResolveTime: 90
  },
  {
    id: 'deployment-stuck-rollout',
    name: 'DeploymentStuckRollout',
    category: 'Workload',
    severity: 3,
    description: 'Deployment rollout is stuck. New ReplicaSet is not scaling up.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['Deployment', 'ReplicaSet'],
    investigationSteps: [
      { command: 'kubectl rollout status deployment/<deployment>', hint: 'Check rollout progress' },
      { command: 'kubectl describe deployment <deployment>', hint: 'Look for conditions and events' },
      { command: 'kubectl get replicasets -l app=<deployment>', hint: 'Check old and new ReplicaSets' }
    ],
    resolutionActions: [
      { action: 'rollback', label: 'Rollback to previous revision', difficulty: 1 },
      { action: 'fix-image', label: 'Fix the container image', difficulty: 1 },
      { action: 'increase-surge', label: 'Increase maxSurge for faster rollout', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl rollout status', 'kubectl rollout undo', 'kubectl rollout history'],
    autoResolveTime: null
  },
  {
    id: 'hpa-scaling-failure',
    name: 'HPAScalingFailure',
    category: 'Workload',
    severity: 2,
    description: 'HPA cannot scale the target. Metrics unavailable or max replicas reached.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['HorizontalPodAutoscaler', 'Deployment'],
    investigationSteps: [
      { command: 'kubectl describe hpa <hpa>', hint: 'Check HPA conditions and events' },
      { command: 'kubectl top pods', hint: 'Verify metrics are available' },
      { command: 'kubectl get hpa', hint: 'Check current vs desired replica count' }
    ],
    resolutionActions: [
      { action: 'increase-max', label: 'Increase maxReplicas', difficulty: 1 },
      { action: 'fix-metrics', label: 'Fix metrics-server', difficulty: 2 },
      { action: 'set-resource-requests', label: 'Set resource requests on containers', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl describe hpa', 'kubectl top pods', 'kubectl edit hpa'],
    autoResolveTime: null
  },
  {
    id: 'job-deadline-exceeded',
    name: 'JobDeadlineExceeded',
    category: 'Workload',
    severity: 2,
    description: 'Job exceeded its activeDeadlineSeconds and was terminated.',
    visualEffect: 'fade-out',
    affectedResourceTypes: ['Job', 'Pod'],
    investigationSteps: [
      { command: 'kubectl describe job <job>', hint: 'Check completion status and deadline' },
      { command: 'kubectl logs job/<job>', hint: 'Check Job Pod logs for slow execution' }
    ],
    resolutionActions: [
      { action: 'increase-deadline', label: 'Increase activeDeadlineSeconds', difficulty: 1 },
      { action: 'fix-parallelism', label: 'Increase Job parallelism', difficulty: 1 },
      { action: 'retry-job', label: 'Delete and recreate the Job', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl describe job', 'kubectl logs', 'kubectl delete job'],
    autoResolveTime: null
  },
  {
    id: 'liveness-probe-failure',
    name: 'LivenessProbeFailure',
    category: 'Pod',
    severity: 3,
    description: 'Liveness probe is failing. Container will be restarted by kubelet.',
    visualEffect: 'pulse-red',
    affectedResourceTypes: ['Pod', 'Deployment'],
    investigationSteps: [
      { command: 'kubectl describe pod <pod>', hint: 'Check liveness probe configuration and failure count' },
      { command: 'kubectl logs <pod> --previous', hint: 'Check logs from the previous container instance' },
      { command: 'kubectl get events --field-selector involvedObject.name=<pod>', hint: 'Look for Unhealthy events with type Liveness' }
    ],
    resolutionActions: [
      { action: 'fix-probe-endpoint', label: 'Fix the health check endpoint', difficulty: 1 },
      { action: 'increase-timeout', label: 'Increase timeoutSeconds and failureThreshold', difficulty: 1 },
      { action: 'fix-app-startup', label: 'Add startupProbe for slow-starting containers', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl describe pod', 'kubectl logs --previous', 'kubectl edit deployment'],
    autoResolveTime: null
  },
  {
    id: 'certificate-expiry',
    name: 'CertificateExpiry',
    category: 'ControlPlane',
    severity: 5,
    description: 'TLS certificate is expired or expiring soon. HTTPS traffic will fail.',
    visualEffect: 'alert-red-border',
    affectedResourceTypes: ['Secret', 'Ingress'],
    investigationSteps: [
      { command: 'kubectl get secret <tls-secret> -o jsonpath="{.data.tls\\.crt}" | base64 -d | openssl x509 -noout -dates', hint: 'Check certificate expiration date' },
      { command: 'kubectl describe ingress <ingress>', hint: 'Verify TLS secret reference in Ingress' },
      { command: 'kubectl get secrets --field-selector type=kubernetes.io/tls', hint: 'List all TLS secrets in the cluster' }
    ],
    resolutionActions: [
      { action: 'renew-cert', label: 'Renew the TLS certificate', difficulty: 2 },
      { action: 'update-secret', label: 'Update the Secret with new cert', difficulty: 1 },
      { action: 'add-cert-manager', label: 'Install cert-manager for auto-renewal', difficulty: 3 }
    ],
    kubectlCommands: ['kubectl get secret', 'kubectl describe ingress', 'kubectl create secret tls'],
    autoResolveTime: null
  },
  {
    id: 'cronjob-missed-schedule',
    name: 'CronJobMissedSchedule',
    category: 'Workload',
    severity: 2,
    description: 'CronJob missed its scheduled execution window.',
    visualEffect: 'pulse-yellow',
    affectedResourceTypes: ['CronJob', 'Job'],
    investigationSteps: [
      { command: 'kubectl describe cronjob <cronjob>', hint: 'Check Last Schedule Time and active Jobs' },
      { command: 'kubectl get jobs --sort-by=.status.startTime', hint: 'List recent Jobs created by this CronJob' },
      { command: 'kubectl get events --field-selector involvedObject.name=<cronjob>', hint: 'Look for MissedSchedule events' }
    ],
    resolutionActions: [
      { action: 'increase-deadline', label: 'Increase startingDeadlineSeconds', difficulty: 1 },
      { action: 'fix-concurrency', label: 'Change concurrencyPolicy to Allow', difficulty: 1 },
      { action: 'manual-trigger', label: 'Create a manual Job from CronJob template', difficulty: 1 }
    ],
    kubectlCommands: ['kubectl describe cronjob', 'kubectl get jobs', 'kubectl create job --from=cronjob/<name>'],
    autoResolveTime: null
  },
  {
    id: 'secret-exposed',
    name: 'SecretExposed',
    category: 'ControlPlane',
    severity: 5,
    description: 'Sensitive data found in a ConfigMap instead of a Secret.',
    visualEffect: 'alert-red-border',
    affectedResourceTypes: ['ConfigMap', 'Secret'],
    investigationSteps: [
      { command: 'kubectl get configmaps -o yaml', hint: 'Search ConfigMaps for sensitive data' },
      { command: 'kubectl get secrets', hint: 'Verify Secrets are being used for sensitive data' }
    ],
    resolutionActions: [
      { action: 'migrate-to-secret', label: 'Move data to a Secret', difficulty: 1 },
      { action: 'rotate-credentials', label: 'Rotate the exposed credentials', difficulty: 2 },
      { action: 'update-references', label: 'Update all Pod references', difficulty: 2 }
    ],
    kubectlCommands: ['kubectl create secret', 'kubectl delete configmap', 'kubectl edit deployment'],
    autoResolveTime: null
  }
];

const INCIDENT_CATEGORIES = {
  Pod: { color: '#ef4444', icon: 'pod-icon', weight: 0.3 },
  Node: { color: '#f97316', icon: 'node-icon', weight: 0.2 },
  Network: { color: '#eab308', icon: 'network-icon', weight: 0.2 },
  Storage: { color: '#8b5cf6', icon: 'storage-icon', weight: 0.1 },
  ControlPlane: { color: '#dc2626', icon: 'control-plane-icon', weight: 0.1 },
  Workload: { color: '#3b82f6', icon: 'workload-icon', weight: 0.1 }
};

const SEVERITY_LEVELS = [
  { level: 1, name: 'Low', color: '#22c55e', xpReward: 25, timeMultiplier: 1.5 },
  { level: 2, name: 'Medium', color: '#eab308', xpReward: 50, timeMultiplier: 1.2 },
  { level: 3, name: 'High', color: '#f97316', xpReward: 100, timeMultiplier: 1.0 },
  { level: 4, name: 'Critical', color: '#ef4444', xpReward: 200, timeMultiplier: 0.8 },
  { level: 5, name: 'Emergency', color: '#dc2626', xpReward: 350, timeMultiplier: 0.6 }
];

export { INCIDENT_DEFS, INCIDENT_CATEGORIES, SEVERITY_LEVELS };
