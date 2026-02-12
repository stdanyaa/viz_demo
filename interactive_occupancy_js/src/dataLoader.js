/**
 * Data loader for occupancy volume files
 * Supports:
 * - Raw occupancy metadata JSON (grid_shape + occupancy_file)
 * - Compare-style scene manifests with occupancy.url
 * - Modalities-style manifests with modalities.occupancy.json
 */

/**
 * Load occupancy data from JSON metadata and binary file
 *
 * @param {string} jsonPath - Path to JSON metadata file
 * @returns {Promise<Object>} Loaded occupancy data with metadata
 */
export async function loadOccupancyData(jsonPath) {
  try {
    console.log(`Loading occupancy metadata from: ${jsonPath}`);

    const response = await fetch(jsonPath);
    if (!response.ok) {
      throw new Error(`Failed to load metadata: ${response.statusText}`);
    }

    const metadata = await response.json();
    const jsonUrl = new URL(jsonPath, window.location.href);

    const hasGridShape = Array.isArray(metadata.grid_shape);
    const hasOccFile = typeof metadata.occupancy_file === 'string';
    const isOccupancyMeta = hasGridShape && hasOccFile;

    if (!isOccupancyMeta) {
      const compareUrl = metadata?.occupancy?.url || null;
      const modalitiesUrl = metadata?.modalities?.occupancy?.json || null;
      const next = compareUrl || modalitiesUrl;
      if (next) {
        const resolved = new URL(next, jsonUrl).toString();
        return await loadOccupancyData(resolved);
      }
      throw new Error('Unrecognized occupancy manifest format.');
    }

    const binUrl = new URL(metadata.occupancy_file, jsonUrl);
    console.log(`Loading occupancy binary: ${binUrl.toString()}`);

    const binResponse = await fetch(binUrl);
    if (!binResponse.ok) {
      const hint = binResponse.status === 404
        ? ' (404). Start your HTTP server from `interactive_occupancy_js/` (or from the repo root and open `/interactive_occupancy_js/`).'
        : '';
      throw new Error(
        `Failed to load binary file (${binUrl.toString()}): ${binResponse.status} ${binResponse.statusText}${hint}`
      );
    }

    const arrayBuffer = await binResponse.arrayBuffer();
    const expectedSize = metadata.grid_shape.reduce((a, b) => a * b, 1);
    const encoding = typeof metadata.encoding === 'string' ? metadata.encoding : 'raw';

    if (encoding === 'bitset') {
      const occupancyBits = new Uint8Array(arrayBuffer);
      const expectedBytes = Math.ceil(expectedSize / 8);
      if (occupancyBits.length !== expectedBytes) {
        console.warn(`Warning: occupancy bitset size (${occupancyBits.length}) != expected (${expectedBytes})`);
      }
      return {
        encoding: 'bitset',
        occupancyBits,
        numVoxels: Number(metadata.num_voxels || expectedSize),
        bitorder: metadata.bitorder || 'lsb0',
        bakeThreshold: Number(metadata.bake_threshold),
        gridShape: metadata.grid_shape,
        bounds: metadata.bounds,
        voxelSize: metadata.voxel_size,
        occupancyRange: metadata.occupancy_range,
      };
    }

    const occupancyFlat = new Float32Array(arrayBuffer);
    if (occupancyFlat.length !== expectedSize) {
      console.warn(`Warning: occupancy binary size (${occupancyFlat.length}) != expected (${expectedSize})`);
    }

    return {
      encoding: 'raw',
      occupancy: occupancyFlat,
      numVoxels: expectedSize,
      gridShape: metadata.grid_shape,
      bounds: metadata.bounds,
      voxelSize: metadata.voxel_size,
      occupancyRange: metadata.occupancy_range,
    };
  } catch (error) {
    console.error('Error loading occupancy data:', error);
    throw error;
  }
}
