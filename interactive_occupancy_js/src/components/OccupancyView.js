/**
 * Occupancy View Component
 * Displays 2D BEV occupancy visualization
 */

import { OccupancyRenderer } from '../renderers/OccupancyRenderer.js';
import { extractZSlice, projectMaxOccupancy, projectMeanOccupancy, worldZToIndex, indexToWorldZ } from '../occupancyProcessor.js';

export class OccupancyView {
    /**
     * @param {HTMLElement} container - Container element
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @param {Object} occupancyData - Occupancy data with occupancy, gridShape, bounds, etc.
     */
    constructor(container, canvas, occupancyData) {
        this.container = container;
        this.canvas = canvas;
        this.occupancyData = occupancyData;
        
        const { bounds } = occupancyData;
        const bevRange = [bounds.x[0], bounds.x[1], bounds.y[0], bounds.y[1]];
        this.renderer = new OccupancyRenderer(canvas, bevRange);
        
        // View state
        this.viewMode = 'mean'; // 'max', 'mean', 'slice' - mean looks best
        this.zSlice = Math.floor(occupancyData.gridShape[2] / 2); // Middle slice by default
        this.threshold = 0.001; // Lower threshold to match data range [0.0017, 0.9993]
        this.colormap = 'turbo';
        this.alpha = 0.8;
        this.indexingMode = 'variant10'; // CORRECT INDEXING: (nx,ny,nz) idx=z+y*nz+x*nz*ny
        
        // Set canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        // Set canvas size to match container (use CSS size for simplicity)
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.render();
    }
    
    /**
     * Set view mode: 'max', 'mean', or 'slice'
     */
    setViewMode(mode) {
        if (['max', 'mean', 'slice'].includes(mode)) {
            this.viewMode = mode;
            this.render();
        }
    }
    
    /**
     * Set Z slice index (for 'slice' mode)
     */
    setZSlice(zIndex) {
        const maxZ = this.occupancyData.gridShape[2] - 1;
        this.zSlice = Math.max(0, Math.min(maxZ, Math.floor(zIndex)));
        if (this.viewMode === 'slice') {
            this.render();
        }
    }
    
    /**
     * Set Z slice by world Z coordinate
     */
    setZSliceByWorldZ(worldZ) {
        const { gridShape, bounds } = this.occupancyData;
        const zIndex = worldZToIndex(worldZ, bounds.z, gridShape[2]);
        this.setZSlice(zIndex);
    }
    
    /**
     * Set threshold
     */
    setThreshold(threshold) {
        this.threshold = threshold;
        this.render();
    }
    
    /**
     * Set colormap
     */
    setColormap(colormap) {
        this.colormap = colormap;
        this.render();
    }
    
    /**
     * Set alpha
     */
    setAlpha(alpha) {
        this.alpha = alpha;
        this.render();
    }
    
    /**
     * Set indexing mode
     */
    setIndexingMode(mode) {
        this.indexingMode = mode;
        this.render();
    }
    
    /**
     * Get current Z slice world coordinate
     */
    getCurrentWorldZ() {
        const { gridShape, bounds } = this.occupancyData;
        return indexToWorldZ(this.zSlice, bounds.z, gridShape[2]);
    }
    
    /**
     * Render the occupancy view
     */
    render() {
        this.renderer.clear();
        
        const { occupancy, gridShape, occupancyRange } = this.occupancyData;
        
        let occupancy2D;
        let title;
        
        if (this.viewMode === 'max') {
            occupancy2D = projectMaxOccupancy(occupancy, gridShape, this.indexingMode);
            title = 'Occupancy Map (Max Projection)';
        } else if (this.viewMode === 'mean') {
            occupancy2D = projectMeanOccupancy(occupancy, gridShape, this.indexingMode);
            title = 'Occupancy Map (Mean Projection)';
        } else if (this.viewMode === 'slice') {
            occupancy2D = extractZSlice(occupancy, gridShape, this.zSlice, this.indexingMode);
            const worldZ = this.getCurrentWorldZ();
            title = `Occupancy Map (Z = ${worldZ.toFixed(2)}m, slice ${this.zSlice}/${gridShape[2]-1})`;
        }
        
        // Render occupancy heatmap
        this.renderer.renderOccupancyHeatmap(occupancy2D, {
            colormap: this.colormap,
            alpha: this.alpha,
            threshold: this.threshold,
            valueRange: occupancyRange
        });
        
        // Render grid
        this.renderer.renderGrid('white', 0.1);
        
        // Render labels
        this.renderer.renderLabels(title);
    }
}
