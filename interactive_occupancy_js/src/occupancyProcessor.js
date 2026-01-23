/**
 * Occupancy data processing utilities
 * Converts 3D occupancy volume to 2D projections
 */

/**
 * Extract a 2D slice from 3D occupancy at a specific Z height
 * 
 * @param {Float32Array} occupancy - Flat 3D occupancy array
 * @param {Array<number>} gridShape - [nx, ny, nz] dimensions
 * @param {number} zIndex - Z slice index (0 to nz-1)
 * @returns {Array<Array<number>>} 2D occupancy map [ny][nx]
 */
export function extractZSlice(occupancy, gridShape, zIndex, indexingMode = 'variant1') {
    const [dim0, dim1, dim2] = gridShape;
    
    let ny, nx, nz;
    let getIndex;
    
    switch (indexingMode) {
        case 'variant1':
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant2':
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => x + y * nx + z * nx * ny;
            break;
        case 'variant3':
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => x + y * nx + z * nx * ny;
            break;
        case 'variant4':
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant5':
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant6':
            nz = dim0; ny = dim1; nx = dim2;
            getIndex = (x, y, z) => z + y * nz + x * nz * ny;
            break;
        case 'variant7':
            nx = dim0; nz = dim1; ny = dim2;
            getIndex = (x, y, z) => x + z * nx + y * nx * nz;
            break;
        case 'variant8':
            ny = dim0; nz = dim1; nx = dim2;
            getIndex = (x, y, z) => y + z * ny + x * ny * nz;
            break;
        case 'variant9':
            nz = dim0; nx = dim1; ny = dim2;
            getIndex = (x, y, z) => z + x * nz + y * nz * nx;
            break;
        case 'variant10':
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => z + y * nz + x * nz * ny;
            break;
        default:
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
    }
    
    if (zIndex < 0 || zIndex >= nz) {
        throw new Error(`Z index ${zIndex} out of range [0, ${nz-1}]`);
    }
    
    const slice = [];
    for (let y = 0; y < ny; y++) {
        const row = [];
        for (let x = 0; x < nx; x++) {
            const volumeIdx = getIndex(x, y, zIndex);
            if (volumeIdx < occupancy.length) {
                row.push(occupancy[volumeIdx]);
            } else {
                row.push(0);
            }
        }
        slice.push(row);
    }
    
    return slice;
}

/**
 * Project 3D occupancy to 2D by taking maximum occupancy along Z axis
 * 
 * @param {Float32Array} occupancy - Flat 3D occupancy array
 * @param {Array<number>} gridShape - [nx, ny, nz] dimensions
 * @returns {Array<Array<number>>} 2D occupancy map [ny][nx] with max values
 */
export function projectMaxOccupancy(occupancy, gridShape, indexingMode = 'variant1') {
    const [dim0, dim1, dim2] = gridShape;
    
    let ny, nx, nz;
    let getIndex;
    
    switch (indexingMode) {
        case 'variant1':
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant2':
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => x + y * nx + z * nx * ny;
            break;
        case 'variant3':
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => x + y * nx + z * nx * ny;
            break;
        case 'variant4':
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant5':
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant6':
            nz = dim0; ny = dim1; nx = dim2;
            getIndex = (x, y, z) => z + y * nz + x * nz * ny;
            break;
        case 'variant7':
            nx = dim0; nz = dim1; ny = dim2;
            getIndex = (x, y, z) => x + z * nx + y * nx * nz;
            break;
        case 'variant8':
            ny = dim0; nz = dim1; nx = dim2;
            getIndex = (x, y, z) => y + z * ny + x * ny * nz;
            break;
        case 'variant9':
            nz = dim0; nx = dim1; ny = dim2;
            getIndex = (x, y, z) => z + x * nz + y * nz * nx;
            break;
        case 'variant10':
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => z + y * nz + x * nz * ny;
            break;
        default:
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
    }
    
    const projection = [];
    for (let y = 0; y < ny; y++) {
        const row = [];
        for (let x = 0; x < nx; x++) {
            let maxOcc = 0;
            for (let z = 0; z < nz; z++) {
                const volumeIdx = getIndex(x, y, z);
                if (volumeIdx < occupancy.length) {
                    maxOcc = Math.max(maxOcc, occupancy[volumeIdx]);
                }
            }
            row.push(maxOcc);
        }
        projection.push(row);
    }
    
    return projection;
}

/**
 * Project 3D occupancy to 2D by taking mean occupancy along Z axis
 * 
 * CORRECT INDEXING (variant10): (nx, ny, nz) with index = z + y*nz + x*nz*ny
 * This means z varies fastest, then y, then x (unusual but correct for this data)
 * 
 * @param {Float32Array} occupancy - Flat 3D occupancy array
 * @param {Array<number>} gridShape - Shape dimensions [nx, ny, nz]
 * @param {string} indexingMode - Indexing mode (default: 'variant10' - CORRECT)
 * @returns {Array<Array<number>>} 2D occupancy map [ny][nx] with mean values
 */
export function projectMeanOccupancy(occupancy, gridShape, indexingMode = 'variant1') {
    const [dim0, dim1, dim2] = gridShape;
    
    let ny, nx, nz;
    let getIndex;
    
    switch (indexingMode) {
        case 'variant1':
            // C-order: (ny, nx, nz), index = y + x*ny + z*ny*nx
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant2':
            // C-order: (nx, ny, nz), index = x + y*nx + z*nx*ny
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => x + y * nx + z * nx * ny;
            break;
        case 'variant3':
            // C-order: (ny, nx, nz), index = x + y*nx + z*nx*ny
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => x + y * nx + z * nx * ny;
            break;
        case 'variant4':
            // C-order: (nx, ny, nz), index = y + x*ny + z*ny*nx
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant5':
            // Fortran-order: (ny, nx, nz), index = y*1 + x*ny + z*ny*nx (same as C for this case)
            ny = dim0; nx = dim1; nz = dim2;
            getIndex = (x, y, z) => y + x * ny + z * ny * nx;
            break;
        case 'variant6':
            // C-order: (nz, ny, nx), index = z + y*nz + x*nz*ny
            nz = dim0; ny = dim1; nx = dim2;
            getIndex = (x, y, z) => z + y * nz + x * nz * ny;
            break;
        case 'variant7':
            // C-order: (nx, nz, ny), index = x + z*nx + y*nx*nz
            nx = dim0; nz = dim1; ny = dim2;
            getIndex = (x, y, z) => x + z * nx + y * nx * nz;
            break;
        case 'variant8':
            // C-order: (ny, nz, nx), index = y + z*ny + x*ny*nz
            ny = dim0; nz = dim1; nx = dim2;
            getIndex = (x, y, z) => y + z * ny + x * ny * nz;
            break;
        case 'variant9':
            // C-order: (nz, nx, ny), index = z + x*nz + y*nz*nx
            nz = dim0; nx = dim1; ny = dim2;
            getIndex = (x, y, z) => z + x * nz + y * nz * nx;
            break;
        case 'variant10':
            // CORRECT! C-order: (nx, ny, nz) but access as (z, y, x): index = z + y*nz + x*nz*ny
            // This means z varies fastest, then y, then x
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => z + y * nz + x * nz * ny;
            break;
        default:
            // Default to variant10 (CORRECT)
            nx = dim0; ny = dim1; nz = dim2;
            getIndex = (x, y, z) => z + y * nz + x * nz * ny;
    }
    
    const projection = [];
    for (let y = 0; y < ny; y++) {
        const row = [];
        for (let x = 0; x < nx; x++) {
            let sum = 0;
            for (let z = 0; z < nz; z++) {
                const volumeIdx = getIndex(x, y, z);
                if (volumeIdx >= occupancy.length) {
                    console.error(`Index out of bounds: ${volumeIdx} >= ${occupancy.length} at (x=${x}, y=${y}, z=${z})`);
                    continue;
                }
                sum += occupancy[volumeIdx];
            }
            row.push(sum / nz);
        }
        projection.push(row);
    }
    
    return projection;
}

/**
 * Get the Z index for a given world Z coordinate
 * 
 * @param {number} worldZ - World Z coordinate in meters
 * @param {Array<number>} zBounds - [zMin, zMax] in meters
 * @param {number} nz - Number of Z slices
 * @returns {number} Z index (0 to nz-1)
 */
export function worldZToIndex(worldZ, zBounds, nz) {
    const [zMin, zMax] = zBounds;
    const normalized = (worldZ - zMin) / (zMax - zMin);
    const index = Math.floor(normalized * nz);
    return Math.max(0, Math.min(nz - 1, index));
}

/**
 * Get world Z coordinate for a given Z index
 * 
 * @param {number} zIndex - Z slice index (0 to nz-1)
 * @param {Array<number>} zBounds - [zMin, zMax] in meters
 * @param {number} nz - Number of Z slices
 * @returns {number} World Z coordinate in meters
 */
export function indexToWorldZ(zIndex, zBounds, nz) {
    const [zMin, zMax] = zBounds;
    const normalized = (zIndex + 0.5) / nz; // Use center of voxel
    return zMin + normalized * (zMax - zMin);
}
