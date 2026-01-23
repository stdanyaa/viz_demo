/**
 * Data loader for occupancy volume files
 */

/**
 * Load occupancy data from JSON metadata and binary file
 * 
 * @param {string} jsonPath - Path to JSON metadata file
 * @returns {Promise<Object>} Loaded occupancy data with metadata
 */
export async function loadOccupancyData(jsonPath) {
    try {
        console.log(`Loading occupancy data from: ${jsonPath}`);
        
        // Fetch JSON metadata file
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`Failed to load metadata: ${response.statusText}`);
        }
        
        const metadata = await response.json();
        console.log('Metadata loaded:', metadata);
        
        // Determine binary file URL (resolve relative to the JSON URL)
        // This handles URL encoding and cases where jsonPath includes query params, etc.
        const jsonUrl = new URL(jsonPath, window.location.href);
        const binUrl = new URL(metadata.occupancy_file, jsonUrl);
        
        console.log(`Loading binary file: ${binUrl.toString()}`);
        
        // Load binary occupancy file
        const binResponse = await fetch(binUrl);
        if (!binResponse.ok) {
            const hint = binResponse.status === 404
                ? ' (404). This usually means your HTTP server is running from the wrong directory. Start it from `interactive_occupancy_js/` (or from the repo root and open `/interactive_occupancy_js/`).'
                : '';
            throw new Error(
                `Failed to load binary file (${binUrl.toString()}): ${binResponse.status} ${binResponse.statusText}${hint}`
            );
        }
        
        const arrayBuffer = await binResponse.arrayBuffer();
        const binSizeMB = arrayBuffer.byteLength / 1024 / 1024;
        console.log(`Binary file loaded (${binSizeMB.toFixed(2)} MB)`);
        
        // Convert to Float32Array
        const occupancyFlat = new Float32Array(arrayBuffer);
        
        // Verify size matches expected
        const expectedSize = metadata.grid_shape.reduce((a, b) => a * b, 1);
        if (occupancyFlat.length !== expectedSize) {
            console.warn(`Warning: Binary file size (${occupancyFlat.length}) doesn't match expected (${expectedSize})`);
        }
        
        console.log(`Converted to Float32Array (${occupancyFlat.length} elements)`);
        console.log(`Occupancy range: [${metadata.occupancy_range[0]}, ${metadata.occupancy_range[1]}]`);
        
        // Reshape to 3D array (we'll keep it flat for now, reshape in renderer if needed)
        // For now, return flat array and shape info
        return {
            occupancy: occupancyFlat,
            gridShape: metadata.grid_shape,
            bounds: metadata.bounds,
            voxelSize: metadata.voxel_size,
            occupancyRange: metadata.occupancy_range
        };
        
    } catch (error) {
        console.error('Error loading occupancy data:', error);
        throw error;
    }
}
