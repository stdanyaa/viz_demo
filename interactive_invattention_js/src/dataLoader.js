/**
 * Data loader for scene JSON files
 */

import { InverseAttentionVisualizer } from './inverseAttention.js';

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
    try {
        console.log(`Loading scene data from: ${jsonPath}`);
        console.log('This may take a while for large files...');
        
        // Fetch JSON file
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`Failed to load scene: ${response.statusText}`);
        }
        
        console.log('Parsing JSON...');
        
        // Use text parsing first to check size
        const text = await response.text();
        const textSizeMB = text.length / 1024 / 1024;
        console.log(`  JSON text loaded (${textSizeMB.toFixed(2)} MB)`);
        
        if (textSizeMB > 50) {
            console.warn(`  Warning: Large JSON file (${textSizeMB.toFixed(2)} MB) - parsing may be slow`);
        }
        
        // Parse JSON
        let data;
        try {
            console.log('  Starting JSON.parse()...');
            data = JSON.parse(text);
            console.log('  JSON parsed successfully');
        } catch (e) {
            console.error('  JSON parse error:', e);
            if (e.message && (e.message.includes('stack') || e.message.includes('Maximum'))) {
                throw new Error('JSON file too large to parse. The attention weights should be in a separate binary file.');
            }
            throw e;
        }
        
        // Verify we got the data
        if (!data) {
            throw new Error('JSON parsing returned null/undefined');
        }
        
        console.log('  JSON structure verified');
        
        // Extract metadata
        const metadata = data.metadata || {};
        const gridSize = metadata.grid_size || 32;
        const patchSize = metadata.patch_size || 14;
        const bevRange = metadata.bev_range || [-40, 40, -40, 40];
        const hasClsTokens = metadata.has_cls_tokens !== undefined ? metadata.has_cls_tokens : true;
        const imageFormat = metadata.image_format || 'base64';
        
        // Load images
        let cameraImages, originalImages;
        
        if (imageFormat === 'base64') {
            console.log('Loading images from base64...');
            // Load base64 images
            cameraImages = await Promise.all(
                data.scaled_images.map((img, idx) => {
                    console.log(`Loading scaled image ${idx + 1}/${data.scaled_images.length}`);
                    return loadBase64Image(img);
                })
            );
            originalImages = await Promise.all(
                data.original_images.map((img, idx) => {
                    console.log(`Loading original image ${idx + 1}/${data.original_images.length}`);
                    return loadBase64Image(img);
                })
            );
            console.log('All images loaded');
        } else {
            // Array format - convert to ImageData or keep as arrays
            // For now, we'll need to handle this differently
            // This would require creating ImageData from arrays
            throw new Error('Array image format not yet supported');
        }
        
        // Load attention weights from binary file to avoid JSON parsing issues
        console.log('Loading attention weights...');
        let attnWeights;
        let attnWeightsShape = null;
        
        if (data.attn_weights_file) {
            // New format: load from separate binary file
            console.log(`  Loading from binary file: ${data.attn_weights_file}`);
            
            // Resolve relative to the JSON file location (handles URL encoding, query params, etc.)
            const jsonUrl = new URL(jsonPath, window.location.href);
            const attnFileUrl = new URL(data.attn_weights_file, jsonUrl);
            console.log(`  Full path: ${attnFileUrl.toString()}`);
            
            const attnResponse = await fetch(attnFileUrl);
            if (!attnResponse.ok) {
                throw new Error(
                    `Failed to load attention weights file (${attnFileUrl.toString()}): ${attnResponse.status} ${attnResponse.statusText}`
                );
            }
            
            const attnArrayBuffer = await attnResponse.arrayBuffer();
            console.log(`  Binary file loaded (${(attnArrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            
            // Verify size matches expected
            const expectedSize = data.attn_weights_shape.reduce((a, b) => a * b, 1) * 4; // 4 bytes per float32
            if (attnArrayBuffer.byteLength !== expectedSize) {
                console.warn(`  Warning: Binary file size (${attnArrayBuffer.byteLength}) doesn't match expected (${expectedSize})`);
            }
            
            // Convert to Float32Array (much more efficient than regular array)
            attnWeights = new Float32Array(attnArrayBuffer);
            attnWeightsShape = data.attn_weights_shape;
            console.log(`  Converted to Float32Array (${attnWeights.length} elements, shape: ${attnWeightsShape.join(', ')})`);
        } else if (data.attn_weights_shape && Array.isArray(data.attn_weights)) {
            // Fallback: flat array in JSON (legacy format)
            console.log(`  Using flat array from JSON (shape: ${data.attn_weights_shape.join(', ')})`);
            attnWeights = new Float32Array(data.attn_weights); // Convert to TypedArray
            attnWeightsShape = data.attn_weights_shape;
        } else {
            // Old format: already nested (for backward compatibility)
            console.log('  Using nested array format (legacy)');
            attnWeights = data.attn_weights;
        }
        
        // LiDAR points
        const lidarPts = data.lidar_pts || null;
        
        // Create visualizer
        console.log('Initializing visualizer...');
        const visualizer = new InverseAttentionVisualizer(
            attnWeights,
            cameraImages,
            data.image_names,
            {
                gridSize,
                patchSize,
                bevRange,
                hasClsTokens,
                originalImages,
                attnWeightsShape // Pass shape for flat array format
            }
        );
        
        console.log('Scene data loaded successfully!');
        
        // Get custom display order if specified
        // Fallback to hardcoded order for common camera names, then original order
        let imageDisplayOrder = metadata.image_display_order;
        
        if (!imageDisplayOrder) {
            // Hardcoded order for common camera names (can be customized)
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
            
            // Try to match camera names to common order
            const ordered = [];
            const unordered = [];
            
            // First, add cameras in common order
            commonOrder.forEach(camName => {
                if (data.image_names.includes(camName)) {
                    ordered.push(camName);
                }
            });
            
            // Then add any remaining cameras in their original order
            data.image_names.forEach(camName => {
                if (!ordered.includes(camName)) {
                    unordered.push(camName);
                }
            });
            
            imageDisplayOrder = ordered.length > 0 ? [...ordered, ...unordered] : data.image_names;
        }
        
        return {
            visualizer,
            imageNames: data.image_names, // Original order for data processing
            imageDisplayOrder, // Custom order for visual display
            originalImages,
            lidarPts,
            metadata
        };
        
    } catch (error) {
        console.error('Error loading scene data:', error);
        throw error;
    }
}
