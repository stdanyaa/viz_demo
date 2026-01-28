/**
 * BEV View Component
 * Displays BEV grid + LiDAR background and supports click selection of a cell.
 */

import { BEVFrameRenderer } from '../../../shared/BEVFrameRenderer.js';
import { metersToCenteredWindow, pixelToSelection } from '../../../shared/BEVViewWindow.js';

export class BEVView {
    /**
     * @param {HTMLElement} container
     * @param {HTMLCanvasElement} canvas
     * @param {Array<number>} bevRange
     * @param {number} gridSize
     * @param {(sel: {queryIdx:number, xIdx:number, yIdx:number}) => void} onSelect
     */
    constructor(container, canvas, bevRange = [-40, 40, -40, 40], gridSize = 32, onSelect = null) {
        this.container = container;
        this.canvas = canvas;
        this.bevRange = bevRange;
        this.gridSize = gridSize;
        this.onSelect = onSelect;
        
        // Default zoom for forward: medium (40x40 meters) centered window.
        this.viewWindow = metersToCenteredWindow(this.gridSize, 40, this.bevRange);
        this.renderer = new BEVFrameRenderer(canvas, {
            bevRange: this.bevRange,
            gridSize: this.gridSize,
            viewWindow: this.viewWindow
        });
        this.lidarPts = null;
        
        this.selected = null; // { xIdx, yIdx, queryIdx }
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const sel = pixelToSelection(
                x,
                y,
                this.canvas.width,
                this.canvas.height,
                this.gridSize,
                this.viewWindow
            );
            if (!sel) return;
            
            this.selected = sel;
            this.render();
            
            if (this.onSelect) this.onSelect(sel);
        });
    }
    
    /**
     * Set BEV zoom preset in meters (e.g. 80, 40, 20) as a centered sub-grid.
     */
    setZoomMeters(metersSide) {
        this.viewWindow = metersToCenteredWindow(this.gridSize, metersSide, this.bevRange);
        this.renderer.setViewWindow(this.viewWindow);
        this.render();
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        // In compact iframe embeds, use more of the available width (but cap it).
        const maxSize = Math.min(container.clientWidth, 900);
        const size = Math.max(360, maxSize);
        this.canvas.width = size;
        this.canvas.height = size;
        this.render();
    }
    
    setLidarPoints(lidarPts) {
        this.lidarPts = lidarPts;
        this.render();
    }
    
    render() {
        this.renderer.clear();
        
        if (this.lidarPts && this.lidarPts.length > 0) {
            // Make lidar points more visible
            this.renderer.renderLidarPoints(this.lidarPts, 'grey', 0.42, 2);
        }
        
        this.renderer.renderGrid('white', 0.12);
        
        if (this.selected) {
            this.renderer.renderSelectedCell(this.selected.xIdx, this.selected.yIdx, '#4a9eff');
        }
    }
}

