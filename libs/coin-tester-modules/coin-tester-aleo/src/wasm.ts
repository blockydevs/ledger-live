export type AleoWasm = typeof import("@provablehq/sdk/testnet.js");

let cached: Promise<AleoWasm> | null = null;

/**
 * @provablehq/sdk is ESM-only. A static import would be compiled to `require()`
 * by swc and fail at runtime, so every consumer goes through this one dynamic
 * import. The promise is cached: instantiating the wasm module twice would give
 * two disjoint sets of classes, and an object from one is not accepted by the
 * other.
 */
export function loadAleoWasm(): Promise<AleoWasm> {
  cached ??= import("@provablehq/sdk/testnet.js");
  return cached;
}
