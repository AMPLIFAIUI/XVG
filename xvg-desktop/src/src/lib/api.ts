import type { XVGFile } from 'xvg-core-wasm';

declare global {
    interface Window {
        openXvg: (path: string) => Promise<XVGFile>;
        saveXvg: (file: XVGFile) => Promise<void>;
    }
} 