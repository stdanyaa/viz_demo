/**
 * Occupancy loader (copied from interactive_occupancy_js/src/dataLoader.js, small renames)
 */

export async function loadOccupancyData(jsonPath) {
  console.log(`Loading occupancy metadata from: ${jsonPath}`);

  const response = await fetch(jsonPath);
  if (!response.ok) {
    throw new Error(`Failed to load metadata: ${response.status} ${response.statusText}`);
  }
  const metadata = await response.json();

  const jsonUrl = new URL(jsonPath, window.location.href);
  const binUrl = new URL(metadata.occupancy_file, jsonUrl);

  console.log(`Loading occupancy binary: ${binUrl.toString()}`);
  const binResponse = await fetch(binUrl);
  if (!binResponse.ok) {
    const hint = binResponse.status === 404
      ? ' (404). Start your HTTP server from `interactive_compare_js/` (or from the repo root and open `/interactive_compare_js/`).'
      : '';
    throw new Error(
      `Failed to load binary file (${binUrl.toString()}): ${binResponse.status} ${binResponse.statusText}${hint}`
    );
  }

  const arrayBuffer = await binResponse.arrayBuffer();
  const occupancyFlat = new Float32Array(arrayBuffer);

  const expectedSize = metadata.grid_shape.reduce((a, b) => a * b, 1);
  if (occupancyFlat.length !== expectedSize) {
    console.warn(`Warning: occupancy binary size (${occupancyFlat.length}) != expected (${expectedSize})`);
  }

  return {
    occupancy: occupancyFlat,
    gridShape: metadata.grid_shape,
    bounds: metadata.bounds,
    voxelSize: metadata.voxel_size,
    occupancyRange: metadata.occupancy_range,
  };
}

