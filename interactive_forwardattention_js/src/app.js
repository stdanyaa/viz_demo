/**
 * Main Application (Forward Attention)
 * Click BEV cell -> render per-camera attention overlays
 */

import { loadSceneData } from './dataLoader.js';
import { BEVView } from './components/BEVView.js';
import { CameraStrip } from './components/CameraStrip.js';

class App {
    constructor() {
        this.sceneData = null;
        this.visualizer = null;
        
        this.selectedQuery = null; // { queryIdx, xIdx, yIdx }
        this.headSelection = { mode: 'mean', headIdx: null }; // mode: 'mean' | 'head'
        this.overlayAlpha = 0.6;
        // Always use global normalization (comparable across cameras)
        this.colorScheme = 'red'; // 'red' | 'hsv'
        
        // Elements
        this.loadingEl = document.getElementById('loading');
        this.mainContentEl = document.getElementById('main-content');
        this.errorEl = document.getElementById('error');
        this.errorMessageEl = document.getElementById('error-message');
        
        this.selectionStatusEl = document.getElementById('selection-status');
        this.headSelectEl = document.getElementById('heads-select');
        this.alphaSliderEl = document.getElementById('alpha-slider');
        this.alphaValueEl = document.getElementById('alpha-value');
        this.colorSchemeEl = document.getElementById('colorscheme-select');
        
        // Components
        this.bevView = null;
        this.cameraStrip = null;
        
        this.setupControls();
    }
    
    setupControls() {
        if (this.alphaSliderEl && this.alphaValueEl) {
            this.alphaSliderEl.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.overlayAlpha = val;
                this.alphaValueEl.textContent = val.toFixed(2);
                this.updateCameraOverlays();
            });
        }
        
        if (this.headSelectEl) {
            this.headSelectEl.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val === 'mean') {
                    this.headSelection = { mode: 'mean', headIdx: null };
                } else if (val.startsWith('head:')) {
                    const headIdx = parseInt(val.split(':')[1], 10);
                    this.headSelection = { mode: 'head', headIdx };
                }
                this.updateCameraOverlays();
            });
        }

        if (this.colorSchemeEl) {
            this.colorSchemeEl.addEventListener('change', (e) => {
                this.colorScheme = e.target.value;
                this.updateCameraOverlays();
            });
        }
    }
    
    populateHeadOptions() {
        if (!this.headSelectEl || !this.visualizer) return;
        const nHeads = this.visualizer.getNumHeads();
        
        this.headSelectEl.innerHTML = '';
        const optMean = document.createElement('option');
        optMean.value = 'mean';
        optMean.textContent = 'Mean over heads';
        this.headSelectEl.appendChild(optMean);
        
        for (let h = 0; h < nHeads; h++) {
            const opt = document.createElement('option');
            opt.value = `head:${h}`;
            opt.textContent = `Head ${h}`;
            this.headSelectEl.appendChild(opt);
        }
    }
    
    async loadScene(jsonPath) {
        try {
            this.showLoading();
            this.hideError();
            
            const sceneData = await loadSceneData(jsonPath);
            this.sceneData = sceneData;
            this.visualizer = sceneData.visualizer;
            
            this.initializeComponents(sceneData);
            this.populateHeadOptions();
            
            this.hideLoading();
            this.showMainContent();
        } catch (err) {
            console.error('Error loading scene:', err);
            this.showError(`Failed to load scene: ${err.message}`);
            this.hideLoading();
        }
    }
    
    initializeComponents(sceneData) {
        // Map camera name -> original index (robust to display-order differences)
        const nameToIndex = new Map();
        sceneData.imageNames.forEach((name, idx) => {
            nameToIndex.set(name, idx);
        });

        // BEV
        const bevCanvas = document.getElementById('bev-canvas');
        const bevRange = sceneData.metadata.bev_range || [-40, 40, -40, 40];
        this.bevView = new BEVView(
            document.getElementById('bev-view'),
            bevCanvas,
            bevRange,
            sceneData.metadata.grid_size || 32,
            (sel) => this.onBevCellSelected(sel)
        );
        if (sceneData.lidarPts) {
            this.bevView.setLidarPoints(sceneData.lidarPts);
        }
        
        // Camera strip
        const stripEl = document.getElementById('camera-strip');
        const displayOrder = sceneData.imageDisplayOrder || sceneData.imageNames;
        this.cameraStrip = new CameraStrip(
            stripEl,
            displayOrder,
            (camName) => this.visualizer.getCameraInfo(camName),
            (camName) => {
                const idx = nameToIndex.get(camName);
                if (idx === undefined) return null;
                return sceneData.originalImages[idx] || null;
            },
            (camName, queryIdx, opts) => this.visualizer.getCameraPatchAttentionForQuery(queryIdx, camName, opts)
        );
        this.cameraStrip.setOverlayAlpha(this.overlayAlpha);
    }
    
    onBevCellSelected(sel) {
        // sel: { queryIdx, xIdx, yIdx }
        this.selectedQuery = sel;
        if (this.selectionStatusEl) {
            this.selectionStatusEl.textContent = `Selected: query ${sel.queryIdx} (x=${sel.xIdx}, y=${sel.yIdx})`;
        }
        this.updateCameraOverlays();
    }
    
    updateCameraOverlays() {
        if (!this.selectedQuery || !this.visualizer || !this.cameraStrip) return;
        
        const { queryIdx } = this.selectedQuery;
        const meanHeads = this.headSelection.mode === 'mean';
        const headIdx = this.headSelection.mode === 'head' ? this.headSelection.headIdx : null;
        
        // Always compute global max across cameras for consistent normalization
        const globalMax = this.visualizer.getGlobalMaxPatchAttentionForQuery(queryIdx, {
            meanHeads,
            headIdx
        });
        
        this.cameraStrip.setOverlayAlpha(this.overlayAlpha);
        this.cameraStrip.updateOverlaysForQuery(queryIdx, {
            meanHeads,
            headIdx,
            globalMax,
            colorScheme: this.colorScheme
        });
    }
    
    showLoading() {
        if (this.loadingEl) this.loadingEl.classList.remove('hidden');
    }
    hideLoading() {
        if (this.loadingEl) this.loadingEl.classList.add('hidden');
    }
    showMainContent() {
        if (this.mainContentEl) this.mainContentEl.classList.remove('hidden');
    }
    showError(message) {
        if (this.errorEl && this.errorMessageEl) {
            this.errorMessageEl.textContent = message;
            this.errorEl.classList.remove('hidden');
        }
    }
    hideError() {
        if (this.errorEl) this.errorEl.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    
    // Default: load scene from this app's own data/ directory
    const defaultScene = 'data/scenes/scene_av2_(10, 23).json';
    
    const urlParams = new URLSearchParams(window.location.search);
    const scenePath = urlParams.get('scene') || defaultScene;
    
    app.loadScene(scenePath);
    window.app = app;
});

