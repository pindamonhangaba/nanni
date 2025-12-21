import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { init } from 'recast-navigation';
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

        // Filter geometry to only include upward-facing triangles (floor + building rooftops)
        const filteredGeometry = filterUpwardFacingTriangles(geometry);

        if (!filteredGeometry) {
          console.warn('No upward-facing triangles found');
          setIsGenerating(false);
          return;
        }

        console.log('[useRecastNavMesh] Filtered geometry has', 
          filteredGeometry.attributes.position.count, 'vertices');

        // Use provided off-mesh connections or generate them from geometry
        let connections: any[];
        let originalConnections: any[];
        if (providedOffMeshConnections && providedOffMeshConnections.length > 0) {
          console.log('[useRecastNavMesh] Using', providedOffMeshConnections.length, 'provided off-mesh connections');
          
          // Store original connections with type info for movement system
          originalConnections = providedOffMeshConnections;
          
          // Create recast-compatible connections (without 'type' field)
          connections = providedOffMeshConnections.map((conn, index) => {
            const recastConn = {
              startPosition: conn.startPosition,
              endPosition: conn.endPosition,
              radius: conn.radius,
              bidirectional: conn.bidirectional,
              area: 0, // Same area as walkable surface
              flags: 0xffff, // All flags enabled
              userId: conn.userId ?? index
            };
            console.log('[useRecastNavMesh] Connection', index, ':', conn.type, 'from', conn.startPosition, 'to', conn.endPosition);
            return recastConn;
          });
        } else {
          // Fallback: Detect building heights and create off-mesh connections automatically
          console.log('[useRecastNavMesh] No provided connections, generating from geometry');
          connections = generateOffMeshConnections(filteredGeometry);
          originalConnections = connections;
        }
        
        console.log('[useRecastNavMesh] Generated', connections.length, 'off-mesh connections');
        if (connections.length > 0) {
          console.log('[useRecastNavMesh] Sample connection:', connections[0]);
        }
        // Store original connections (with type info) for movement system
        setOffMeshConnections(originalConnections);

        // Extract positions and indices from geometry for recast
        const positions = filteredGeometry.attributes.position.array as Float32Array;
        const indices = filteredGeometry.index?.array as Uint32Array | Uint16Array;

        console.log('[useRecastNavMesh] Positions array length:', positions.length);
        console.log('[useRecastNavMesh] Indices array length:', indices.length);
        console.log('[useRecastNavMesh] Passing config with', connections.length, 'offMeshConnections');

        // Log first few connections to verify format
        console.log('[useRecastNavMesh] First 3 connections to pass to navmesh:');
        connections.slice(0, 3).forEach((conn, i) => {
          console.log(`  [${i}]:`, JSON.stringify(conn));
        });

        // Generate navmesh using recast-navigation core API
        const { success, navMesh: generatedNavMesh } = generateSoloNavMesh(
          Array.from(positions),
          Array.from(indices),
          {
            cs: 0.5, // cell size - increased for better performance with large connections
            ch: 0.2, // cell height
            walkableRadius: 1, // agent radius - reduced to allow tighter paths
            walkableHeight: 8, // Increased to handle building heights
            walkableClimb: 0.5, // Keep low - off-mesh connections handle vertical movement
            walkableSlopeAngle: 35,
            offMeshConnections: connections, // Add the generated connections
          }
        );
        
        console.log('[useRecastNavMesh] generateSoloNavMesh result - success:', success);

        if (success) {
          console.log('NavMesh generated successfully');
          
          // Verify off-mesh connections are in the navmesh
          import('recast-navigation').then(({ NavMesh: NavMeshClass }) => {
            const navMeshInstance = new NavMeshClass(generatedNavMesh);
            
            // Try to get all tiles and check for off-mesh connections
            let totalOffMeshConnections = 0;
            for (let i = 0; i < navMeshInstance.getMaxTiles(); i++) {
              const tile = navMeshInstance.getTileAt(i);
              if (tile) {
                const header = tile.header;
                if (header && header.offMeshConCount > 0) {
                  totalOffMeshConnections += header.offMeshConCount;
                  console.log('[useRecastNavMesh] Tile', i, 'has', header.offMeshConCount, 'off-mesh connections');
                }
              }
            }
            console.log('[useRecastNavMesh] Total off-mesh connections in navmesh:', totalOffMeshConnections);
          });
          
          setNavMesh(generatedNavMesh);
        } else {
          console.error('Failed to generate NavMesh');
        }
      } catch (error) {
        console.error('Error generating NavMesh:', error);
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
