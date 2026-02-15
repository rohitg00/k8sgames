import * as THREE from 'three';

const STATUS_COLORS = {
    Running:     0x28a745,
    Pending:     0xffa657,
    Succeeded:   0x3fb950,
    Failed:      0xd73a49,
    CrashLoop:   0xf85149,
    Terminating: 0x8b949e,
    Unknown:     0x6e7681,
    Bound:       0x28a745,
    Available:   0x28a745,
    Progressing: 0x58a6ff,
    Active:      0x326CE5,
    Completed:   0x3fb950,
    Suspended:   0xffa657,
    default:     0x326CE5
};

const K8S_BLUE = 0x326CE5;
const EMISSIVE_INTENSITY = 0.15;

function getStatusColor(status) {
    return STATUS_COLORS[status] || STATUS_COLORS.default;
}

function createStandardMaterial(color, status) {
    const statusColor = getStatusColor(status);
    return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.3,
        roughness: 0.5,
        emissive: new THREE.Color(statusColor),
        emissiveIntensity: EMISSIVE_INTENSITY
    });
}

function createLabelSprite(text) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(13, 17, 23, 0.7)';
    const metrics = ctx.measureText(text);
    const textWidth = Math.min(metrics.width + 16, 256);
    ctx.fillRect((256 - textWidth) / 2, 8, textWidth, 48);

    ctx.fillStyle = '#c9d1d9';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3, 0.75, 1);
    sprite.userData.isLabel = true;
    return sprite;
}

function hexShape(radius) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
}

function starShape(outerRadius, innerRadius, points) {
    const shape = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (Math.PI / points) * i - Math.PI / 2;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
}

function shieldShape(width, height) {
    const shape = new THREE.Shape();
    const hw = width / 2;
    shape.moveTo(0, height / 2);
    shape.quadraticCurveTo(hw, height / 2, hw, height / 6);
    shape.lineTo(hw, -height / 6);
    shape.quadraticCurveTo(hw * 0.8, -height / 2.5, 0, -height / 2);
    shape.quadraticCurveTo(-hw * 0.8, -height / 2.5, -hw, -height / 6);
    shape.lineTo(-hw, height / 6);
    shape.quadraticCurveTo(-hw, height / 2, 0, height / 2);
    return shape;
}

function lockShape() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.4, -0.3);
    shape.lineTo(-0.4, 0.1);
    shape.quadraticCurveTo(-0.4, 0.5, 0, 0.5);
    shape.quadraticCurveTo(0.4, 0.5, 0.4, 0.1);
    shape.lineTo(0.4, -0.3);
    shape.lineTo(-0.4, -0.3);

    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-0.5, -0.3);
    bodyShape.lineTo(0.5, -0.3);
    bodyShape.lineTo(0.5, -0.8);
    bodyShape.lineTo(-0.5, -0.8);
    bodyShape.closePath();

    return { shackle: shape, body: bodyShape };
}

function roundedBoxGeometry(width, height, depth, radius, segments) {
    const shape = new THREE.Shape();
    const hw = width / 2 - radius;
    const hh = height / 2 - radius;

    shape.moveTo(-hw, height / 2);
    shape.lineTo(hw, height / 2);
    shape.quadraticCurveTo(width / 2, height / 2, width / 2, hh);
    shape.lineTo(width / 2, -hh);
    shape.quadraticCurveTo(width / 2, -height / 2, hw, -height / 2);
    shape.lineTo(-hw, -height / 2);
    shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2, -hh);
    shape.lineTo(-width / 2, hh);
    shape.quadraticCurveTo(-width / 2, height / 2, -hw, height / 2);

    return new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelSegments: segments || 2
    });
}

const CREATORS = {
    Pod(resource) {
        const group = new THREE.Group();
        const shape = hexShape(0.6);
        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: 0.5,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        });
        geom.center();
        const mat = createStandardMaterial(0x326CE5, resource.status);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const glowGeom = new THREE.CircleGeometry(0.7, 6);
        const glowMat = new THREE.MeshBasicMaterial({
            color: getStatusColor(resource.status),
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.26;
        glow.userData.isGlow = true;
        group.add(glow);

        const label = createLabelSprite(resource.name || 'pod');
        label.position.y = 1.0;
        group.add(label);

        group.userData.baseY = resource.y || 0;
        return group;
    },

    Deployment(resource) {
        const group = new THREE.Group();
        const geom = roundedBoxGeometry(1.4, 1.0, 0.5, 0.15, 3);
        geom.center();
        const mat = createStandardMaterial(0x1f6feb, resource.status);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const replicas = resource.replicas || 1;
        const badgeGeom = new THREE.CircleGeometry(0.2, 16);
        const badgeMat = new THREE.MeshBasicMaterial({ color: 0x58a6ff });
        const badge = new THREE.Mesh(badgeGeom, badgeMat);
        badge.position.set(0.6, 0.55, 0.3);
        badge.lookAt(0.6, 0.55, 1);
        group.add(badge);

        const badgeLabel = createLabelSprite(String(replicas));
        badgeLabel.scale.set(0.5, 0.25, 1);
        badgeLabel.position.set(0.6, 0.55, 0.32);
        group.add(badgeLabel);

        const label = createLabelSprite(resource.name || 'deploy');
        label.position.y = 1.2;
        group.add(label);
        return group;
    },

    ReplicaSet(resource) {
        const group = new THREE.Group();
        const count = Math.min(resource.replicas || 3, 5);
        for (let i = 0; i < count; i++) {
            const geom = new THREE.BoxGeometry(1.2, 0.12, 0.9);
            const mat = createStandardMaterial(0x388bfd, resource.status);
            mat.transparent = true;
            mat.opacity = 1 - i * 0.15;
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.y = i * 0.16;
            mesh.castShadow = true;
            group.add(mesh);
        }
        const label = createLabelSprite(resource.name || 'rs');
        label.position.y = count * 0.16 + 0.7;
        group.add(label);
        return group;
    },

    StatefulSet(resource) {
        const group = new THREE.Group();
        const ordinals = Math.min(resource.replicas || 3, 5);
        for (let i = 0; i < ordinals; i++) {
            const shape = hexShape(0.4);
            const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
            geom.center();
            const mat = createStandardMaterial(0x8957e5, resource.status);
            const mesh = new THREE.Mesh(geom, mat);
            mesh.position.set(i * 0.9 - (ordinals - 1) * 0.45, 0, 0);
            mesh.castShadow = true;
            group.add(mesh);

            const ordLabel = createLabelSprite(String(i));
            ordLabel.scale.set(0.5, 0.25, 1);
            ordLabel.position.set(mesh.position.x, 0.5, 0);
            group.add(ordLabel);
        }
        const label = createLabelSprite(resource.name || 'sts');
        label.position.y = 1.0;
        group.add(label);
        return group;
    },

    DaemonSet(resource) {
        const group = new THREE.Group();
        const shape = starShape(0.7, 0.35, 5);
        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: 0.4,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.03,
            bevelSegments: 1
        });
        geom.center();
        const mat = createStandardMaterial(0xd29922, resource.status);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const label = createLabelSprite(resource.name || 'ds');
        label.position.y = 1.2;
        group.add(label);

        group.userData.animate = (time) => {
            mesh.rotation.z = Math.sin(time * 0.5) * 0.1;
        };
        return group;
    },

    Service(resource) {
        const group = new THREE.Group();
        const sphereGeom = new THREE.SphereGeometry(0.5, 24, 24);
        const sphereMat = createStandardMaterial(0x58a6ff, resource.status);
        const sphere = new THREE.Mesh(sphereGeom, sphereMat);
        sphere.castShadow = true;
        group.add(sphere);

        const ringGeom = new THREE.TorusGeometry(0.75, 0.06, 8, 32);
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0x79c0ff,
            emissive: new THREE.Color(0x58a6ff),
            emissiveIntensity: 0.3,
            metalness: 0.6,
            roughness: 0.3
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        const label = createLabelSprite(resource.name || 'svc');
        label.position.y = 1.2;
        group.add(label);

        group.userData.animate = (time) => {
            ring.rotation.z = time * 0.8;
        };
        return group;
    },

    Ingress(resource) {
        const group = new THREE.Group();
        const geom = new THREE.OctahedronGeometry(0.6, 0);
        const mat = createStandardMaterial(0x79c0ff, resource.status);
        mat.flatShading = true;
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const edgesGeom = new THREE.EdgesGeometry(geom);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0xb3d9ff, transparent: true, opacity: 0.5 });
        const edges = new THREE.LineSegments(edgesGeom, edgesMat);
        group.add(edges);

        const label = createLabelSprite(resource.name || 'ing');
        label.position.y = 1.3;
        group.add(label);

        group.userData.animate = (time) => {
            mesh.rotation.y = time * 0.4;
            edges.rotation.y = time * 0.4;
        };
        return group;
    },

    ConfigMap(resource) {
        const group = new THREE.Group();
        const geom = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16);
        const mat = createStandardMaterial(0xe3b341, resource.status);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const capGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 16);
        const capMat = new THREE.MeshStandardMaterial({
            color: 0xf0c84d,
            metalness: 0.4,
            roughness: 0.4
        });
        const topCap = new THREE.Mesh(capGeom, capMat);
        topCap.position.y = 0.42;
        group.add(topCap);
        const bottomCap = new THREE.Mesh(capGeom, capMat.clone());
        bottomCap.position.y = -0.42;
        group.add(bottomCap);

        const label = createLabelSprite(resource.name || 'cm');
        label.position.y = 1.1;
        group.add(label);
        return group;
    },

    Secret(resource) {
        const group = new THREE.Group();
        const shapes = lockShape();

        const shackleGeom = new THREE.ExtrudeGeometry(shapes.shackle, {
            depth: 0.25, bevelEnabled: false
        });
        shackleGeom.center();
        const shackleMat = createStandardMaterial(0x8b949e, resource.status);
        const shackleMesh = new THREE.Mesh(shackleGeom, shackleMat);
        shackleMesh.position.y = 0.3;
        shackleMesh.castShadow = true;
        group.add(shackleMesh);

        const bodyGeom = new THREE.ExtrudeGeometry(shapes.body, {
            depth: 0.35, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03
        });
        bodyGeom.center();
        const bodyMat = createStandardMaterial(0x6e7681, resource.status);
        const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
        bodyMesh.position.y = -0.15;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const label = createLabelSprite(resource.name || 'secret');
        label.position.y = 1.2;
        group.add(label);
        return group;
    },

    PVC(resource) {
        const group = new THREE.Group();
        const geom = new THREE.CylinderGeometry(0.5, 0.4, 0.8, 8);
        const mat = createStandardMaterial(0x56d364, resource.status);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const ringGeom = new THREE.TorusGeometry(0.52, 0.04, 8, 8);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x3fb950, metalness: 0.5, roughness: 0.3 });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.2;
        group.add(ring);

        const label = createLabelSprite(resource.name || 'pvc');
        label.position.y = 1.1;
        group.add(label);
        return group;
    },

    HPA(resource) {
        const group = new THREE.Group();
        const gaugeGeom = new THREE.TorusGeometry(0.55, 0.1, 8, 24, Math.PI * 1.5);
        const gaugeMat = createStandardMaterial(0xd2a8ff, resource.status);
        const gauge = new THREE.Mesh(gaugeGeom, gaugeMat);
        gauge.rotation.z = Math.PI * 0.75;
        gauge.castShadow = true;
        group.add(gauge);

        const needleGeom = new THREE.ConeGeometry(0.04, 0.5, 4);
        const needleMat = new THREE.MeshStandardMaterial({ color: 0xff7b72, emissive: new THREE.Color(0xff7b72), emissiveIntensity: 0.3 });
        const needle = new THREE.Mesh(needleGeom, needleMat);
        needle.position.y = 0.2;
        group.add(needle);

        const hubGeom = new THREE.SphereGeometry(0.08, 8, 8);
        const hub = new THREE.Mesh(hubGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8 }));
        group.add(hub);

        const label = createLabelSprite(resource.name || 'hpa');
        label.position.y = 1.2;
        group.add(label);

        group.userData.animate = (time) => {
            const utilization = resource.currentUtilization || 50;
            const angle = (utilization / 100) * Math.PI * 1.5 - Math.PI * 0.75;
            needle.rotation.z = angle + Math.sin(time * 2) * 0.05;
        };
        return group;
    },

    NetworkPolicy(resource) {
        const group = new THREE.Group();
        const shape = shieldShape(1.0, 1.2);
        const geom = new THREE.ExtrudeGeometry(shape, {
            depth: 0.25,
            bevelEnabled: true,
            bevelThickness: 0.04,
            bevelSize: 0.04,
            bevelSegments: 2
        });
        geom.center();
        const mat = createStandardMaterial(0xf0883e, resource.status);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const label = createLabelSprite(resource.name || 'netpol');
        label.position.y = 1.3;
        group.add(label);
        return group;
    },

    ResourceQuota(resource) {
        const group = new THREE.Group();
        const boxGeom = new THREE.BoxGeometry(1.0, 0.8, 0.6);
        const boxMat = createStandardMaterial(0xdb6d28, resource.status);
        const box = new THREE.Mesh(boxGeom, boxMat);
        box.castShadow = true;
        group.add(box);

        for (let i = 0; i < 3; i++) {
            const stripeGeom = new THREE.BoxGeometry(1.02, 0.06, 0.62);
            const stripeMat = new THREE.MeshStandardMaterial({
                color: 0xffa657,
                emissive: new THREE.Color(0xffa657),
                emissiveIntensity: 0.2
            });
            const stripe = new THREE.Mesh(stripeGeom, stripeMat);
            stripe.position.y = -0.2 + i * 0.2;
            group.add(stripe);
        }

        const label = createLabelSprite(resource.name || 'quota');
        label.position.y = 1.1;
        group.add(label);
        return group;
    },

    Node(resource) {
        const group = new THREE.Group();
        const platformGeom = new THREE.BoxGeometry(4.0, 0.3, 3.0);
        const platformMat = createStandardMaterial(0x21262d, resource.status);
        platformMat.metalness = 0.5;
        platformMat.roughness = 0.6;
        const platform = new THREE.Mesh(platformGeom, platformMat);
        platform.receiveShadow = true;
        platform.castShadow = true;
        group.add(platform);

        const borderGeom = new THREE.EdgesGeometry(platformGeom);
        const borderMat = new THREE.LineBasicMaterial({ color: K8S_BLUE, transparent: true, opacity: 0.5 });
        const border = new THREE.LineSegments(borderGeom, borderMat);
        group.add(border);

        const indicatorGeom = new THREE.SphereGeometry(0.12, 8, 8);
        const indicatorMat = new THREE.MeshBasicMaterial({ color: getStatusColor(resource.status) });
        const indicator = new THREE.Mesh(indicatorGeom, indicatorMat);
        indicator.position.set(-1.8, 0.28, -1.3);
        group.add(indicator);

        const label = createLabelSprite(resource.name || 'node');
        label.position.y = 0.9;
        group.add(label);
        return group;
    },

    Namespace(resource) {
        const group = new THREE.Group();
        const planeGeom = new THREE.PlaneGeometry(6, 6);
        const planeMat = new THREE.MeshStandardMaterial({
            color: K8S_BLUE,
            transparent: true,
            opacity: 0.06,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const plane = new THREE.Mesh(planeGeom, planeMat);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        group.add(plane);

        const borderGeom = new THREE.EdgesGeometry(planeGeom);
        const borderMat = new THREE.LineBasicMaterial({ color: K8S_BLUE, transparent: true, opacity: 0.3 });
        const border = new THREE.LineSegments(borderGeom, borderMat);
        border.rotation.x = -Math.PI / 2;
        border.position.y = 0.01;
        group.add(border);

        const label = createLabelSprite(resource.name || 'ns');
        label.position.y = 0.5;
        group.add(label);
        return group;
    },

    Job(resource) {
        const group = new THREE.Group();
        const topConeGeom = new THREE.ConeGeometry(0.4, 0.6, 6);
        const mat = createStandardMaterial(0x7ee787, resource.status);
        const topCone = new THREE.Mesh(topConeGeom, mat);
        topCone.position.y = 0.3;
        topCone.castShadow = true;
        group.add(topCone);

        const botConeGeom = new THREE.ConeGeometry(0.4, 0.6, 6);
        const botCone = new THREE.Mesh(botConeGeom, mat.clone());
        botCone.rotation.x = Math.PI;
        botCone.position.y = -0.3;
        botCone.castShadow = true;
        group.add(botCone);

        const waistGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8);
        const waistMat = new THREE.MeshStandardMaterial({ color: 0xaff5b4, metalness: 0.7 });
        const waist = new THREE.Mesh(waistGeom, waistMat);
        group.add(waist);

        const label = createLabelSprite(resource.name || 'job');
        label.position.y = 1.1;
        group.add(label);

        group.userData.animate = (time) => {
            if (resource.status === 'Running') {
                group.rotation.z = Math.sin(time * 3) * 0.15;
            }
        };
        return group;
    },

    CronJob(resource) {
        const group = new THREE.Group();
        const faceGeom = new THREE.CylinderGeometry(0.6, 0.6, 0.15, 24);
        const faceMat = createStandardMaterial(0xbc8cff, resource.status);
        const face = new THREE.Mesh(faceGeom, faceMat);
        face.rotation.x = Math.PI / 2;
        face.castShadow = true;
        group.add(face);

        const rimGeom = new THREE.TorusGeometry(0.62, 0.05, 8, 24);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xd2a8ff, metalness: 0.6, roughness: 0.3 });
        const rim = new THREE.Mesh(rimGeom, rimMat);
        group.add(rim);

        const hourHandGeom = new THREE.BoxGeometry(0.04, 0.3, 0.04);
        const handMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.3 });
        const hourHand = new THREE.Mesh(hourHandGeom, handMat);
        hourHand.position.y = 0.15;
        hourHand.position.z = 0.1;
        group.add(hourHand);

        const minuteHandGeom = new THREE.BoxGeometry(0.03, 0.42, 0.03);
        const minuteHand = new THREE.Mesh(minuteHandGeom, handMat.clone());
        minuteHand.position.y = 0.21;
        minuteHand.position.z = 0.12;
        group.add(minuteHand);

        for (let i = 0; i < 12; i++) {
            const tickGeom = new THREE.BoxGeometry(0.03, 0.08, 0.03);
            const tick = new THREE.Mesh(tickGeom, new THREE.MeshBasicMaterial({ color: 0xc9d1d9 }));
            const angle = (Math.PI / 6) * i;
            tick.position.set(Math.sin(angle) * 0.5, Math.cos(angle) * 0.5, 0.1);
            group.add(tick);
        }

        const label = createLabelSprite(resource.name || 'cronjob');
        label.position.y = 1.3;
        group.add(label);

        group.userData.animate = (time) => {
            hourHand.rotation.z = -time * 0.2;
            minuteHand.rotation.z = -time * 1.2;
        };
        return group;
    }
};

export class ResourceMeshFactory {
    constructor() {
        this.geometryCache = new Map();
    }

    create(resource) {
        const creator = CREATORS[resource.type];
        if (!creator) {
            return this._createFallback(resource);
        }
        return creator(resource);
    }

    _createFallback(resource) {
        const group = new THREE.Group();
        const geom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const mat = createStandardMaterial(0x8b949e, resource.status);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        group.add(mesh);

        const label = createLabelSprite(resource.name || resource.type || '?');
        label.position.y = 1.0;
        group.add(label);
        return group;
    }

    updateStatus(group, status) {
        const statusColor = getStatusColor(status);
        group.traverse((child) => {
            if (!child.isMesh) return;
            if (child.userData.isGlow && child.material) {
                child.material.color.set(statusColor);
            } else if (!child.userData.isLabel && child.material?.emissive) {
                child.material.emissive.set(statusColor);
            }
        });
    }

    dispose(group) {
        if (!group) return;
        group.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}
