/**
 * Camera strip component
 * Renders a horizontal strip of camera canvases with attention overlays.
 */

import { CameraRenderer } from '../renderers/CameraRenderer.js';

export class CameraStrip {
    /**
     * @param {HTMLElement} container
     * @param {Array<string>} cameraDisplayOrder
     * @param {(camName:string) => Object} getPatchInfoForCam
     * @param {(camName:string) => Image} getImageForCam
     * @param {(camName:string, queryIdx:number, opts:{meanHeads:boolean, headIdx:?number}) => Float32Array} getPatchAttention
     */
    constructor(container, cameraDisplayOrder, getPatchInfoForCam, getImageForCam, getPatchAttention) {
        this.container = container;
        this.cameraNames = cameraDisplayOrder;
        
        this.getPatchInfoForCam = getPatchInfoForCam;
        this.getImageForCam = getImageForCam;
        this.getPatchAttention = getPatchAttention;
        
        this.overlayAlpha = 0.6;
        
        // Main (center) canvases we actively render into
        this.items = new Map(); // camName -> { canvas, renderer, patchInfo }
        // Clone canvases for seamless infinite scrolling
        this.cloneCanvases = new Map(); // camName -> Array<HTMLCanvasElement>
        this.segmentWidth = null;

        this.render();
        this.enableInfiniteScroll();
    }
    
    setOverlayAlpha(alpha) {
        this.overlayAlpha = alpha;
    }
    
    render() {
        this.container.innerHTML = '';
        this.items.clear();
        this.cloneCanvases.clear();
        this.segmentWidth = null;
        
        // Create three copies: [left clone][main][right clone]
        const cycles = [-1, 0, 1];
        cycles.forEach((cycle) => {
            this.cameraNames.forEach(camName => {
            const item = document.createElement('div');
            item.className = 'camera-strip-item';
            item.dataset.cameraName = camName;
            item.dataset.cycle = String(cycle);
            
            const label = document.createElement('div');
            label.className = 'camera-strip-label';
            label.textContent = camName;
            
            const canvas = document.createElement('canvas');
            
            item.appendChild(canvas);
            item.appendChild(label);
            this.container.appendChild(item);
            
            const patchInfo = this.getPatchInfoForCam(camName);
            
            if (cycle === 0) {
                const renderer = new CameraRenderer(canvas);
                this.items.set(camName, { canvas, renderer, patchInfo });
                
                // Initial render: image + grid only
                const img = this.getImageForCam(camName);
                renderer.clear();
                renderer.renderImage(img);
                renderer.renderPatchGrid(patchInfo, 'cyan', 0.15);
            } else {
                // clones: keep list per camera; we will blit from main canvas
                const arr = this.cloneCanvases.get(camName) || [];
                arr.push(canvas);
                this.cloneCanvases.set(camName, arr);
            }
            });
        });
        
        // After layout, jump scroll to middle segment
        requestAnimationFrame(() => {
            this._updateSegmentWidth();
            if (this.segmentWidth !== null) {
                this.container.scrollLeft = this.segmentWidth;
            }
            // Copy initial images into clones
            this._syncClonesFromMain();
        });
    }

    /**
     * True infinite-strip effect via 3 repeated segments.
     * When scroll drifts into left/right clone segments, shift scrollLeft by ±segmentWidth.
     * Visuals stay continuous because segments are identical.
     */
    enableInfiniteScroll() {
        // one listener; segmentWidth computed after first render
        this.container.addEventListener('scroll', () => {
            if (this.segmentWidth === null) return;
            const s = this.segmentWidth;
            if (s <= 0) return;
            
            // If we enter the left clone segment, move forward by one segment.
            if (this.container.scrollLeft < s * 0.5) {
                this.container.scrollLeft += s;
            }
            // If we enter the right clone segment, move back by one segment.
            if (this.container.scrollLeft > s * 1.5) {
                this.container.scrollLeft -= s;
            }
        }, { passive: true });
        
        // Update segment width on resize
        window.addEventListener('resize', () => {
            this._updateSegmentWidth();
            if (this.segmentWidth !== null) {
                this.container.scrollLeft = this.segmentWidth;
            }
        });
    }

    _updateSegmentWidth() {
        // Measure distance between the first item in cycle 0 and the first item in cycle 1.
        const firstMain = this.container.querySelector('.camera-strip-item[data-cycle="0"]');
        const firstRight = this.container.querySelector('.camera-strip-item[data-cycle="1"]');
        if (!firstMain || !firstRight) return;
        const s = firstRight.offsetLeft - firstMain.offsetLeft;
        if (s > 0) this.segmentWidth = s;
    }
    
    _syncClonesFromMain() {
        for (const camName of this.cameraNames) {
            const main = this.items.get(camName);
            if (!main) continue;
            const clones = this.cloneCanvases.get(camName) || [];
            for (const c of clones) {
                c.width = main.canvas.width;
                c.height = main.canvas.height;
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, c.width, c.height);
                ctx.drawImage(main.canvas, 0, 0);
            }
        }
    }
    
    /**
     * Recompute and render overlays for all cameras for a given query.
     *
     * @param {number} queryIdx
     * @param {Object} opts
     * @param {boolean} opts.meanHeads
     * @param {?number} opts.headIdx
     * @param {?number} opts.globalMax
     * @param {string} opts.colorScheme
     */
    updateOverlaysForQuery(queryIdx, opts = {}) {
        const { meanHeads = true, headIdx = null, globalMax = null, colorScheme = 'red' } = opts;
        
        for (const camName of this.cameraNames) {
            const item = this.items.get(camName);
            if (!item) continue;
            const { renderer, patchInfo } = item;
            const img = this.getImageForCam(camName);
            
            renderer.clear();
            renderer.renderImage(img);
            
            // Attention overlay
            const patchAttn = this.getPatchAttention(camName, queryIdx, { meanHeads, headIdx });
            renderer.renderPatchAttentionOverlay(patchAttn, patchInfo, {
                alpha: this.overlayAlpha,
                globalMax,
                colorScheme
            });
            
            // Grid on top for patch boundaries
            renderer.renderPatchGrid(patchInfo, 'cyan', 0.15);
        }
        
        // Keep clone segments visually identical (for seamless infinite scroll)
        this._syncClonesFromMain();
    }
}

