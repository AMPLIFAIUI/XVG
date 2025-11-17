// FILE: src-web/tauri-adapter.js - Tauri Backend Adapter
// This module adapts the web editor to use Tauri's native backend instead of WASM

import { invoke } from '@tauri-apps/api/tauri';
import { open, save } from '@tauri-apps/api/dialog';
import { readBinaryFile, writeBinaryFile } from '@tauri-apps/api/fs';

/**
 * Tauri Adapter
 * Replaces WASM XVGRuntime with Tauri backend calls
 */
export class TauriXVGRuntime {
    constructor() {
        this.fileData = null;
        this.currentFilePath = null;
        console.log('[Tauri] XVGRuntime adapter initialized');
    }

    /**
     * Load XVG file data
     * @param {Uint8Array} data - XVG file bytes
     */
    load(data) {
        this.fileData = data;
        console.log('[Tauri] Loaded XVG data:', data.length, 'bytes');
    }

    /**
     * Render to bitmap
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @returns {Promise<Uint8Array>} RGBA pixel data
     */
    async render(width, height) {
        try {
            const result = await invoke('render_canvas', {
                width: width,
                height: height,
                data: Array.from(this.fileData || [])
            });
            return new Uint8Array(result);
        } catch (error) {
            console.error('[Tauri] Render error:', error);
            throw error;
        }
    }

    /**
     * Extract to format (SVG, PNG)
     * @param {string} format - Output format
     * @returns {Promise<Uint8Array>} Extracted data
     */
    async extract(format) {
        try {
            const result = await invoke('extract_format', {
                format: format,
                data: Array.from(this.fileData || [])
            });
            return new Uint8Array(result);
        } catch (error) {
            console.error('[Tauri] Extract error:', error);
            throw error;
        }
    }

    /**
     * Apply CRDT operation
     * @param {string} opJson - CRDT operation as JSON
     */
    async applyCrdtOp(opJson) {
        try {
            await invoke('sync_operations', {
                operations: [JSON.parse(opJson)]
            });
        } catch (error) {
            console.error('[Tauri] CRDT op error:', error);
            throw error;
        }
    }
}

/**
 * Tauri File Operations
 * Replaces web file operations with native file dialogs
 */
export class TauriFileOperations {
    /**
     * Open file dialog and load XVG file
     * @returns {Promise<{data: Uint8Array, path: string}>}
     */
    static async openFile() {
        try {
            const filePath = await open({
                filters: [{
                    name: 'XVG Files',
                    extensions: ['xvg']
                }],
                multiple: false
            });

            if (!filePath) {
                return null;
            }

            const data = await readBinaryFile(filePath);
            console.log('[Tauri] Opened file:', filePath, data.length, 'bytes');
            
            return {
                data: data,
                path: filePath
            };
        } catch (error) {
            console.error('[Tauri] Open file error:', error);
            throw error;
        }
    }

    /**
     * Save file dialog and write XVG file
     * @param {Uint8Array} data - XVG file data
     * @param {string} defaultPath - Default file path
     * @returns {Promise<string>} Saved file path
     */
    static async saveFile(data, defaultPath = null) {
        try {
            const filePath = await save({
                filters: [{
                    name: 'XVG Files',
                    extensions: ['xvg']
                }],
                defaultPath: defaultPath || 'untitled.xvg'
            });

            if (!filePath) {
                return null;
            }

            await writeBinaryFile(filePath, data);
            console.log('[Tauri] Saved file:', filePath, data.length, 'bytes');
            
            return filePath;
        } catch (error) {
            console.error('[Tauri] Save file error:', error);
            throw error;
        }
    }
}

/**
 * Initialize Tauri adapter
 * Replaces WASM runtime with Tauri backend
 */
export function initializeTauriAdapter() {
    // Replace XVGRuntime with Tauri adapter
    window.XVGRuntime = TauriXVGRuntime;
    
    // Override file operations
    window.TauriFileOps = TauriFileOperations;
    
    // Detect Tauri environment
    window.isTauri = true;
    
    console.log('[Tauri] Adapter initialized, WASM runtime replaced with Tauri backend');
}
