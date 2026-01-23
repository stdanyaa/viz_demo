/**
 * Color utilities for visualization
 */

/**
 * Convert RGB [0, 1] to CSS color string
 */
export function rgbToCss(rgb) {
    const [r, g, b] = rgb;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}
