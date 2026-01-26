/**
 * Compare app entrypoint:
 * - top: image strip
 * - bottom: shared-controls split 3D view (occupancy vs pointcloud)
 */

import { loadCompareScene } from './sceneLoader.js';
import { ImageCarousel } from './components/ImageCarousel.js';
import { SplitViewRenderer } from './renderers/SplitViewRenderer.js';

class App {
  static VERSION = '2026-01-23-compare-v2b-stabletop';

  constructor() {
    this.loadingEl = document.getElementById('loading');
    this.errorEl = document.getElementById('error');
    this.errorMsgEl = document.getElementById('error-message');
    this.mainEl = document.getElementById('main');

    this.canvasLeft = document.getElementById('gl-canvas-left');
    this.canvasRight = document.getElementById('gl-canvas-right');
    this.thumbStripEl = document.getElementById('thumb-strip');
    this.selectedImgEl = document.getElementById('selected-image');
    this.selectedLabelEl = document.getElementById('selected-label');

    this.carousel = null;
    this.renderer = null;
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const scenePath = urlParams.get('scene') || 'data/scenes/frame_000121/scene.json';

    try {
      console.log('Compare app version:', App.VERSION);
      this.showLoading();
      const scene = await loadCompareScene(scenePath);

      // IMPORTANT: reveal layout before initializing UI + WebGL.
      // If we init while #main is display:none, canvas/image strip measure as 0x0 until a resize.
      this.hideLoading();
      this.showMain();

      // Let the browser do layout before we measure/init WebGL.
      await new Promise((r) => requestAnimationFrame(r));

      // Top carousel
      this.carousel = new ImageCarousel(
        this.thumbStripEl,
        this.selectedImgEl,
        this.selectedLabelEl
      );
      this.carousel.setImages(scene.images);

      // Let images/strip populate before WebGL init (prevents 0x0 canvas on some browsers).
      await new Promise((r) => requestAnimationFrame(r));

      // Bottom split renderer
      this.renderer = new SplitViewRenderer(this.canvasLeft, this.canvasRight, scene.occupancy, scene.pointcloud);
    } catch (err) {
      console.error(err);
      this.showError(err?.message || String(err));
    }
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

