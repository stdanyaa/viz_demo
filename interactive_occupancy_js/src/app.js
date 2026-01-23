/**
 * Main application for interactive occupancy volume viewer
 */

import { loadOccupancyData } from './dataLoader.js';
import { OccupancyView } from './components/OccupancyView.js';

class App {
    static VERSION = '2026-01-23-3d-cachebust';

    constructor() {
        this.occupancyView = null;
        this.volumeRenderer = null; // optional, loaded dynamically
        this.loadingElement = null;
        this.errorElement = null;
        this.mainContent = null;
    }
    
    async init() {
        // Get DOM elements
        this.loadingElement = document.getElementById('loading');
        this.errorElement = document.getElementById('error');
        this.mainContent = document.getElementById('main-content');
        const canvasContainer = document.getElementById('canvas-container');
        const bevCanvas = document.getElementById('bev-canvas');
        
        // Get scene path from URL parameter or use default
        const urlParams = new URLSearchParams(window.location.search);
        const scenePath = urlParams.get('scene') || 'data/scenes/occ_av2_(10,23)_400x400x32.json';
        const mode = (urlParams.get('mode') || '3d').toLowerCase(); // '3d' (default) or '2d'
        
        try {
            // Show loading
            this.showLoading();
            
            // Load occupancy data
            console.log('Loading occupancy data...');
            const occupancyData = await loadOccupancyData(scenePath);
            console.log('Occupancy data loaded:', occupancyData);
            
            // Hide loading, show main content
            this.hideLoading();
            this.showMainContent();

            // Default: fast 2D BEV view with controls
            if (mode !== '3d') {
                this.init2D(canvasContainer, bevCanvas, occupancyData);
            } else {
                // Optional: heavier 3D view, loaded dynamically to avoid breaking
                // browsers that don't support import maps / bare module specifiers.
                await this.init3D(canvasContainer, occupancyData);
            }
            
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError(error.message);
        }
    }
    
    init2D(canvasContainer, bevCanvas, occupancyData) {
        // Ensure the 2D canvas is visible and container is ready
        if (bevCanvas) bevCanvas.style.display = 'block';

        this.occupancyView = new OccupancyView(canvasContainer, bevCanvas, occupancyData);

        // Wire up controls
        const viewModeEl = document.getElementById('view-mode');
        const zSliceEl = document.getElementById('z-slice');
        const zSliceValueEl = document.getElementById('z-slice-value');
        const zSliceControlEl = document.getElementById('z-slice-control');
        const thresholdEl = document.getElementById('threshold');
        const thresholdValueEl = document.getElementById('threshold-value');
        const alphaEl = document.getElementById('alpha');
        const alphaValueEl = document.getElementById('alpha-value');
        const colormapEl = document.getElementById('colormap');

        const nz = occupancyData.gridShape[2];
        if (zSliceEl) {
            zSliceEl.min = '0';
            zSliceEl.max = String(Math.max(0, nz - 1));
            zSliceEl.step = '1';
            zSliceEl.value = String(this.occupancyView.zSlice);
        }

        const updateZLabel = () => {
            if (!zSliceValueEl) return;
            const worldZ = this.occupancyView.getCurrentWorldZ();
            zSliceValueEl.textContent = `${worldZ.toFixed(2)}m`;
        };

        const syncSliceVisibility = () => {
            const isSlice = this.occupancyView.viewMode === 'slice';
            if (zSliceControlEl) zSliceControlEl.style.display = isSlice ? 'block' : 'none';
        };

        if (viewModeEl) {
            viewModeEl.value = this.occupancyView.viewMode;
            viewModeEl.addEventListener('change', () => {
                this.occupancyView.setViewMode(viewModeEl.value);
                syncSliceVisibility();
            });
        }

        if (zSliceEl) {
            zSliceEl.addEventListener('input', () => {
                this.occupancyView.setZSlice(Number(zSliceEl.value));
                updateZLabel();
            });
        }

        if (thresholdEl) {
            thresholdEl.value = String(this.occupancyView.threshold);
            thresholdValueEl && (thresholdValueEl.textContent = Number(thresholdEl.value).toFixed(3));
            thresholdEl.addEventListener('input', () => {
                const v = Number(thresholdEl.value);
                this.occupancyView.setThreshold(v);
                thresholdValueEl && (thresholdValueEl.textContent = v.toFixed(3));
            });
        }

        if (alphaEl) {
            alphaEl.value = String(this.occupancyView.alpha);
            alphaValueEl && (alphaValueEl.textContent = Number(alphaEl.value).toFixed(2));
            alphaEl.addEventListener('input', () => {
                const v = Number(alphaEl.value);
                this.occupancyView.setAlpha(v);
                alphaValueEl && (alphaValueEl.textContent = v.toFixed(2));
            });
        }

        if (colormapEl) {
            colormapEl.value = this.occupancyView.colormap;
            colormapEl.addEventListener('change', () => {
                this.occupancyView.setColormap(colormapEl.value);
            });
        }

        updateZLabel();
        syncSliceVisibility();
        this.occupancyView.render();
    }

    async init3D(canvasContainer, occupancyData) {
        const bevCanvas = document.getElementById('bev-canvas');
        if (bevCanvas) bevCanvas.style.display = 'none';

        // Hide the 2D-only controls (still keep sidebar as a hint container)
        const controls = document.getElementById('controls');
        if (controls) {
            controls.innerHTML = `
                <h2>3D mode</h2>
                <div class="hint">
                    3D rendering can be very heavy for dense volumes.
                    If this freezes, use default 2D mode (remove <code>?mode=3d</code>).
                    <div style="height: 8px"></div>
                    <div><strong>Keys</strong></div>
                    <div><code>WASD</code> move, <code>Q/E</code> rotate left/right.</div>
                </div>
            `;
        }

        // Cache-bust so Chrome definitely loads the latest module after edits.
        const mod = await import(`./volumeRenderer.js?v=${encodeURIComponent(App.VERSION)}`);
        const { VolumeRenderer } = mod;

        console.log('Initializing volume renderer...');
        this.volumeRenderer = new VolumeRenderer(canvasContainer, occupancyData);
        console.log('Volume renderer initialized');
    }

    showLoading() {
        if (this.loadingElement) {
            this.loadingElement.classList.remove('hidden');
        }
        if (this.mainContent) {
            this.mainContent.classList.add('hidden');
        }
        if (this.errorElement) {
            this.errorElement.classList.add('hidden');
        }
    }
    
    hideLoading() {
        if (this.loadingElement) {
            this.loadingElement.classList.add('hidden');
        }
    }
    
    showMainContent() {
        if (this.mainContent) {
            this.mainContent.classList.remove('hidden');
        }
    }
    
    showError(message) {
        if (this.errorElement) {
            this.errorElement.classList.remove('hidden');
            const errorMessage = this.errorElement.querySelector('#error-message');
            if (errorMessage) {
                errorMessage.textContent = message;
            }
        }
        if (this.loadingElement) {
            this.loadingElement.classList.add('hidden');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
