/**
 * Compare app entrypoint:
 * - top: image strip
 * - bottom: shared-controls multi-view (occupancy + 1-2 point clouds)
 */

import { loadCompareScene } from './sceneLoader.js?v=2026-02-13-layout-fix1';
import { ImageStrip } from '../../shared/ImageStrip.js';
import { loadPointCloudData } from './loaders/pointCloudLoader.js?v=2026-02-13-layout-fix1';
import { CompareMultiViewRenderer } from './renderers/CompareMultiViewRenderer.js?v=2026-02-13-layout-fix1';
import { DatasetFrameDock } from '../../shared/DatasetFrameDock.js';
import { orderCameraItemsForUi } from '../../shared/cameraOrder.js';

class App {
  static VERSION = '2026-01-23-compare-v2b-stabletop';

  constructor() {
    this.loadingEl = document.getElementById('loading');
    this.errorEl = document.getElementById('error');
    this.errorMsgEl = document.getElementById('error-message');
    this.mainEl = document.getElementById('main');

    this.canvasOcc = document.getElementById('gl-canvas-left');
    this.canvasPcA = document.getElementById('gl-canvas-right');
    this.canvasPcB = document.getElementById('gl-canvas-third');
    this.thumbStripEl = document.getElementById('thumb-strip');

    this.paneModeEl = document.getElementById('pane-mode');
    this.pcSelectAEl = document.getElementById('pc-select-a');
    this.pcSelectBEl = document.getElementById('pc-select-b');

    this.labelOccEl = document.getElementById('label-occ');
    this.labelPcAEl = document.getElementById('label-pc-a');
    this.labelPcBEl = document.getElementById('label-pc-b');
    this.resetViewEl = document.getElementById('reset-view');

    this.strip = null;
    this.renderer = null;
    this.dock = null;

    this.scene = null;
    this.pcOptions = [];
    this.pcCacheByUrl = new Map(); // url -> pointcloudData
    this.occRenderOptions = {};
    this._cleanupViewportSizing = null;
  }

  async init() {
    this._installViewportSizing();
    const urlParams = new URLSearchParams(window.location.search);
    this.occRenderOptions = this._parseOccRenderOptions(urlParams);
    const dockContainer = document.getElementById('context-dock');
    if (dockContainer) {
      this.dock = new DatasetFrameDock(dockContainer, { demoKey: 'compare' });
      await this.dock.init();
    }

    let scenePath = urlParams.get('scene');
    if (scenePath) {
      this.dock?.setSelectedBySceneUrl(scenePath);
    } else {
      const def = this.dock?.getDefaultSceneUrl?.() || null;
      if (def) {
        const url = new URL(window.location.href);
        url.searchParams.set('scene', def);
        window.history.replaceState({}, '', url.toString());
        scenePath = def;
        this.dock?.setSelectedBySceneUrl(def);
      } else {
        scenePath = '../artifacts/av2/av2_s01/frame_000121/manifests/compare.scene.json';
      }
    }

    try {
      console.log('Compare app version:', App.VERSION);
      this.showLoading();
      this.scene = await loadCompareScene(scenePath);
      if (this.scene && Array.isArray(this.scene.images)) {
        const datasetHint = this.scene?.manifest?.metadata?.dataset
          || this.scene?.manifest?.metadata?.dataset_name
          || this.scene?.manifest?.metadata?.datasetName
          || null;
        this.scene.images = orderCameraItemsForUi(this.scene.images, datasetHint);
      }

      // IMPORTANT: reveal layout before initializing UI + WebGL.
      // If we init while #main is display:none, canvas/image strip measure as 0x0 until a resize.
      this.hideLoading();
      this.showMain();

      // Let the browser do layout before we measure/init WebGL.
      await new Promise((r) => requestAnimationFrame(r));

      // Top strip (no selection, no-op clicks)
      const stripItems = this.scene.images.map((img) => ({
        key: img.url,
        src: img.url,
        label: img.name || img.url
      }));
      this.strip = new ImageStrip(this.thumbStripEl, stripItems, {
        enableSelection: false,
        alwaysPannable: true,
        // Reduce duplicate DOM/images; still infinite, just fewer segments.
        maxSegments: 3,
        itemClass: 'thumb'
      });

      // Let images/strip populate before WebGL init (prevents 0x0 canvas on some browsers).
      await new Promise((r) => requestAnimationFrame(r));

      // Options + selectors
      this.pcOptions = Array.isArray(this.scene.pointclouds) ? this.scene.pointclouds : [];
      if (!this.pcOptions.length) {
        throw new Error('No pointcloud entries found in scene manifest.');
      }
      this._populatePointCloudSelect(this.pcSelectAEl, this.pcOptions);
      this._populatePointCloudSelect(this.pcSelectBEl, this.pcOptions);

      // Initial state from URL params (backed by defaults)
      const panesRaw = Number(urlParams.get('panes') || this.paneModeEl?.value || 2);
      const panes = panesRaw === 3 ? 3 : 2;
      if (this.paneModeEl) this.paneModeEl.value = String(panes);

      const defaultA = this._pickDefaultKey(urlParams.get('pcA'), 0);
      const defaultB = this._pickDefaultKey(urlParams.get('pcB'), 1);
      if (this.pcSelectAEl) this.pcSelectAEl.value = defaultA;
      if (this.pcSelectBEl) this.pcSelectBEl.value = defaultB;

      // Apply pane mode (show/hide pcB)
      this._applyPaneMode(panes);

      // Load initial point clouds
      const pcAKey = this.pcSelectAEl?.value || defaultA;
      const pcBKey = this.pcSelectBEl?.value || defaultB;
      const pcAData = await this._loadPointCloudByKey(pcAKey);
      const pcBData = panes === 3 ? await this._loadPointCloudByKey(pcBKey) : null;

      // Renderer
      this._createRenderer(panes, pcAData, pcBData);

      // Hook UI events
      this._installUiHandlers();
    } catch (err) {
      console.error(err);
      this.showError(err?.message || String(err));
    }
  }

  _installUiHandlers() {
    const updateUrl = (key, value) => {
      const url = new URL(window.location.href);
      if (value === null || value === undefined || value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
      window.history.replaceState({}, '', url.toString());
    };

    this.resetViewEl?.addEventListener('click', (e) => {
      e.preventDefault();
      const defA = this._pickDefaultKey(null, 0);
      const defB = this._pickDefaultKey(null, 1);
      if (this.paneModeEl) this.paneModeEl.value = '2';
      if (this.pcSelectAEl) this.pcSelectAEl.value = defA;
      if (this.pcSelectBEl) this.pcSelectBEl.value = defB;
      // Clear URL params and reload (simplest/most reliable reset for renderer + layout).
      const url = new URL(window.location.href);
      url.searchParams.delete('panes');
      url.searchParams.delete('pcA');
      url.searchParams.delete('pcB');
      url.searchParams.delete('vox_threshold');
      url.searchParams.delete('vox_z_min');
      url.searchParams.delete('vox_z_max');
      url.searchParams.delete('vox_top_layers');
      window.location.href = url.toString();
    });

    this.paneModeEl?.addEventListener('change', async () => {
      const panes = Number(this.paneModeEl.value) === 3 ? 3 : 2;
      updateUrl('panes', panes);

      this._applyPaneMode(panes);

      // Recreate renderer so we can cleanly add/remove the third canvas.
      const pcAKey = this.pcSelectAEl?.value || this._pickDefaultKey(null, 0);
      let pcBKey = this.pcSelectBEl?.value || this._pickDefaultKey(null, 1);
      if (panes === 3 && !pcBKey) {
        pcBKey = this._pickDefaultKey(null, 1);
        if (this.pcSelectBEl) this.pcSelectBEl.value = pcBKey;
      }

      const pcAData = await this._loadPointCloudByKey(pcAKey);
      const pcBData = panes === 3 ? await this._loadPointCloudByKey(pcBKey) : null;

      this._createRenderer(panes, pcAData, pcBData);
    });

    this.pcSelectAEl?.addEventListener('change', async () => {
      const key = this.pcSelectAEl.value;
      updateUrl('pcA', key);
      const data = await this._loadPointCloudByKey(key);
      this.renderer?.setPointCloud?.(0, data);
    });

    this.pcSelectBEl?.addEventListener('change', async () => {
      const panes = Number(this.paneModeEl?.value) === 3 ? 3 : 2;
      if (panes !== 3) return;
      const key = this.pcSelectBEl.value;
      updateUrl('pcB', key);
      const data = await this._loadPointCloudByKey(key);
      this.renderer?.setPointCloud?.(1, data);
    });
  }

  _createRenderer(panes, pcAData, pcBData) {
    if (this.renderer?.dispose) this.renderer.dispose();
    this.renderer = null;

    const canvases = {
      occ: this.canvasOcc,
      pcA: this.canvasPcA,
      pcB: panes === 3 ? this.canvasPcB : null,
    };
    this.renderer = new CompareMultiViewRenderer(
      canvases,
      this.scene.occupancy,
      [pcAData, pcBData],
      this.occRenderOptions
    );
  }

  _parseOccRenderOptions(urlParams) {
    const readNum = (...keys) => {
      for (const key of keys) {
        const raw = urlParams.get(key);
        if (raw === null || raw === '') continue;
        const v = Number(raw);
        if (Number.isFinite(v)) return v;
      }
      return undefined;
    };

    const threshold = readNum('vox_threshold', 'occ_threshold');
    const zFilterMin = readNum('vox_z_min', 'occ_z_min');
    const zFilterMax = readNum('vox_z_max', 'occ_z_max');
    const topLayersRaw = readNum('vox_top_layers', 'occ_top_layers');
    const dropTopLayers = Number.isFinite(topLayersRaw)
      ? Math.max(0, Math.floor(topLayersRaw))
      : undefined;

    const opts = {};
    if (Number.isFinite(threshold)) opts.threshold = threshold;
    if (Number.isFinite(zFilterMin)) opts.zFilterMin = zFilterMin;
    if (Number.isFinite(zFilterMax)) opts.zFilterMax = zFilterMax;
    if (Number.isFinite(dropTopLayers)) opts.dropTopLayers = dropTopLayers;
    return opts;
  }

  _installViewportSizing() {
    if (this._cleanupViewportSizing) return;

    let raf = 0;
    const apply = () => {
      raf = 0;
      const vvHeight = window.visualViewport?.height || 0;
      const rawHeight = vvHeight > 0 ? vvHeight : window.innerHeight;
      const clamped = Math.max(320, Math.floor(rawHeight || 0));
      if (!clamped) return;
      document.documentElement.style.setProperty('--app-vh', `${clamped}px`);
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };

    const onWindowResize = () => schedule();
    const onViewportResize = () => schedule();
    const vv = window.visualViewport || null;

    window.addEventListener('resize', onWindowResize, { passive: true });
    vv?.addEventListener('resize', onViewportResize, { passive: true });
    vv?.addEventListener('scroll', onViewportResize, { passive: true });
    apply();

    this._cleanupViewportSizing = () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onWindowResize);
      vv?.removeEventListener('resize', onViewportResize);
      vv?.removeEventListener('scroll', onViewportResize);
      this._cleanupViewportSizing = null;
    };
  }

  _applyPaneMode(panes) {
    document.documentElement.style.setProperty('--pane-count', String(panes));
    const showB = panes === 3;
    this.canvasPcB?.classList.toggle('hidden', !showB);
    this.labelPcBEl?.classList.toggle('hidden', !showB);
    if (this.pcSelectBEl) this.pcSelectBEl.disabled = !showB;
  }

  _populatePointCloudSelect(selectEl, options) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.key;
      o.textContent = opt.label;
      selectEl.appendChild(o);
    });
  }

  _pickDefaultKey(desiredKey, fallbackIndex) {
    const keys = this.pcOptions.map((o) => o.key);
    if (desiredKey && keys.includes(desiredKey)) return desiredKey;
    if (keys.length === 0) return '';
    const idx = Math.max(0, Math.min(keys.length - 1, fallbackIndex));
    return keys[idx];
  }

  _getPointCloudOptionByKey(key) {
    return this.pcOptions.find((o) => o.key === key) || null;
  }

  async _loadPointCloudByKey(key) {
    const opt = this._getPointCloudOptionByKey(key);
    if (!opt) throw new Error(`Unknown pointcloud key: ${key}`);
    const url = opt.url;
    if (this.pcCacheByUrl.has(url)) return this.pcCacheByUrl.get(url);
    const data = await loadPointCloudData(url);
    this.pcCacheByUrl.set(url, data);
    return data;
  }

  showLoading() {
    this.loadingEl && this.loadingEl.classList.remove('hidden');
    this.errorEl && this.errorEl.classList.add('hidden');
    this.mainEl && this.mainEl.classList.add('hidden');
  }
  hideLoading() {
    this.loadingEl && this.loadingEl.classList.add('hidden');
  }
  showMain() {
    this.mainEl && this.mainEl.classList.remove('hidden');
  }
  showError(msg) {
    this.loadingEl && this.loadingEl.classList.add('hidden');
    this.mainEl && this.mainEl.classList.add('hidden');
    this.errorEl && this.errorEl.classList.remove('hidden');
    this.errorMsgEl && (this.errorMsgEl.textContent = msg);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App().init();
});
