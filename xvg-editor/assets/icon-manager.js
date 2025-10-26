/**
 * XVG Icon Manager
 * Single source of truth for all icon assets
 * UI is for the xvg project and the rules are being followed.
 */

class XVGIconManager {
  constructor() {
    this.icons = [
      'assets/xvgicon.png',
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
      'assets/icons/white/icons8-add-new-100.png',
      'assets/icons/white/icons8-undo-100.png',
      'assets/icons/white/icons8-redo-100.png',
      'assets/icons/white/icons8-trash-100.png',
      'assets/icons/white/icons8-export-100.png',
      'assets/icons/white/icons8-fill-color-100.png',
      'assets/icons/white/icons8-text-100.png',
      'assets/icons/white/icons8-chevron-up-100.png',
      'assets/icons/white/icons8-chevron-down-100.png'
    ];
    
    this.loadedIcons = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Load all icons in a single batch
   */
  async loadAllIcons() {
    console.log('[IconManager] Loading all icons in single batch...');
    
    const results = await Promise.allSettled(
      this.icons.map(icon => this.loadIcon(icon))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`[IconManager] Icon loading complete: ${successful} successful, ${failed} failed`);
    return { successful, failed };
  }

  /**
   * Load individual icon
   */
  async loadIcon(iconPath) {
    if (this.loadedIcons.has(iconPath)) {
      return this.loadedIcons.get(iconPath);
    }

    if (this.loadingPromises.has(iconPath)) {
      return this.loadingPromises.get(iconPath);
    }

    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.loadedIcons.set(iconPath, img);
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`[IconManager] Failed to load icon: ${iconPath}`);
        reject(new Error(`Failed to load ${iconPath}`));
      };
      img.src = iconPath;
    });

    this.loadingPromises.set(iconPath, promise);
    return promise;
  }

  /**
   * Get loaded icon
   */
  getIcon(iconPath) {
    return this.loadedIcons.get(iconPath);
  }

  /**
   * Check if icon is loaded
   */
  isIconLoaded(iconPath) {
    return this.loadedIcons.has(iconPath);
  }
}

// Global instance
window.XVGIconManager = XVGIconManager;
