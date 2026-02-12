/**
 * Three.js volume renderer for occupancy data
 */

// Use explicit CDN URLs so 3D mode works without import maps.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { getTurboColorForHeight, turboColormap } from './utils/turboColormap.js';

const FLIP_LEFT_RIGHT = true;

/**
 * Visualize occupancy data using instanced rendering (memory efficient)
 * 
 * @param {Float32Array} occupancy - Flat occupancy array with indexing: z + y*nz + x*nz*ny
 * @param {Array<number>} gridShape - [nx, ny, nz] dimensions
 * @param {Object} bounds - Bounds object with x, y, z arrays
 * @param {number} threshold - Minimum occupancy value to render (default: 0.01)
 * @returns {THREE.InstancedMesh|THREE.Group} Instanced mesh containing all occupancy cubes
 */
function visualizeOccupancyWithCubes(occupancy, gridShape, bounds, threshold = 0.01) {
    const [nx, ny, nz] = gridShape;
    const [xMin, xMax] = bounds.x;
    const [yMin, yMax] = bounds.y;
    const [zMin, zMax] = bounds.z;

    const zFilterMin = -1.0;
    const zFilterMax = 3.5;
    
    // Calculate voxel size in world coordinates
    const voxelSizeX = (xMax - xMin) / nx;
    const voxelSizeY = (yMax - yMin) / ny;
    const voxelSizeZ = (zMax - zMin) / nz;
    
    // Group voxels by world Z height with fine bins for smoother color gradients
    // Use 0.1m bins for more color grades
    const binSize = 0.1; // 10cm bins for smooth color transitions
    const voxelsByZBin = new Map();
    
    // Iterate through all voxels to collect occupied ones
    // CORRECT INDEXING: z + y*nz + x*nz*ny (z varies fastest)
    for (let x = 0; x < nx; x++) {
        for (let y = 0; y < ny; y++) {
            for (let z = 0; z < nz; z++) {
                const volumeIdx = z + y * nz + x * nz * ny;
                
                if (volumeIdx >= occupancy.length) {
                    continue;
                }
                
                const p = occupancy[volumeIdx];
                if (p <= threshold) {
                    continue;
                }
                
                // Filter Z range
                const worldZ = zMin + (z + 0.5) * voxelSizeZ;
                if (worldZ < zFilterMin || worldZ > zFilterMax) {
                    continue;
                }
                
                // Group by world Z bin for smoother color coding
                const zBin = Math.floor(worldZ / binSize);
                if (!voxelsByZBin.has(zBin)) {
                    voxelsByZBin.set(zBin, []);
                }
                voxelsByZBin.get(zBin).push({ x, y, z, p, worldZ });
            }
        }
    }
    
    const totalCubes = Array.from(voxelsByZBin.values()).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`Creating ${totalCubes} instanced cubes from ${nx * ny * nz} voxels, grouped into ${voxelsByZBin.size} Z bins`);
    
    if (totalCubes === 0) {
        return new THREE.Group();
    }
    
    // Create shared geometry
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const group = new THREE.Group();
    const matrix = new THREE.Matrix4();
    
    // Create instanced meshes for each Z bin with different colors
    voxelsByZBin.forEach((voxels, zBin) => {
        const cubeCount = voxels.length;
        if (cubeCount === 0) return;
        
        // Calculate color based on average world Z height of this bin (-1.0 to 2.5 range)
        // Use the first voxel's worldZ to represent this bin
        const avgWorldZ = voxels[0].worldZ;
        const normalizedHeight = Math.max(0, Math.min(1, (avgWorldZ - zFilterMin) / (zFilterMax - zFilterMin)));
        const [r, g, b] = turboColormap(normalizedHeight);
        
        // Create material with height-based color
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(r, g, b),
            side: THREE.DoubleSide
        });
        
        // Create instanced mesh for this Z layer
        const instancedMesh = new THREE.InstancedMesh(geometry, material, cubeCount);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        // Set transforms for each cube in this bin
        for (let i = 0; i < cubeCount; i++) {
            const { x, y, z, worldZ: storedWorldZ } = voxels[i];
            // Flip axes: swap X and Y for BEV yx view
            const worldX = yMin + (y + 0.5) * voxelSizeY; // Y becomes X
            const worldY = xMin + (x + 0.5) * voxelSizeX; // X becomes Y
            const worldZ = storedWorldZ; // Use stored worldZ
            
            // Normal size (no 1.1x scale) - also flip scale to match axes
            matrix.makeScale(voxelSizeY, voxelSizeX, voxelSizeZ);
            matrix.setPosition(worldX, worldY, worldZ);
            instancedMesh.setMatrixAt(i, matrix);
        }
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        group.add(instancedMesh);
    });
    
    return group;
}

/**
 * Volume renderer class
 */
export class VolumeRenderer {
    constructor(container, occupancyData) {
        this.container = container;
        this.occupancyData = occupancyData;
        
        // Three.js setup
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.occupancyGroup = null;
        
        // Animation
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        // Create renderer (no longer need WebGL2 for simple cube rendering)
        const canvas = document.createElement('canvas');
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: canvas,
            antialias: true, 
            alpha: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        // Create camera
        const { bounds } = this.occupancyData;
        const centerX = (bounds.x[0] + bounds.x[1]) / 2;
        const centerY = (bounds.y[0] + bounds.y[1]) / 2;
        const centerZ = (bounds.z[0] + bounds.z[1]) / 2;
        
        const sizeX = bounds.x[1] - bounds.x[0];
        const sizeY = bounds.y[1] - bounds.y[0];
        const sizeZ = bounds.z[1] - bounds.z[0];
        const maxSize = Math.max(sizeX, sizeY, sizeZ);
        
        this.camera = new THREE.PerspectiveCamera(
            50,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            maxSize * 10
        );

        // IMPORTANT: this project uses Z as "up" (height). Three.js defaults to Y-up.
        // If we don't set this, OrbitControls yaw/pitch will feel wrong / axes will "flip".
        this.camera.up.set(0, 0, 1);
        
        // Position camera at center of scene, at eye level, looking forward
        // Flip axes for BEV yx view: swap X and Y
        const eyeHeight = 1.5; // Eye level at 1.5m
        this.camera.position.set(
            centerY,  // Y becomes X (centered)
            centerX,  // X becomes Y (centered)
            eyeHeight // Z stays Z (eye height)
        );
        
        // Look forward in the scene
        this.camera.lookAt(
            centerY,  // Y becomes X
            centerX + sizeX * 0.3, // X becomes Y (look forward)
            eyeHeight // Look at eye level
        );
        
        // Create controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(centerY, centerX + sizeX * 0.3, eyeHeight); // Flip axes for target
        
        // Enable full rotation - remove any angle restrictions
        this.controls.enableRotate = true;
        this.controls.minAzimuthAngle = -Infinity; // Allow unlimited horizontal rotation
        this.controls.maxAzimuthAngle = Infinity;  // Allow unlimited horizontal rotation
        this.controls.minPolarAngle = 0;            // Allow looking straight up
        this.controls.maxPolarAngle = Math.PI;     // Allow looking straight down
        
        // Store camera movement state for keyboard controls
        this.moveSpeed = 0.5;
        this.rotateSpeed = 0.02; // Rotation speed in radians per frame
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
            KeyE: false
        };
        
        // Add keyboard event listeners
        this.handleKeyDown = (event) => {
            // Use event.code for physical key position (works for both arrow keys and WASD)
            const key = event.code;
            // Also check event.key for arrow keys as fallback
            const keyName = key || event.key;
            if (keyName in this.keys) {
                this.keys[keyName] = true;
                event.preventDefault();
            }
        };
        
        this.handleKeyUp = (event) => {
            const key = event.code;
            const keyName = key || event.key;
            if (keyName in this.keys) {
                this.keys[keyName] = false;
                event.preventDefault();
            }
        };
        
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        
        // Log occupancy range for debugging
        const { occupancyRange } = this.occupancyData;
        console.log('Occupancy range:', occupancyRange);
        console.log('Bounds:', this.occupancyData.bounds);
        console.log('Grid shape:', this.occupancyData.gridShape);
        
        // Create cube-based visualization
        const occupancyGroup = visualizeOccupancyWithCubes(
            this.occupancyData.occupancy,
            this.occupancyData.gridShape,
            this.occupancyData.bounds,
            0.01 // Lower threshold to show more detail
        );
        if (FLIP_LEFT_RIGHT) {
            occupancyGroup.scale.x = -1;
        }
        
        // Set scene background to dark gray for better visibility
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Add occupancy cubes to scene
        this.scene.add(occupancyGroup);
        this.occupancyGroup = occupancyGroup; // Store reference
        
        // Log some debug info
        if (occupancyGroup instanceof THREE.InstancedMesh) {
            console.log(`Instanced mesh created with ${occupancyGroup.count} instances`);
            console.log(`Using single color material (instanced colors not working)`);
        }
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Start render loop
        this.animate();
    }
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Handle keyboard movement
        const direction = new THREE.Vector3();
        const right = new THREE.Vector3();
        
        // Get camera forward and right vectors
        this.camera.getWorldDirection(direction);
        right.crossVectors(direction, this.camera.up).normalize();
        
        // Move forward/backward
        if (this.keys.ArrowUp || this.keys.KeyW) {
            this.camera.position.addScaledVector(direction, this.moveSpeed);
            this.controls.target.addScaledVector(direction, this.moveSpeed);
        }
        if (this.keys.ArrowDown || this.keys.KeyS) {
            this.camera.position.addScaledVector(direction, -this.moveSpeed);
            this.controls.target.addScaledVector(direction, -this.moveSpeed);
        }
        
        // Move left/right
        if (this.keys.ArrowLeft || this.keys.KeyA) {
            this.camera.position.addScaledVector(right, -this.moveSpeed);
            this.controls.target.addScaledVector(right, -this.moveSpeed);
        }
        if (this.keys.ArrowRight || this.keys.KeyD) {
            this.camera.position.addScaledVector(right, this.moveSpeed);
            this.controls.target.addScaledVector(right, this.moveSpeed);
        }
        
        // Yaw left/right (Q/E): turn like a car.
        // Camera position stays fixed; we rotate the look direction around world-up (Z).
        if (this.keys.KeyQ || this.keys.KeyE) {
            const upAxis = this.camera.up; // (0,0,1)
            const angle = this.keys.KeyQ ? this.rotateSpeed : -this.rotateSpeed;

            // Current look vector (camera -> target)
            const lookOffset = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
            lookOffset.applyAxisAngle(upAxis, angle);
            this.controls.target.copy(this.camera.position).add(lookOffset);
        }
        
        this.controls.update();
        
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.controls) {
            this.controls.dispose();
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Remove keyboard listeners
        if (this.handleKeyDown) {
            window.removeEventListener('keydown', this.handleKeyDown);
        }
        if (this.handleKeyUp) {
            window.removeEventListener('keyup', this.handleKeyUp);
        }
        
        window.removeEventListener('resize', () => this.onWindowResize());
    }
}
