import { useState, useEffect } from 'react';
import { loadFloorplanWasm } from '../utils/floorplan';
import type { FloorplanWasm } from '../utils/floorplan';

export interface UseFloorplanWasmResult {
  wasm: FloorplanWasm | null;
  loading: boolean;
  error: Error | null;
}

/**
 * React hook to load and use the floorplan WASM module
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { wasm, loading, error } = useFloorplanWasm();
 * 
 *   if (loading) return <div>Loading WASM...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!wasm) return <div>WASM not available</div>;
 * 
 *   return <div>{wasm.greet("World")}</div>;
 * }
 * ```
 */
export function useFloorplanWasm(): UseFloorplanWasmResult {
  const [wasm, setWasm] = useState<FloorplanWasm | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        const module = await loadFloorplanWasm();
        
        if (mounted) {
          setWasm(module);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load WASM'));
          setWasm(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return { wasm, loading, error };
}
