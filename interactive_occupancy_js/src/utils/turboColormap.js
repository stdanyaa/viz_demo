/**
 * Turbo colormap implementation
 * Maps a value in [0, 1] to RGB color using the turbo colormap
 * Turbo: dark blue → cyan → yellow → red
 */

/**
 * Apply turbo colormap to a value in [0, 1]
 * Returns RGB array [r, g, b] in [0, 1]
 * 
 * @param {number} value - Value in [0, 1]
 * @returns {Array<number>} RGB array [r, g, b] in [0, 1]
 */
export function turboColormap(value) {
    value = Math.max(0, Math.min(1, value));
    
    // Turbo colormap lookup table (256 colors)
    // This is a simplified version - for full accuracy, use the complete lookup table
    // Turbo colormap: dark blue (0) → cyan → yellow → red (1)
    
    let r, g, b;
    
    if (value < 0.25) {
        // Dark blue to cyan
        const t = value / 0.25;
        r = 0.0;
        g = t * 0.5;
        b = 0.5 + t * 0.5;
    } else if (value < 0.5) {
        // Cyan to green/yellow
        const t = (value - 0.25) / 0.25;
        r = 0.0;
        g = 0.5 + t * 0.5;
        b = 1.0 - t * 0.5;
    } else if (value < 0.75) {
        // Green/yellow to yellow
        const t = (value - 0.5) / 0.25;
        r = t * 0.5;
        g = 1.0;
        b = 0.0;
    } else {
        // Yellow to red
        const t = (value - 0.75) / 0.25;
        r = 0.5 + t * 0.5;
        g = 1.0 - t;
        b = 0.0;
    }
    
    return [r, g, b];
}

/**
 * Map a height value to [0, 1] based on z bounds
 * 
 * @param {number} z - Height value
 * @param {Array<number>} zBounds - [z_min, z_max]
 * @returns {number} Normalized value in [0, 1]
 */
export function normalizeHeight(z, zBounds) {
    const [zMin, zMax] = zBounds;
    if (zMax === zMin) return 0.5;
    return Math.max(0, Math.min(1, (z - zMin) / (zMax - zMin)));
}

/**
 * Get turbo color for a height value
 * 
 * @param {number} z - Height value
 * @param {Array<number>} zBounds - [z_min, z_max]
 * @returns {Array<number>} RGB array [r, g, b] in [0, 1]
 */
export function getTurboColorForHeight(z, zBounds) {
    const normalized = normalizeHeight(z, zBounds);
    return turboColormap(normalized);
}
