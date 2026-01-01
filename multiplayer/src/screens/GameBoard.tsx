import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  Stats,
  Bounds,
  Mask,
  PivotControls,
  useMask,
  Float,
  RoundedBox,
  useMotion,
} from "@react-three/drei";

import { BallCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { Unicorn } from "@/components/models/Unicorn";
import { NavigationGrid } from "@/components/NavigationGrid";
import { useNavMesh } from "@/context/NavMeshContext";
import { usePathfinding } from "@/hooks/usePathfinding";
import { useAgentMovementWithOffMesh } from "@/hooks/useAgentMovementWithOffMesh";

interface ResourceCardType {
  id: string;
  category: "resource" | "attribute";
  type: string;
  color: string;
  quantity: number;
  unit: string;
  salePrice: number;
  expiry: number;
  cost?: number;
  effect?: {
    type: "buyDiscount" | "sellPremium" | "marketInsight";
    value: number;
  };
}

interface BuyOfferType {
  id: string;
  type: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  expiry: number;
}

export interface GameBoardProps {
  gameState: {
    gold: number;
    inventory: ResourceCardType[];
    nextResourceDropTime: number;
    nextBuyOffersTime: number;
    stage: number;
    round: number;
    attributes: {
      buyDiscount: number;
      sellPremium: number;
      marketInsight: number;
    };
  } | null;
  playerId: string;
  resourceOffer: { offers: ResourceCardType[]; expiry: number } | null;
  buyOffers: BuyOfferType[];
  sendResourceChoice: (card: ResourceCardType) => void;
  sendAcceptOffer: (data: { offerId: string; cardId: string }) => void;
  setResourceOffer: (offer: any) => void;
  onBuyDrop: () => void;
  onSellItem: (cardId: string) => void;
}

// Wrapper that provides NavMesh context and handles click-to-move
const GameSceneWithNavMesh = () => {
  const unicornRef = useRef<THREE.Group>(null);
  const [unicornPosition, setUnicornPosition] = useState(new THREE.Vector3(0, 0, 0));
  const [unicornRotation, setUnicornRotation] = useState(0);
  const pathfindingRef = useRef<any>(null);
  const movementRef = useRef<any>(null);

  const handleGridClick = (event: any) => {
    if (!pathfindingRef.current?.isReady) {
      console.warn('NavMesh not ready yet');
      return;
    }

    const clickPoint = new THREE.Vector3(event.point.x, event.point.y, event.point.z);
    
    // Snap click point to navmesh
    const targetPoint = pathfindingRef.current.getClosestPoint(clickPoint);
    if (!targetPoint) {
      console.warn('Click point not on navmesh');
      return;
    }

    // Find path from current position to target
    const path = pathfindingRef.current.findPath(unicornPosition, targetPoint);
    if (path.length > 0) {
      movementRef.current?.moveTo(path);
    }
  };

  return (
    <>
      <NavigationGrid
        width={10}
        height={10}
        cellSize={3}
        showNavMesh={true}
        onClick={handleGridClick}
      >
        <GameSceneContent 
          unicornRef={unicornRef}
          unicornPosition={unicornPosition}
          setUnicornPosition={setUnicornPosition}
          unicornRotation={unicornRotation}
          setUnicornRotation={setUnicornRotation}
          pathfindingRef={pathfindingRef}
          movementRef={movementRef}
        />
      </NavigationGrid>
    </>
  );
};

interface GameSceneContentProps {
  unicornRef: React.RefObject<THREE.Group>;
  unicornPosition: THREE.Vector3;
  setUnicornPosition: (pos: THREE.Vector3) => void;
  unicornRotation: number;
  setUnicornRotation: (rot: number) => void;
  pathfindingRef: React.MutableRefObject<any>;
  movementRef: React.MutableRefObject<any>;
}

const GameSceneContent = ({ 
  unicornRef, 
  unicornPosition, 
  setUnicornPosition,
  unicornRotation,
  setUnicornRotation,
  pathfindingRef,
  movementRef
}: GameSceneContentProps) => {
  const { navMesh, offMeshConnections } = useNavMesh();
  const pathfinding = usePathfinding(navMesh, offMeshConnections ?? []);
  
  console.log('[GameSceneContent] Off-mesh connections available:', offMeshConnections?.length ?? 0);
  
  const movement = useAgentMovementWithOffMesh({ 
    speed: 3, 
    rotationSpeed: 8,
    climbSpeed: 2,
    jumpSpeed: 2,
    offMeshConnections: offMeshConnections ?? []
  });

  // Store refs for parent access
  pathfindingRef.current = pathfinding;
  movementRef.current = movement;

  useFrame((state, delta) => {
    if (!unicornRef.current) return;

    movement.update(
      unicornPosition,
      delta,
      (newPos) => {
        setUnicornPosition(newPos);
        unicornRef.current!.position.copy(newPos);
      },
      (newRot) => {
        setUnicornRotation(newRot);
        unicornRef.current!.rotation.y = newRot;
      }
    );
  });

  return (
    <Unicorn
      ref={unicornRef}
      animation={movement.isMoving ? "run" : "still"}
      scale={0.5}
      position={unicornPosition}
    />
  );
};

export const GameBoard = ({}: GameBoardProps) => {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <Canvas shadows camera={{ position: [-2.5, 1, 10], fov: 17 }}>
        <color attach="background" args={["#f0f0f0"]} />
        <ambientLight intensity={0.25 * Math.PI} />
        <spotLight
          decay={0}
          position={[10, 10, 10]}
          angle={0.15}
          penumbra={1}
        />
        <pointLight decay={0} position={[-10, 0, -5]} intensity={6} />

        <GameSceneWithNavMesh />

        <Bounds fit clip observe>
          <Float floatIntensity={4} rotationIntensity={0} speed={4}>
            <Atom invert={false} scale={1.5} />
          </Float>
        </Bounds>
        <Environment
          files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/dancing_hall_1k.hdr"
          background
          blur={1}
        />
        <OrbitControls
          makeDefault
          enableZoom={true}
          minDistance={10}
          maxDistance={40}
          enablePan={true}
        />
        <Stats />
      </Canvas>
    </div>
  );
};

function Pointer({
  vec = new THREE.Vector3(),
  dir = new THREE.Vector3(),
}: {
  vec?: THREE.Vector3;
  dir?: THREE.Vector3;
}) {
  const ref = useRef<any>();
  useFrame(({ pointer, viewport, camera }) => {
    vec.set(pointer.x, pointer.y, 0.5).unproject(camera);
    dir.copy(vec).sub(camera.position).normalize();
    vec.add(dir.multiplyScalar(camera.position.length()));
    ref.current?.setNextKinematicTranslation(vec);
  });
  return (
    <RigidBody
      userData={{ cloud: true }}
      type="kinematicPosition"
      colliders={false}
      ref={ref}
    >
      <BallCollider args={[4]} />
    </RigidBody>
  );
}

const Frame = (props: ThreeElements["mesh"]) => (
  <mesh {...props}>
    <ringGeometry args={[0.785, 0.85, 64]} />
    <meshPhongMaterial color="black" />
  </mesh>
);

const CircularMask = (props: ThreeElements["group"]) => (
  <group {...props}>
    <PivotControls
      offset={[0, 0, 1]}
      activeAxes={[true, true, false]}
      disableRotations
      depthTest={false}
    >
      <Frame position={[0, 0, 1]} />
      <Mask id={1} position={[0, 0, 0.95]}>
        <circleGeometry args={[0.8, 64]} />
      </Mask>
    </PivotControls>
  </group>
);

const Atom = ({
  args = [1, 4, 1] as [number, number, number],
  radius = 0.05,
  smoothness = 4,
  color = "black",
  invert = false,
  ...boxProps
}) => {
  const stencil = useMask(1, invert);
  return (
    <RoundedBox
      args={args}
      radius={radius}
      smoothness={smoothness}
      {...boxProps}
    >
      <meshPhongMaterial color="#33BBFF" {...stencil} />
    </RoundedBox>
  );
};

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

function Loop({ factor = 0.2 }) {
  const motion = useMotion();
  useFrame((state, delta) => (motion.current += Math.min(0.1, delta) * factor));
  return null;
}
