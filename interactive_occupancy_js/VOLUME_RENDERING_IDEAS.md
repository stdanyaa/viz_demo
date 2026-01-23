# Volume rendering ideas (for occupancy-as-field samples)

This repo currently visualizes occupancy using instanced cubes. That’s useful for debugging, but if your model output is **irregular samples of a scalar field** \(points + probability \(p\)\), the most “natural” demo visualization is typically **volume rendering** (raymarching a density field) or a **surface extracted from the field** (isosurface).

Below are approaches that avoid running Torch in the browser. The theme: **do heavy transforms in Python once**, export a render-friendly artifact, and keep JS purely for rendering + interaction.

---

## A) True volume rendering (raymarching)

### A1) Regular 3D grid + 3D texture (simplest shader)
- **Python/offline**
  - Resample your irregular field samples onto a regular grid in a bounded ROI.
  - Store density/probability in a 3D array (float or uint8).
  - Optional: prefilter / smooth (3D Gaussian) to reduce speckle.
- **JS/WebGL2**
  - Upload as a **3D texture**.
  - Raymarch a box volume:
    - Step along ray in texture space
    - Accumulate color/opacity with a **transfer function** (p→alpha, p→color)
  - Use **early ray termination** and **empty-space skipping** (see A2) for performance.

Notes:
- Visual quality depends heavily on the transfer function and step size.
- Regular-grid resampling is the main “lossy” step—choose resolution based on desired fidelity.

### A2) Sparse volume via “bricks” / tiles (performance + scalability)
Instead of a single dense 3D texture:
- Partition space into fixed-size bricks (e.g. 32³ or 64³).
- Store only bricks that contain density above a threshold.
- In the shader:
  - Use a coarse occupancy mask / indirection texture to skip empty bricks.
  - Raymarch with **adaptive step size** (bigger steps in empty/low-density regions).

Benefits:
- Lets you keep high local resolution without paying for a dense global grid.
- Makes it feasible to stream data by region-of-interest.

### A3) View-dependent / ROI rendering (interactive LOD)
- Keep a multi-resolution representation (mip pyramid of 3D textures, or multiple brick levels).
- When camera is far: sample low-res.
- When camera is near: sample high-res bricks near the frustum/camera.

This is the closest to “sample more points near the camera” without doing ML in JS.

---

## B) “Looks volumetric” but point-based (no 3D texture required)

If you want to stay point-based (because your source data is irregular):

### B1) Splat rendering (Gaussian discs / sprites)
- Export point positions + probability \(p\).
- Render as splats (screen-aligned discs) with a soft falloff.
- Map \(p\) to:
  - **alpha** (opacity)
  - **radius** (bigger for more confident samples or for lower density regions)
  - **color** (height colormap, or color by p)

This can look surprisingly good and is usually simpler than full raymarching.

### B2) Importance sample near the boundary
To avoid “foggy soup”:
- Sample more densely where the surface likely is (e.g. \(p\in[0.4,0.6]\) or around your iso-level).
- Sample less in uniform interior/exterior regions.

This produces a crisp “shell” while keeping point count manageable.

---

## C) Isosurface extraction (often the most “demo clean”)

Even if “volume” is natural, many demos read best with a surface:

### C1) Resample to grid → Marching Cubes → mesh
- Python: irregular samples → regular grid (interpolation) → marching cubes at iso-level.
- Export mesh (glTF/GLB) with normals.
- JS: render mesh with lighting, fog, AO/outline.

This gives the cleanest perception of shape and is stable in motion.

---

## Rendering “tricks” that help regardless of approach

- **Lighting**: if rendering any surface/mesh, use at least ambient + directional light.
- **Fog**: subtle fog makes depth immediately readable.
- **Tone mapping / color management**: keep colors consistent (especially if using turbo).
- **Transfer function UI**: even a tiny UI (threshold/opacity/gamma) helps a lot.
- **Early termination**: in raymarching, stop when accumulated alpha ~ 1.
- **Empty-space skipping**: coarse mask to skip regions with no density.

---

## Practical next steps (suggested experiments)

1. **Decide iso-level / density mapping**
   - If p is calibrated: try iso at 0.5.
   - If not: pick a visually meaningful threshold and expose it in UI.
2. **Prototype point splats first**
   - Fast to try; often “good enough” for demos.
3. **Then prototype grid+3D texture raymarch**
   - Start with modest grid (e.g. 128×128×64) and tune step count/transfer function.
4. If perf is an issue: move to **sparse bricks** and/or **LOD**.

