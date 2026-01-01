import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Maximum distance for rooftop-to-rooftop off-mesh connections
const MAX_ROOFTOP_JUMP_DISTANCE = 8;

export enum OffMeshConnectionType {
  Teleport = 'teleport',
  Ladder = 'ladder',
  Jump = 'jump'
}

interface OffMeshConnection {
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  radius: number;
  bidirectional: boolean;
  userId: number;
  type: OffMeshConnectionType;
}

export function generateCityGeometry(
  width: number,
  height: number,
  buildingCount: number = 10,
  skipFloor: boolean = false
): { 
  visualGeometry: THREE.BufferGeometry; 
  navGeometry: THREE.BufferGeometry; 
  buildings: any[];
  offMeshConnections: OffMeshConnection[];
} {

  const visualGeometries: THREE.BufferGeometry[] = [];
  const buildings: any[] = [];

  const tileSize = 2; 
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);
  
  // Coarse grid for building placement
  const grid = new Array(cols * rows).fill(false);
  const rng = () => Math.random();

  // 1. Generate Buildings & Mark Coarse Grid
  for (let i = 0; i < buildingCount; i++) {
    const buildingW = Math.floor(2 + rng() * 4) * tileSize; 
    const buildingL = Math.floor(2 + rng() * 4) * tileSize;
    const buildingH = 5 + rng() * 15;

    const gridW = Math.ceil(buildingW / tileSize);
    const gridL = Math.ceil(buildingL / tileSize);
    
    // Placement Logic
    let gridX = 0, gridY = 0, attempts = 0, valid = false;
    const centerX = Math.floor(cols / 2);
    const centerY = Math.floor(rows / 2);
    const safeRadius = 3;

    while (!valid && attempts < 50) {
        gridX = Math.floor(rng() * (cols - gridW));
        gridY = Math.floor(rng() * (rows - gridL));
        
        let collision = false;
        const overlapsCenter = 
            (gridX < centerX + safeRadius && gridX + gridW > centerX - safeRadius) &&
            (gridY < centerY + safeRadius && gridY + gridL > centerY - safeRadius);
            
        if (overlapsCenter) collision = true;
        else {
            for (let x = gridX; x < gridX + gridW; x++) {
                for (let y = gridY; y < gridY + gridL; y++) {
                    if (grid[y * cols + x]) { collision = true; break; }
                }
                if (collision) break;
            }
        }
        if (!collision) valid = true;
        attempts++;
    }
    
    if (!valid) continue;

    // Mark Coarse Grid
    for (let x = gridX; x < gridX + gridW; x++) {
      for (let y = gridY; y < gridY + gridL; y++) {
          grid[y * cols + x] = true;
      }
    }
    
    const worldX = (gridX * tileSize) - (width / 2) + (buildingW / 2);
    const worldZ = (gridY * tileSize) - (height / 2) + (buildingL / 2);
    
    const boxGeo = new THREE.BoxGeometry(buildingW, buildingH, buildingL);
    boxGeo.translate(worldX, buildingH / 2, worldZ); 
    visualGeometries.push(boxGeo);

    buildings.push({
        position: new THREE.Vector3(worldX, buildingH / 2, worldZ),
        width: buildingW,
        height: buildingH,
        depth: buildingL,
        boundingRadius: Math.max(buildingW, buildingL) / 2
    });
  }

  // 2. Build High-Res Voxel Grid for NavMesh
  // Resolution: 0.5 units (Matches Agent Radius)
  const navRes = 0.5;
  const navCols = Math.ceil(width / navRes);
  const navRows = Math.ceil(height / navRes);
  const navGrid = new Array(navCols * navRows).fill(false); // false = WALKABLE, true = BLOCKED

  // Function to map World -> NavGrid
  const worldToNav = (wx: number, wz: number) => {
      const nx = Math.floor((wx + width/2) / navRes);
      const nz = Math.floor((wz + height/2) / navRes);
      return { x: nx, z: nz };
  };

  // Mark Buildings on NavGrid
  // iterate buildings
  buildings.forEach(b => {
      // Building bounds in World
      const minX = b.position.x - b.width/2;
      const maxX = b.position.x + b.width/2;
      const minZ = b.position.z - b.depth/2;
      const maxZ = b.position.z + b.depth/2;

      const pMin = worldToNav(minX, minZ);
      const pMax = worldToNav(maxX, maxZ);

      // We erode by expanding the blocked area by 1 unit (approx 1-2 cells)
      // Agent radius 0.5. Grid is 0.5. Expanding by 1 cell = 0.5 margin.
      const margin = 1; 

      for (let x = pMin.x - margin; x < pMax.x + margin; x++) {
          for (let z = pMin.z - margin; z < pMax.z + margin; z++) {
              if (x >= 0 && x < navCols && z >= 0 && z < navRows) {
                  navGrid[z * navCols + x] = true; // BLOCKED
              }
          }
      }
  });

  console.log(`[generateCity] NavGrid: ${navCols}x${navRows}, Resolution: ${navRes}`);

  // 3. Construct NavMesh Geometry from Voxel Grid (Ground Level)
  // We create a single mesh for all WALKABLE cells.
  const navVertices: number[] = [];
  const navIndices: number[] = [];
  let vertOffset = 0;

  // Ground level navigation
  for (let z = 0; z < navRows; z++) {
      for (let x = 0; x < navCols; x++) {
          if (!navGrid[z * navCols + x]) {
              // WALKABLE
              // Center of cell
              const wx = (x * navRes) - (width/2) + (navRes/2);
              const wz = (z * navRes) - (height/2) + (navRes/2);
              const h = navRes / 2;

              // 4 Vertices (Y=0 for ground level)
              // TL, TR, BL, BR
              navVertices.push(wx - h, 0, wz - h); // TL
              navVertices.push(wx + h, 0, wz - h); // TR
              navVertices.push(wx - h, 0, wz + h); // BL
              navVertices.push(wx + h, 0, wz + h); // BR

              // Indices (0, 2, 1, 2, 3, 1)
              navIndices.push(vertOffset, vertOffset + 2, vertOffset + 1);
              navIndices.push(vertOffset + 2, vertOffset + 3, vertOffset + 1);

              vertOffset += 4;
          }
      }
  }

  // 3b. Add Rooftop Navigation Surfaces
  // Create walkable planes on top of each building
  let roofNavCellCount = 0;
  buildings.forEach((b, idx) => {
      const roofY = b.height; // Top of building
      const roofW = b.width;
      const roofD = b.depth;
      
      // Add margin for safety (agent shouldn't walk too close to edge)
      const edgeMargin = 0.5;
      const walkableW = Math.max(0, roofW - edgeMargin * 2);
      const walkableD = Math.max(0, roofD - edgeMargin * 2);
      
      // Only add rooftop nav if there's enough space
      if (walkableW > navRes && walkableD > navRes) {
          // Create grid of nav cells on rooftop
          const roofCols = Math.floor(walkableW / navRes);
          const roofRows = Math.floor(walkableD / navRes);
          
          const startX = b.position.x - (roofCols * navRes) / 2;
          const startZ = b.position.z - (roofRows * navRes) / 2;
          
          let cellsAdded = 0;
          for (let rz = 0; rz < roofRows; rz++) {
              for (let rx = 0; rx < roofCols; rx++) {
                  const wx = startX + (rx * navRes) + (navRes / 2);
                  const wz = startZ + (rz * navRes) + (navRes / 2);
                  const h = navRes / 2;
                  
                  // 4 Vertices at rooftop height
                  navVertices.push(wx - h, roofY, wz - h); // TL
                  navVertices.push(wx + h, roofY, wz - h); // TR
                  navVertices.push(wx - h, roofY, wz + h); // BL
                  navVertices.push(wx + h, roofY, wz + h); // BR
                  
                  // Indices
                  navIndices.push(vertOffset, vertOffset + 2, vertOffset + 1);
                  navIndices.push(vertOffset + 2, vertOffset + 3, vertOffset + 1);
                  
                  vertOffset += 4;
                  cellsAdded++;
              }
          }
          roofNavCellCount += cellsAdded;
          console.log(`[generateCity] Building ${idx}: Added ${cellsAdded} rooftop nav cells at Y=${roofY.toFixed(2)}`);
      } else {
          console.log(`[generateCity] Building ${idx}: Rooftop too small for nav (${walkableW.toFixed(2)}x${walkableD.toFixed(2)})`);
      }
  });
  
  console.log(`[generateCity] Total rooftop nav cells: ${roofNavCellCount}`);

  const navGeometry = new THREE.BufferGeometry();
  navGeometry.setAttribute('position', new THREE.Float32BufferAttribute(navVertices, 3));
  navGeometry.setIndex(navIndices);


  // 4. Construct Visual Floor (Coarse Grid)
  // We keep this separate so it looks nice (big tiles)
  if (!skipFloor) {
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        if (!grid[y * cols + x]) {
            const floorGeo = new THREE.PlaneGeometry(tileSize, tileSize);
            floorGeo.rotateX(-Math.PI / 2);
            floorGeo.translate(
              (x * tileSize) - (width / 2) + (tileSize / 2),
              0,
              (y * tileSize) - (height / 2) + (tileSize / 2)
            );
            visualGeometries.push(floorGeo);
        }
      }
    }
  }

  // Ensure all visual geometries are non-indexed before merging
  const nonIndexedVisualGeometries = visualGeometries.map(geo => {
      return geo.index ? geo.toNonIndexed() : geo;
  });
  const visualGeometry = nonIndexedVisualGeometries.length > 0 
      ? mergeGeometries(nonIndexedVisualGeometries, false) 
      : new THREE.BufferGeometry();
  
  // 5. Generate Off-Mesh Connections Between Nearby Rooftops
  const offMeshConnections: OffMeshConnection[] = [];
  
  // 5a. First, create ground-to-rooftop connections (access ladders/teleporters)
  // Create 4 connections per building (one on each side) for better accessibility
  buildings.forEach((building, index) => {
    const halfW = building.width / 2;
    const halfD = building.depth / 2;
    const margin = 2.0; // Distance from building edge where ladder starts (center of adjacent tile)
    
    // Use exact navmesh surface heights
    const groundY = 0;
    const roofY = building.height;
    
    // North side
    offMeshConnections.push({
      startPosition: {
        x: building.position.x,
        y: groundY,
        z: building.position.z - halfD - margin
      },
      endPosition: {
        x: building.position.x,
        y: roofY,
        z: building.position.z - halfD + 1.0 // Move inward by 1.0
      },
      radius: 1.5, // Increased radius slightly
      bidirectional: true,
      userId: offMeshConnections.length,
      type: OffMeshConnectionType.Ladder
    });
    
    // South side
    offMeshConnections.push({
      startPosition: {
        x: building.position.x,
        y: groundY,
        z: building.position.z + halfD + margin
      },
      endPosition: {
        x: building.position.x,
        y: roofY,
        z: building.position.z + halfD - 1.0 // Move inward by 1.0
      },
      radius: 1.5,
      bidirectional: true,
      userId: offMeshConnections.length,
      type: OffMeshConnectionType.Ladder
    });
    
    // East side
    offMeshConnections.push({
      startPosition: {
        x: building.position.x + halfW + margin,
        y: groundY,
        z: building.position.z
      },
      endPosition: {
        x: building.position.x + halfW - 1.0, // Move inward by 1.0
        y: roofY,
        z: building.position.z
      },
      radius: 1.5,
      bidirectional: true,
      userId: offMeshConnections.length,
      type: OffMeshConnectionType.Ladder
    });
    
    // West side
    offMeshConnections.push({
      startPosition: {
        x: building.position.x - halfW - margin,
        y: groundY,
        z: building.position.z
      },
      endPosition: {
        x: building.position.x - halfW + 1.0, // Move inward by 1.0
        y: roofY,
        z: building.position.z
      },
      radius: 1.5,
      bidirectional: true,
      userId: offMeshConnections.length,
      type: OffMeshConnectionType.Ladder
    });
  });
  
  console.log('[generateCity] Added', offMeshConnections.length, 'ground-to-rooftop connections (4 per building)');
  
  // 5b. Create rooftop-to-rooftop connections for nearby buildings
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const buildingA = buildings[i];
      const buildingB = buildings[j];
      
      // Calculate horizontal distance between building centers
      const dx = buildingB.position.x - buildingA.position.x;
      const dz = buildingB.position.z - buildingA.position.z;
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
      
      // Check if buildings are within jump distance
      if (horizontalDistance <= MAX_ROOFTOP_JUMP_DISTANCE) {
        // Also check height difference isn't too extreme
        const heightDiff = Math.abs(buildingB.height - buildingA.height);
        
        // Only allow jumps if height difference is reasonable (within 5 units)
        if (heightDiff <= 5) {
          // Create connection from A to B
          offMeshConnections.push({
            startPosition: {
              x: buildingA.position.x,
              y: buildingA.height,
              z: buildingA.position.z
            },
            endPosition: {
              x: buildingB.position.x,
              y: buildingB.height,
              z: buildingB.position.z
            },
            radius: 0.5, // Agent radius
            bidirectional: true,
            userId: offMeshConnections.length,
            type: OffMeshConnectionType.Jump
          });
        }
      }
    }
  }
  
  console.log('[generateCity] navGeometry verts:', navVertices.length / 3);
  console.log('[generateCity] Total offMeshConnections:', offMeshConnections.length, '(ground-to-roof + roof-to-roof)');

  return { visualGeometry, navGeometry, buildings, offMeshConnections };
}
