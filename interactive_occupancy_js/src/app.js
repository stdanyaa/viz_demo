/**
 * Occupancy-only 3D demo app entrypoint
 */

import { loadOccupancyData } from './dataLoader.js';
import { Occupancy3DRenderer } from './renderers/Occupancy3DRenderer.js';
import { DatasetFrameDock } from '../../shared/DatasetFrameDock.js';

class App {
  static VERSION = '2026-02-12-occupancy-3d-refresh';

  constructor() {
    this.loadingEl = document.getElementById('loading');
    this.errorEl = document.getElementById('error');
    this.errorMsgEl = document.getElementById('error-message');
    this.mainEl = document.getElementById('main');
    this.canvas = document.getElementById('gl-canvas');

    this.renderer = null;
    this.dock = null;
    this.occRenderOptions = {};
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    this.occRenderOptions = this._parseOccRenderOptions(urlParams);

    const dockContainer = document.getElementById('context-dock');
    if (dockContainer) {
      this.dock = new DatasetFrameDock(dockContainer, { demoKey: 'occupancy' });
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
        scenePath = 'data/scenes/occ_av2_(10,23)_400x400x32.json';
      }
    }

    try {
      console.log('Occupancy app version:', App.VERSION);
      this.showLoading();
      const occupancyData = await loadOccupancyData(scenePath);

      this.hideLoading();
      this.showMain();

      await new Promise((r) => requestAnimationFrame(r));

      if (this.renderer?.dispose) this.renderer.dispose();
      this.renderer = new Occupancy3DRenderer(this.canvas, occupancyData, this.occRenderOptions);
    } catch (err) {
      console.error(err);
      this.showError(err?.message || String(err));
    }
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
