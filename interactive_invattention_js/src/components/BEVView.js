/**
 * BEV View Component
 * Displays BEV attention heatmap
 */

import { BEVRenderer } from '../renderers/BEVRenderer.js';

export class BEVView {
    /**
     * @param {HTMLElement} container - Container element
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Array<number>} bevRange - BEV range [xMin, xMax, yMin, yMax]
     */
    constructor(container, canvas, bevRange = [-40, 40, -40, 40]) {
        this.container = container;
        this.canvas = canvas;
        this.bevRange = bevRange;
        
        this.renderer = new BEVRenderer(canvas, bevRange);
        this.lidarPts = null;
        this.regions = []; // Array of {bevMap, color, alpha}
        
        // Set canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        // In compact iframe embeds, use more of the available width.
        const maxSize = Math.min(container.clientWidth, 900);
        const size = Math.max(360, maxSize);
        this.canvas.width = size;
        this.canvas.height = size;
        this.render();
    }
    
    /**
     * Set LiDAR points
     */
    setLidarPoints(lidarPts) {
        this.lidarPts = lidarPts;
        this.render();
    }
    
    /**
     * Set regions to display
     * @param {Array<Object>} regions - Array of {bevMap, color, alpha}
     */
    setRegions(regions) {
        this.regions = regions || [];
        this.render();
    }
    
    /**
     * Clear all regions
     */
    clearRegions() {
        this.regions = [];
        this.render();
    }
    
    /**
     * Render the BEV view
     */
    render() {
        this.renderer.clear();
        
        // Render LiDAR points first (background)
        if (this.lidarPts && this.lidarPts.length > 0) {
            this.renderer.renderLidarPoints(this.lidarPts, 'grey', 0.1, 1); // 10% alpha
        }
        
        // Render attention heatmaps - use same path for single and multiple
        if (this.regions.length > 0) {
            // Always use multiple regions rendering for consistency
            // Single region will just have one item in the array
            this.renderer.renderMultipleRegions(this.regions);
        }
        
        // Render grid
        this.renderer.renderGrid('white', 0.1);
        
        // Render labels
        const title = this.regions.length > 0
            ? `BEV Attention (${this.regions.length} region${this.regions.length > 1 ? 's' : ''})`
            : 'BEV Attention Map';
        this.renderer.renderLabels(title);
    }
}
