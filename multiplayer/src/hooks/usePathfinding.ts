import { useEffect, useState, useCallback } from 'react';
import { NavMeshQuery } from 'recast-navigation';
import * as THREE from 'three';

export function usePathfinding(navMesh: any) {
  const [navMeshQuery, setNavMeshQuery] = useState<NavMeshQuery | null>(null);

  useEffect(() => {
    if (!navMesh) return;

    try {
      const query = new NavMeshQuery(navMesh);
      setNavMeshQuery(query);
      console.log('[usePathfinding] NavMeshQuery created');
    } catch (error) {
      console.error('[usePathfinding] Failed to create NavMeshQuery:', error);
    }

    return () => {
      navMeshQuery?.destroy();
    };
  }, [navMesh]);

  const findPath = useCallback(
    (start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] => {
      if (!navMeshQuery) {
        console.warn('[usePathfinding] NavMeshQuery not ready');
        return [];
      }

      try {
        const startPos = { x: start.x, y: start.y, z: start.z };
        const endPos = { x: end.x, y: end.y, z: end.z };

        console.log('[usePathfinding] Computing path from', startPos, 'to', endPos);

        // First, find the polygon path to see if it includes off-mesh connections
        const startNearestPoly = navMeshQuery.findNearestPoly(startPos);
        const endNearestPoly = navMeshQuery.findNearestPoly(endPos);
        
        if (startNearestPoly.success && endNearestPoly.success) {
          console.log('[usePathfinding] Start polygon:', startNearestPoly.nearestRef);
          console.log('[usePathfinding] End polygon:', endNearestPoly.nearestRef);
          
          const pathPolysResult = navMeshQuery.findPath(
            startNearestPoly.nearestRef,
            endNearestPoly.nearestRef,
            startPos,
            endPos
          );
          
          if (pathPolysResult.success) {
            const polyRefs = Array.from(pathPolysResult.polys.getHeapView());
            console.log('[usePathfinding] Polygon path has', polyRefs.length, 'polygons:', polyRefs);
            pathPolysResult.polys.destroy();
          }
        }

        const { success, path } = navMeshQuery.computePath(startPos, endPos);

        if (success && path) {
          console.log(`[usePathfinding] Path found with ${path.length} waypoints:`);
          path.forEach((p: any, i: number) => {
            console.log(`  [${i}]:`, p);
          });
          
          // Check for height changes that might indicate off-mesh connections
          for (let i = 1; i < path.length; i++) {
            const heightDiff = Math.abs(path[i].y - path[i - 1].y);
            if (heightDiff > 1) {
              console.log(`[usePathfinding] Large height change detected at waypoint ${i}: ${heightDiff.toFixed(2)} units`);
            }
          }
          
          return path.map((p: any) => new THREE.Vector3(p.x, p.y, p.z));
        } else {
          console.warn('[usePathfinding] Path not found from', startPos, 'to', endPos);
          return [];
        }
      } catch (error) {
        console.error('[usePathfinding] Error computing path:', error);
        return [];
      }
    },
    [navMeshQuery]
  );

  const getClosestPoint = useCallback(
    (position: THREE.Vector3): THREE.Vector3 | null => {
      if (!navMeshQuery) return null;

      try {
        const pos = { x: position.x, y: position.y, z: position.z };
        const { success, point } = navMeshQuery.findClosestPoint(pos);

        if (success && point) {
          console.log('[usePathfinding] Closest point to', pos, 'is', point);
          return new THREE.Vector3(point.x, point.y, point.z);
        }
        
        console.warn('[usePathfinding] Could not find closest point for', pos);
      } catch (error) {
        console.error('[usePathfinding] Error finding closest point:', error);
      }

      return null;
    },
    [navMeshQuery]
  );

  const getRandomPoint = useCallback((): THREE.Vector3 | null => {
    if (!navMeshQuery) return null;

    try {
      const { success, randomPoint } = navMeshQuery.findRandomPointAroundCircle(
        { x: 0, y: 0, z: 0 },
        20 // radius
      );

      if (success && randomPoint) {
        return new THREE.Vector3(randomPoint.x, randomPoint.y, randomPoint.z);
      }
    } catch (error) {
      console.error('[usePathfinding] Error getting random point:', error);
    }

    return null;
  }, [navMeshQuery]);

  return {
    navMeshQuery,
    findPath,
    getClosestPoint,
    getRandomPoint,
    isReady: !!navMeshQuery,
  };
}
