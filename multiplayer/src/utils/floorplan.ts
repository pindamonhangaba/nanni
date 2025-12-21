/**
 * Floorplan WASM Module Loader
 * 
 * This module handles loading and initializing the floorplan WASM library.
 * 
 * To build the WASM module:
 * 1. Install Rust: https://rustup.rs/
 * 2. Install wasm-pack: cargo install wasm-pack
 * 3. Navigate to ../floor_plan directory
 * 4. Run: wasm-pack build --target web
 * 5. Copy the generated pkg/ folder to multiplayer/public/wasm/floorplan/
 */

let wasmModule: any = null;

export interface FloorplanWasm {
  init_floorplan: () => string;
  greet: (name: string) => string;
}

/**
 * Load the floorplan WASM module
 * @param wasmPath - Path to the WASM module (default: '/wasm/floorplan/floorplan_bg.wasm')
 */
export async function loadFloorplanWasm(
  wasmPath: string = '/wasm/floorplan/floorplan.js'
): Promise<FloorplanWasm | null> {
  if (wasmModule) {
    console.log('Floorplan WASM module already loaded');
    return wasmModule;
  }

  try {
    console.log('Loading floorplan WASM module from:', wasmPath);
    
    // Dynamic import of the WASM module
    const module = await import(/* @vite-ignore */ wasmPath);
    
    // Initialize the WASM module
    await module.default();
    
    wasmModule = module;
    
    console.log('Floorplan WASM module loaded successfully');
    console.log('Test:', module.init_floorplan());
    
    return module as FloorplanWasm;
  } catch (error) {
    console.error('Failed to load floorplan WASM module:', error);
    console.info(`
      To build the WASM module:
      1. Install Rust from https://rustup.rs/
      2. Install wasm-pack: cargo install wasm-pack
      3. Navigate to the floor_plan directory
      4. Run: wasm-pack build --target web
      5. Copy the generated pkg/ folder to multiplayer/public/wasm/floorplan/
    `);
    return null;
  }
}

/**
 * Get the loaded WASM module (must call loadFloorplanWasm first)
 */
export function getFloorplanWasm(): FloorplanWasm | null {
  return wasmModule;
}

/**
 * Check if the WASM module is loaded
 */
export function isFloorplanWasmLoaded(): boolean {
  return wasmModule !== null;
}
