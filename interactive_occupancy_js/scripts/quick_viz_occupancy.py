#!/usr/bin/env python3
"""
Quick occupancy visualization script
Loads .npz file and shows different views to debug data
"""

import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import sys

def load_occupancy(npz_path):
    """Load occupancy data from .npz file"""
    data = np.load(npz_path, allow_pickle=True)
    
    occupancy = data['occupancy']
    x_bounds = tuple(data.get('x_bounds', (-40.0, 40.0)))
    y_bounds = tuple(data.get('y_bounds', (-40.0, 40.0)))
    z_bounds = tuple(data.get('z_bounds', (-1.0, 5.4)))
    voxel_size = float(data.get('voxel_size', 0.2))
    
    print(f"Occupancy shape: {occupancy.shape}")
    print(f"Occupancy dtype: {occupancy.dtype}")
    print(f"Occupancy range: [{occupancy.min():.6f}, {occupancy.max():.6f}]")
    print(f"Occupancy mean: {occupancy.mean():.6f}")
    print(f"Occupancy std: {occupancy.std():.6f}")
    print(f"Non-zero voxels: {np.count_nonzero(occupancy)} / {occupancy.size} ({100*np.count_nonzero(occupancy)/occupancy.size:.2f}%)")
    print(f"Bounds: X={x_bounds}, Y={y_bounds}, Z={z_bounds}")
    print(f"Voxel size: {voxel_size}")
    
    return {
        'occupancy': occupancy,
        'x_bounds': x_bounds,
        'y_bounds': y_bounds,
        'z_bounds': z_bounds,
        'voxel_size': voxel_size
    }

def project_max(occupancy):
    """Project 3D occupancy to 2D by taking max along Z axis"""
    return np.max(occupancy, axis=2)

def project_mean(occupancy):
    """Project 3D occupancy to 2D by taking mean along Z axis"""
    return np.mean(occupancy, axis=2)

def extract_slice(occupancy, z_index):
    """Extract a 2D slice at given Z index"""
    return occupancy[:, :, z_index]

def visualize(data, output_path=None):
    """Create visualization with multiple views"""
    occupancy = data['occupancy']
    nx, ny, nz = occupancy.shape
    
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    fig.suptitle('Occupancy Visualization - Multiple Views', fontsize=16)
    
    # 1. Max projection
    ax = axes[0, 0]
    max_proj = project_max(occupancy)
    im = ax.imshow(max_proj, cmap='turbo', origin='lower', aspect='auto')
    ax.set_title(f'Max Projection\nRange: [{max_proj.min():.4f}, {max_proj.max():.4f}]')
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    plt.colorbar(im, ax=ax)
    
    # 2. Mean projection
    ax = axes[0, 1]
    mean_proj = project_mean(occupancy)
    im = ax.imshow(mean_proj, cmap='turbo', origin='lower', aspect='auto')
    ax.set_title(f'Mean Projection\nRange: [{mean_proj.min():.4f}, {mean_proj.max():.4f}]')
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    plt.colorbar(im, ax=ax)
    
    # 3. Middle Z slice
    ax = axes[0, 2]
    mid_slice = extract_slice(occupancy, nz // 2)
    im = ax.imshow(mid_slice, cmap='turbo', origin='lower', aspect='auto')
    ax.set_title(f'Middle Z Slice (z={nz//2}/{nz-1})\nRange: [{mid_slice.min():.4f}, {mid_slice.max():.4f}]')
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    plt.colorbar(im, ax=ax)
    
    # 4. Top Z slice
    ax = axes[1, 0]
    top_slice = extract_slice(occupancy, nz - 1)
    im = ax.imshow(top_slice, cmap='turbo', origin='lower', aspect='auto')
    ax.set_title(f'Top Z Slice (z={nz-1})\nRange: [{top_slice.min():.4f}, {top_slice.max():.4f}]')
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    plt.colorbar(im, ax=ax)
    
    # 5. Bottom Z slice
    ax = axes[1, 1]
    bottom_slice = extract_slice(occupancy, 0)
    im = ax.imshow(bottom_slice, cmap='turbo', origin='lower', aspect='auto')
    ax.set_title(f'Bottom Z Slice (z=0)\nRange: [{bottom_slice.min():.4f}, {bottom_slice.max():.4f}]')
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    plt.colorbar(im, ax=ax)
    
    # 6. Histogram of occupancy values
    ax = axes[1, 2]
    ax.hist(occupancy.flatten(), bins=100, log=True, alpha=0.7)
    ax.set_title('Occupancy Value Distribution (log scale)')
    ax.set_xlabel('Occupancy Value')
    ax.set_ylabel('Count (log)')
    ax.axvline(occupancy.mean(), color='r', linestyle='--', label=f'Mean: {occupancy.mean():.4f}')
    ax.legend()
    
    plt.tight_layout()
    
    if output_path:
        plt.savefig(output_path, dpi=150, bbox_inches='tight')
        print(f"\nSaved visualization to: {output_path}")
    else:
        plt.show()

def main():
    if len(sys.argv) < 2:
        print("Usage: python quick_viz_occupancy.py <npz_file> [output_image.png]")
        print("\nExample:")
        print("  python quick_viz_occupancy.py ../data/scenes/occ_av2_(10,23)_400x400x32.npz")
        print("  python quick_viz_occupancy.py ../data/scenes/occ_av2_(10,23)_400x400x32.npz output.png")
        sys.exit(1)
    
    npz_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    
    if not npz_path.exists():
        print(f"Error: File not found: {npz_path}")
        sys.exit(1)
    
    print(f"Loading occupancy data from: {npz_path}")
    print("=" * 60)
    
    data = load_occupancy(npz_path)
    
    print("=" * 60)
    print("\nCreating visualization...")
    
    visualize(data, output_path)

if __name__ == '__main__':
    main()
