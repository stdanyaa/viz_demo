# Quick Start - Compare (Occupancy vs VIGT Point Cloud)

## 1) Build the frame bundle (copies images + converts data)

From repo root:

```bash
python3 interactive_compare_js/scripts/build_frame_000121.py
```

This creates:

```
interactive_compare_js/data/scenes/frame_000121/
  scene.json
  images/ring_*.jpg
  occ_frame000121.json + occ_frame000121.bin
  vigt_frame000121.json + vigt_frame000121.bin
```

## 2) Run a local server

```bash
cd interactive_compare_js
python3 -m http.server 8001
```

## 3) Open in browser

```text
http://localhost:8001/?scene=data/scenes/frame_000121/scene.json
```

## Controls

- `WASD`: move
- `Q/E`: yaw left/right
- mouse: orbit

