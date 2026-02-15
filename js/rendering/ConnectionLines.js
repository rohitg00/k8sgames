import * as THREE from 'three';

const RELATIONSHIP_COLORS = {
    ownership: 0xc9d1d9,
    network:   0x58a6ff,
    storage:   0x8b949e,
    config:    0xd29922,
    default:   0x6e7681
};

const DASH_SIZE = 0.3;
const GAP_SIZE = 0.15;
const CURVE_SEGMENTS = 32;
const FLOW_SPEED = 2.0;
const BASE_LINE_WIDTH = 1.5;
const MIN_OPACITY = 0.25;
const MAX_OPACITY = 0.7;

export class ConnectionLineManager {
    constructor(scene) {
        this.scene = scene;
        this.connections = new Map();
        this.lineGroup = new THREE.Group();
        this.scene.add(this.lineGroup);
    }

    addConnection(connection, resourceMeshes) {
        if (this.connections.has(connection.id)) return;

        const sourceGroup = resourceMeshes.get(connection.sourceId);
        const targetGroup = resourceMeshes.get(connection.targetId);
        if (!sourceGroup || !targetGroup) return;

        const sourcePos = sourceGroup.position.clone();
        const targetPos = targetGroup.position.clone();

        const midpoint = new THREE.Vector3().lerpVectors(sourcePos, targetPos, 0.5);
        const distance = sourcePos.distanceTo(targetPos);
        midpoint.y += Math.min(distance * 0.3, 3);

        const curve = new THREE.QuadraticBezierCurve3(sourcePos, midpoint, targetPos);
        const points = curve.getPoints(CURVE_SEGMENTS);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const relationColor = RELATIONSHIP_COLORS[connection.type] || RELATIONSHIP_COLORS.default;
        const trafficVolume = connection.trafficVolume || 1;
        const opacity = Math.min(MIN_OPACITY + trafficVolume * 0.05, MAX_OPACITY);

        const material = new THREE.LineDashedMaterial({
            color: relationColor,
            dashSize: DASH_SIZE,
            gapSize: GAP_SIZE,
            transparent: true,
            opacity,
            linewidth: BASE_LINE_WIDTH
        });

        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        line.userData.connectionId = connection.id;
        line.userData.sourceId = connection.sourceId;
        line.userData.targetId = connection.targetId;
        line.userData.type = connection.type;
        line.userData.flowOffset = 0;
        line.userData.flowSpeed = FLOW_SPEED * (0.5 + Math.random() * 0.5);
        line.userData.curve = curve;

        this.lineGroup.add(line);
        this.connections.set(connection.id, {
            line,
            connection,
            curve,
            sourcePos: sourcePos.clone(),
            targetPos: targetPos.clone(),
            midpoint: midpoint.clone()
        });
    }

    removeConnection(connectionId) {
        const entry = this.connections.get(connectionId);
        if (!entry) return;

        this.lineGroup.remove(entry.line);
        entry.line.geometry.dispose();
        entry.line.material.dispose();
        this.connections.delete(connectionId);
    }

    updatePositions(resourceMeshes) {
        for (const [id, entry] of this.connections) {
            const sourceGroup = resourceMeshes.get(entry.connection.sourceId);
            const targetGroup = resourceMeshes.get(entry.connection.targetId);

            if (!sourceGroup || !targetGroup) {
                this.removeConnection(id);
                continue;
            }

            const sourcePos = sourceGroup.position;
            const targetPos = targetGroup.position;

            if (sourcePos.distanceToSquared(entry.sourcePos) < 0.001 &&
                targetPos.distanceToSquared(entry.targetPos) < 0.001) {
                continue;
            }

            entry.sourcePos.copy(sourcePos);
            entry.targetPos.copy(targetPos);

            const midpoint = new THREE.Vector3().lerpVectors(sourcePos, targetPos, 0.5);
            const distance = sourcePos.distanceTo(targetPos);
            midpoint.y += Math.min(distance * 0.3, 3);
            entry.midpoint.copy(midpoint);

            const curve = new THREE.QuadraticBezierCurve3(
                sourcePos.clone(), midpoint, targetPos.clone()
            );
            entry.curve = curve;
            entry.line.userData.curve = curve;

            const points = curve.getPoints(CURVE_SEGMENTS);
            entry.line.geometry.dispose();
            entry.line.geometry = new THREE.BufferGeometry().setFromPoints(points);
            entry.line.computeLineDistances();
        }
    }

    update(delta) {
        for (const entry of this.connections.values()) {
            const line = entry.line;
            line.userData.flowOffset += line.userData.flowSpeed * delta;
            const material = line.material;
            material.dashSize = DASH_SIZE;
            material.gapSize = GAP_SIZE;

            const distances = line.geometry.attributes.lineDistance;
            if (distances) {
                const offset = line.userData.flowOffset;
                const array = distances.array;
                const totalDist = array[array.length - 1];
                for (let i = 0; i < array.length; i++) {
                    array[i] = ((array[i] / totalDist) * totalDist + offset) % (totalDist + DASH_SIZE + GAP_SIZE);
                }
                distances.needsUpdate = true;
            }
        }
    }

    sync(connectionsMap, resourceMeshes) {
        const newIds = new Set();

        for (const [id, conn] of connectionsMap) {
            newIds.add(id);
            if (!this.connections.has(id)) {
                this.addConnection(conn, resourceMeshes);
            }
        }

        for (const id of [...this.connections.keys()]) {
            if (!newIds.has(id)) {
                this.removeConnection(id);
            }
        }

        this.updatePositions(resourceMeshes);
    }

    getConnectionsForResource(resourceId) {
        const result = [];
        for (const [id, entry] of this.connections) {
            if (entry.connection.sourceId === resourceId ||
                entry.connection.targetId === resourceId) {
                result.push(entry.connection);
            }
        }
        return result;
    }

    highlightConnectionsForResource(resourceId) {
        for (const entry of this.connections.values()) {
            const isRelated = entry.connection.sourceId === resourceId ||
                              entry.connection.targetId === resourceId;
            entry.line.material.opacity = isRelated ? MAX_OPACITY : MIN_OPACITY * 0.5;
            entry.line.userData.flowSpeed = FLOW_SPEED * (isRelated ? 2 : 0.5);
        }
    }

    resetHighlight() {
        for (const entry of this.connections.values()) {
            const trafficVolume = entry.connection.trafficVolume || 1;
            entry.line.material.opacity = Math.min(MIN_OPACITY + trafficVolume * 0.05, MAX_OPACITY);
            entry.line.userData.flowSpeed = FLOW_SPEED * (0.5 + Math.random() * 0.5);
        }
    }

    getCurveForConnection(connectionId) {
        const entry = this.connections.get(connectionId);
        return entry ? entry.curve : null;
    }

    getConnectionCount() {
        return this.connections.size;
    }

    dispose() {
        for (const id of [...this.connections.keys()]) {
            this.removeConnection(id);
        }
        this.scene.remove(this.lineGroup);
    }
}
