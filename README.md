# KubeOps

Real-time Kubernetes cluster management simulation game. Deploy resources, handle incidents, master kubectl commands — all in your browser.

## Game Modes

- **Campaign** (20 levels) — Learn K8s from pods to production across 5 chapters
- **Chaos Mode** — Survive escalating cluster incidents, SRE training
- **Sandbox** — Free cluster design with Architecture Advisor scoring (0-100)
- **Challenges** — 10 timed scenarios: deploy apps, fix outages, race the clock

## Features

- **18 placeable K8s resources** with unique 3D shapes (Pod, Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, NetworkPolicy, ConfigMap, Secret, PVC, HPA, Node, Namespace, ResourceQuota, CronJob)
- **kubectl command bar** — type real commands (`get`, `describe`, `scale`, `logs`, `rollout`, `drain`) that affect the game world
- **25 incident types** across Pod, Node, Network, Storage, Control Plane, and Workload categories
- **Visual resource graph** — isometric 3D view with animated ownership chains and traffic flow particles
- **Live metrics dashboard** — canvas-based CPU/memory/latency charts
- **Architecture Advisor** — scores your cluster design across 10 categories
- **YAML preview** — every resource shows generated YAML in real-time
- **40 achievements** and 30-level XP progression (Novice to CKA-ready)

## Controls

| Key | Action |
|-----|--------|
| `/` | Open kubectl command bar |
| `Space` | Pause / Resume |
| `M` | Toggle metrics dashboard |
| `Esc` | Back to menu |
| `Delete` | Remove selected resource |
| `1-9` | Quick-select resource from palette |
| Right-click | Context menu (Scale, Logs, Restart, etc.) |
| Mouse wheel | Zoom |
| Middle-click drag | Pan |

## How to Play

1. Clone or download this repo
2. Open `index.html` in a browser (no build step needed)
3. Pick a game mode and start managing your cluster

```bash
git clone https://github.com/rohitg00/kubeops.git
cd kubeops
open index.html
```

## Tech Stack

- Three.js r152 (isometric 3D rendering)
- Tailwind CSS v3 (CDN)
- Vanilla JavaScript (ES6 modules, no build step)

## Campaign Chapters

| Chapter | Levels | Topic |
|---------|--------|-------|
| 1 | 1-4 | Foundations (Pods, Namespaces, Nodes) |
| 2 | 5-8 | Workloads (Deployments, StatefulSets, Jobs) |
| 3 | 9-12 | Networking (Services, Ingress, NetworkPolicies) |
| 4 | 13-16 | State & Config (ConfigMaps, Secrets, PVCs) |
| 5 | 17-20 | Production (HPA, RBAC, ResourceQuotas) |

## File Structure

```
kubeops/
├── index.html
├── style.css
├── js/
│   ├── engine/          (GameEngine, ClusterState, SimulationTick, IncidentEngine, ScoringEngine)
│   ├── resources/       (ResourceBase + 5 resource modules)
│   ├── rendering/       (ClusterRenderer, ResourceMeshes, ConnectionLines, ParticleTraffic)
│   ├── ui/              (HUD, CommandBar, InspectorPanel, ContextMenu, MetricsDashboard, IncidentPanel, Minimap)
│   ├── modes/           (CampaignMode, ChaosMode, SandboxMode, ChallengeMode)
│   └── data/            (CampaignLevels, IncidentDefs, Achievements)
├── README.md
└── LICENSE
```

## License

Apache-2.0
