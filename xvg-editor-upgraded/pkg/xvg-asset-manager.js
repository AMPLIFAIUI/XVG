/**
 * XVG Asset Management System
 * Professional asset loading, caching, compression, and optimization
 */

class XVGAssetManager {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
    this.preloadedAssets = new Set();
    this.failedAssets = new Set();
    this.assetVersions = new Map();
    this.compressionEnabled = true;
    this.lazyLoadingEnabled = true;
    this.monitoringEnabled = true;
    this.preloadCriticalAssetsEnabled = true;
    
    // Asset loading statistics
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      loadFailures: 0,
      compressionSavings: 0,
      totalLoadTime: 0,
      averageLoadTime: 0
    };
    
    // Initialize asset versioning
    this.initializeAssetVersions();
    
    // Set up monitoring
    if (this.monitoringEnabled) {
      this.setupAssetMonitoring();
    }
  }

  /**
   * Initialize asset versions for cache busting
   */
  initializeAssetVersions() {
    // Single source of truth for all assets - comprehensive list
    const allAssets = [
      'assets/xvgicon.png',
      'assets/sunset.jpg',
      'assets/texteditor.png',
      'assets/icons/white/icons8-add-100.png',
      'assets/icons/white/icons8-eye-100.png',
      'assets/icons/white/icons8-invisible-100.png',
      'assets/icons/white/icons8-lock-100.png',
      'assets/icons/white/icons8-unlock-100.png',
      'assets/icons/white/icons8-zoom-in-100.png',
      'assets/icons/white/icons8-zoom-out-100.png',
      'assets/icons/white/icons8-cut-100.png',
      'assets/icons/white/icons8-copy-100.png',
      'assets/icons/white/icons8-paste-100.png',
      'assets/icons/white/icons8-save-100.png',
      'assets/icons/white/icons8-open-100.png',
      'assets/icons/white/icons8-undo-100.png',
      'assets/icons/white/icons8-redo-100.png',
      'assets/icons/white/icons8-cursor-100.png',
      'assets/icons/white/icons8-ball-point-pen-100.png',
      'assets/icons/white/icons8-paint-100.png',
      'assets/icons/white/icons8-rectangle-100.png',
      'assets/icons/white/icons8-circled-thin-100.png',
      'assets/icons/white/icons8-hexagon-100.png',
      'assets/icons/white/icons8-triangle-100.png',
      'assets/icons/white/icons8-line-100.png',
      'assets/icons/white/icons8-text-100.png',
      'assets/icons/white/icons8-eraser-tool-100.png',
      'assets/icons/white/icons8-hand-pan-100.png',
      'assets/icons/white/icons8-color-dropper-100.png',
      'assets/icons/white/icons8-full-image-100.png',
      'assets/icons/white/icons8-original-size-100.png',
      'assets/icons/white/icons8-table-100.png',
      'assets/icons/white/icons8-ruler-100.png',
      'assets/icons/white/icons8-horiz-guide-100.png',
      'assets/icons/white/icons8-bold-100.png',
      'assets/icons/white/icons8-italic-100.png',
      'assets/icons/white/icons8-underline-100.png',
      'assets/icons/white/icons8-strikethrough-100.png',
      'assets/icons/white/icons8-align-left-100.png',
      'assets/icons/white/icons8-align-center-100.png',
      'assets/icons/white/icons8-align-right-100.png',
      'assets/icons/white/icons8-align-justify-100.png',
      'assets/icons/white/icons8-typography-100.png',
      'assets/icons/white/icons8-project-setup-100.png',
      'assets/icons/white/icons8-layers-100.png',
      'assets/icons/white/icons8-neural-100.png',
      'assets/icons/white/icons8-chevron-up-100.png',
      'assets/icons/white/icons8-chevron-down-100.png',
      'assets/icons/white/icons8-trash-100.png',
      'assets/icons/white/icons8-export-100.png',
      'assets/icons/white/icons8-fill-color-100.png'
    ];
    
    allAssets.forEach(asset => {
      const hash = this.generateAssetHash(asset);
      this.assetVersions.set(asset, hash);
    });
  }

  /**
   * Generate asset hash for versioning
   */
  generateAssetHash(assetName) {
    // Simple hash generation - in production, this would be based on file content
    const timestamp = Date.now();
    const hash = btoa(assetName + timestamp).substring(0, 8);
    return hash;
  }


  /**
   * Set up asset monitoring
   */
  setupAssetMonitoring() {
    // Monitor asset loading performance
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name.includes('assets/')) {
          this.recordAssetLoadTime(entry.name, entry.duration);
        }
      }
    });
    
    try {
      observer.observe({ entryTypes: ['resource'] });
    } catch (error) {
      console.warn('[AssetManager] Performance monitoring not available:', error);
    }
  }

  /**
   * Record asset load time for monitoring
   */
  recordAssetLoadTime(assetName, loadTime) {
    // Handle NaN or invalid timing values
    if (isNaN(loadTime) || loadTime < 0) {
      if (this.monitoringEnabled) {
        console.log(`[AssetManager] Loaded ${assetName} in unknown time`);
      }
      return;
    }

    this.stats.totalRequests++;
    this.stats.totalLoadTime += loadTime;
    this.stats.averageLoadTime = this.stats.totalLoadTime / this.stats.totalRequests;

    if (this.monitoringEnabled) {
      console.log(`[AssetManager] Loaded ${assetName} in ${loadTime.toFixed(2)}ms`);
    }
  }

  /**
   * Load an asset with caching and optimization
   */
  async loadAsset(assetPath, options = {}) {
    const {
      useCache = true,
      preload = false,
      fallback = null,
      compression = this.compressionEnabled,
      lazy = this.lazyLoadingEnabled,
      priority = 'normal'
    } = options;

    // Add version to asset path for cache busting
    const versionedPath = this.getVersionedAssetPath(assetPath);
    
    // Check cache first
    if (useCache && this.cache.has(versionedPath)) {
      this.stats.cacheHits++;
      return this.cache.get(versionedPath);
    }

    this.stats.cacheMisses++;

    // Check if asset is already loading
    if (this.loadingPromises.has(versionedPath)) {
      return this.loadingPromises.get(versionedPath);
    }

    // Start loading
    const loadPromise = this.performAssetLoad(versionedPath, options);
    this.loadingPromises.set(versionedPath, loadPromise);

    try {
      const result = await loadPromise;
      
      // Cache the result
      if (useCache) {
        this.cache.set(versionedPath, result);
      }
      
      // Mark as preloaded if requested
      if (preload) {
        this.preloadedAssets.add(versionedPath);
      }
      
      return result;
      
    } catch (error) {
      this.stats.loadFailures++;
      this.failedAssets.add(versionedPath);
      
      // Try fallback if available
      if (fallback) {
        console.warn(`[AssetManager] Failed to load ${assetPath}, using fallback`);
        return this.loadAsset(fallback, { ...options, fallback: null });
      }
      
      throw error;
      
    } finally {
      this.loadingPromises.delete(versionedPath);
    }
  }

  /**
   * Perform the actual asset loading
   */
  async performAssetLoad(assetPath, options) {
    const startTime = performance.now();
    options.startTime = startTime; // Set start time for timing calculations

    try {
      // Determine asset type and load accordingly
      const extension = assetPath.split('.').pop().toLowerCase();
      
      switch (extension) {
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg':
          return await this.loadImageAsset(assetPath, options);
        case 'css':
          return await this.loadCSSAsset(assetPath, options);
        case 'js':
          return await this.loadJavaScriptAsset(assetPath, options);
        case 'json':
          return await this.loadJSONAsset(assetPath, options);
        default:
          return await this.loadGenericAsset(assetPath, options);
      }
      
    } catch (error) {
      const loadTime = performance.now() - startTime;
      this.recordAssetLoadTime(assetPath, loadTime);
      throw error;
    }
  }

  /**
   * Load image asset
   */
  async loadImageAsset(assetPath, options) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const loadTime = performance.now() - options.startTime;
        this.recordAssetLoadTime(assetPath, loadTime);
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${assetPath}`));
      };
      
      // Set loading priority
      if (options.priority === 'high') {
        img.loading = 'eager';
      } else if (options.lazy) {
        img.loading = 'lazy';
      }
      
      img.src = assetPath;
    });
  }

  /**
   * Load CSS asset
   */
  async loadCSSAsset(assetPath, options) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = assetPath;
      
      link.onload = () => {
        const loadTime = performance.now() - options.startTime;
        this.recordAssetLoadTime(assetPath, loadTime);
        resolve(link);
      };
      
      link.onerror = () => {
        reject(new Error(`Failed to load CSS: ${assetPath}`));
      };
      
      document.head.appendChild(link);
    });
  }

  /**
   * Load JavaScript asset
   */
  async loadJavaScriptAsset(assetPath, options) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = assetPath;
      script.async = true;
      
      script.onload = () => {
        const loadTime = performance.now() - options.startTime;
        this.recordAssetLoadTime(assetPath, loadTime);
        resolve(script);
      };
      
      script.onerror = () => {
        reject(new Error(`Failed to load JavaScript: ${assetPath}`));
      };
      
      document.head.appendChild(script);
    });
  }

  /**
   * Load JSON asset
   */
  async loadJSONAsset(assetPath, options) {
    try {
      const response = await fetch(assetPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const loadTime = performance.now() - options.startTime;
      this.recordAssetLoadTime(assetPath, loadTime);
      
      return data;
      
    } catch (error) {
      throw new Error(`Failed to load JSON: ${assetPath} - ${error.message}`);
    }
  }

  /**
   * Load generic asset
   */
  async loadGenericAsset(assetPath, options) {
    try {
      const response = await fetch(assetPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.blob();
      const loadTime = performance.now() - options.startTime;
      this.recordAssetLoadTime(assetPath, loadTime);
      
      return data;
      
    } catch (error) {
      throw new Error(`Failed to load asset: ${assetPath} - ${error.message}`);
    }
  }

  /**
   * Get versioned asset path
   */
  getVersionedAssetPath(assetPath) {
    const version = this.assetVersions.get(assetPath);
    if (version) {
      const separator = assetPath.includes('?') ? '&' : '?';
      return `${assetPath}${separator}v=${version}`;
    }
    return assetPath;
  }

  /**
   * Preload critical assets
   */
  async preloadCriticalAssets() {
    if (!this.preloadCriticalAssetsEnabled) return;

    // Use all versioned assets for comprehensive preloading
    const criticalAssets = Array.from(this.assetVersions.keys());
    
    console.log('[AssetManager] Preloading all UI assets in single batch...');
    
    // Single batch load with Promise.allSettled for efficiency
    const results = await Promise.allSettled(
      criticalAssets.map(asset => this.loadAsset(asset, { preload: true, priority: 'high' }))
    );
    
    // Count successes and failures
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[AssetManager] Asset preload complete: ${successful} successful, ${failed} failed`);
  }

  /**
   * Lazy load assets when they come into view
   */
  setupLazyLoading() {
    if (!this.lazyLoadingEnabled) return;
    
    const lazyImages = document.querySelectorAll('img[data-lazy]');
    
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.lazy;
            
            this.loadAsset(src)
              .then(loadedImg => {
                img.src = loadedImg.src;
                img.removeAttribute('data-lazy');
                observer.unobserve(img);
              })
              .catch(error => {
                console.warn(`[AssetManager] Failed to lazy load ${src}:`, error);
              });
          }
        });
      });
      
      lazyImages.forEach(img => imageObserver.observe(img));
    } else {
      // Fallback for browsers without IntersectionObserver
      lazyImages.forEach(img => {
        const src = img.dataset.lazy;
        this.loadAsset(src)
          .then(loadedImg => {
            img.src = loadedImg.src;
            img.removeAttribute('data-lazy');
          })
          .catch(error => {
            console.warn(`[AssetManager] Failed to lazy load ${src}:`, error);
          });
      });
    }
  }

  /**
   * Compress assets (placeholder for actual compression)
   */
  async compressAsset(assetPath, options = {}) {
    if (!this.compressionEnabled) return assetPath;
    
    // In a real implementation, this would:
    // 1. Check if compressed version exists
    // 2. Generate compressed version if needed
    // 3. Return compressed asset path
    
    const compressedPath = assetPath.replace(/\.(png|jpg|jpeg)$/, '.webp');
    
    try {
      // Try to load compressed version
      await this.loadAsset(compressedPath, { useCache: false });
      return compressedPath;
    } catch (error) {
      // Fall back to original if compressed version doesn't exist
      return assetPath;
    }
  }

  /**
   * Bundle assets for better performance
   */
  async bundleAssets(assetPaths, bundleName) {
    const bundle = {
      name: bundleName,
      assets: new Map(),
      loadTime: 0,
      size: 0
    };
    
    const startTime = performance.now();
    
    try {
      const loadPromises = assetPaths.map(async (assetPath) => {
        const asset = await this.loadAsset(assetPath);
        bundle.assets.set(assetPath, asset);
        return asset;
      });
      
      await Promise.all(loadPromises);
      
      bundle.loadTime = performance.now() - startTime;
      console.log(`[AssetManager] Bundle ${bundleName} loaded in ${bundle.loadTime.toFixed(2)}ms`);
      
      return bundle;
      
    } catch (error) {
      console.error(`[AssetManager] Failed to load bundle ${bundleName}:`, error);
      throw error;
    }
  }

  /**
   * Get asset statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      preloadedCount: this.preloadedAssets.size,
      failedCount: this.failedAssets.size,
      loadingCount: this.loadingPromises.size,
      compressionEnabled: this.compressionEnabled,
      lazyLoadingEnabled: this.lazyLoadingEnabled,
      monitoringEnabled: this.monitoringEnabled
    };
  }

  /**
   * Clear asset cache
   */
  clearCache() {
    this.cache.clear();
    this.preloadedAssets.clear();
    this.failedAssets.clear();
    console.log('[AssetManager] Cache cleared');
  }

  /**
   * Update asset versions (for cache busting)
   */
  updateAssetVersions() {
    this.initializeAssetVersions();
    console.log('[AssetManager] Asset versions updated');
  }

  /**
   * Enable/disable compression
   */
  setCompressionEnabled(enabled) {
    this.compressionEnabled = enabled;
    console.log(`[AssetManager] Compression ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable lazy loading
   */
  setLazyLoadingEnabled(enabled) {
    this.lazyLoadingEnabled = enabled;
    console.log(`[AssetManager] Lazy loading ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable monitoring
   */
  setMonitoringEnabled(enabled) {
    this.monitoringEnabled = enabled;
    console.log(`[AssetManager] Monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Export for use in the application
if (typeof module !== 'undefined' && module.exports) {
  module.exports = XVGAssetManager;
} else {
  window.XVGAssetManager = XVGAssetManager;
}
