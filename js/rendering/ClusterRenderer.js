import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ResourceMeshFactory } from './ResourceMeshes.js';
import { ConnectionLineManager } from './ConnectionLines.js';
import { ParticleTrafficSystem } from './ParticleTraffic.js';

const BACKGROUND_COLOR = 0x0d1117;
const K8S_BLUE = 0x326CE5;
const GRID_SIZE = 40;
const GRID_DIVISIONS = 20;
const HIGHLIGHT_COLOR = 0x58a6ff;
const SELECT_COLOR = 0xffa657;
const NAMESPACE_OPACITY = 0.04;

const NAMESPACE_COLORS = [
    0x326CE5, 0x28a745, 0xe36209, 0x8957e5,
    0xd73a49, 0x0366d6, 0x6f42c1, 0x22863a,
    0xb08800, 0xdb6d28, 0x5a32a3, 0x044289
];

export class ClusterRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.resourceMeshes = new Map();
        this.namespacePlanes = new Map();
        this.selectedResource = null;
        this.hoveredResource = null;
        this.mouse = new THREE.Vector2(-999, -999);
        this._clickStart = new THREE.Vector2();
        this._didDrag = false;
        this.namespaceColorIndex = 0;
        this.running = false;
        this.frameId = null;
        this.lastFrameTime = 0;
        this.onSelect = null;
        this.onHover = null;
        this.onResourceMoved = null;
        this._draggingResource = null;
        this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this._initScene();
        this._initCamera();
        this._initRenderer();
        this._initControls();
        this._initLights();
        this._initGrid();
        this._initRaycaster();
        this._initSubsystems();
        this._bindEvents();
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(BACKGROUND_COLOR);
        this.scene.fog = new THREE.FogExp2(BACKGROUND_COLOR, 0.006);
    }

    _initCamera() {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
        this.camera.position.set(18, 14, 18);
        this.camera.lookAt(0, 0, 0);
    }

    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.rotateSpeed = 0.8;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 80;
        this.controls.maxPolarAngle = Math.PI / 2.1;
        this.controls.minPolarAngle = 0.1;
        this.controls.target.set(0, 0, 0);
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
        };
        this.controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
        };
        this.controls.update();
    }

    _initLights() {
        this.ambientLight = new THREE.AmbientLight(0x8899bb, 0.7);
        this.scene.add(this.ambientLight);

        const hemiLight = new THREE.HemisphereLight(0x88aaff, 0x222244, 0.4);
        this.scene.add(hemiLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.directionalLight.position.set(20, 40, 20);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.set(2048, 2048);
        this.directionalLight.shadow.camera.left = -40;
        this.directionalLight.shadow.camera.right = 40;
        this.directionalLight.shadow.camera.top = 40;
        this.directionalLight.shadow.camera.bottom = -40;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 100;
        this.directionalLight.shadow.bias = -0.001;
        this.scene.add(this.directionalLight);

        const rimLight = new THREE.DirectionalLight(0x326CE5, 0.4);
        rimLight.position.set(-15, 10, -15);
        this.scene.add(rimLight);

        const fillLight = new THREE.DirectionalLight(0x446688, 0.3);
        fillLight.position.set(-10, 5, 20);
        this.scene.add(fillLight);
    }

    _initGrid() {
        this.gridGroup = new THREE.Group();
        const gridMaterial = new THREE.LineBasicMaterial({
            color: K8S_BLUE,
            transparent: true,
            opacity: 0.1
        });

        const halfSize = GRID_SIZE / 2;
        const step = GRID_SIZE / GRID_DIVISIONS;
        const gridGeometry = new THREE.BufferGeometry();
        const vertices = [];

        for (let i = -halfSize; i <= halfSize; i += step) {
            vertices.push(i, 0, -halfSize, i, 0, halfSize);
            vertices.push(-halfSize, 0, i, halfSize, 0, i);
        }

        gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const gridLines = new THREE.LineSegments(gridGeometry, gridMaterial);
        this.gridGroup.add(gridLines);

        const axesMaterial = new THREE.LineBasicMaterial({
            color: K8S_BLUE,
            transparent: true,
            opacity: 0.25
        });
        const axesGeometry = new THREE.BufferGeometry();
        axesGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
            -halfSize, 0, 0, halfSize, 0, 0,
            0, 0, -halfSize, 0, 0, halfSize
        ], 3));
        const axesLines = new THREE.LineSegments(axesGeometry, axesMaterial);
        this.gridGroup.add(axesLines);

        const groundGeometry = new THREE.PlaneGeometry(GRID_SIZE * 1.5, GRID_SIZE * 1.5);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0e14,
            metalness: 0.9,
            roughness: 0.2,
            transparent: true,
            opacity: 0.15,
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.gridGroup.add(ground);

        this.scene.add(this.gridGroup);
    }

    _initRaycaster() {
        this.raycaster = new THREE.Raycaster();
        this.pickableObjects = [];
    }

    _initSubsystems() {
        this.meshFactory = new ResourceMeshFactory();
        this.connectionLines = new ConnectionLineManager(this.scene);
        this.particleTraffic = new ParticleTrafficSystem(this.scene);
    }

    _bindEvents() {
        this._onMouseMove = this._handleMouseMove.bind(this);
        this._onMouseDown = this._handleMouseDown.bind(this);
        this._onMouseUp = this._handleMouseUp.bind(this);
        this._onResize = this._handleResize.bind(this);
        this._onContextMenu = (e) => e.preventDefault();

        this.canvas.addEventListener('mousemove', this._onMouseMove);
        this.canvas.addEventListener('mousedown', this._onMouseDown);
        this.canvas.addEventListener('mouseup', this._onMouseUp);
        this.canvas.addEventListener('contextmenu', this._onContextMenu);
        window.addEventListener('resize', this._onResize);
    }

    _handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (this._draggingResource) {
            const pos = this._raycastGround(this.mouse);
            if (pos) {
                const group = this.resourceMeshes.get(this._draggingResource);
                if (group) {
                    group.position.x = pos.x;
                    group.position.z = pos.z;
                }
            }
            return;
        }

        const dx = event.clientX - this._clickStart.x;
        const dy = event.clientY - this._clickStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 4) {
            if (this._dragCandidate && !this._didDrag) {
                this._draggingResource = this._dragCandidate;
                this._dragCandidate = null;
                this.controls.enabled = false;
                this.canvas.style.cursor = 'grabbing';
            }
            this._didDrag = true;
        }
    }

    _handleMouseDown(event) {
        if (event.button === 0) {
            this._clickStart.set(event.clientX, event.clientY);
            this._didDrag = false;
            this._dragCandidate = null;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.pickableObjects, true);
            if (intersects.length > 0) {
                let target = intersects[0].object;
                while (target.parent && !target.userData.resourceId) {
                    target = target.parent;
                }
                if (target.userData.resourceId) {
                    this._dragCandidate = target.userData.resourceId;
                }
            }
        }
    }

    _handleMouseUp(event) {
        if (this._draggingResource) {
            const rid = this._draggingResource;
            this._draggingResource = null;
            this.controls.enabled = true;
            this.canvas.style.cursor = 'default';
            const group = this.resourceMeshes.get(rid);
            if (group && this.onResourceMoved) {
                this.onResourceMoved(rid, { x: group.position.x, y: 0, z: group.position.z });
            }
            this._didDrag = false;
            return;
        }

        if (event.button === 0 && !this._didDrag) {
            this._performPick(true);
        }
        this._didDrag = false;
        this._dragCandidate = null;
    }

    _handleResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    _performPick(isClick) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.pickableObjects, true);

        if (intersects.length > 0) {
            let target = intersects[0].object;
            while (target.parent && !target.userData.resourceId) {
                target = target.parent;
            }

            if (target.userData.resourceId) {
                if (isClick) {
                    this._setSelected(target.userData.resourceId);
                } else {
                    this._setHovered(target.userData.resourceId);
                }
                return;
            }
        }

        if (isClick) {
            this._setSelected(null);
        } else {
            this._setHovered(null);
        }
    }

    _setSelected(resourceId) {
        if (this.selectedResource === resourceId) return;

        if (this.selectedResource) {
            const prevGroup = this.resourceMeshes.get(this.selectedResource);
            if (prevGroup) this._applyMeshEffect(prevGroup, 'default');
        }

        this.selectedResource = resourceId;

        if (resourceId) {
            const group = this.resourceMeshes.get(resourceId);
            if (group) this._applyMeshEffect(group, 'selected');
        }

        if (this.onSelect) this.onSelect(resourceId);
    }

    _setHovered(resourceId) {
        if (this.hoveredResource === resourceId) return;

        if (this.hoveredResource && this.hoveredResource !== this.selectedResource) {
            const prevGroup = this.resourceMeshes.get(this.hoveredResource);
            if (prevGroup) this._applyMeshEffect(prevGroup, 'default');
        }

        this.hoveredResource = resourceId;
        this.canvas.style.cursor = resourceId ? 'pointer' : 'default';

        if (resourceId && resourceId !== this.selectedResource) {
            const group = this.resourceMeshes.get(resourceId);
            if (group) this._applyMeshEffect(group, 'hovered');
        }

        if (this.onHover) this.onHover(resourceId);
    }

    _applyMeshEffect(group, effect) {
        group.traverse((child) => {
            if (!child.isMesh || child.userData.isLabel) return;
            const mat = child.material;
            if (!mat) return;

            const hasEmissive = mat.isMeshStandardMaterial || mat.isMeshPhongMaterial || mat.isMeshLambertMaterial;

            switch (effect) {
                case 'selected':
                    if (hasEmissive) {
                        mat.emissiveIntensity = 0.5;
                        mat.emissive.set(SELECT_COLOR);
                    } else if (mat.color) {
                        if (!child.userData.baseColor) child.userData.baseColor = mat.color.getHex();
                        mat.color.set(SELECT_COLOR);
                    }
                    if (child.userData.originalScale) {
                        child.scale.copy(child.userData.originalScale).multiplyScalar(1.08);
                    }
                    break;
                case 'hovered':
                    if (hasEmissive) {
                        mat.emissiveIntensity = 0.3;
                        mat.emissive.set(HIGHLIGHT_COLOR);
                    } else if (mat.color) {
                        if (!child.userData.baseColor) child.userData.baseColor = mat.color.getHex();
                        mat.color.set(HIGHLIGHT_COLOR);
                    }
                    break;
                default:
                    if (hasEmissive) {
                        if (child.userData.baseEmissive) {
                            mat.emissive.copy(child.userData.baseEmissive);
                            mat.emissiveIntensity = child.userData.baseEmissiveIntensity || 0.15;
                        } else {
                            mat.emissiveIntensity = 0.15;
                        }
                    } else if (child.userData.baseColor !== undefined) {
                        mat.color.set(child.userData.baseColor);
                    }
                    if (child.userData.originalScale) {
                        child.scale.copy(child.userData.originalScale);
                    }
                    break;
            }
        });
    }

    addResource(resource) {
        if (this.resourceMeshes.has(resource.id)) return;

        const group = this.meshFactory.create(resource);
        if (!group) return;

        group.userData.resourceId = resource.id;
        group.userData.resourceType = resource.type;
        group.position.set(resource.x || 0, resource.y || 0, resource.z || 0);

        group.traverse((child) => {
            if (child.isMesh) {
                child.userData.resourceId = resource.id;
                child.userData.originalScale = child.scale.clone();
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material && child.material.emissive) {
                    child.userData.baseEmissive = child.material.emissive.clone();
                    child.userData.baseEmissiveIntensity = child.material.emissiveIntensity;
                }
            }
        });

        this.scene.add(group);
        this.resourceMeshes.set(resource.id, group);
        this._rebuildPickableList();

        if (resource.namespace) {
            this._ensureNamespacePlane(resource.namespace);
        }
    }

    removeResource(resourceId) {
        const group = this.resourceMeshes.get(resourceId);
        if (!group) return;

        this.scene.remove(group);
        group.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });

        this.resourceMeshes.delete(resourceId);
        this._rebuildPickableList();

        if (this.selectedResource === resourceId) this._setSelected(null);
        if (this.hoveredResource === resourceId) this._setHovered(null);
    }

    updateResource(resource) {
        const group = this.resourceMeshes.get(resource.id);
        if (!group) return;

        if (resource.x !== undefined) group.position.x = resource.x;
        if (resource.y !== undefined) group.position.y = resource.y;
        if (resource.z !== undefined) group.position.z = resource.z;

        if (resource.status) {
            this.meshFactory.updateStatus(group, resource.status);
        }
    }

    _rebuildPickableList() {
        this.pickableObjects = [];
        for (const group of this.resourceMeshes.values()) {
            group.traverse((child) => {
                if (child.isMesh && !child.userData.isLabel) {
                    this.pickableObjects.push(child);
                }
            });
        }
    }

    _ensureNamespacePlane(namespace) {
        if (this.namespacePlanes.has(namespace)) return;

        const colorIdx = this.namespaceColorIndex++ % NAMESPACE_COLORS.length;
        const color = NAMESPACE_COLORS[colorIdx];
        const planeGeom = new THREE.PlaneGeometry(6, 6);
        const planeMat = new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: NAMESPACE_OPACITY,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const plane = new THREE.Mesh(planeGeom, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.05;
        plane.receiveShadow = true;
        plane.userData.isNamespacePlane = true;

        this.scene.add(plane);
        this.namespacePlanes.set(namespace, { mesh: plane, color });
    }

    updateNamespaceBounds(namespace, bounds) {
        const entry = this.namespacePlanes.get(namespace);
        if (!entry) return;

        const width = bounds.maxX - bounds.minX + 4;
        const depth = bounds.maxZ - bounds.minZ + 4;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerZ = (bounds.minZ + bounds.maxZ) / 2;

        entry.mesh.geometry.dispose();
        entry.mesh.geometry = new THREE.PlaneGeometry(width, depth);
        entry.mesh.position.set(centerX, -0.05, centerZ);
    }

    addConnection(connection) {
        this.connectionLines.addConnection(connection, this.resourceMeshes);
    }

    removeConnection(connectionId) {
        this.connectionLines.removeConnection(connectionId);
    }

    updateConnections() {
        this.connectionLines.updatePositions(this.resourceMeshes);
    }

    addTrafficRoute(route) {
        this.particleTraffic.addRoute(route);
    }

    removeTrafficRoute(routeId) {
        this.particleTraffic.removeRoute(routeId);
    }

    syncWithState(clusterState) {
        if (!clusterState) return;

        const currentIds = new Set(this.resourceMeshes.keys());
        const stateIds = new Set();

        if (clusterState.resources) {
            for (const resource of clusterState.resources.values()) {
                stateIds.add(resource.id);
                if (currentIds.has(resource.id)) {
                    this.updateResource(resource);
                } else {
                    this.addResource(resource);
                }
            }
        }

        for (const id of currentIds) {
            if (!stateIds.has(id)) {
                this.removeResource(id);
            }
        }

        if (clusterState.connections) {
            this.connectionLines.sync(clusterState.connections, this.resourceMeshes);
        }

        if (clusterState.trafficRoutes) {
            this.particleTraffic.syncRoutes(clusterState.trafficRoutes);
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastFrameTime = performance.now();
        this._animate();
    }

    stop() {
        this.running = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    _animate() {
        if (!this.running) return;
        this.frameId = requestAnimationFrame(() => this._animate());

        const now = performance.now();
        const delta = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;

        this.controls.update();

        if (!this._didDrag) {
            this._performPick(false);
        }

        this.connectionLines.update(delta);
        this.particleTraffic.update(delta);
        this._animateResources(delta);

        this.renderer.render(this.scene, this.camera);
    }

    _animateResources(delta) {
        const time = performance.now() * 0.001;
        for (const [id, group] of this.resourceMeshes) {
            if (group.userData.resourceType === 'Pod') {
                group.position.y = (group.userData.baseY || 0) + Math.sin(time * 2 + id.charCodeAt(0)) * 0.08;
            }
            if (group.userData.animate) {
                group.userData.animate(time, delta);
            }
        }
    }

    focusResource(resourceId) {
        const group = this.resourceMeshes.get(resourceId);
        if (!group) return;

        this.controls.target.copy(group.position);
        this.controls.update();
    }

    getScreenPosition(resourceId) {
        const group = this.resourceMeshes.get(resourceId);
        if (!group) return null;

        const pos = group.position.clone();
        pos.project(this.camera);

        return {
            x: (pos.x + 1) / 2 * this.canvas.clientWidth,
            y: (-pos.y + 1) / 2 * this.canvas.clientHeight
        };
    }

    _raycastGround(ndc) {
        this.raycaster.setFromCamera(ndc, this.camera);
        const intersection = new THREE.Vector3();
        const hit = this.raycaster.ray.intersectPlane(this._groundPlane, intersection);
        return hit ? intersection : null;
    }

    screenToGround(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((screenX - rect.left) / rect.width) * 2 - 1,
            -((screenY - rect.top) / rect.height) * 2 + 1
        );
        const pos = this._raycastGround(ndc);
        return pos ? { x: pos.x, y: 0, z: pos.z } : null;
    }

    animateToPositions(targets, duration = 800) {
        const startTime = performance.now();
        const startPositions = new Map();

        for (const [uid, target] of targets) {
            const group = this.resourceMeshes.get(uid);
            if (group) {
                startPositions.set(uid, {
                    x: group.position.x,
                    y: group.position.y,
                    z: group.position.z,
                });
            }
        }

        const animate = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            for (const [uid, target] of targets) {
                const group = this.resourceMeshes.get(uid);
                const start = startPositions.get(uid);
                if (!group || !start) continue;

                group.position.x = start.x + (target.x - start.x) * ease;
                group.position.y = start.y + (target.y - start.y) * ease;
                group.position.z = start.z + (target.z - start.z) * ease;
            }

            this.connectionLines.updatePositions(this.resourceMeshes);

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    resetCamera() {
        this.camera.position.set(18, 14, 18);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    dispose() {
        this.stop();

        this.controls.dispose();

        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        this.canvas.removeEventListener('mouseup', this._onMouseUp);
        this.canvas.removeEventListener('contextmenu', this._onContextMenu);
        window.removeEventListener('resize', this._onResize);

        for (const id of [...this.resourceMeshes.keys()]) {
            this.removeResource(id);
        }

        for (const entry of this.namespacePlanes.values()) {
            this.scene.remove(entry.mesh);
            entry.mesh.geometry.dispose();
            entry.mesh.material.dispose();
        }
        this.namespacePlanes.clear();

        this.connectionLines.dispose();
        this.particleTraffic.dispose();
        this.renderer.dispose();
    }
}
