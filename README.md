# K8s Games

Learn Kubernetes by playing. Deploy pods, fix CrashLoopBackOff, type real kubectl commands — all in a 3D sim that runs in your browser.

**[Play Now at k8sgames.com](https://k8sgames.com)**

## Get Started

Visit **[k8sgames.com](https://k8sgames.com)** and pick a mode. No install, no signup, no build step.

Or run locally:

```bash
git clone https://github.com/rohitg00/k8sgames.git
cd k8sgames
python3 -m http.server 8080
# Open http://localhost:8080
```

## How to Play

1. Pick a game mode from the main menu
2. Click resources from the left palette to place them in your cluster
3. Drag resources to reposition them anywhere
4. Click any resource to inspect it (status, YAML, kubectl describe)
5. Right-click for actions (Scale, Delete, Logs, Restart)
6. Press `/` to open the kubectl command bar
7. Handle incidents as they appear — diagnose and fix like a real SRE
8. Press `?` anytime for help

## Game Modes

| Mode | What You Do |
|------|-------------|
| **Campaign** | 20 levels across 5 chapters. Learn pods, deployments, networking, storage, and production K8s |
| **Chaos** | Endless survival. Incidents escalate until your cluster breaks. How long can you last? |
| **Sandbox** | Free build. Design any cluster, get scored 0-100 by the Architecture Advisor |
| **Challenges** | 10 timed scenarios. Deploy apps, fix outages, race the clock |

## Controls

| Input | Action |
|-------|--------|
| `/` | kubectl command bar |
| `?` | Help / How to play |
| `Space` | Pause / Resume |
| `M` | Metrics dashboard |
| `Esc` | Back to menu |
| `1-9` | Quick-select resource |
| Left-click | Select resource |
| Left-drag | Move resource or rotate camera |
| Right-click | Context menu |
| Right-drag | Pan |
| Scroll | Zoom |

Bottom toolbar: **Auto-Align** (K8s architecture layout) | **Reset View** | **YAML** (export cluster) | **Help**

## What's In It

**25 K8s resources** — Pod, Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, NetworkPolicy, ConfigMap, Secret, PVC, PV, StorageClass, Node, Namespace, HPA, ResourceQuota, PodDisruptionBudget, ServiceAccount, Role, ClusterRole, RoleBinding, ClusterRoleBinding. Each has a unique 3D shape, color, and real K8s behavior.

**29 incidents** — OOMKilled, CrashLoopBackOff, ImagePullBackOff, node NotReady, DNS failures, PVC pending, API throttling, rollout stuck, certificate expiry, HPA flapping, and more. Investigate with kubectl describe/logs, then fix.

**kubectl command bar** — type real commands: `get pods`, `describe deployment nginx`, `scale deployment nginx --replicas=3`, `logs pod-1`, `rollout status`, `drain node-1`. Tab completion included.

**Visual connections** — animated lines show ownership chains (Deployment -> ReplicaSet -> Pod) and network routing (Service -> Pods) based on label selectors. Place a Service and pick which Deployment it connects to.

**Edit resources** — click Edit on any resource to modify labels, replicas, selectors, and service types. Quick-connect buttons let you wire a Service to an existing Deployment in one click.

**Architecture Advisor** — scores your cluster design across HA, security, scalability, cost, and 6 other categories.

**40 achievements** and a 30-level XP system from Novice to CKA-ready.

**RBAC simulation** — ServiceAccounts, Roles, ClusterRoles, RoleBindings, and ClusterRoleBindings with real rule definitions and wildcard detection.

## Tech

Three.js r152 + Tailwind CSS CDN + vanilla ES6 modules. No build step, no dependencies, no bundler. ~50K lines across 90+ files.

## License

Apache-2.0
