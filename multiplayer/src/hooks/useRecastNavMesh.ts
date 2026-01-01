import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { init, NavMeshQuery } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';

let recastInitialized = false;

interface OffMeshConnection {
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  radius: number;
  bidirectional: boolean;
  userId?: number;
}

export function useRecastNavMesh(
  geometry: THREE.BufferGeometry | null,
  providedOffMeshConnections?: OffMeshConnection[]
) {
  const [navMesh, setNavMesh] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [offMeshConnections, setOffMeshConnections] = useState<any[]>([]);

  useEffect(() => {
    if (!geometry) return;

    const generateNavMesh = async () => {
      setIsGenerating(true);

      try {
        // Initialize recast if not already done
        if (!recastInitialized) {
          await init();
          recastInitialized = true;
        }

        // Use the full geometry (including walls) for Recast
        // Recast needs the walls to define obstacles
        // We rely on walkableSlopeAngle to prevent walking on walls
        const geometryToUse = geometry;

        console.log('[useRecastNavMesh] Geometry has', 
          geometryToUse.attributes.position.count, 'vertices');

        // Extract positions and indices from geometry for recast
        const positions = geometryToUse.attributes.position.array as Float32Array;
        
        // Handle non-indexed geometry
        let indices: Uint32Array | Uint16Array | number[];
        if (geometryToUse.index) {
          indices = geometryToUse.index.array as Uint32Array | Uint16Array;
        } else {
          // Generate indices for non-indexed geometry (0, 1, 2, 3, 4, 5...)
          const vertexCount = geometryToUse.attributes.position.count;
          indices = new Uint32Array(vertexCount);
          for (let i = 0; i < vertexCount; i++) {
            indices[i] = i;
          }
        }

        console.log('[useRecastNavMesh] Positions array length:', positions.length);
        console.log('[useRecastNavMesh] Indices array length:', indices.length);

        const navMeshConfig = {
          cs: 0.5,
          ch: 0.2,
          walkableRadius: 1, // 0.5m / 0.5cs = 1 voxel
          walkableHeight: 10, // 2m / 0.2ch = 10 voxels
          walkableClimb: 2, // 0.4m / 0.2ch = 2 voxels
          walkableSlopeAngle: 45,
          borderSize: 0, 
          tileSize: 0, 
        };

        // First: build a temporary navmesh (no off-mesh) to snap endpoints
        console.log('[useRecastNavMesh] Generating temp NavMesh for snapping...');
        const { success: tempSuccess, navMesh: tempNavMesh } = generateSoloNavMesh(
          Array.from(positions),
          Array.from(indices),
          navMeshConfig
        );

        let snappedConnections: typeof providedOffMeshConnections = [];

        const failedConnections: any[] = [];

        if (tempSuccess && tempNavMesh) {
          try {
            const query = new NavMeshQuery(tempNavMesh);
            const extents = { halfExtents: { x: 8, y: 12, z: 8 } }; // more generous to catch roof/ground
            const snapped: any[] = [];
            let ok = 0;

            (providedOffMeshConnections || []).forEach((c, idx) => {
              const startResult = query.findClosestPoint(c.startPosition, extents);
              const endResult = query.findClosestPoint(c.endPosition, extents);

              const startDist = startResult.success
                ? Math.hypot(
                    startResult.point.x - c.startPosition.x,
                    startResult.point.y - c.startPosition.y,
                    startResult.point.z - c.startPosition.z
                  )
                : Infinity;

              const endDist = endResult.success
                ? Math.hypot(
                    endResult.point.x - c.endPosition.x,
                    endResult.point.y - c.endPosition.y,
                    endResult.point.z - c.endPosition.z
                  )
                : Infinity;

              const startOk = startResult.success && startDist < 20;
              const endOk = endResult.success && endDist < 20;

              if (startOk && endOk) {
                ok += 1;
                snapped.push({
                  ...c,
                  startPosition: { x: startResult.point.x, y: startResult.point.y, z: startResult.point.z },
                  endPosition: { x: endResult.point.x, y: endResult.point.y, z: endResult.point.z },
                });
              } else {
                failedConnections.push(c);
                console.warn(
                  `[useRecastNavMesh] Snap failed for connection ${c.userId || idx}: startOk=${startOk} (${startDist.toFixed(2)}m), endOk=${endOk} (${endDist.toFixed(2)}m)`
                );
              }
            });

            console.log(`[useRecastNavMesh] Snap success: ${ok}/${(providedOffMeshConnections || []).length}`);
            snappedConnections = snapped;
            query.destroy();
          } catch (e) {
            console.warn('[useRecastNavMesh] Failed snapping connections:', e);
            snappedConnections = providedOffMeshConnections || [];
          } finally {
            tempNavMesh.destroy();
          }
        } else {
          console.warn('[useRecastNavMesh] Temp NavMesh generation failed, using unsnapped connections');
          snappedConnections = providedOffMeshConnections || [];
          if (tempNavMesh) tempNavMesh.destroy();
        }

        // Merge snapped + failed originals so nothing is dropped
        const mergedConnections = [...snappedConnections, ...failedConnections];

        // Generate NavMesh with snapped connections
        console.log('[useRecastNavMesh] Generating NavMesh...');
        
        const connectionsForRecast = (mergedConnections || []).map(c => ({
            startPosition: [c.startPosition.x, c.startPosition.y, c.startPosition.z] as [number, number, number],
            endPosition: [c.endPosition.x, c.endPosition.y, c.endPosition.z] as [number, number, number],
            radius: 4.0, // generous to ensure overlap
            bidirectional: true,
            area: 0, 
            flags: 1, 
            userId: c.userId
        }));

        if (connectionsForRecast.length > 0) {
            console.log('[useRecastNavMesh] Passing', connectionsForRecast.length, 'connections to Recast');
        }

        const { success, navMesh: generatedNavMesh } = generateSoloNavMesh(
          Array.from(positions),
          Array.from(indices),
          {
            ...navMeshConfig,
            offMeshConnections: connectionsForRecast
          }
        );
        
        console.log('[useRecastNavMesh] generateSoloNavMesh result - success:', success);

        if (success && generatedNavMesh) {
          setNavMesh(generatedNavMesh);
          
          // Update state with connections for movement system
          // We just pass through the provided connections since we aren't modifying them anymore
          // Use merged positions for movement system (preserve type/userId)
          setOffMeshConnections(mergedConnections || []);
          
          // Debug info
          try {
            const tile = generatedNavMesh.getTile(0);
            if (tile) {
                const header = tile.header();
                if (header) {
                    console.log(`[useRecastNavMesh] Generated tile has ${header.offMeshConCount()} off-mesh connections`);
                    console.log(`[useRecastNavMesh] Generated tile has ${header.polyCount()} polygons`);
                    console.log(`[useRecastNavMesh] Generated tile has ${header.vertCount()} vertices`);
                } else {
                    console.warn('[useRecastNavMesh] Failed to get tile header');
                }
            }
          } catch (e) {
             console.warn('[useRecastNavMesh] Failed to inspect tile header:', e);
          }

          // Validate each off-mesh connection against the generated navmesh to see if endpoints snap
          try {
            const query = new NavMeshQuery(generatedNavMesh);
            const extents = { halfExtents: { x: 4, y: 4, z: 4 } };
            let validCount = 0;

            (providedOffMeshConnections || []).forEach((conn, idx) => {
              const start = query.findClosestPoint(conn.startPosition, extents);
              const end = query.findClosestPoint(conn.endPosition, extents);

              const startDist = start.success
                ? Math.sqrt(
                    Math.pow(start.point.x - conn.startPosition.x, 2) +
                    Math.pow(start.point.y - conn.startPosition.y, 2) +
                    Math.pow(start.point.z - conn.startPosition.z, 2)
                  )
                : Infinity;

              const endDist = end.success
                ? Math.sqrt(
                    Math.pow(end.point.x - conn.endPosition.x, 2) +
                    Math.pow(end.point.y - conn.endPosition.y, 2) +
                    Math.pow(end.point.z - conn.endPosition.z, 2)
                  )
                : Infinity;

              const ok = start.success && end.success && startDist < 5 && endDist < 5;
              if (ok) validCount += 1;

              if (!ok) {
                console.warn(
                  `[useRecastNavMesh] Connection ${conn.userId || idx} failed snap: startDist=${startDist.toFixed(2)}, endDist=${endDist.toFixed(2)}, startSuccess=${start.success}, endSuccess=${end.success}`
                );
              }
            });

            console.log(`[useRecastNavMesh] Connection snap validation: ${validCount}/${(providedOffMeshConnections || []).length} within 5m`);
            query.destroy();
          } catch (e) {
            console.warn('[useRecastNavMesh] Failed to validate off-mesh snaps:', e);
          }
        } else {
          console.error('[useRecastNavMesh] Failed to generate NavMesh');
        }
        
        console.log('[useRecastNavMesh] ✓ NavMesh generated successfully');
      } catch (error) {
        console.error('[useRecastNavMesh] Error generating NavMesh:', error);
      } finally {
        setIsGenerating(false);
      }
    };

    generateNavMesh();
  }, [geometry, providedOffMeshConnections]);

  return { navMesh, isGenerating, offMeshConnections };
}

/**
 * Filters a geometry to only include triangles that face upward (walkable surfaces)
 * Returns a new geometry with only upward-facing triangles
 */
function filterUpwardFacingTriangles(
  geometry: THREE.BufferGeometry,
  minNormalY: number = 0.5
): THREE.BufferGeometry | null {
  const positions = geometry.attributes.position;
  const indices = geometry.index;

  if (!positions) return null;

  const filteredPositions: number[] = [];
  const filteredIndices: number[] = [];
  const vertexMap = new Map<string, number>();

  const triangle = new THREE.Triangle();
  const normal = new THREE.Vector3();
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  const getOrAddVertex = (x: number, y: number, z: number): number => {
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    let index = vertexMap.get(key);
    if (index === undefined) {
      index = filteredPositions.length / 3;
      filteredPositions.push(x, y, z);
      vertexMap.set(key, index);
    }
    return index;
  };

  const processTriangle = (i0: number, i1: number, i2: number) => {
    v0.fromBufferAttribute(positions, i0);
    v1.fromBufferAttribute(positions, i1);
    v2.fromBufferAttribute(positions, i2);

    triangle.set(v0, v1, v2);
    triangle.getNormal(normal);

    // Only include triangles facing upward
    if (normal.y >= minNormalY) {
      const idx0 = getOrAddVertex(v0.x, v0.y, v0.z);
      const idx1 = getOrAddVertex(v1.x, v1.y, v1.z);
      const idx2 = getOrAddVertex(v2.x, v2.y, v2.z);

      filteredIndices.push(idx0, idx1, idx2);
    }
  };

  if (indices) {
    // Indexed geometry
    for (let i = 0; i < indices.count; i += 3) {
      processTriangle(
        indices.getX(i),
        indices.getX(i + 1),
        indices.getX(i + 2)
      );
    }
  } else {
    // Non-indexed geometry
    for (let i = 0; i < positions.count; i += 3) {
      processTriangle(i, i + 1, i + 2);
    }
  }

  if (filteredIndices.length === 0) {
    return null;
  }

  const filteredGeometry = new THREE.BufferGeometry();
  filteredGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(filteredPositions, 3)
  );
  filteredGeometry.setIndex(filteredIndices);
  filteredGeometry.computeVertexNormals();

  return filteredGeometry;
}

/**
 * Analyzes geometry to find disconnected regions and creates off-mesh connections
 * between ground level and elevated surfaces (building rooftops)
 */
function generateOffMeshConnections(geometry: THREE.BufferGeometry): any[] {
  console.log('[generateOffMeshConnections] Starting analysis...');
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  if (!positions || !indices) {
    console.warn('[generateOffMeshConnections] No positions or indices found');
    return [];
  }

  console.log('[generateOffMeshConnections] Analyzing', indices.count / 3, 'triangles');

  // Group triangles by height
  const heightLevels = new Map<number, THREE.Vector3[]>();
  
  for (let i = 0; i < indices.count; i += 3) {
    const i0 = indices.getX(i);
    const i1 = indices.getX(i + 1);
    const i2 = indices.getX(i + 2);

    const y0 = positions.getY(i0);
    const y1 = positions.getY(i1);
    const y2 = positions.getY(i2);
    
    const avgY = (y0 + y1 + y2) / 3;
    const heightKey = Math.round(avgY * 10) / 10; // Round to nearest 0.1

    if (!heightLevels.has(heightKey)) {
      heightLevels.set(heightKey, []);
    }

    // Add triangle center point
    const centerX = (positions.getX(i0) + positions.getX(i1) + positions.getX(i2)) / 3;
    const centerZ = (positions.getZ(i0) + positions.getZ(i1) + positions.getZ(i2)) / 3;
    heightLevels.get(heightKey)!.push(new THREE.Vector3(centerX, avgY, centerZ));
  }

  const sortedHeights = Array.from(heightLevels.keys()).sort((a, b) => a - b);
  console.log('[generateOffMeshConnections] Found', sortedHeights.length, 'height levels:', sortedHeights);
  
  const connections: any[] = [];

  if (sortedHeights.length < 2) {
    console.warn('[generateOffMeshConnections] Not enough height levels for connections');
    return [];
  }

  // Ground level is the lowest height
  const groundLevel = sortedHeights[0];
  const groundPoints = heightLevels.get(groundLevel)!;
  console.log('[generateOffMeshConnections] Ground level:', groundLevel, 'with', groundPoints.length, 'points');

  // Create connections from ground to each elevated level
  for (let i = 1; i < sortedHeights.length; i++) {
    const elevatedHeight = sortedHeights[i];
    const elevatedPoints = heightLevels.get(elevatedHeight)!;
    console.log('[generateOffMeshConnections] Processing elevated level', elevatedHeight, 'with', elevatedPoints.length, 'points');

    let connectionsForThisLevel = 0;
    // For each elevated point, find the nearest ground point
    for (const elevatedPoint of elevatedPoints) {
      let nearestGroundPoint: THREE.Vector3 | null = null;
      let minDistance = Infinity;

      for (const groundPoint of groundPoints) {
        const dx = elevatedPoint.x - groundPoint.x;
        const dz = elevatedPoint.z - groundPoint.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < minDistance) {
          minDistance = dist;
          nearestGroundPoint = groundPoint;
        }
      }

      // Only create connection if points are close horizontally (same building area)
      if (nearestGroundPoint && minDistance < 10) {
        const connection = {
          startPosition: { 
            x: nearestGroundPoint.x, 
            y: nearestGroundPoint.y, 
            z: nearestGroundPoint.z 
          },
          endPosition: { 
            x: elevatedPoint.x, 
            y: elevatedPoint.y, 
            z: elevatedPoint.z 
          },
          radius: 1.0, // Larger radius for easier connection
          bidirectional: true,
          area: 0, // Same area as walkable surface
          flags: 0xffff, // All flags enabled to ensure pathfinding uses them
        };
        connections.push(connection);
        connectionsForThisLevel++;
      }
    }
    console.log('[generateOffMeshConnections] Created', connectionsForThisLevel, 'connections for level', elevatedHeight);
  }

  console.log('[generateOffMeshConnections] Total connections created:', connections.length);
  if (connections.length > 0) {
    console.log('[generateOffMeshConnections] First connection:', connections[0]);
    console.log('[generateOffMeshConnections] Last connection:', connections[connections.length - 1]);
  }
  return connections;
}
