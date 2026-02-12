# Quick Start - Occupancy 3D Viewer

This demo is a lightweight, occupancy-only 3D viewer (no 2D controls). It accepts either:
- Raw occupancy metadata JSON (`grid_shape` + `occupancy_file`), or
- Compare-style scene manifests with `occupancy.url`.

## Step 1: Verify Data Files

Make sure you have the converted data files:
```bash
ls data/scenes/
# Should show:
# - occ_av2_(10,23)_400x400x32.bin
# - occ_av2_(10,23)_400x400x32.json
```

If you don't have the `.bin` and `.json` files, convert from `.npz`:
```bash
cd scripts
python convert_occupancy_to_bin.py ../data/scenes/occ_av2_(10,23)_400x400x32.npz
```

## Step 2: Start a Local Server

You need a local web server (browsers block loading local files due to CORS). Choose one:

### Option A: Python (easiest)
```bash
cd interactive_occupancy_js
python3 -m http.server 8000
```

### Option B: Node.js
```bash
cd interactive_occupancy_js
npx http-server -p 8000
```

### Option C: PHP
```bash
cd interactive_occupancy_js
php -S localhost:8000
```

## Step 3: Open in Browser

Open your browser and go to:
```
http://localhost:8000
```

With a specific occupancy JSON:
```
http://localhost:8000?scene=data/scenes/occ_av2_(10,23)_400x400x32.json
```

With a compare-style manifest:
```
http://localhost:8000?scene=../artifacts/av2/av2_s01/frame_000121/manifests/compare.scene.json
```

## Step 4: Debugging Render Options (URL Params)

Use URL params to filter occupancy voxels:
- `vox_threshold` (or `occ_threshold`)
- `vox_z_min` (or `occ_z_min`)
- `vox_z_max` (or `occ_z_max`)
- `vox_top_layers` (or `occ_top_layers`)

Example:
```
http://localhost:8000?scene=data/scenes/occ_av2_(10,23)_400x400x32.json&vox_threshold=0.2&vox_z_min=-1&vox_z_max=2&vox_top_layers=2
```

## Controls

- Mouse orbit (drag)
- Scroll zoom
- `WASD` / arrow keys to move
- `Q/E` to yaw left/right

## Troubleshooting

**"Failed to load metadata" error:**
- Make sure you're running a local server (not opening file:// directly)
- Check that the scene file exists and the URL is correct

**"Failed to load binary file" error:**
- Check that the `.bin` exists next to the `.json`
- Start the server from `interactive_occupancy_js/` or open `/interactive_occupancy_js/` from the repo root
