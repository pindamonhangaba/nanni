import {
  forwardRef,
  useMemo,
  useRef,
  useImperativeHandle as useReactImperativeHandle,
  useEffect,
} from "react";
import type { ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateCityGeometry } from "@/utils/generateCity";
import { createProceduralGroundShape } from "@/lib/createProceduralGroundShape";
import { useRecastNavMesh } from "@/hooks/useRecastNavMesh";
import { useThree } from "@react-three/fiber";
import { NavMeshProvider, useNavMesh } from "@/context/NavMeshContext";

export type NavigationGridProps = ThreeElements["group"] & {
  width?: number;
  height?: number;
  cellSize?: number;
  onClick?: (event: any) => void;
  showNavMesh?: boolean;
  children?: React.ReactNode;
  visualGeometry?: THREE.BufferGeometry;
};

const NavigationGridInner = forwardRef<THREE.Mesh, NavigationGridProps>(
  ({ width = 10, height = 10, cellSize = 3, onClick, showNavMesh = false, children, visualGeometry: passedVisualGeometry, ...props }, ref) => {
    const innerRef = useRef<THREE.Mesh>(null);
    const { scene } = useThree();
    const { navMesh, isGenerating, offMeshConnections } = useNavMesh();

    useReactImperativeHandle(ref, () => innerRef.current!, []);

    // Debug visualization of off-mesh connections
    useEffect(() => {
      if (!showNavMesh || !offMeshConnections || offMeshConnections.length === 0) return;

      console.log('[NavigationGrid] Rendering', offMeshConnections.length, 'off-mesh connection debug lines');

      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xff00ff, // Magenta for visibility
        linewidth: 3,
      });

      const connectionLines: THREE.Line[] = [];

      offMeshConnections.forEach((conn, index) => {
        const points = [
          new THREE.Vector3(conn.startPosition.x, conn.startPosition.y, conn.startPosition.z),
          new THREE.Vector3(conn.endPosition.x, conn.endPosition.y, conn.endPosition.z),
        ];
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        line.name = `OffMeshConnection_${index}`;
        scene.add(line);
        connectionLines.push(line);

        // Add spheres at connection points
        const sphereGeometry = new THREE.SphereGeometry(0.3, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
        
        const startSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        startSphere.position.set(conn.startPosition.x, conn.startPosition.y, conn.startPosition.z);
        scene.add(startSphere);
        connectionLines.push(startSphere as any);

        const endSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        endSphere.position.set(conn.endPosition.x, conn.endPosition.y, conn.endPosition.z);
        scene.add(endSphere);
        connectionLines.push(endSphere as any);
      });

      return () => {
        connectionLines.forEach(line => {
          scene.remove(line);
          line.geometry?.dispose();
          (line.material as THREE.Material)?.dispose();
        });
      };
    }, [offMeshConnections, showNavMesh, scene]);

    // Debug visualization of navmesh
    useEffect(() => {
      if (!showNavMesh || !navMesh) return;

      // Import the core library to get navmesh debug data
      import('recast-navigation').then(({ getNavMeshPositionsAndIndices }) => {
        // Get the raw vertex data from the navmesh
        const [positions, indices] = getNavMeshPositionsAndIndices(navMesh);
        
        const navMeshGeometry = new THREE.BufferGeometry();
        navMeshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        navMeshGeometry.setIndex(Array.from(indices));
        navMeshGeometry.computeVertexNormals();

        const navMeshMaterial = new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          wireframe: true,
          transparent: true,
          opacity: 0.3,
        });

        const navMeshDebug = new THREE.Mesh(navMeshGeometry, navMeshMaterial);
        navMeshDebug.name = 'NavMeshDebug';
        navMeshDebug.position.y = 0.1; // Lift slightly to prevent z-fighting
        scene.add(navMeshDebug);

        return () => {
          scene.remove(navMeshDebug);
          navMeshGeometry.dispose();
          navMeshMaterial.dispose();
        };
      });
    }, [navMesh, showNavMesh, scene]);

    // Log navmesh status
    useEffect(() => {
      if (isGenerating) {
        console.log('[NavigationGrid] Generating NavMesh...');
      } else if (navMesh) {
        console.log('[NavigationGrid] NavMesh ready!', navMesh);
      }
    }, [isGenerating, navMesh]);

    return (
      <group {...props}>
        {/* Procedural City Mesh - Visual Only */}
        <mesh
          ref={innerRef}
          geometry={passedVisualGeometry}
          position={[0, 0, 0]}
          receiveShadow
          castShadow
          onClick={(e) => {
            // Strict Click Filter:
            // If it's a vertical wall (normal.y <= 0.5), STOP propagation.
            if (e.face && e.face.normal.y <= 0.5) {
              e.stopPropagation();
            } else if (onClick) {
              onClick(e);
            }
          }}
        >
          <meshStandardMaterial color="#888888" flatShading />
        </mesh>

        {/* Helper grid */}
        <gridHelper
          args={[width * cellSize, width, "white", "#404040"]}
          position={[0, 0.01, 0]}
        />

        {children}
      </group>
    );
  }
);

export const NavigationGrid = forwardRef<THREE.Mesh, NavigationGridProps>(
  (props, ref) => {
    const innerRef = useRef<THREE.Mesh>(null);
    const { scene } = useThree();

    // Generate combined geometry: procedural ground + buildings
    const { visualGeometry, navGeometry, offMeshConnections: cityOffMeshConnections } = useMemo(() => {
      const w = (props.width ?? 10) * (props.cellSize ?? 3);
      const h = (props.height ?? 10) * (props.cellSize ?? 3);
      
      console.log('[NavigationGrid] Generating procedural ground + buildings, dimensions:', w, 'x', h);

      // 1. Generate city with buildings FIRST (so we can cut holes in floor)
      const cityResult = generateCityGeometry(w, h, 15, true);
      
      // 2. Generate procedural rectilinear polygon for floor
      const { shape, curveSegments } = createProceduralGroundShape({
        seed: 'multiplayer-ground',
        minArea: w * h * 0.6,
        maxArea: w * h * 0.9,
        pad: 4,
        radius: 3,
        roundConcave: false,
        cellSize: 1,
      });

      // Calculate shape center to align with world coordinates
      const points = shape.getPoints();
      const min = new THREE.Vector2(Infinity, Infinity);
      const max = new THREE.Vector2(-Infinity, -Infinity);
      points.forEach(p => {
        min.min(p);
        max.max(p);
      });
      const shapeCenter = new THREE.Vector2().addVectors(min, max).multiplyScalar(0.5);
      
      // Create Visual Geometry (Clean floor)
      const floorGeometry = new THREE.ShapeGeometry(shape, curveSegments);
      floorGeometry.rotateX(-Math.PI / 2);
      floorGeometry.translate(-shapeCenter.x, 0, shapeCenter.y);

      console.log('[NavigationGrid] Generated rectilinear floor + ', cityResult.buildings.length, 'buildings');
      console.log('[NavigationGrid] Generated', cityResult.offMeshConnections.length, 'rooftop connections');
      
      // 3. Merge procedural floor with buildings
      
      // Helper to prepare geometry for merging
      const prepareForMerge = (geo: THREE.BufferGeometry) => {
        let bufferGeo = geo instanceof THREE.BufferGeometry ? geo : new THREE.BufferGeometry().copy(geo);
        if (bufferGeo.index) {
          bufferGeo = bufferGeo.toNonIndexed();
        }
        return bufferGeo;
      };

      const floorBufferGeometry = prepareForMerge(floorGeometry);
      
      // Merge for Visuals AND NavMesh (Same geometry now)
      const geometriesToMerge = [floorBufferGeometry];
      if (cityResult.visualGeometry && cityResult.visualGeometry.getAttribute('position')) {
        geometriesToMerge.push(cityResult.visualGeometry);
      }
      const combinedGeometry = mergeGeometries(geometriesToMerge, false);

      return {
        visualGeometry: combinedGeometry, // Clean floor + buildings
        navGeometry: combinedGeometry, // Same geometry for navmesh (Recast will handle obstacles)
        offMeshConnections: cityResult.offMeshConnections
      };
    }, [props.width, props.height, props.cellSize]);

    // Generate navmesh from the navGeometry with off-mesh connections
    const { navMesh, isGenerating, offMeshConnections } = useRecastNavMesh(navGeometry, cityOffMeshConnections);

    return (
      <NavMeshProvider navMesh={navMesh} isGenerating={isGenerating} offMeshConnections={offMeshConnections}>
        <NavigationGridInner {...props} visualGeometry={visualGeometry} ref={ref} />
      </NavMeshProvider>
    );
  }
);