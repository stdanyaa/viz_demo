#!/usr/bin/env python3
"""
Convert .npz occupancy files to binary + JSON format for JavaScript web application.

This script converts numpy occupancy volumes to:
- Binary file: Raw Float32Array data
- JSON metadata: Grid bounds, voxel size, shape information
"""

import numpy as np
import json
from pathlib import Path


def convert_occupancy_to_bin(npz_path, output_path=None):
    """
    Convert .npz occupancy file to binary + JSON format.
    
    Args:
        npz_path: Path to input .npz file
        output_path: Path to output JSON file (default: same name with .json extension)
    
    Returns:
        Dictionary with converted data paths
    """
    npz_path = Path(npz_path)
    if not npz_path.exists():
        raise FileNotFoundError(f"Occupancy file not found: {npz_path}")
    
    # Load numpy data
    print(f"Loading {npz_path}...")
    data_dict = np.load(npz_path, allow_pickle=True)
    
    # Extract occupancy volume and metadata
    occupancy = data_dict['occupancy']
    x_bounds = tuple(data_dict.get('x_bounds', (-40.0, 40.0)))
    y_bounds = tuple(data_dict.get('y_bounds', (-40.0, 40.0)))
    z_bounds = tuple(data_dict.get('z_bounds', (-1.0, 5.4)))
    voxel_size = float(data_dict.get('voxel_size', 0.2))
    grid_shape = tuple(data_dict.get('grid_shape', occupancy.shape))
    
    print(f"Occupancy shape: {occupancy.shape}")
    print(f"Grid shape: {grid_shape}")
    print(f"X bounds: {x_bounds}")
    print(f"Y bounds: {y_bounds}")
    print(f"Z bounds: {z_bounds}")
    print(f"Voxel size: {voxel_size}")
    
    # Ensure occupancy is float32
    occupancy = occupancy.astype(np.float32)
    
    # Flatten to 1D array for binary storage
    # NOTE: The data is stored with z varying fastest, then y, then x
    # Index formula: z + y*nz + x*nz*ny (for shape [nx, ny, nz])
    # This is CORRECT INDEXING - do not change!
    occupancy_flat = occupancy.flatten()
    print(f"Flattened to {len(occupancy_flat)} elements")
    print(f"NOTE: Data uses CORRECT INDEXING: (nx,ny,nz) with idx=z+y*nz+x*nz*ny")
    
    # Determine output paths
    if output_path is None:
        bin_path = npz_path.parent / f"{npz_path.stem}.bin"
        json_path = npz_path.parent / f"{npz_path.stem}.json"
    else:
        output_path = Path(output_path)
        bin_path = output_path.parent / f"{output_path.stem}.bin"
        json_path = output_path
    
    # Save as binary file (little-endian float32)
    print(f"Saving binary to {bin_path}...")
    occupancy_flat.tofile(bin_path)
    bin_size = bin_path.stat().st_size / (1024 * 1024)
    print(f"Binary file size: {bin_size:.2f} MB")
    
    # Build metadata dictionary (convert numpy types to native Python types)
    metadata = {
        'occupancy_file': bin_path.name,  # Reference to binary file
        'grid_shape': [int(x) for x in grid_shape],
        'bounds': {
            'x': [float(x) for x in x_bounds],
            'y': [float(y) for y in y_bounds],
            'z': [float(z) for z in z_bounds]
        },
        'voxel_size': float(voxel_size),
        'occupancy_range': [float(occupancy.min()), float(occupancy.max())]
    }
    
    # Write JSON file
    print(f"Writing JSON to {json_path}...")
    with open(json_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    # Calculate file sizes
    npz_size = npz_path.stat().st_size / (1024 * 1024)  # MB
    json_size = json_path.stat().st_size / (1024 * 1024)  # MB
    
    print(f"Conversion complete!")
    print(f"  Input size:  {npz_size:.2f} MB")
    print(f"  Binary size: {bin_size:.2f} MB")
    print(f"  JSON size:   {json_size:.2f} MB")
    print(f"  Total output: {bin_size + json_size:.2f} MB")
    
    return {
        'bin_path': bin_path,
        'json_path': json_path,
        'metadata': metadata
    }


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Convert .npz occupancy files to binary + JSON')
    parser.add_argument('input', type=str, help='Input .npz file path')
    parser.add_argument('-o', '--output', type=str, default=None, help='Output JSON file path')
    
    args = parser.parse_args()
    
    convert_occupancy_to_bin(
        args.input,
        output_path=args.output
    )
