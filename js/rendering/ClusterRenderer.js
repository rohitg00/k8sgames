import * as THREE from 'three';
import { ResourceMeshFactory } from './ResourceMeshes.js';
import { ConnectionLineManager } from './ConnectionLines.js';
import { ParticleTrafficSystem } from './ParticleTraffic.js';

const BACKGROUND_COLOR = 0x0d1117;
const K8S_BLUE = 0x326CE5;
const GRID_SIZE = 80;
const GRID_DIVISIONS = 40;
const ISO_X_ROTATION = Math.PI / 6;
const ISO_Y_ROTATION = Math.PI / 4;
const ZOOM_SPEED = 0.1;
const ZOOM_MIN = 2;
const ZOOM_MAX = 40;
const PAN_SPEED = 0.005;
const HIGHLIGHT_COLOR = 0x58a6ff;
const SELECT_COLOR = 0xffa657;
const NAMESPACE_OPACITY = 0.08;

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
        this.isPanning = false;
        this.panStart = new THREE.Vector2();
        this.panTarget = new THREE.Vector3();
        this.mouse = new THREE.Vector2(-999, -999);
        this.namespaceColorIndex = 0;
        this.running = false;
        this.frameId = null;
        this.lastFrameTime = 0;
        this.onSelect = null;
        this.onHover = null;

        this._initScene();
        this._initCamera();
        this._initRenderer();
        this._initLights();
        this._initGrid();
        this._initRaycaster();
        this._initSubsystems();
        this._bindEvents();
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(BACKGROUND_COLOR);
        this.scene.fog = new THREE.FogExp2(BACKGROUND_COLOR, 0.008);
    }

    _initCamera() {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        const frustum = 15;
        this.camera = new THREE.OrthographicCamera(
            -frustum * aspect, frustum * aspect,
            frustum, -frustum,
            0.1, 1000
        );
        this.cameraFrustum = frustum;
        this.camera.position.set(30, 30, 30);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = ISO_Y_ROTATION;
        this.camera.rotation.x = -ISO_X_ROTATION;
        this.camera.lookAt(0, 0, 0);
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
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

    _initLights() {
        this.ambientLight = new THREE.AmbientLight(0x4a6fa5, 0.4);
        this.scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

        const rimLight = new THREE.DirectionalLight(0x326CE5, 0.3);
        rimLight.position.set(-15, 10, -15);
        this.scene.add(rimLight);
    }

    _initGrid() {
        this.gridGroup = new THREE.Group();
        const gridMaterial = new THREE.LineBasicMaterial({
            color: K8S_BLUE,
            transparent: true,
            opacity: 0.12
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
            opacity: 0.3
        });
        const axesGeometry = new THREE.BufferGeometry();
        axesGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
            -halfSize, 0, 0, halfSize, 0, 0,
            0, 0, -halfSize, 0, 0, halfSize
        ], 3));
        const axesLines = new THREE.LineSegments(axesGeometry, axesMaterial);
        this.gridGroup.add(axesLines);

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
        this._onWheel = this._handleWheel.bind(this);
        this._onResize = this._handleResize.bind(this);
        this._onContextMenu = (e) => e.preventDefault();

        this.canvas.addEventListener('mousemove', this._onMouseMove);
        this.canvas.addEventListener('mousedown', this._onMouseDown);
        this.canvas.addEventListener('mouseup', this._onMouseUp);
        this.canvas.addEventListener('wheel', this._onWheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this._onContextMenu);
        window.addEventListener('resize', this._onResize);
    }

    _handleMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (this.isPanning) {
            const dx = (event.clientX - this.panStart.x) * PAN_SPEED * this.cameraFrustum;
            const dy = (event.clientY - this.panStart.y) * PAN_SPEED * this.cameraFrustum;

            const right = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);
            this.camera.getWorldDirection(new THREE.Vector3()).cross(up).normalize();
            right.copy(this.camera.getWorldDirection(new THREE.Vector3()).cross(up).normalize());

            this.cameraTarget.addScaledVector(right, -dx);
            this.cameraTarget.y += dy;

            this.panStart.set(event.clientX, event.clientY);
            this._updateCameraPosition();
        }
    }

    _handleMouseDown(event) {
        if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
            this.isPanning = true;
            this.panStart.set(event.clientX, event.clientY);
            this.canvas.style.cursor = 'grabbing';
        } else if (event.button === 0) {
            this._performPick(true);
        }
    }

    _handleMouseUp(event) {
        if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
            this.isPanning = false;
            this.canvas.style.cursor = 'default';
        }
    }

    _handleWheel(event) {
        event.preventDefault();
        const delta = event.deltaY > 0 ? 1 + ZOOM_SPEED : 1 - ZOOM_SPEED;
        this.cameraFrustum = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.cameraFrustum * delta));
        this._updateCameraProjection();
    }

    _handleResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        this.renderer.setSize(width, height);
        this._updateCameraProjection();
    }

    _updateCameraProjection() {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera.left = -this.cameraFrustum * aspect;
        this.camera.right = this.cameraFrustum * aspect;
        this.camera.top = this.cameraFrustum;
        this.camera.bottom = -this.cameraFrustum;
        this.camera.updateProjectionMatrix();
    }

    _updateCameraPosition() {
        const offset = new THREE.Vector3(30, 30, 30).normalize().multiplyScalar(50);
        this.camera.position.copy(this.cameraTarget).add(offset);
        this.camera.lookAt(this.cameraTarget);
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

            switch (effect) {
                case 'selected':
                    mat.emissive = mat.emissive || new THREE.Color();
                    mat.emissiveIntensity = 0.5;
                    mat.emissive.set(SELECT_COLOR);
                    if (child.userData.originalScale) {
                        child.scale.copy(child.userData.originalScale).multiplyScalar(1.08);
                    }
                    break;
                case 'hovered':
                    mat.emissive = mat.emissive || new THREE.Color();
                    mat.emissiveIntensity = 0.3;
                    mat.emissive.set(HIGHLIGHT_COLOR);
                    break;
                default:
                    if (child.userData.baseEmissive) {
                        mat.emissive.copy(child.userData.baseEmissive);
                        mat.emissiveIntensity = child.userData.baseEmissiveIntensity || 0.15;
                    } else {
                        mat.emissiveIntensity = 0.15;
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
        const planeGeom = new THREE.PlaneGeometry(20, 20);
        const planeMat = new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: NAMESPACE_OPACITY,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const plane = new THREE.Mesh(planeGeom, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.01;
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
        entry.mesh.position.set(centerX, -0.01, centerZ);
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

        if (!this.isPanning) {
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
                group.position.y = (group.userData.baseY || 0) + Math.sin(time * 2 + id.charCodeAt(0)) * 0.05;
            }
            if (group.userData.animate) {
                group.userData.animate(time, delta);
            }
        }
    }

    focusResource(resourceId) {
        const group = this.resourceMeshes.get(resourceId);
        if (!group) return;

        this.cameraTarget.copy(group.position);
        this._updateCameraPosition();
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

    resetCamera() {
        this.cameraFrustum = 15;
        this.cameraTarget.set(0, 0, 0);
        this._updateCameraPosition();
        this._updateCameraProjection();
    }

    dispose() {
        this.stop();

        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        this.canvas.removeEventListener('mouseup', this._onMouseUp);
        this.canvas.removeEventListener('wheel', this._onWheel);
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
