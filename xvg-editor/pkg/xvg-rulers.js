// FILE: xvg-rulers.js - Ruler rendering functions for XVG Editor

/**
 * Update the top (horizontal) ruler
 */
export function updateTopRuler() {
    if (!window.XVGSystem || !window.XVGSystem.appState) return;
    
    const rulers = window.XVGSystem.appState.rulers;
    if (!rulers || !rulers.visible) return;
    
    const topRuler = document.getElementById('top-ruler');
    if (!topRuler) return;
    
    const transform = window.XVGSystem.appState.canvasTransform;
    const canvas = window.XVGSystem.canvas.element;
    if (!canvas) return;
    
    // Clear ruler
    topRuler.innerHTML = '';
    
    // Calculate visible range in world coordinates
    const startX = -transform.pan_x / transform.zoom;
    const endX = startX + (canvas.width / transform.zoom);
    
    // Determine tick spacing based on zoom level
    let majorTick = 100;
    let minorTick = 10;
    
    if (transform.zoom < 0.2) {
        majorTick = 1000;
        minorTick = 100;
    } else if (transform.zoom < 0.5) {
        majorTick = 500;
        minorTick = 50;
    } else if (transform.zoom > 2) {
        majorTick = 50;
        minorTick = 5;
    }
    
    // Create ruler canvas
    const rulerCanvas = document.createElement('canvas');
    rulerCanvas.width = canvas.width;
    rulerCanvas.height = rulers.rulerSize || 30;
    rulerCanvas.style.width = '100%';
    rulerCanvas.style.height = '100%';
    
    const ctx = rulerCanvas.getContext('2d');
    
    // Draw ruler background
    ctx.fillStyle = rulers.background || '#2a2a2a';
    ctx.fillRect(0, 0, rulerCanvas.width, rulerCanvas.height);
    
    // Draw ticks and labels
    ctx.font = rulers.font || '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const tickStart = Math.floor(startX / minorTick) * minorTick;
    
    for (let x = tickStart; x <= endX; x += minorTick) {
        const screenX = (x * transform.zoom) + transform.pan_x;
        
        if (screenX < 0 || screenX > rulerCanvas.width) continue;
        
        const isMajor = (x % majorTick === 0);
        
        // Draw tick
        ctx.strokeStyle = rulers.tickColor || '#999999';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenX, rulerCanvas.height);
        ctx.lineTo(screenX, rulerCanvas.height - (isMajor ? 15 : 8));
        ctx.stroke();
        
        // Draw label for major ticks
        if (isMajor) {
            ctx.fillStyle = rulers.textColor || '#cccccc';
            ctx.fillText(x.toString(), screenX, 2);
        }
    }
    
    topRuler.appendChild(rulerCanvas);
}

/**
 * Update the left (vertical) ruler
 */
export function updateLeftRuler() {
    if (!window.XVGSystem || !window.XVGSystem.appState) return;
    
    const rulers = window.XVGSystem.appState.rulers;
    if (!rulers || !rulers.visible) return;
    
    const leftRuler = document.getElementById('left-ruler');
    if (!leftRuler) return;
    
    const transform = window.XVGSystem.appState.canvasTransform;
    const canvas = window.XVGSystem.canvas.element;
    if (!canvas) return;
    
    // Clear ruler
    leftRuler.innerHTML = '';
    
    // Calculate visible range in world coordinates
    const startY = -transform.pan_y / transform.zoom;
    const endY = startY + (canvas.height / transform.zoom);
    
    // Determine tick spacing based on zoom level
    let majorTick = 100;
    let minorTick = 10;
    
    if (transform.zoom < 0.2) {
        majorTick = 1000;
        minorTick = 100;
    } else if (transform.zoom < 0.5) {
        majorTick = 500;
        minorTick = 50;
    } else if (transform.zoom > 2) {
        majorTick = 50;
        minorTick = 5;
    }
    
    // Create ruler canvas
    const rulerCanvas = document.createElement('canvas');
    rulerCanvas.width = rulers.rulerSize || 30;
    rulerCanvas.height = canvas.height;
    rulerCanvas.style.width = '100%';
    rulerCanvas.style.height = '100%';
    
    const ctx = rulerCanvas.getContext('2d');
    
    // Draw ruler background
    ctx.fillStyle = rulers.background || '#2a2a2a';
    ctx.fillRect(0, 0, rulerCanvas.width, rulerCanvas.height);
    
    // Draw ticks and labels
    ctx.font = rulers.font || '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    const tickStart = Math.floor(startY / minorTick) * minorTick;
    
    for (let y = tickStart; y <= endY; y += minorTick) {
        const screenY = (y * transform.zoom) + transform.pan_y;
        
        if (screenY < 0 || screenY > rulerCanvas.height) continue;
        
        const isMajor = (y % majorTick === 0);
        
        // Draw tick
        ctx.strokeStyle = rulers.tickColor || '#999999';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rulerCanvas.width, screenY);
        ctx.lineTo(rulerCanvas.width - (isMajor ? 15 : 8), screenY);
        ctx.stroke();
        
        // Draw label for major ticks
        if (isMajor) {
            ctx.fillStyle = rulers.textColor || '#cccccc';
            ctx.save();
            ctx.translate(rulerCanvas.width - 18, screenY);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.fillText(y.toString(), 0, 0);
            ctx.restore();
        }
    }
    
    leftRuler.appendChild(rulerCanvas);
}

/**
 * Toggle rulers visibility
 */
export function toggleRulers() {
    if (!window.XVGSystem || !window.XVGSystem.appState) return;
    
    const rulers = window.XVGSystem.appState.rulers;
    if (!rulers) return;
    
    rulers.visible = !rulers.visible;
    
    const topRuler = document.getElementById('top-ruler');
    const leftRuler = document.getElementById('left-ruler');
    const rulerCorner = document.querySelector('.ruler-corner');
    
    if (rulers.visible) {
        if (topRuler) topRuler.style.display = 'block';
        if (leftRuler) leftRuler.style.display = 'block';
        if (rulerCorner) rulerCorner.style.display = 'block';
        updateTopRuler();
        updateLeftRuler();
    } else {
        if (topRuler) topRuler.style.display = 'none';
        if (leftRuler) leftRuler.style.display = 'none';
        if (rulerCorner) rulerCorner.style.display = 'none';
    }
}

// Export functions to window for global access
if (typeof window !== 'undefined') {
    window.updateTopRuler = updateTopRuler;
    window.updateLeftRuler = updateLeftRuler;
    window.toggleRulers = toggleRulers;
}
