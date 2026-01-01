import { useEffect, useState, useCallback } from 'react';
import { NavMeshQuery } from 'recast-navigation';
import * as THREE from 'three';
import { OffMeshConnectionType } from '@/utils/generateCity';

type OffMeshConnection = {
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  radius: number;
  bidirectional?: boolean;
  userId?: number;
  type?: OffMeshConnectionType;
};

export function usePathfinding(navMesh: any, offMeshConnections: OffMeshConnection[] = []) {
  const [navMeshQuery, setNavMeshQuery] = useState<NavMeshQuery | null>(null);

  useEffect(() => {
    if (!navMesh) return;

    try {
      const query = new NavMeshQuery(navMesh);
      
      // Configure default filter to include everything
      // This ensures off-mesh connections (flags: 1) are traversable
      const filter = query.defaultFilter;
      filter.includeFlags = 0xffff;
      filter.excludeFlags = 0;
      filter.setAreaCost(0, 1.0);
      
      setNavMeshQuery(query);
      console.log('[usePathfinding] NavMeshQuery created and filter configured');
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
        // Use taller Y extents so we can pick roof polygons (previously too small)
        const extents = { x: 2, y: 8, z: 2 };
        const startNearestPoly = navMeshQuery.findNearestPoly(startPos, extents);
        let endNearestPoly = navMeshQuery.findNearestPoly(endPos, extents);

        // If the end snaps far below the requested height, try to bias to roof by using nearest off-mesh endpoint
        const heightDelta = Math.abs((endNearestPoly.nearestPoint?.y ?? endPos.y) - endPos.y);
        if (heightDelta > 2 && offMeshConnections.length > 0) {
          // Pick the off-mesh endpoint closest in XZ to the target but also closest in height
          let best = null as null | { pos: { x: number; y: number; z: number }; score: number };
          offMeshConnections.forEach((c) => {
            const candidates = [c.startPosition, c.endPosition];
            candidates.forEach((p) => {
              const horiz = Math.hypot(p.x - endPos.x, p.z - endPos.z);
              const vert = Math.abs(p.y - endPos.y);
              const score = horiz + vert * 0.25; // height matters, but XZ closeness dominates
              if (!best || score < best.score) best = { pos: p, score };
            });
          });

          if (best) {
            const biased = navMeshQuery.findNearestPoly(best.pos, extents);
            if (biased.success) {
              console.warn('[usePathfinding] Biasing end poly to off-mesh endpoint due to height mismatch');
              endNearestPoly = biased;
            }
          }
        }
        
        if (startNearestPoly.success && endNearestPoly.success) {
          console.log('[usePathfinding] Start polygon:', startNearestPoly.nearestRef);
          console.log('[usePathfinding] End polygon:', endNearestPoly.nearestRef);
          console.log('[usePathfinding] End polygon point:', endNearestPoly.nearestPoint);
          
          // Check if start and end are on the same polygon
          if (startNearestPoly.nearestRef === endNearestPoly.nearestRef) {
             console.log('[usePathfinding] Start and end are on the same polygon');
          }

          if (Math.abs(endNearestPoly.nearestPoint.y - endPos.y) > 2.0) {
             console.warn('[usePathfinding] WARNING: End point snapped to a different height!', 
               'Requested Y:', endPos.y, 'Snapped Y:', endNearestPoly.nearestPoint.y);
          }

          const pathPolysResult = navMeshQuery.findPath(
            startNearestPoly.nearestRef,
            endNearestPoly.nearestRef,
            startNearestPoly.nearestPoint,
            endNearestPoly.nearestPoint,
            { filter: navMeshQuery.defaultFilter }
          );
          
          // Check for partial result (status & DT_PARTIAL_RESULT)
          // DT_PARTIAL_RESULT is 1 << 30 (0x40000000)
          const isPartial = (pathPolysResult.status & 0x40000000) !== 0;
          
          console.log(`[usePathfinding] findPath status: ${pathPolysResult.status} (Partial: ${isPartial}), success: ${pathPolysResult.success}`);
          
          // Allow partial results if they are successful (often happens with off-mesh connections)
          if (pathPolysResult.success) {
            const polyRefs = Array.from(pathPolysResult.polys.getHeapView());
            console.log('[usePathfinding] Polygon path has', polyRefs.length, 'polygons:', polyRefs);
            
            // Use findStraightPath with the explicit polygon path
            // This avoids computePath's internal findNearestPoly which might snap to ground
            const straightPathResult = navMeshQuery.findStraightPath(
              startNearestPoly.nearestPoint,
              endNearestPoly.nearestPoint,
              pathPolysResult.polys
            );
            
            console.log(`[usePathfinding] findStraightPath status: ${straightPathResult.status}, success: ${straightPathResult.success}`);
            
            pathPolysResult.polys.destroy();

            if (straightPathResult.success) {
              const { straightPath, straightPathFlags, straightPathRefs } = straightPathResult;
              
              const path: THREE.Vector3[] = [];
              const DT_STRAIGHTPATH_END = 0x02;
              const DT_STRAIGHTPATH_OFFMESH_CONNECTION = 0x04;
              
              console.log(`[usePathfinding] straightPath.size: ${straightPath.size}`);

              // straightPath is a FloatArray containing [x, y, z, x, y, z...]
              for (let i = 0; i < straightPath.size; i += 3) {
                const x = straightPath.get(i);
                const y = straightPath.get(i + 1);
                const z = straightPath.get(i + 2);
                const flags = straightPathFlags.get(i / 3);
                
                console.log(`[usePathfinding] Raw point ${i/3}: (${x}, ${y}, ${z}) Flags: ${flags}`);

                // Stop if we encounter a zeroed out point (0,0,0) after the first point
                // This is a safety check in case flags don't catch it
                if (i > 0 && x === 0 && y === 0 && z === 0) {
                   console.log('[usePathfinding] Zero point detected, breaking');
                   break;
                }

                path.push(new THREE.Vector3(x, y, z));

                if ((flags & DT_STRAIGHTPATH_OFFMESH_CONNECTION) !== 0) {
                   console.log(`[usePathfinding] Waypoint ${i/3} is an off-mesh connection start`);
                   // If this is an off-mesh connection, the NEXT point is the end of the connection
                   // We need to ensure we capture that correctly.
                   // Recast returns: [start_pos, end_pos] for off-mesh links
                   
                   // HACK: Sometimes Recast returns the start/end points of the link snapped to the ground
                   // or slightly offset. We should trust the off-mesh connection data if we can match it.
                }
                
                if ((flags & DT_STRAIGHTPATH_END) !== 0) {
                  console.log(`[usePathfinding] Reached end of straight path at index ${i/3}`);
                  // Don't break immediately if we are in the middle of processing points
                  // But usually this is the last point.
                }
              }

              // If we ended far from target, try a two-step path via the best off-mesh connection
              const targetVec = new THREE.Vector3(endPos.x, endPos.y, endPos.z);
              const last = path[path.length - 1];
              const distToTarget = last.distanceTo(targetVec);
              const heightDelta = Math.abs(last.y - targetVec.y);

              const computePathSimple = (a: {x:number;y:number;z:number}, b: {x:number;y:number;z:number}) => {
                const { success, path: p } = navMeshQuery.computePath(a, b, { filter: navMeshQuery.defaultFilter });
                if (success && p) return p.map((pt: any) => new THREE.Vector3(pt.x, pt.y, pt.z));
                return null;
              };

              if (distToTarget > 2 || heightDelta > 1.5) {
                console.warn(`[usePathfinding] Path ended ${distToTarget.toFixed(2)}m / ${heightDelta.toFixed(2)}m height from target; attempting off-mesh bridging`);

                let best: { conn: OffMeshConnection; reverse: boolean; score: number } | null = null;
                offMeshConnections.forEach((c) => {
                  const start = new THREE.Vector3(c.startPosition.x, c.startPosition.y, c.startPosition.z);
                  const end = new THREE.Vector3(c.endPosition.x, c.endPosition.y, c.endPosition.z);

                  const scoreForward = start.distanceTo(path[0]) + end.distanceTo(targetVec);
                  if (!best || scoreForward < best.score) best = { conn: c, reverse: false, score: scoreForward };

                  if (c.bidirectional) {
                    const scoreReverse = end.distanceTo(path[0]) + start.distanceTo(targetVec);
                    if (!best || scoreReverse < best.score) best = { conn: c, reverse: true, score: scoreReverse };
                  }
                });

                if (best) {
                  const a = best.reverse ? best.conn.endPosition : best.conn.startPosition;
                  const b = best.reverse ? best.conn.startPosition : best.conn.endPosition;

                  const leg1 = computePathSimple(startPos, a);
                  const leg2 = computePathSimple(b, endPos);

                  if (leg1 && leg2) {
                    const bridged = [...leg1];
                    bridged.push(new THREE.Vector3(a.x, a.y, a.z));
                    bridged.push(new THREE.Vector3(b.x, b.y, b.z));
                    leg2.forEach((p, idx) => {
                      if (idx === 0 && p.equals(bridged[bridged.length - 1])) return;
                      bridged.push(p);
                    });

                    console.warn('[usePathfinding] Bridged via off-mesh connection');
                    straightPath.destroy();
                    straightPathFlags.destroy();
                    straightPathRefs.destroy();
                    return bridged;
                  }
                }
              }

              // Clean up native arrays
              straightPath.destroy();
              straightPathFlags.destroy();
              straightPathRefs.destroy();

              console.log(`[usePathfinding] Straight path found with ${path.length} waypoints:`);
              path.forEach((p: any, i: number) => {
                console.log(`  [${i}]:`, p);
              });
              
              // Check for height changes that might indicate off-mesh connections
              for (let i = 1; i < path.length; i++) {
                const heightDiff2 = Math.abs(path[i].y - path[i - 1].y);
                if (heightDiff2 > 1) {
                  console.log(`[usePathfinding] Large height change detected at waypoint ${i}: ${heightDiff2.toFixed(2)} units`);
                }
              }
              
              return path;
            }
          }
        }

        // Fallback to computePath if manual method fails (or if findNearestPoly failed)
        console.warn('[usePathfinding] Manual pathfinding failed, falling back to computePath');
        const { success, path } = navMeshQuery.computePath(startPos, endPos, { filter: navMeshQuery.defaultFilter });

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
