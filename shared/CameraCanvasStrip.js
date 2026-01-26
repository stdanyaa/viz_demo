/**
 * CameraCanvasStrip
 * Adapter around InfiniteStrip for canvas-based camera tiles with optional overlay updates.
 *
 * This module is renderer-agnostic: you provide `rendererFactory(canvas)` that returns an object
 * implementing the methods used in forward-attention.
 */
import { InfiniteStrip } from './InfiniteStrip.js';

export class CameraCanvasStrip {
  /**
   * @param {HTMLElement} container
   * @param {Array<string>} cameraNames
   * @param {Object} deps
   * @param {(camName:string)=>Object} deps.getPatchInfoForCam
   * @param {(camName:string)=>Image} deps.getImageForCam
   * @param {(camName:string, queryIdx:number, opts:{meanHeads:boolean, headIdx:?number})=>Float32Array} deps.getPatchAttention
   * @param {(canvas:HTMLCanvasElement)=>any} deps.rendererFactory
   * @param {Object} [options]
   * @param {number} [options.overlayAlpha=0.6]
   * @param {boolean} [options.alwaysPannable=true]
   * @param {number} [options.maxSegments=7]
   */
  constructor(container, cameraNames, deps, options = {}) {
    this.container = container;
    this.cameraNames = cameraNames || [];

    this.getPatchInfoForCam = deps.getPatchInfoForCam;
    this.getImageForCam = deps.getImageForCam;
    this.getPatchAttention = deps.getPatchAttention;
    this.rendererFactory = deps.rendererFactory;

    this.overlayAlpha = options.overlayAlpha !== undefined ? options.overlayAlpha : 0.6;

    this._main = new Map(); // camName -> { canvas, renderer, patchInfo, labelEl }
    this._clones = new Map(); // camName -> Array<HTMLCanvasElement>
    this._strip = null;

    this._initStrip({
      alwaysPannable: options.alwaysPannable !== undefined ? options.alwaysPannable : true,
      maxSegments: options.maxSegments !== undefined ? options.maxSegments : 7
    });
  }

  destroy() {
    this._strip?.destroy();
    this._strip = null;
    this._main.clear();
    this._clones.clear();
  }

  setOverlayAlpha(alpha) {
    this.overlayAlpha = alpha;
  }

  setSelected(camName) {
    this._strip?.setSelected(camName);
  }

  /**
   * Render or update overlays for a given query.
   */
  updateOverlaysForQuery(queryIdx, opts = {}) {
    const { meanHeads = true, headIdx = null, globalMax = null, colorScheme = 'red' } = opts;

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/d2a98541-3c7b-4fd8-a1eb-81e975a90bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'shared/CameraCanvasStrip.js:updateOverlaysForQuery',message:'updateOverlaysForQuery called',data:{queryIdx,meanHeads,headIdx,hasGlobalMax:globalMax!=null,colorScheme},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    for (const camName of this.cameraNames) {
      const item = this._main.get(camName);
      if (!item) continue;
      const { renderer, patchInfo } = item;

      const img = this.getImageForCam(camName);
      renderer.clear();
      renderer.renderImage(img);

      const patchAttn = this.getPatchAttention(camName, queryIdx, { meanHeads, headIdx });
      renderer.renderPatchAttentionOverlay(patchAttn, patchInfo, {
        alpha: this.overlayAlpha,
        globalMax,
        colorScheme
      });

      renderer.renderPatchGrid(patchInfo, 'cyan', 0.15);
    }

    this._syncClonesFromMain();
  }

  _initStrip({ alwaysPannable, maxSegments }) {
    this._main.clear();
    this._clones.clear();

    const items = this.cameraNames.map((name) => ({ key: name, label: name }));

    this._strip = new InfiniteStrip(this.container, items, {
      key: (it) => it.key,
      itemClass: 'camera-strip-item',
      alwaysPannable,
      maxSegments,
      enableInfinite: true,
      onRenderStart: () => {
        this._main.clear();
        this._clones.clear();
      },
      onRenderEnd: () => {
        // When InfiniteStrip re-renders (e.g., iframe autoheight triggers resize),
        // clones are re-created and need to be synced again.
        requestAnimationFrame(() => this._syncClonesFromMain());
      },
      renderMainItem: (el, it) => {
        const camName = it.key;

        const canvas = document.createElement('canvas');
        const label = document.createElement('div');
        label.className = 'camera-strip-label';
        label.textContent = it.label;

        el.appendChild(canvas);
        el.appendChild(label);

        const patchInfo = this.getPatchInfoForCam(camName);
        const renderer = this.rendererFactory(canvas);
        this._main.set(camName, { canvas, renderer, patchInfo, labelEl: label });

        // Initial render: image + grid only
        const img = this.getImageForCam(camName);
        renderer.clear();
        renderer.renderImage(img);
        renderer.renderPatchGrid(patchInfo, 'cyan', 0.15);

        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/d2a98541-3c7b-4fd8-a1eb-81e975a90bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2',location:'shared/CameraCanvasStrip.js:renderMainItem',message:'camera canvas initial render',data:{camName,iw:img?.naturalWidth||img?.width||0,ih:img?.naturalHeight||img?.height||0,canvasW:canvas?.width||0,canvasH:canvas?.height||0,cssW:canvas?.getBoundingClientRect?.().width||0,cssH:canvas?.getBoundingClientRect?.().height||0},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        // If the image isn't decoded yet (rare, but can happen with iframe resize races),
        // re-render once it loads.
        const iw = img?.naturalWidth || img?.width || 0;
        const ih = img?.naturalHeight || img?.height || 0;
        if (img && (!iw || !ih) && typeof img.addEventListener === 'function') {
          const onLoad = () => {
            img.removeEventListener('load', onLoad);
            const again = this._main.get(camName);
            if (!again) return;
            again.renderer.clear();
            again.renderer.renderImage(img);
            again.renderer.renderPatchGrid(again.patchInfo, 'cyan', 0.15);
            this._syncClonesFromMain();
          };
          img.addEventListener('load', onLoad, { once: true });
        }
      },
      renderCloneItem: (el, it, mainEl) => {
        void mainEl;
        const camName = it.key;

        const canvas = document.createElement('canvas');
        const label = document.createElement('div');
        label.className = 'camera-strip-label';
        label.textContent = it.label;

        el.appendChild(canvas);
        el.appendChild(label);

        const arr = this._clones.get(camName) || [];
        arr.push(canvas);
        this._clones.set(camName, arr);
      }
    });

    // After first paint, ensure clones match main.
    requestAnimationFrame(() => this._syncClonesFromMain());
  }

  _syncClonesFromMain() {
    for (const camName of this.cameraNames) {
      const main = this._main.get(camName);
      if (!main) continue;
      const clones = this._clones.get(camName) || [];

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/d2a98541-3c7b-4fd8-a1eb-81e975a90bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'shared/CameraCanvasStrip.js:_syncClonesFromMain',message:'sync clones from main',data:{camName,clones:clones.length,mainW:main.canvas?.width||0,mainH:main.canvas?.height||0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      for (const c of clones) {
        c.width = main.canvas.width;
        c.height = main.canvas.height;
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(main.canvas, 0, 0);
      }
    }
  }
}

