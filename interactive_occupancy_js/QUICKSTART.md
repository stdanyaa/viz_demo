# Quick Start - Occupancy Visualization

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

Or with a specific scene:
```
http://localhost:8000?scene=data/scenes/occ_av2_(10,23)_400x400x32.json
```

Default is 3D mode (heavier). Force fast 2D mode:
```
http://localhost:8000?mode=2d&scene=data/scenes/occ_av2_(10,23)_400x400x32.json
```

## Step 4: Use the Controls

Once loaded, you'll see:
- **View Mode**: Switch between "Max Projection", "Mean Projection", or "Z Slice"
- **Z Slice slider**: (only in slice mode) Navigate through different heights
- **Threshold**: Filter out low occupancy values
- **Colormap**: Choose "Turbo" or "Hot" colormap
- **Alpha**: Adjust transparency

## Troubleshooting

**"Failed to load metadata" error:**
- Make sure you're running a local server (not opening file:// directly)
- Check that `data/scenes/occ_av2_(10,23)_400x400x32.json` exists

**"Failed to load binary file" error:**
- Check that `data/scenes/occ_av2_(10,23)_400x400x32.bin` exists
- Make sure the JSON file references the correct binary filename

**Blank screen:**
- Open browser console (F12) to see error messages
- Check that all JavaScript files are loading correctly
