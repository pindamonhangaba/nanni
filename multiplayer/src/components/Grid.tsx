import { ShaderMaterial, PlaneGeometry, Mesh, Vector3, Texture } from "three";
import * as THREE from "three";
import {
  useGLTF,
  Decal,
  RenderTexture,
  PerspectiveCamera,
  MotionPathControls,
  useTexture,
  PivotControls,
  useMotion,
} from "@react-three/drei";
import { useRef, useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";

// Vertex Shader
const vertexShader = `
varying vec3 vUv; 
void main() {
  vUv = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}`;

// Fragment Shader with Color
const fragmentShader = `
varying vec3 vUv;
uniform vec3 gridColor;
uniform vec3 backgroundColor;
void main() {
  vec2 gridUV = vUv.xz * 100.0; // Scale grid size
  vec2 grid = abs(fract(gridUV - 0.5) - 0.5) / fwidth(gridUV);
  float line = min(grid.x, grid.y);
  vec3 color = mix(backgroundColor, gridColor, smoothstep(0.0, 0.02, line));
  gl_FragColor = vec4(color, 1.0);
}`;

// ShaderMaterial Component
const GridMaterial = () => {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      gridColor: { value: new THREE.Color(0x000000) }, // Red grid lines
      backgroundColor: { value: new THREE.Color(0xffffff) }, // Black background
      time: { value: 0 },
    },
  });
};

interface Position2D {
  x: number;
  y: number;
}

interface Position3D extends Position2D {
  z: number;
}

interface PlayerPosition {
  movePath: Position2D[];
  placement: Position2D;
}

interface GridDimensions {
  width: number;
  height: number;
  cellSize: number;
}

export interface GridProps {
  player?: ReactNode;
  targetPosition?: Position3D;
  playerPosition?: PlayerPosition;
  dimensions: GridDimensions;
  onClick?: (position: Position2D) => void;
  onContextMenu?: (position: Position2D) => void;
  onDoubleClick?: (position: Position2D) => void;
}

export function Grid({
  player,
  targetPosition = { x: 0, y: 0, z: 0 },
  playerPosition,
  dimensions: { width, height, cellSize },
  onClick,
  onContextMenu,
  onDoubleClick,
}: GridProps) {
  const material = GridMaterial();
  const ref = useRef<THREE.Mesh>(null);
  const refHover = useRef<THREE.Vector3 | undefined>(undefined);
  const motionRef = useRef<THREE.Group>(null);
  const focusRef = useRef<THREE.Group>(null);
  const { movePath = [], placement = { x: 0, y: 0 } } = playerPosition ?? {
    movePath: [
      { x: 5, y: 3 },
      { x: 6, y: 4 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 7, y: 6 },
    ],
    placement: { x: 7, y: 7 },
  };

  useFrame(() => {
    if (motionRef.current && ref.current) {
      const p = cellToPoint(ref.current.position, cellSize, width, height);
      const look =
        movePath[
          Math.max(
            movePath.findIndex((v) => p.x === v.x && p.y === v.y),
            0
          )
        ] ?? targetPosition;
      const target = new Vector3(look.x, 0, look.y);
      motionRef.current.lookAt(target);
    }
  });

  useFrame(() => {
    if (refHover.current) {
      if (ref.current) {
        ref.current.visible = true;
      }
      // const snappedX = Math.floor(refHover.current.x / cellSize) * cellSize + cellSize / 2
      // const snappedY = Math.floor(refHover.current.y / cellSize) * cellSize + cellSize / 2

      // ref.current.position.x = Math.max(snappedX, 0 - (width / 2) * cellSize)
      // ref.current.position.y = Math.max(snappedY, 0 - (height / 2) * cellSize)
      const { x, y } = pointToCell(refHover.current, cellSize, width, height);
      if (ref.current) {
        ref.current.position.x = x;
        ref.current.position.y = y;
      }
    } else {
      if (ref.current) {
        ref.current.visible = false;
      }
    }
  });

  const curve = useMemo(() => {
    if (movePath.length === 0) return undefined;
    return new THREE.CatmullRomCurve3(
      movePath.map(
        (p) =>
          new THREE.Vector3(
            p.x * cellSize - (width / 2) * cellSize - cellSize / 2,
            0,
            p.y * cellSize - (height / 2) * cellSize - cellSize / 2
          )
      ),
      false,
      "centripetal"
    );
  }, [movePath, cellSize, width, height]);

  const decalTexture = useTexture("/react.png") as Texture;
  return (
    <group>
      <axesHelper args={[5]} />
      <PivotControls
        offset={[0, 0, 1]}
        activeAxes={[true, true, true]}
        disableRotations
        depthTest={false}
      >
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            if (e.object?.uuid !== ref.current?.uuid) {
              refHover.current = e.object.worldToLocal(e.point);
            }
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.object?.uuid !== ref.current?.uuid) {
              const wrldPoint = e.object.worldToLocal(e.point);
              const { x, y } = pointToCell(wrldPoint, cellSize, width, height);
              onClick?.({ x, y });
            }
          }}
          onContextMenu={(e: ThreeEvent<MouseEvent>) => {
            if (e.object?.uuid !== ref.current?.uuid) {
              const wrldPoint = e.object.worldToLocal(e.point);
              const { x, y } = pointToCell(wrldPoint, cellSize, width, height);
              onContextMenu?.({ x, y });
            }
          }}
          onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.object?.uuid !== ref.current?.uuid) {
              const wrldPoint = e.object.worldToLocal(e.point);
              const { x, y } = pointToCell(wrldPoint, cellSize, width, height);
              onDoubleClick?.({ x, y });
            }
          }}
          onPointerOut={() => (refHover.current = undefined)}
          onPointerCancel={() => (refHover.current = undefined)}
          onPointerLeave={() => (refHover.current = undefined)}
        >
          <planeGeometry args={[width * cellSize, height * cellSize]} />
          <Decal
            visible={true}
            ref={ref}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[3, 3, 3]}
          >
            <meshStandardMaterial
              roughness={1}
              transparent
              polygonOffset
              polygonOffsetFactor={-1}
            >
              <RenderTexture attach="map">
                <PerspectiveCamera
                  makeDefault
                  manual
                  aspect={1}
                  fov={1}
                  position={[0, 0, 5]}
                />
                <color attach="background" args={["blue"]} />
                <ambientLight intensity={Math.PI} />
                <directionalLight position={[2, 0, 0]} />
                <Shape color="hotpink" position={[0, 0, 0]}>
                  <planeGeometry args={[cellSize, cellSize]} />
                </Shape>
              </RenderTexture>
            </meshStandardMaterial>
          </Decal>
          {[...movePath, placement].map((p) => {
            return (
              <Decal
                key={p.x + "-" + p.y}
                position={[
                  p.x * cellSize - (width / 2) * cellSize - cellSize / 2,
                  p.y * cellSize - (height / 2) * cellSize - cellSize / 2,
                  0,
                ]}
                rotation={[-Math.PI / 2, 0, 0.1]}
                scale={[3, 3, 3]}
              >
                <meshStandardMaterial
                  map={decalTexture}
                  transparent={true}
                  color="white"
                  polygonOffset
                  polygonOffsetFactor={-1}
                />
              </Decal>
            );
          })}
        </mesh>
      </PivotControls>
      <gridHelper
        args={[width * cellSize, width, "white", "gray"]} // Arguments: size, divisions, colorCenterLine, colorGrid
      />
      {/* <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width * cellSize, height * cellSize]} />
        <primitive object={material} attach="material" />
      </mesh> */}
      <group ref={motionRef}>{player}</group>
      <group ref={focusRef}></group>
      {curve && (
        <MotionPathControls
          //focus={focusRef}
          object={motionRef as any}
          debug={true}
          damping={0.2}
          focusDamping={0.15}
          // @ts-ignore
          path={curve}
        >
          <Loop factor={0.5} />
        </MotionPathControls>
      )}
      <CameraRig target={motionRef} />
    </group>
  );
}

function Loop({ factor = 0.1 }: { factor?: number }) {
  const motion = useMotion();
  useFrame((state, delta) => {
    return (motion.current += Math.min(0.1, delta) * factor);
  });
  return null;
}

function Once({ factor = 0.1 }: { factor?: number }) {
  const motion = useMotion();
  useFrame((state, delta) => {
    if (motion.current >= 1) {
      return;
    }
    return (motion.current += Math.min(0.1, delta) * factor);
  });
  return null;
}

function Bun(props: ThreeElements["mesh"]) {
  const textRef = useRef<THREE.Mesh>(null);
  const { nodes } = useGLTF("/Box.glb") as any;
  //useFrame((state) => (textRef.current.position.x = Math.sin(state.clock.elapsedTime) * 5.5))
  console.log("!!!", nodes);
  return (
    <mesh
      castShadow
      receiveShadow
      geometry={nodes.Mesh.geometry}
      {...props}
      dispose={null}
    >
      <meshStandardMaterial color="green" />
      <Sticker
        url="/three.png"
        position={[1, 1, 1]}
        rotation={Math.PI * 1}
        scale={0.45}
      />

      <Decal
        position={[0, 1, 1]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, 1, 1]}
      >
        <meshStandardMaterial
          roughness={1}
          transparent
          polygonOffset
          polygonOffsetFactor={-1}
        >
          <RenderTexture attach="map">
            <PerspectiveCamera
              makeDefault
              manual
              aspect={0.9 / 0.25}
              position={[0, 0, 5]}
            />
            <color attach="background" args={["#af2040"]} />
            <ambientLight intensity={Math.PI} />
            <directionalLight position={[10, 10, 5]} />
            <Shape color="hotpink" position={[-2, 0, 0]}>
              <planeGeometry args={[100, 100]} />
            </Shape>
          </RenderTexture>
        </meshStandardMaterial>
      </Decal>
    </mesh>
  );
}

function Shape({
  children,
  color,
  ...props
}: ThreeElements["mesh"] & { color: string }) {
  const [hovered, hover] = useState(true);
  return (
    <mesh
      {...props}
      onPointerOver={() => hover(false)}
      onPointerOut={() => hover(true)}
    >
      {children}
      {/* In order to get selective bloom we must crank colors out of
        their 0-1 spectrum. We push them way out of range. What previously was [1, 1, 1] now could
        for instance be [10, 10, 10]. */}
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={!hovered ? 4 : 0}
      />
    </mesh>
  );
}

function Sticker({ url, ...props }: { url: string; [key: string]: any }) {
  const emoji = useTexture(url) as Texture;
  return (
    <Decal /*debug*/ {...props}>
      <meshPhysicalMaterial
        transparent
        polygonOffset
        polygonOffsetFactor={-10}
        map={emoji}
        map-flipY={false}
        map-anisotropy={16}
        iridescence={1}
        iridescenceIOR={1}
        iridescenceThicknessRange={[0, 1400]}
        roughness={1}
        clearcoat={0.5}
        metalness={0.75}
        toneMapped={false}
      />
    </Decal>
  );
}

function pointToCell(
  point: { x: number; y: number },
  cellSize: number,
  width: number,
  height: number
): Position2D {
  const snappedX = Math.floor(point.x / cellSize) * cellSize + cellSize / 2;
  const snappedY = Math.floor(point.y / cellSize) * cellSize + cellSize / 2;

  const x = Math.max(snappedX, 0 - (width / 2) * cellSize);
  const y = Math.max(snappedY, 0 - (height / 2) * cellSize);
  return { x, y };
}

function cellToPoint(
  cell: { x: number; y: number },
  cellSize: number,
  width: number,
  height: number
): Position3D {
  const halfWidth = (width * cellSize) / 2;
  const halfHeight = (height * cellSize) / 2;

  const x = cell.x * cellSize - halfWidth + cellSize / 2;
  const y = cell.y * cellSize - halfHeight + cellSize / 2;

  return { x, y, z: 0 };
}

function CameraRig({ target }: { target: any }) {
  const { camera, controls } = useThree();
  const vec = new THREE.Vector3();

  useFrame((state, delta) => {
    if (!target.current) return;

    // Get precise world position of the player
    target.current.getWorldPosition(vec);

    // Camera offset: Fixed height and distance (Isometric-ish)
    // Adjust these values to get the desired MOBA look
    // Higher Y is simpler for overview
    const height = 40;
    const distance = 60;

    // We want to maintain this offset relative to the player
    const targetPosition = vec.clone();

    // We maintain the CURRENT direction/offset if we want rotation allowed,
    // OR we force a specific offset if we want LOCKED rotation.
    // User asked for "locked perspective camera like a moba".
    // This usually implies fixed rotation.

    const cameraTargetPosition = new THREE.Vector3(
      targetPosition.x - distance,
      targetPosition.y + height,
      targetPosition.z + distance
    );

    // Smooth follow
    state.camera.position.lerp(cameraTargetPosition, delta * 4);

    // If using OrbitControls, update its target to circle the player
    if (controls) {
      // @ts-ignore
      controls.target.lerp(targetPosition, delta * 4);
      // @ts-ignore
      controls.update();
    } else {
      state.camera.lookAt(targetPosition);
    }
  });

  return null;
}
