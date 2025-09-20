/* tslint:disable */
/* eslint-disable */
export function create_sample_file(): XVGFile;
/**
 * Parse raw path binary data (as Uint8Array) to a JS array of [x, y] arrays.
 */
export function parse_path_data(data: any): any;
/**
 * WGSL Shader Engine - TEMPORARILY COMMENTED OUT FOR WASM COMPATIBILITY
 * Will be restored when web-sys supports WebGPU APIs
 * 3D Mesh Generation Engine
 */
export class XVG3DEngine {
  free(): void;
  constructor();
  /**
   * Extrude 2D path to 3D mesh
   */
  extrude_path(path_data: any, height: number): any;
  /**
   * Generate 3D mesh from path
   */
  generate_mesh(path_data: any): any;
}
/**
 * CRDT Collaboration Engine
 */
export class XVGCRDTEngine {
  free(): void;
  constructor();
  /**
   * Apply operation to CRDT
   */
  apply_operation(operation: any): any;
  /**
   * Merge operations from another CRDT
   */
  merge_operations(operations: any): any;
  /**
   * Get current state
   */
  get_state(): any;
}
/**
 * A safe, high-level wrapper around the Rust XVG file model, optimized for WASM/JS/TS.
 */
export class XVGFile {
  free(): void;
  /**
   * Create an empty XVG file of given width and height.
   */
  constructor(width: number, height: number);
  /**
   * Encode and return the file as a Uint8Array (zero-copy).
   */
  encode_bytes(): Uint8Array;
  /**
   * Decode binary data (Uint8Array or Array) as an XVGFile.
   */
  static decode(bytes: any): XVGFile;
  /**
   * Add a path from binary point data, transform, and style (JS object).
   * - `data`: Float32[x0, y0, x1, y1, ...] as Uint8Array or ArrayBuffer
   * - `tf`: Array of 6 numbers [a,b,c,d,e,f]
   * - `style`: PathStyle as JS object or undefined/null for default.
   */
  add_path(data: any, tf: any, style: any): void;
  /**
   * Get all path records as a JS array of objects; efficient for interop.
   */
  get_paths(): any;
  /**
   * Get header as a JS object (width, height, etc).
   */
  get_header(): any;
  /**
   * Remove all vector paths.
   */
  clear_paths(): void;
  /**
   * Remove path by index (returns success/failure).
   */
  remove_path(index: number): boolean;
  /**
   * Basic info as a JS object (for fast preview).
   */
  get_file_info(): any;
  /**
   * Number of vector paths in file.
   */
  readonly path_count: number;
}
export class XVGPathBuilder {
  free(): void;
  /**
   * New builder, with empty geometry.
   */
  constructor();
  /**
   * Add a 2D point to the path.
   */
  add_point(x: number, y: number): void;
  set_fill_color(r: number, g: number, b: number, a: number): void;
  set_stroke_color(r: number, g: number, b: number, a: number, width: number): void;
  /**
   * Build returns [bytes, style] as a JS array: [Uint8Array, PathStyle].
   */
  build(): Array<any>;
  get_style(): any;
}
export class XVGRenderer {
  free(): void;
  /**
   * Create new camera/viewport for specified dimensions.
   */
  constructor(width: number, height: number);
  set_zoom(zoom: number): void;
  set_pan(x: number, y: number): void;
  world_to_screen(x: number, y: number): Array<any>;
  screen_to_world(x: number, y: number): Array<any>;
  get_viewport_info(): any;
}
/**
 * SDF Neural Network Engine
 */
export class XVGSDFEngine {
  free(): void;
  constructor();
  /**
   * Train the neural network with sample data
   */
  train(training_data: any): any;
  /**
   * Evaluate SDF at a point
   */
  evaluate(x: number, y: number): number;
  /**
   * Get neural network weights
   */
  get_weights(): any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_xvgfile_free: (a: number, b: number) => void;
  readonly xvgfile_new: (a: number, b: number) => number;
  readonly xvgfile_encode_bytes: (a: number) => any;
  readonly xvgfile_decode: (a: any) => [number, number, number];
  readonly xvgfile_add_path: (a: number, b: any, c: any, d: any) => [number, number];
  readonly xvgfile_get_paths: (a: number) => [number, number, number];
  readonly xvgfile_get_header: (a: number) => [number, number, number];
  readonly xvgfile_path_count: (a: number) => number;
  readonly xvgfile_clear_paths: (a: number) => void;
  readonly xvgfile_remove_path: (a: number, b: number) => number;
  readonly xvgfile_get_file_info: (a: number) => [number, number, number];
  readonly __wbg_xvgpathbuilder_free: (a: number, b: number) => void;
  readonly xvgpathbuilder_new: () => number;
  readonly xvgpathbuilder_add_point: (a: number, b: number, c: number) => void;
  readonly xvgpathbuilder_set_fill_color: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly xvgpathbuilder_set_stroke_color: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly xvgpathbuilder_build: (a: number) => [number, number, number];
  readonly xvgpathbuilder_get_style: (a: number) => [number, number, number];
  readonly __wbg_xvgrenderer_free: (a: number, b: number) => void;
  readonly xvgrenderer_new: (a: number, b: number) => number;
  readonly xvgrenderer_set_zoom: (a: number, b: number) => void;
  readonly xvgrenderer_set_pan: (a: number, b: number, c: number) => void;
  readonly xvgrenderer_world_to_screen: (a: number, b: number, c: number) => [number, number, number];
  readonly xvgrenderer_screen_to_world: (a: number, b: number, c: number) => [number, number, number];
  readonly xvgrenderer_get_viewport_info: (a: number) => [number, number, number];
  readonly create_sample_file: () => number;
  readonly parse_path_data: (a: any) => [number, number, number];
  readonly __wbg_xvgsdfengine_free: (a: number, b: number) => void;
  readonly xvgsdfengine_new: () => number;
  readonly xvgsdfengine_train: (a: number, b: any) => [number, number, number];
  readonly xvgsdfengine_evaluate: (a: number, b: number, c: number) => number;
  readonly xvgsdfengine_get_weights: (a: number) => [number, number, number];
  readonly __wbg_xvg3dengine_free: (a: number, b: number) => void;
  readonly xvg3dengine_new: () => number;
  readonly xvg3dengine_extrude_path: (a: number, b: any, c: number) => [number, number, number];
  readonly xvg3dengine_generate_mesh: (a: number, b: any) => [number, number, number];
  readonly __wbg_xvgcrdtengine_free: (a: number, b: number) => void;
  readonly xvgcrdtengine_new: () => number;
  readonly xvgcrdtengine_apply_operation: (a: number, b: any) => [number, number, number];
  readonly xvgcrdtengine_merge_operations: (a: number, b: any) => [number, number, number];
  readonly xvgcrdtengine_get_state: (a: number) => [number, number, number];
  readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
  readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
  readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
  readonly rust_zstd_wasm_shim_free: (a: number) => void;
  readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
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
