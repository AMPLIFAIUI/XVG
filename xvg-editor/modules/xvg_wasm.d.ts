/* tslint:disable */
/* eslint-disable */
/**
 * Standalone function to apply CRDT operation (for backward compatibility)
 */
export function applyCrdtOp(runtime: XVGRuntime, op_json: string): void;
/**
 * WASM wrapper for 3D Engine
 */
export class XVG3DEngine {
  free(): void;
  /**
   * Get total index count
   */
  getTotalIndices(): number;
  /**
   * Get total vertex count
   */
  getTotalVertices(): number;
  constructor();
}
/**
 * WASM wrapper for CRDT Engine  
 */
export class XVGCRDTEngine {
  free(): void;
  /**
   * Get author ID
   */
  getAuthorId(): number;
  /**
   * Get Lamport clock
   */
  getLamportClock(): number;
  constructor(author_id: number);
}
/**
 * A safe, high-level wrapper around the Rust XVG file model.
 */
export class XVGFile {
  free(): void;
  /**
   * Get header as a JS object (width, height, etc).
   */
  get_header(): any;
  /**
   * Remove all vector paths.
   */
  clear_paths(): void;
  /**
   * Encode and return the file as a Uint8Array (zero-copy).
   */
  encode_bytes(): Uint8Array;
  /**
   * Create an empty XVG file of given width and height.
   */
  constructor(width: number, height: number);
  /**
   * Decode binary data (Uint8Array or Array) as an XVGFile.
   */
  static decode(bytes: any): XVGFile;
  /**
   * Add a path from binary point data, transform, and style (JS object).
   */
  add_path(data: any, tf: any, style: any): void;
  /**
   * Number of vector paths in file.
   */
  readonly path_count: number;
}
/**
 * The WASM-exposed XVG Runtime, implementing the Zero-Conversion contract.
 */
export class XVGRuntime {
  free(): void;
  /**
   * Applies a CRDT operation to the file state.
   * The operation is passed as a JSON string.
   */
  applyCrdtOp(op_json: string): void;
  /**
   * Loads an XVG file from raw bytes (Uint8Array or ArrayBuffer).
   */
  constructor(data: Uint8Array);
  /**
   * Implements the core rendering contract: xvg.render(width, height)
   * Renders the XVG file to a bitmap and returns the RGBA8888 pixel data as a Uint8Array.
   */
  render(width: number, height: number): Uint8Array;
  /**
   * Implements the core extraction contract: xvg.extract(format)
   * Extracts the XVG file to a legacy format (e.g., "svg", "png") and returns the raw bytes.
   */
  extract(format: string): Uint8Array;
}
/**
 * WASM wrapper for SDF Engine
 */
export class XVGSDFEngine {
  free(): void;
  /**
   * Evaluate SDF at a given point
   */
  evaluateSDF(x: number, y: number): number;
  /**
   * Initialize weights
   */
  initializeWeights(): void;
  constructor();
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_xvg3dengine_free: (a: number, b: number) => void;
  readonly __wbg_xvgcrdtengine_free: (a: number, b: number) => void;
  readonly __wbg_xvgfile_free: (a: number, b: number) => void;
  readonly __wbg_xvgruntime_free: (a: number, b: number) => void;
  readonly __wbg_xvgsdfengine_free: (a: number, b: number) => void;
  readonly applyCrdtOp: (a: number, b: number, c: number) => [number, number];
  readonly xvg3dengine_getTotalIndices: (a: number) => number;
  readonly xvg3dengine_getTotalVertices: (a: number) => number;
  readonly xvg3dengine_new: () => number;
  readonly xvgcrdtengine_getAuthorId: (a: number) => number;
  readonly xvgcrdtengine_getLamportClock: (a: number) => number;
  readonly xvgcrdtengine_new: (a: number) => number;
  readonly xvgfile_add_path: (a: number, b: any, c: any, d: any) => [number, number];
  readonly xvgfile_clear_paths: (a: number) => void;
  readonly xvgfile_decode: (a: any) => [number, number, number];
  readonly xvgfile_encode_bytes: (a: number) => any;
  readonly xvgfile_get_header: (a: number) => [number, number, number];
  readonly xvgfile_new: (a: number, b: number) => number;
  readonly xvgfile_path_count: (a: number) => number;
  readonly xvgruntime_extract: (a: number, b: number, c: number) => [number, number, number];
  readonly xvgruntime_load: (a: number, b: number) => [number, number, number];
  readonly xvgruntime_render: (a: number, b: number, c: number) => [number, number, number];
  readonly xvgsdfengine_evaluateSDF: (a: number, b: number, c: number) => number;
  readonly xvgsdfengine_initializeWeights: (a: number) => void;
  readonly xvgsdfengine_new: () => number;
  readonly xvgruntime_applyCrdtOp: (a: number, b: number, c: number) => [number, number];
  readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
  readonly rust_zstd_wasm_shim_free: (a: number) => void;
  readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
  readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_4: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
