/**
 * Data loader for scene JSON files
 */

import { ForwardAttentionVisualizer } from './forwardAttention.js';

/**
 * Load base64 image string and convert to Image object
 */
function loadBase64Image(base64String) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `data:image/png;base64,${base64String}`;
    });
}

/**
 * Load scene data from JSON file
 *
 * @param {string} jsonPath - Path to JSON scene file
 * @returns {Promise<Object>} Loaded scene data with visualizer
 */
export async function loadSceneData(jsonPath) {
    console.log(`Loading scene data from: ${jsonPath}`);

    // Resolve relative to the current page (works on GitHub Pages under /<repo>/)
    // and handles URL encoding (spaces, parentheses) safely.
    const jsonUrl = new URL(jsonPath, window.location.href);

    const response = await fetch(jsonUrl);
    if (!response.ok) {
        throw new Error(`Failed to load scene: ${response.statusText}`);
    }
    
    const text = await response.text();
    const data = JSON.parse(text);
    
    const metadata = data.metadata || {};
    const gridSize = metadata.grid_size || 32;
    const patchSize = metadata.patch_size || 14;
    const bevRange = metadata.bev_range || [-40, 40, -40, 40];
    const hasClsTokens = metadata.has_cls_tokens !== undefined ? metadata.has_cls_tokens : true;
    const imageFormat = metadata.image_format || 'base64';
    
    // Load images
    let cameraImages, originalImages;
    if (imageFormat === 'base64') {
        cameraImages = await Promise.all(data.scaled_images.map(loadBase64Image));
        originalImages = await Promise.all(data.original_images.map(loadBase64Image));
    } else {
        throw new Error('Array image format not yet supported');
    }
    
    // Load attention weights (binary preferred)
    let attnWeights;
    let attnWeightsShape = null;
    
    if (data.attn_weights_file) {
        // Resolve relative to the JSON file location (robust to query params / encoding)
        const attnFileUrl = new URL(data.attn_weights_file, jsonUrl);
        const attnResponse = await fetch(attnFileUrl);
        if (!attnResponse.ok) {
            throw new Error(
                `Failed to load attention weights file (${attnFileUrl.toString()}): ${attnResponse.status} ${attnResponse.statusText}`
            );
        }
        const attnArrayBuffer = await attnResponse.arrayBuffer();
        attnWeights = new Float32Array(attnArrayBuffer);
        attnWeightsShape = data.attn_weights_shape;
    } else if (data.attn_weights_shape && Array.isArray(data.attn_weights)) {
        attnWeights = new Float32Array(data.attn_weights);
        attnWeightsShape = data.attn_weights_shape;
    } else {
        attnWeights = data.attn_weights;
    }
    
    const lidarPts = data.lidar_pts || null;
    
    const visualizer = new ForwardAttentionVisualizer(
        attnWeights,
        cameraImages,
        data.image_names,
        {
            gridSize,
            patchSize,
            bevRange,
            hasClsTokens,
            originalImages,
            attnWeightsShape
        }
    );
    
    // Display order
    let imageDisplayOrder = metadata.image_display_order;
    if (!imageDisplayOrder) {
        const commonOrder = [
            'FRONT',
            'FRONT_LEFT',
            'FRONT_RIGHT',
            'BACK',
            'BACK_LEFT',
            'BACK_RIGHT',
            'LEFT',
            'RIGHT'
        ];
        
        const ordered = [];
        const unordered = [];
        
        commonOrder.forEach(camName => {
            if (data.image_names.includes(camName)) ordered.push(camName);
        });
        data.image_names.forEach(camName => {
            if (!ordered.includes(camName)) unordered.push(camName);
        });
        
        imageDisplayOrder = ordered.length > 0 ? [...ordered, ...unordered] : data.image_names;
    }
    
    return {
        visualizer,
        imageNames: data.image_names,
        imageDisplayOrder,
        originalImages,
        lidarPts,
        metadata
    };
}

