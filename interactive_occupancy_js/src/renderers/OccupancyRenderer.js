/**
 * 2D BEV Occupancy Renderer
 * Simple canvas-based rendering (like attention visualization)
 */

import { turboColormap } from '../utils/turboColormap.js';
import { rgbToCss } from '../utils/colorUtils.js';

export class OccupancyRenderer {
    /**
     * @param {HTMLCanvasElement} canvas - Canvas element to render to
     * @param {Array<number>} bevRange - [xMin, xMax, yMin, yMax] in meters
     */
    constructor(canvas, bevRange = [-40, 40, -40, 40]) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.bevRange = bevRange;
        // Store original canvas dimensions for coordinate calculations
        this.logicalWidth = canvas.width;
        this.logicalHeight = canvas.height;
    }
    
    /**
     * Clear the canvas
     */
    clear() {
        const logicalWidth = this.canvas.clientWidth || this.canvas.width;
        const logicalHeight = this.canvas.clientHeight || this.canvas.height;
        this.ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    }
    
    /**
     * Render occupancy heatmap from 2D projection
     * 
     * @param {Array<Array<number>>} occupancy2D - 2D occupancy map [ny][nx]
     * @param {Object} options - Rendering options
     * @param {string} options.colormap - 'turbo' or 'hot' (default: 'turbo')
     * @param {number} options.alpha - Transparency (default: 0.8)
     * @param {number} options.threshold - Minimum occupancy to render (default: 0.01)
     * @param {Array<number>} options.valueRange - [min, max] for normalization (default: auto)
     */
    renderOccupancyHeatmap(occupancy2D, options = {}) {
        if (!occupancy2D || occupancy2D.length === 0) return;
        
        const {
            colormap = 'turbo',
            alpha = 0.8,
            threshold = 0.01,
            valueRange = null
        } = options;
        
        const ny = occupancy2D.length;
        const nx = occupancy2D[0] ? occupancy2D[0].length : 0;
        
        if (nx === 0 || ny === 0) return;
        
        // Use logical dimensions (CSS size, not pixel size)
        const logicalWidth = this.canvas.clientWidth || this.canvas.width;
        const logicalHeight = this.canvas.clientHeight || this.canvas.height;
        
        const cellWidth = logicalWidth / nx;
        const cellHeight = logicalHeight / ny;
        
        // Normalize occupancy values
        // First, compute actual min/max from data (ignoring threshold for range calculation)
        let dataMin = Infinity;
        let dataMax = -Infinity;
        
        for (let y = 0; y < ny; y++) {
            for (let x = 0; x < nx; x++) {
                const val = occupancy2D[y][x];
                dataMin = Math.min(dataMin, val);
                dataMax = Math.max(dataMax, val);
            }
        }
        
        // Use provided range or auto range from actual data
        let min, max;
        if (valueRange) {
            min = valueRange[0];
            max = valueRange[1];
        } else {
            min = dataMin;
            max = dataMax;
        }
        
        const range = max - min;
        if (range === 0) return; // No variation
        
        // Render cells
        this.ctx.save();
        
        for (let y = 0; y < ny; y++) {
            for (let x = 0; x < nx; x++) {
                const val = occupancy2D[y][x];
                
                // Skip cells below threshold
                if (val <= threshold) continue;
                
                // Normalize value
                const normalized = (val - min) / range;
                
                // Get color
                let color;
                if (colormap === 'turbo') {
                    color = turboColormap(normalized);
                } else if (colormap === 'hot') {
                    color = this._hotColormap(normalized);
                } else {
                    // Grayscale
                    color = [normalized, normalized, normalized];
                }
                
                // Map to plot coordinates (flip X and Y for BEV view, same as attention renderer)
                // Flip X: right-to-left, Flip Y: bottom-to-top
                const logicalWidth = this.canvas.clientWidth || this.canvas.width;
                const logicalHeight = this.canvas.clientHeight || this.canvas.height;
                
                const plotX = Math.floor(logicalWidth - (x + 1) * cellWidth);
                const plotY = Math.floor(logicalHeight - (y + 1) * cellHeight);
                
                // Ensure we don't draw outside canvas bounds
                const actualWidth = Math.min(cellWidth, logicalWidth - plotX);
                const actualHeight = Math.min(cellHeight, logicalHeight - plotY);
                
                if (plotX >= 0 && plotY >= 0 && plotX < logicalWidth && plotY < logicalHeight) {
                    // Draw cell with alpha blending
                    this.ctx.globalAlpha = alpha * normalized;
                    this.ctx.fillStyle = rgbToCss(color);
                    this.ctx.fillRect(plotX, plotY, actualWidth, actualHeight);
                }
            }
        }
        
        this.ctx.restore();
    }
    
    /**
     * Render grid overlay
     */
    renderGrid(color = 'white', alpha = 0.1) {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.globalAlpha = alpha;
        this.ctx.lineWidth = 1;
        
        // Draw grid lines (simplified - just major divisions)
        const logicalWidth = this.canvas.clientWidth || this.canvas.width;
        const logicalHeight = this.canvas.clientHeight || this.canvas.height;
        const gridSize = 8; // 8x8 grid
        const stepX = logicalWidth / gridSize;
        const stepY = logicalHeight / gridSize;
        
        for (let i = 0; i <= gridSize; i++) {
            // Vertical lines
            this.ctx.beginPath();
            this.ctx.moveTo(i * stepX, 0);
            this.ctx.lineTo(i * stepX, logicalHeight);
            this.ctx.stroke();
            
            // Horizontal lines
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * stepY);
            this.ctx.lineTo(logicalWidth, i * stepY);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    /**
     * Render labels and title
     */
    renderLabels(title = 'Occupancy Map') {
        this.ctx.save();
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(title, 10, 10);
        this.ctx.restore();
    }
    
    /**
     * Hot colormap (for compatibility)
     */
    _hotColormap(value) {
        value = Math.max(0, Math.min(1, value));
        
        let r, g, b;
        if (value < 0.33) {
            r = value * 3;
            g = 0;
            b = 0;
        } else if (value < 0.66) {
            r = 1;
            g = (value - 0.33) * 3;
            b = 0;
        } else {
            r = 1;
            g = 1;
            b = (value - 0.66) * 3;
        }
        
        return [r, g, b];
    }
}
