import { useFloorplanWasm } from '@/hooks/useFloorplanWasm';

/**
 * Test component to demonstrate WASM module loading
 * 
 * This component will attempt to load the floorplan WASM module
 * and display its status and test functions.
 */
export function FloorplanWasmTest() {
  const { wasm, loading, error } = useFloorplanWasm();

  if (loading) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-bold text-blue-900">Loading Floorplan WASM...</h3>
        <p className="text-sm text-blue-700">Initializing WebAssembly module</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <h3 className="font-bold text-red-900">Error Loading WASM</h3>
        <p className="text-sm text-red-700 mb-2">{error.message}</p>
        <details className="text-xs text-red-600">
          <summary className="cursor-pointer font-semibold">Build Instructions</summary>
          <pre className="mt-2 p-2 bg-red-100 rounded overflow-x-auto">
{`1. Install Rust: https://rustup.rs/
2. Install wasm-pack: cargo install wasm-pack
3. Navigate to ../floor_plan
4. Run: wasm-pack build --target web
5. Copy pkg/ to multiplayer/public/wasm/floorplan/`}
          </pre>
        </details>
      </div>
    );
  }

  if (!wasm) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h3 className="font-bold text-yellow-900">WASM Module Not Available</h3>
        <p className="text-sm text-yellow-700">
          The module failed to load. See console for details.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded">
      <h3 className="font-bold text-green-900 mb-2">✓ Floorplan WASM Loaded</h3>
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-semibold">init_floorplan():</span>
          <p className="text-green-700 ml-4">{wasm.init_floorplan()}</p>
        </div>
        <div>
          <span className="font-semibold">greet("Player"):</span>
          <p className="text-green-700 ml-4">{wasm.greet("Player")}</p>
        </div>
      </div>
    </div>
  );
}
