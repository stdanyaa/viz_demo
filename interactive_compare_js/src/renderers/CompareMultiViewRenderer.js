/**
 * Multi-canvas compare renderer:
 * - left canvas: occupancy voxels (with controls)
 * - right canvases: 1 or 2 point cloud views (camera pose synced from left every frame)
 *
 * Supports dynamic pointcloud swapping via setPointCloud(viewIndex, data).
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { turboColormap, normalizeHeight } from '../utils/turboColormap.js';

const FLIP_LEFT_RIGHT = true;

function sizeCanvasRenderer(renderer, canvas) {
  const rect = canvas.getBoundingClientRect();
  const wCss = Math.max(1, Math.floor(rect.width));
  const hCss = Math.max(1, Math.floor(rect.height));
  renderer.setSize(wCss, hCss, false);
  return { wCss, hCss };
}

function visualizeOccupancyWithCubes(occupancy, gridShape, bounds, threshold = 0.01) {
  const [nx, ny, nz] = gridShape;
  const [xMin, xMax] = bounds.x;
  const [yMin, yMax] = bounds.y;
  const [zMin, zMax] = bounds.z;

  const zFilterMin = -1.0;
  const zFilterMax = 3.5;

  const voxelSizeX = (xMax - xMin) / nx;
  const voxelSizeY = (yMax - yMin) / ny;
  const voxelSizeZ = (zMax - zMin) / nz;

  const binSize = 0.1;
  const voxelsByZBin = new Map();

  // z + y*nz + x*nz*ny
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        const idx = z + y * nz + x * nz * ny;
        const p = occupancy[idx];
        if (p <= threshold) continue;

        const worldZ = zMin + (z + 0.5) * voxelSizeZ;
        if (worldZ < zFilterMin || worldZ > zFilterMax) continue;

        const zBin = Math.floor(worldZ / binSize);
        let arr = voxelsByZBin.get(zBin);
        if (!arr) {
          arr = [];
          voxelsByZBin.set(zBin, arr);
        }
        arr.push({ x, y, z, worldZ });
      }
    }
  }

  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();

  voxelsByZBin.forEach((voxels) => {
    const cubeCount = voxels.length;
    if (!cubeCount) return;

    const avgWorldZ = voxels[0].worldZ;
    const t = Math.max(0, Math.min(1, (avgWorldZ - zFilterMin) / (zFilterMax - zFilterMin)));
    const [r, g, b] = turboColormap(t);

    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(r, g, b),
      side: THREE.DoubleSide,
    });

    const instanced = new THREE.InstancedMesh(geometry, material, cubeCount);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < cubeCount; i++) {
      const { x, y, z, worldZ } = voxels[i];

      // Match occupancy 3D convention: swap X/Y for BEV yx view.
      const worldX = yMin + (y + 0.5) * voxelSizeY;
      const worldY = xMin + (x + 0.5) * voxelSizeX;

      matrix.makeScale(voxelSizeY, voxelSizeX, voxelSizeZ);
      matrix.setPosition(worldX, worldY, worldZ);
      instanced.setMatrixAt(i, matrix);
    }

    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  });

  return group;
}

function buildPointCloud(points, count, bounds, opts = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));

  // Height colors (optional)
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = points[i * 3 + 2];
    const t = normalizeHeight(z, bounds.z);
    const [r, g, b] = turboColormap(t);
    colors[i * 3 + 0] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    size: Number(opts.size ?? 2.0),
    sizeAttenuation: false,
    color: opts.color ?? 0x66ccff,
    vertexColors: Boolean(opts.vertexColors ?? false),
    transparent: true,
    opacity: 0.95,
  });

  const pts = new THREE.Points(geometry, material);
  if (FLIP_LEFT_RIGHT) {
    pts.scale.x = -1;
  }
  pts.frustumCulled = false;
  return pts;
}

export class CompareMultiViewRenderer {
  constructor(canvases, occupancyData, pointCloudDatas = []) {
    this.canvases = canvases; // { occ, pcA, pcB }
    this.occ = occupancyData;

    this.rendererOcc = null;
    this.rendererPc = [null, null];

    this.cameraOcc = null;
    this.cameraPc = [null, null];
    this.controls = null;

    this.sceneOcc = new THREE.Scene();
    this.scenePc = [new THREE.Scene(), new THREE.Scene()];
    this.pcObjects = [null, null];

    this.animationId = null;
    this._resizeObserver = null;
    this._resizeRaf = 0;
    this._lastCssSizes = { occW: 0, occH: 0, pc0W: 0, pc0H: 0, pc1W: 0, pc1H: 0 };

    this.moveSpeed = 0.5;
    this.rotateSpeed = 0.02;
    this.keys = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      KeyQ: false,
      KeyE: false,
    };

    this.init(pointCloudDatas);
  }

  init(pointCloudDatas) {
    this.rendererOcc = new THREE.WebGLRenderer({
      canvas: this.canvases.occ,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.rendererOcc.setPixelRatio(window.devicePixelRatio || 1);
    this.rendererOcc.setClearColor(0x1a1a1a, 1.0);

    this.rendererPc[0] = new THREE.WebGLRenderer({
      canvas: this.canvases.pcA,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.rendererPc[0].setPixelRatio(window.devicePixelRatio || 1);
    this.rendererPc[0].setClearColor(0x1a1a1a, 1.0);

    // pcB is optional (3-pane mode). If missing/null, we just skip it.
    if (this.canvases.pcB) {
      this.rendererPc[1] = new THREE.WebGLRenderer({
        canvas: this.canvases.pcB,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      this.rendererPc[1].setPixelRatio(window.devicePixelRatio || 1);
      this.rendererPc[1].setClearColor(0x1a1a1a, 1.0);
    }

    this.sceneOcc.background = new THREE.Color(0x1a1a1a);
    this.scenePc[0].background = new THREE.Color(0x1a1a1a);
    this.scenePc[1].background = new THREE.Color(0x1a1a1a);

    const { bounds } = this.occ;
    const centerX = (bounds.x[0] + bounds.x[1]) / 2;
    const centerY = (bounds.y[0] + bounds.y[1]) / 2;

    const sizeX = bounds.x[1] - bounds.x[0];
    const sizeY = bounds.y[1] - bounds.y[0];
    const sizeZ = bounds.z[1] - bounds.z[0];
    const maxSize = Math.max(sizeX, sizeY, sizeZ);

    this.cameraOcc = new THREE.PerspectiveCamera(50, 1, 0.1, maxSize * 20 + 100);
    this.cameraOcc.up.set(0, 0, 1);
    this.cameraPc[0] = new THREE.PerspectiveCamera(50, 1, 0.1, maxSize * 20 + 100);
    this.cameraPc[0].up.set(0, 0, 1);
    this.cameraPc[1] = new THREE.PerspectiveCamera(50, 1, 0.1, maxSize * 20 + 100);
    this.cameraPc[1].up.set(0, 0, 1);

    const eyeHeight = 1.5;
    this.cameraOcc.position.set(centerY, centerX, eyeHeight);
    this.cameraOcc.lookAt(centerY, centerX + sizeX * 0.3, eyeHeight);

    for (let i = 0; i < 2; i++) {
      this.cameraPc[i].position.copy(this.cameraOcc.position);
      this.cameraPc[i].quaternion.copy(this.cameraOcc.quaternion);
    }

    this.controls = new OrbitControls(this.cameraOcc, this.rendererOcc.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(centerY, centerX + sizeX * 0.3, eyeHeight);
    this.controls.enableRotate = true;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;

    // Build occupancy scene
    const occGroup = visualizeOccupancyWithCubes(
      this.occ.occupancy,
      this.occ.gridShape,
      this.occ.bounds,
      0.01
    );
    if (FLIP_LEFT_RIGHT) {
      occGroup.scale.x = -1;
    }
    this.sceneOcc.add(occGroup);
    this.sceneOcc.add(new THREE.AxesHelper(5));

    // Init pointcloud views (if provided)
    this.setPointCloud(0, pointCloudDatas[0] ?? null);
    this.setPointCloud(1, pointCloudDatas[1] ?? null);
    this.scenePc[0].add(new THREE.AxesHelper(5));
    this.scenePc[1].add(new THREE.AxesHelper(5));

    // Key listeners
    this.handleKeyDown = (event) => {
      const key = event.code || event.key;
      if (key in this.keys) {
        this.keys[key] = true;
        event.preventDefault();
      }
    };
    this.handleKeyUp = (event) => {
      const key = event.code || event.key;
      if (key in this.keys) {
        this.keys[key] = false;
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    window.addEventListener('resize', () => this.onResize());
    this._installResizeObserver();
    this.onResize();
    this.animate();
  }

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  setPointCloud(viewIndex, pcData) {
    if (viewIndex !== 0 && viewIndex !== 1) return;

    // If this view is not present (e.g. pcB canvas missing), ignore.
    if (viewIndex === 1 && !this.canvases.pcB) return;

    // Remove old object
    const old = this.pcObjects[viewIndex];
    if (old) {
      this.scenePc[viewIndex].remove(old);
      old.geometry?.dispose?.();
      old.material?.dispose?.();
      this.pcObjects[viewIndex] = null;
    }
    if (!pcData) return;

    const obj = buildPointCloud(pcData.points, pcData.count, pcData.bounds, {
      size: 2.0,
      color: viewIndex === 0 ? 0x66ccff : 0xffcc66,
      vertexColors: false,
    });
    this.scenePc[viewIndex].add(obj);
    this.pcObjects[viewIndex] = obj;

    console.log('Pointcloud view updated:', {
      viewIndex,
      count: pcData.count,
      bounds: pcData.bounds,
      source: pcData.source,
    });
  }

  _installResizeObserver() {
    if (!('ResizeObserver' in window)) return;
    const schedule = () => {
      if (this._resizeRaf) return;
      this._resizeRaf = requestAnimationFrame(() => {
        this._resizeRaf = 0;
        this.onResize();
      });
    };
    this._resizeObserver = new ResizeObserver(() => schedule());
    const observe = (el) => { if (el) this._resizeObserver.observe(el); };
    observe(this.canvases.occ);
    observe(this.canvases.pcA);
    observe(this.canvases.pcB);
    observe(this.canvases.occ?.parentElement);
    observe(this.canvases.pcA?.parentElement);
    observe(this.canvases.pcB?.parentElement);
  }

  onResize() {
    const occ = sizeCanvasRenderer(this.rendererOcc, this.canvases.occ);
    const pc0 = sizeCanvasRenderer(this.rendererPc[0], this.canvases.pcA);

    this.cameraOcc.aspect = occ.wCss / occ.hCss;
    this.cameraOcc.updateProjectionMatrix();
    this.cameraPc[0].aspect = pc0.wCss / pc0.hCss;
    this.cameraPc[0].updateProjectionMatrix();

    let pc1 = { wCss: 0, hCss: 0 };
    if (this.canvases.pcB && this.rendererPc[1]) {
      pc1 = sizeCanvasRenderer(this.rendererPc[1], this.canvases.pcB);
      this.cameraPc[1].aspect = pc1.wCss / pc1.hCss;
      this.cameraPc[1].updateProjectionMatrix();
    }

    this._lastCssSizes = {
      occW: occ.wCss, occH: occ.hCss,
      pc0W: pc0.wCss, pc0H: pc0.hCss,
      pc1W: pc1.wCss, pc1H: pc1.hCss,
    };
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    // Cheap per-frame resize check (for iframe/layout edge cases)
    const oRect = this.canvases.occ.getBoundingClientRect();
    const aRect = this.canvases.pcA.getBoundingClientRect();
    const bRect = this.canvases.pcB ? this.canvases.pcB.getBoundingClientRect() : null;

    const occW = Math.max(1, Math.floor(oRect.width));
    const occH = Math.max(1, Math.floor(oRect.height));
    const pc0W = Math.max(1, Math.floor(aRect.width));
    const pc0H = Math.max(1, Math.floor(aRect.height));
    const pc1W = bRect ? Math.max(1, Math.floor(bRect.width)) : 0;
    const pc1H = bRect ? Math.max(1, Math.floor(bRect.height)) : 0;

    const s = this._lastCssSizes;
    if (occW !== s.occW || occH !== s.occH || pc0W !== s.pc0W || pc0H !== s.pc0H || pc1W !== s.pc1W || pc1H !== s.pc1H) {
      this.onResize();
    }

    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.cameraOcc.getWorldDirection(direction);
    right.crossVectors(direction, this.cameraOcc.up).normalize();

    if (this.keys.ArrowUp || this.keys.KeyW) {
      this.cameraOcc.position.addScaledVector(direction, this.moveSpeed);
      this.controls.target.addScaledVector(direction, this.moveSpeed);
    }
    if (this.keys.ArrowDown || this.keys.KeyS) {
      this.cameraOcc.position.addScaledVector(direction, -this.moveSpeed);
      this.controls.target.addScaledVector(direction, -this.moveSpeed);
    }
    if (this.keys.ArrowLeft || this.keys.KeyA) {
      this.cameraOcc.position.addScaledVector(right, -this.moveSpeed);
      this.controls.target.addScaledVector(right, -this.moveSpeed);
    }
    if (this.keys.ArrowRight || this.keys.KeyD) {
      this.cameraOcc.position.addScaledVector(right, this.moveSpeed);
      this.controls.target.addScaledVector(right, this.moveSpeed);
    }
    if (this.keys.KeyQ || this.keys.KeyE) {
      const upAxis = this.cameraOcc.up;
      const angle = this.keys.KeyQ ? this.rotateSpeed : -this.rotateSpeed;
      const lookOffset = new THREE.Vector3().subVectors(this.controls.target, this.cameraOcc.position);
      lookOffset.applyAxisAngle(upAxis, angle);
      this.controls.target.copy(this.cameraOcc.position).add(lookOffset);
    }

    this.controls.update();

    // Sync all pointcloud cameras from occupancy camera
    for (let i = 0; i < 2; i++) {
      this.cameraPc[i].position.copy(this.cameraOcc.position);
      this.cameraPc[i].quaternion.copy(this.cameraOcc.quaternion);
    }

    this.rendererOcc.render(this.sceneOcc, this.cameraOcc);
    this.rendererPc[0].render(this.scenePc[0], this.cameraPc[0]);
    if (this.canvases.pcB && this.rendererPc[1]) {
      this.rendererPc[1].render(this.scenePc[1], this.cameraPc[1]);
    }
  }
}
