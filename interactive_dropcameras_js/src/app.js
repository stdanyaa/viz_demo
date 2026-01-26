import {
  DEFAULT_BEV_BOUNDS,
  DEFAULT_ORIENTATION,
  buildCameraWedgePx,
  drawDimMaskSelectedNoClear,
  drawWedgeOutlinesNoClear,
  hitTestWedges,
} from "./frustums.js";
import { InfiniteStrip } from "../../shared/InfiniteStrip.js";

// Keep the demo self-contained under this app's folder (GH Pages-friendly).
const SCENE_DIR = "data/drop_scenes/av2_(10,23)";

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function prettyCamName(cam) {
  return cam.replace(/^ring_/, "").replaceAll("_", " ");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return await res.json();
}

function setCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { width: w, height: h, dpr };
}

function getPointerInCanvas(ev, canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = (ev.clientX - rect.left) * dpr;
  const y = (ev.clientY - rect.top) * dpr;
  return { x, y };
}

function getContainedImageRectCss(imgEl, stageWidthCss, stageHeightCss) {
  const iw = imgEl.naturalWidth || 1;
  const ih = imgEl.naturalHeight || 1;
  const scale = Math.min(stageWidthCss / iw, stageHeightCss / ih);
  const w = iw * scale;
  const h = ih * scale;
  const x = (stageWidthCss - w) / 2;
  const y = (stageHeightCss - h) / 2;
  return { x, y, width: w, height: h };
}

class DropCamerasApp {
  constructor() {
    this.cameraStripEl = $("camera-strip");
    this.imgAll = $("img-all");
    this.imgSelected = $("img-selected");
    this.overlayAll = $("overlay-all");
    this.overlaySelected = $("overlay-selected");
    this.selectedLabel = $("selected-label");

    /** @type {any} */
    this.meta = null;
    /** @type {string[]} */
    this.cams = [];
    /** @type {string} */
    this.selectedCam = "";
    /** @type {InfiniteStrip|null} */
    this.strip = null;

    this.lengthMeters = 15.0;
    this.bounds = DEFAULT_BEV_BOUNDS;
    this.dimAlpha = 0.32;

    // If overlays appear mirrored, tweak these.
    this.orient = { ...DEFAULT_ORIENTATION };

    this._wedgesAll = [];
    this._wedgesSelected = [];
    this._rectAll = null; // device px rect of displayed image within overlay canvas
    this._rectSelected = null;

    this._resizeObserver = null;
  }

  async init() {
    // Images
    this.imgAll.src = `${SCENE_DIR}/all.jpg`;

    // Metadata: generated from metadata.npz.npy by python script
    const metaUrl = `${SCENE_DIR}/metadata.json`;
    this.meta = await fetchJson(metaUrl);

    this.cams = Array.isArray(this.meta.viz_camera_order) ? this.meta.viz_camera_order : Object.keys(this.meta.cameras || {});
    if (this.cams.length === 0) throw new Error("No cameras found in metadata.json");

    // Optional bounds override from metadata.json
    if (this.meta.bounds?.x && this.meta.bounds?.y) {
      const [x0, x1] = this.meta.bounds.x;
      const [y0, y1] = this.meta.bounds.y;
      // Note: bounds are in BEV coords after world->bev mapping. For symmetric [-40,40] it's same.
      this.bounds = { xmin: x0, xmax: x1, ymin: y0, ymax: y1 };
    }

    // Default selection: front center if present; else first.
    this.selectedCam = this.cams.includes("ring_front_center") ? "ring_front_center" : this.cams[0];
    this._applySelection();
    this._initCameraStrip();

    // Ensure overlays are always aligned with the rendered image area.
    this._setupResizeHandling();

    // Frustum click interaction on both panels
    this.overlayAll.addEventListener("click", (ev) =>
      this._onOverlayClick(ev, this.overlayAll, this._wedgesAll, this._rectAll)
    );
    this.overlaySelected.addEventListener("click", (ev) =>
      this._onOverlayClick(ev, this.overlaySelected, this._wedgesSelected, this._rectSelected)
    );

    // Redraw once images have dimensions
    this.imgAll.addEventListener("load", () => this.renderOverlays());
    this.imgSelected.addEventListener("load", () => this.renderOverlays());

    // First draw
    this.renderOverlays();
  }

  _setupResizeHandling() {
    const redraw = () => this.renderOverlays();
    window.addEventListener("resize", redraw);

    // ResizeObserver gives tighter alignment when panels change size
    if ("ResizeObserver" in window) {
      this._resizeObserver = new ResizeObserver(() => redraw());
      this._resizeObserver.observe(this.overlayAll);
      this._resizeObserver.observe(this.overlaySelected);
    }
  }

  _buildCameraStrip() {
    // Deprecated in favor of InfiniteStrip-based _initCameraStrip().
  }

  _initCameraStrip() {
    const items = this.cams.map((cam) => ({
      key: cam,
      src: `${SCENE_DIR}/${cam}_cam.jpg`,
      label: prettyCamName(cam),
    }));

    // Clear and rebuild
    this.cameraStripEl.innerHTML = "";
    this.strip?.destroy?.();

    this.strip = new InfiniteStrip(this.cameraStripEl, items, {
      key: (it) => it.key,
      itemClass: "cameraButton",
      selectedClass: "cameraButton--selected",
      // Requested: drop app should stay finite (no infinite wrap).
      alwaysPannable: false,
      wheelPan: false,
      maxSegments: 1,
      enableInfinite: false,
      createItemContainer: (it) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.title = it.key;
        return btn;
      },
      onItemClick: (it) => {
        if (it.key === this.selectedCam) return;
        this.selectedCam = it.key;
        this._applySelection();
        this.strip?.setSelected(this.selectedCam);
        this.renderOverlays();
      },
      renderMainItem: (el, it) => {
        const img = document.createElement("img");
        img.className = "cameraButton__img";
        img.alt = `Camera ${it.label}`;
        img.loading = "lazy";
        img.src = it.src;

        const label = document.createElement("div");
        label.className = "cameraButton__label";
        label.textContent = it.label;

        el.appendChild(img);
        el.appendChild(label);
      },
    });

    this.strip.setSelected(this.selectedCam);
  }

  _applySelection() {
    this.imgSelected.src = `${SCENE_DIR}/${this.selectedCam}.jpg`;
    this.selectedLabel.textContent = prettyCamName(this.selectedCam);
  }

  _onOverlayClick(ev, canvas, wedges, rect) {
    if (!rect) return;
    const { x, y } = getPointerInCanvas(ev, canvas);
    // Convert to local coords inside the displayed image rectangle (object-fit: contain)
    const lx = x - rect.x;
    const ly = y - rect.y;
    if (lx < 0 || ly < 0 || lx > rect.width || ly > rect.height) return;

    const cam = hitTestWedges(wedges, lx, ly);
    if (!cam) return;
    if (cam === this.selectedCam) return;
    this.selectedCam = cam;
    this._applySelection();
    this.strip?.setSelected(this.selectedCam);
    this.renderOverlays();
  }

  _computeWedgesForCanvas(canvas, imgEl) {
    const { width, height, dpr } = setCanvasToDisplaySize(canvas);
    // Compute the actual displayed image rectangle in the stage (CSS px), then convert to device px.
    const rectCss = getContainedImageRectCss(imgEl, canvas.clientWidth || 1, canvas.clientHeight || 1);
    const rect = {
      x: rectCss.x * dpr,
      y: rectCss.y * dpr,
      width: rectCss.width * dpr,
      height: rectCss.height * dpr,
    };

    const quatConvention = this.meta.quat_convention || "wxyz";
    const wedges = [];
    for (const cam of this.cams) {
      const pose = this.meta.cameras?.[cam];
      if (!pose) continue;
      wedges.push(
        buildCameraWedgePx(cam, pose, rect.width, rect.height, {
          bounds: this.bounds,
          orient: this.orient,
          lengthMeters: this.lengthMeters,
          quatConvention,
        })
      );
    }
    return { wedges, rect, canvasSize: { width, height } };
  }

  renderOverlays() {
    // Keep overlays aligned: set canvas internal size to CSS size * dpr.
    const all = this._computeWedgesForCanvas(this.overlayAll, this.imgAll);
    const sel = this._computeWedgesForCanvas(this.overlaySelected, this.imgSelected);
    this._wedgesAll = all.wedges;
    this._rectAll = all.rect;
    this._wedgesSelected = sel.wedges;
    this._rectSelected = sel.rect;

    const ctxAll = this.overlayAll.getContext("2d");
    const ctxSel = this.overlaySelected.getContext("2d");
    if (!ctxAll || !ctxSel) return;

    // Clear full canvas then draw wedges *only over the displayed image area*
    ctxAll.setTransform(1, 0, 0, 1, 0, 0);
    ctxAll.clearRect(0, 0, ctxAll.canvas.width, ctxAll.canvas.height);
    ctxAll.save();
    ctxAll.translate(this._rectAll.x, this._rectAll.y);
    // Full surround is a reference view: don't dim it.
    drawWedgeOutlinesNoClear(ctxAll, this._wedgesAll, this.selectedCam);
    ctxAll.restore();

    ctxSel.setTransform(1, 0, 0, 1, 0, 0);
    ctxSel.clearRect(0, 0, ctxSel.canvas.width, ctxSel.canvas.height);
    ctxSel.save();
    ctxSel.translate(this._rectSelected.x, this._rectSelected.y);
    // Limit dimming to the displayed image rect; otherwise letterbox space below gets extra dim.
    drawDimMaskSelectedNoClear(ctxSel, this._wedgesSelected, this.selectedCam, this.dimAlpha, {
      width: this._rectSelected.width,
      height: this._rectSelected.height,
    });
    drawWedgeOutlinesNoClear(ctxSel, this._wedgesSelected, this.selectedCam);
    ctxSel.restore();
  }
}

// Boot
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const app = new DropCamerasApp();
    await app.init();
    // Expose for quick debugging/tweaks in console:
    window.__dropcams = app;
  } catch (err) {
    console.error(err);
    const div = document.createElement("div");
    div.style.padding = "14px";
    div.style.color = "white";
    div.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
    div.textContent = `Error: ${err?.message || String(err)}`;
    document.body.appendChild(div);
  }
});

