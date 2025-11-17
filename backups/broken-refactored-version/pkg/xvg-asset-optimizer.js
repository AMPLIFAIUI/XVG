/**
 * XVG Asset Optimization Utility
 * Handles asset compression, minification, and optimization
 */

class XVGAssetOptimizer {
  constructor() {
    this.compressionFormats = ['webp', 'avif', 'jpeg', 'png'];
    this.qualitySettings = {
      webp: 85,
      avif: 80,
      jpeg: 90,
      png: 95
    };
    this.maxDimensions = {
      icons: { width: 100, height: 100 },
      images: { width: 1920, height: 1080 },
      thumbnails: { width: 300, height: 300 }
    };
  }

  /**
   * Optimize image asset
   */
  async optimizeImage(imageElement, options = {}) {
    const {
      format = 'webp',
      quality = this.qualitySettings[format] || 85,
      maxWidth = null,
      maxHeight = null,
      preserveAspectRatio = true
    } = options;

    try {
      // Create canvas for optimization
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Calculate dimensions
      let { width, height } = this.calculateOptimalDimensions(
        imageElement.width,
        imageElement.height,
        maxWidth,
        maxHeight,
        preserveAspectRatio
      );
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw image to canvas
      ctx.drawImage(imageElement, 0, 0, width, height);
      
      // Convert to optimized format
      const optimizedBlob = await this.canvasToBlob(canvas, format, quality);
      
      return {
        blob: optimizedBlob,
        width,
        height,
        format,
        quality,
        originalSize: this.getImageSize(imageElement),
        optimizedSize: optimizedBlob.size,
        compressionRatio: (1 - optimizedBlob.size / this.getImageSize(imageElement)) * 100
      };
      
    } catch (error) {
      console.error('[AssetOptimizer] Failed to optimize image:', error);
      throw error;
    }
  }

  /**
   * Calculate optimal dimensions
   */
  calculateOptimalDimensions(originalWidth, originalHeight, maxWidth, maxHeight, preserveAspectRatio) {
    if (!maxWidth && !maxHeight) {
      return { width: originalWidth, height: originalHeight };
    }
    
    let width = originalWidth;
    let height = originalHeight;
    
    if (maxWidth && width > maxWidth) {
      width = maxWidth;
      if (preserveAspectRatio) {
        height = (originalHeight * maxWidth) / originalWidth;
      }
    }
    
    if (maxHeight && height > maxHeight) {
      height = maxHeight;
      if (preserveAspectRatio) {
        width = (originalWidth * maxHeight) / originalHeight;
      }
    }
    
    return { width: Math.round(width), height: Math.round(height) };
  }

  /**
   * Convert canvas to blob
   */
  async canvasToBlob(canvas, format, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        },
        `image/${format}`,
        quality / 100
      );
    });
  }

  /**
   * Get image size in bytes
   */
  getImageSize(imageElement) {
    // Estimate size based on dimensions and format
    const width = imageElement.width || imageElement.naturalWidth;
    const height = imageElement.height || imageElement.naturalHeight;
    const channels = imageElement.src.includes('.png') ? 4 : 3; // RGBA vs RGB
    return width * height * channels;
  }

  /**
   * Generate responsive image sources
   */
  generateResponsiveSources(imagePath, sizes = []) {
    const defaultSizes = [
      { width: 300, suffix: '-sm' },
      { width: 600, suffix: '-md' },
      { width: 1200, suffix: '-lg' },
      { width: 1920, suffix: '-xl' }
    ];
    
    const imageSizes = sizes.length > 0 ? sizes : defaultSizes;
    const basePath = imagePath.replace(/\.[^/.]+$/, '');
    const extension = imagePath.split('.').pop();
    
    const sources = imageSizes.map(size => ({
      src: `${basePath}${size.suffix}.${extension}`,
      width: size.width,
      media: `(max-width: ${size.width}px)`
    }));
    
    return sources;
  }

  /**
   * Optimize CSS assets
   */
  async optimizeCSS(cssContent, options = {}) {
    const {
      minify = true,
      removeComments = true,
      removeWhitespace = true,
      removeUnused = false
    } = options;

    let optimizedCSS = cssContent;

    if (removeComments) {
      optimizedCSS = optimizedCSS.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    if (removeWhitespace) {
      optimizedCSS = optimizedCSS
        .replace(/\s+/g, ' ')
        .replace(/;\s*}/g, '}')
        .replace(/{\s*/g, '{')
        .replace(/;\s*/g, ';')
        .trim();
    }

    if (minify) {
      optimizedCSS = optimizedCSS
        .replace(/:\s+/g, ':')
        .replace(/;\s+/g, ';')
        .replace(/,\s+/g, ',')
        .replace(/\s*{\s*/g, '{')
        .replace(/;\s*}/g, '}');
    }

    return {
      original: cssContent,
      optimized: optimizedCSS,
      compressionRatio: (1 - optimizedCSS.length / cssContent.length) * 100
    };
  }

  /**
   * Optimize JavaScript assets
   */
  async optimizeJavaScript(jsContent, options = {}) {
    const {
      minify = true,
      removeComments = true,
      removeWhitespace = true,
      mangleVariables = false
    } = options;

    let optimizedJS = jsContent;

    if (removeComments) {
      // Remove single-line comments
      optimizedJS = optimizedJS.replace(/\/\/.*$/gm, '');
      // Remove multi-line comments
      optimizedJS = optimizedJS.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    if (removeWhitespace) {
      optimizedJS = optimizedJS
        .replace(/\s+/g, ' ')
        .replace(/;\s*/g, ';')
        .replace(/{\s*/g, '{')
        .replace(/}\s*/g, '}')
        .trim();
    }

    if (minify) {
      optimizedJS = optimizedJS
        .replace(/,\s+/g, ',')
        .replace(/:\s+/g, ':')
        .replace(/=\s+/g, '=')
        .replace(/\s*\(\s*/g, '(')
        .replace(/\s*\)\s*/g, ')');
    }

    return {
      original: jsContent,
      optimized: optimizedJS,
      compressionRatio: (1 - optimizedJS.length / jsContent.length) * 100
    };
  }

  /**
   * Create asset bundle
   */
  async createAssetBundle(assets, bundleName, options = {}) {
    const {
      compress = true,
      minify = true,
      combine = true
    } = options;

    const bundle = {
      name: bundleName,
      assets: [],
      totalSize: 0,
      optimizedSize: 0,
      compressionRatio: 0
    };

    try {
      for (const asset of assets) {
        const optimizedAsset = await this.optimizeAsset(asset, options);
        bundle.assets.push(optimizedAsset);
        bundle.totalSize += asset.size || 0;
        bundle.optimizedSize += optimizedAsset.size || 0;
      }

      bundle.compressionRatio = (1 - bundle.optimizedSize / bundle.totalSize) * 100;

      console.log(`[AssetOptimizer] Bundle ${bundleName} created: ${bundle.compressionRatio.toFixed(1)}% compression`);

      return bundle;

    } catch (error) {
      console.error(`[AssetOptimizer] Failed to create bundle ${bundleName}:`, error);
      throw error;
    }
  }

  /**
   * Optimize any asset type
   */
  async optimizeAsset(asset, options = {}) {
    const assetType = this.getAssetType(asset);
    
    switch (assetType) {
      case 'image':
        return await this.optimizeImage(asset, options);
      case 'css':
        return await this.optimizeCSS(asset, options);
      case 'javascript':
        return await this.optimizeJavaScript(asset, options);
      default:
        return asset; // No optimization for unknown types
    }
  }

  /**
   * Get asset type
   */
  getAssetType(asset) {
    if (asset instanceof HTMLImageElement || asset.tagName === 'IMG') {
      return 'image';
    }
    
    if (typeof asset === 'string') {
      if (asset.includes('.css')) return 'css';
      if (asset.includes('.js')) return 'javascript';
      if (asset.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) return 'image';
    }
    
    return 'unknown';
  }

  /**
   * Generate asset manifest
   */
  generateAssetManifest(assets) {
    const manifest = {
      version: '1.0.0',
      generated: new Date().toISOString(),
      assets: {}
    };

    assets.forEach(asset => {
      manifest.assets[asset.path] = {
        hash: asset.hash || this.generateHash(asset.path),
        size: asset.size || 0,
        optimizedSize: asset.optimizedSize || asset.size || 0,
        compressionRatio: asset.compressionRatio || 0,
        format: asset.format || 'unknown',
        lastModified: asset.lastModified || new Date().toISOString()
      };
    });

    return manifest;
  }

  /**
   * Generate hash for asset
   */
  generateHash(content) {
    // Simple hash generation - in production, use a proper hash function
    let hash = 0;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(assetStats) {
    const recommendations = [];

    if (assetStats.compressionRatio < 20) {
      recommendations.push({
        type: 'compression',
        message: 'Low compression ratio - consider using WebP or AVIF format',
        priority: 'high'
      });
    }

    if (assetStats.size > 1024 * 1024) { // 1MB
      recommendations.push({
        type: 'size',
        message: 'Large asset size - consider resizing or using lower quality',
        priority: 'medium'
      });
    }

    if (assetStats.loadTime > 1000) { // 1 second
      recommendations.push({
        type: 'performance',
        message: 'Slow load time - consider lazy loading or preloading',
        priority: 'high'
      });
    }

    return recommendations;
  }
}

// Export for use in the application
if (typeof module !== 'undefined' && module.exports) {
  module.exports = XVGAssetOptimizer;
} else {
  window.XVGAssetOptimizer = XVGAssetOptimizer;
}
