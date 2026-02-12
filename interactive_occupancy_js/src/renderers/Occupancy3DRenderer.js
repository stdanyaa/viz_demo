/**
 * Occupancy-only 3D renderer extracted from compare demo.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { turboColormap } from '../utils/turboColormap.js';

const FLIP_LEFT_RIGHT = true;
const BASE_VFOV_DEG = 50;
const BASE_ASPECT = 16 / 9;
const BASE_HFOV_RAD = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_VFOV_DEG) / 2) * BASE_ASPECT);

function sizeCanvasRenderer(renderer, canvas) {
  const rect = canvas.getBoundingClientRect();
  const wCss = Math.max(1, Math.floor(rect.width));
  const hCss = Math.max(1, Math.floor(rect.height));
  renderer.setSize(wCss, hCss, false);
  return { wCss, hCss };
}

function applyCameraFov(camera, aspect) {
  if (!camera || !Number.isFinite(aspect) || aspect <= 0) return;
  const safeAspect = Math.max(0.01, aspect);
  const vFovRad = 2 * Math.atan(Math.tan(BASE_HFOV_RAD / 2) / safeAspect);
  camera.fov = THREE.MathUtils.radToDeg(vFovRad);
  camera.aspect = safeAspect;
  camera.updateProjectionMatrix();
}

function visualizeOccupancyWithCubes(occupancyData, options = {}) {
  const gridShape = occupancyData.gridShape;
  const bounds = occupancyData.bounds;
  const occupancy = occupancyData.occupancy;
  const occupancyBits = occupancyData.occupancyBits;
  const occEncoding = occupancyData.encoding || (occupancyBits ? 'bitset' : 'raw');
  const [nx, ny, nz] = gridShape;
  const [xMin, xMax] = bounds.x;
  const [yMin, yMax] = bounds.y;
  const [zMin, zMax] = bounds.z;

  const voxelSizeX = (xMax - xMin) / nx;
  const voxelSizeY = (yMax - yMin) / ny;
  const voxelSizeZ = (zMax - zMin) / nz;
  const defaultZFilterMin = zMin;
  const defaultZFilterMax = Math.min(zMax, 3.5);

  let threshold = Number(options.threshold);
  if (!Number.isFinite(threshold)) threshold = 0.5;
  threshold = Math.max(0, threshold);

  let zFilterMin = Number(options.zFilterMin);
  if (!Number.isFinite(zFilterMin)) zFilterMin = defaultZFilterMin;

  let zFilterMax = Number(options.zFilterMax);
  if (!Number.isFinite(zFilterMax)) zFilterMax = defaultZFilterMax;

  const dropTopLayers = Math.max(0, Math.floor(Number(options.dropTopLayers) || 0));
  if (dropTopLayers > 0) {
    zFilterMax -= dropTopLayers * voxelSizeZ;
  }

  zFilterMin = Math.max(zMin, zFilterMin);
  zFilterMax = Math.min(zMax, zFilterMax);
  if (zFilterMax <= zFilterMin) {
    zFilterMax = Math.min(zMax, zFilterMin + voxelSizeZ);
  }

  const binSize = 0.1;
  const voxelsByZBin = new Map();
  const xyStride = nz * ny;
  const addVoxel = (x, y, z) => {
    const worldZ = zMin + (z + 0.5) * voxelSizeZ;
    if (worldZ < zFilterMin || worldZ > zFilterMax) return;

    const zBin = Math.floor(worldZ / binSize);
    let arr = voxelsByZBin.get(zBin);
    if (!arr) {
      arr = [];
      voxelsByZBin.set(zBin, arr);
    }
    arr.push({ x, y, z, worldZ });
  };

  if (occEncoding === 'bitset') {
    const numVoxels = Number(occupancyData.numVoxels) || (nx * ny * nz);
    const bakeThreshold = Number(occupancyData.bakeThreshold);
    if (Number.isFinite(bakeThreshold) && Math.abs(threshold - bakeThreshold) > 1e-9) {
      console.warn(
        `Bitset occupancy was baked at threshold=${bakeThreshold}; URL threshold=${threshold} cannot change selection.`
      );
    }

    for (let byteIdx = 0; byteIdx < occupancyBits.length; byteIdx++) {
      const byteVal = occupancyBits[byteIdx];
      if (byteVal === 0) continue;
      for (let bit = 0; bit < 8; bit++) {
        if ((byteVal & (1 << bit)) === 0) continue;
        const idx = (byteIdx << 3) + bit;
        if (idx >= numVoxels) break;
        const x = Math.floor(idx / xyStride);
        const rem = idx - x * xyStride;
        const y = Math.floor(rem / nz);
        const z = rem - y * nz;
        addVoxel(x, y, z);
      }
    }
  } else {
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        for (let z = 0; z < nz; z++) {
          const idx = z + y * nz + x * nz * ny;
          if (idx >= occupancy.length) continue;
          const p = occupancy[idx];
          if (p <= threshold) continue;
          addVoxel(x, y, z);
        }
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
    const zSpan = Math.max(1e-6, zFilterMax - zFilterMin);
    const t = Math.max(0, Math.min(1, (avgWorldZ - zFilterMin) / zSpan));
    const [r, g, b] = turboColormap(t);

    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(r, g, b),
      side: THREE.DoubleSide,
    });

    const instanced = new THREE.InstancedMesh(geometry, material, cubeCount);
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < cubeCount; i++) {
      const { x, y, z, worldZ } = voxels[i];

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

export class Occupancy3DRenderer {
  constructor(canvas, occupancyData, occRenderOptions = {}) {
    this.canvas = canvas;
    this.occ = occupancyData;
    this.occRenderOptions = occRenderOptions;

    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this.scene = new THREE.Scene();

    this.animationId = null;
    this._resizeObserver = null;
    this._resizeRaf = 0;
    this._lastCssSizes = { w: 0, h: 0 };

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

    this.init();
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setClearColor(0x1a1a1a, 1.0);

    this.scene.background = new THREE.Color(0x1a1a1a);

    const { bounds } = this.occ;
    const centerX = (bounds.x[0] + bounds.x[1]) / 2;
    const centerY = (bounds.y[0] + bounds.y[1]) / 2;

    const sizeX = bounds.x[1] - bounds.x[0];
    const sizeY = bounds.y[1] - bounds.y[0];
    const sizeZ = bounds.z[1] - bounds.z[0];
    const maxSize = Math.max(sizeX, sizeY, sizeZ);

    this.camera = new THREE.PerspectiveCamera(BASE_VFOV_DEG, 1, 0.1, maxSize * 20 + 100);
    this.camera.up.set(0, 0, 1);

    const eyeHeight = 1.5;
    this.camera.position.set(centerY, centerX, eyeHeight);
    this.camera.lookAt(centerY, centerX + sizeX * 0.3, eyeHeight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(centerY, centerX + sizeX * 0.3, eyeHeight);
    this.controls.enableRotate = true;
    this.controls.minAzimuthAngle = -Infinity;
    this.controls.maxAzimuthAngle = Infinity;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;

    const occGroup = visualizeOccupancyWithCubes(this.occ, this.occRenderOptions);
    if (FLIP_LEFT_RIGHT) {
      occGroup.scale.x = -1;
    }
    this.scene.add(occGroup);
    this.scene.add(new THREE.AxesHelper(5));

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
    if (this.canvas) this._resizeObserver.observe(this.canvas);
    if (this.canvas?.parentElement) this._resizeObserver.observe(this.canvas.parentElement);
  }

  onResize() {
    const size = sizeCanvasRenderer(this.renderer, this.canvas);
    applyCameraFov(this.camera, size.wCss / size.hCss);
    this._lastCssSizes = { w: size.wCss, h: size.hCss };
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    const rect = this.canvas.getBoundingClientRect();
    const wCss = Math.max(1, Math.floor(rect.width));
    const hCss = Math.max(1, Math.floor(rect.height));
    if (wCss !== this._lastCssSizes.w || hCss !== this._lastCssSizes.h) {
      this.onResize();
    }

    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    right.crossVectors(direction, this.camera.up).normalize();

    if (this.keys.ArrowUp || this.keys.KeyW) {
      this.camera.position.addScaledVector(direction, this.moveSpeed);
      this.controls.target.addScaledVector(direction, this.moveSpeed);
    }
    if (this.keys.ArrowDown || this.keys.KeyS) {
      this.camera.position.addScaledVector(direction, -this.moveSpeed);
      this.controls.target.addScaledVector(direction, -this.moveSpeed);
    }
    if (this.keys.ArrowLeft || this.keys.KeyA) {
      this.camera.position.addScaledVector(right, -this.moveSpeed);
      this.controls.target.addScaledVector(right, -this.moveSpeed);
    }
    if (this.keys.ArrowRight || this.keys.KeyD) {
      this.camera.position.addScaledVector(right, this.moveSpeed);
      this.controls.target.addScaledVector(right, this.moveSpeed);
    }
    if (this.keys.KeyQ || this.keys.KeyE) {
      const upAxis = this.camera.up;
      const angle = this.keys.KeyQ ? this.rotateSpeed : -this.rotateSpeed;
      const lookOffset = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
      lookOffset.applyAxisAngle(upAxis, angle);
      this.controls.target.copy(this.camera.position).add(lookOffset);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
