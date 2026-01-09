import { useRef, useEffect, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  Stats,
  Bounds,
  Float,
  RoundedBox,
  useMask,
} from "@react-three/drei";

import * as THREE from "three";
import { NavigationGrid } from "@/components/NavigationGrid";
import { useNavMesh } from "@/context/NavMeshContext";
import { usePathfinding } from "@/hooks/usePathfinding";

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

import {
  MovementSystem,
  RenderSystem,
  CameraSystem,
  PatrolSystem,
  setPlayerSpeed,
  setEnemySpeed,
} from "@/ecs/systems";
import { PlayerEntity, EnemyEntity } from "@/ecs/entities";
import { world } from "@/ecs";
import { ControlPanel } from "@/components/ControlPanel";
import { v4 as uuidv4 } from "uuid";
import { CombatSystem } from "@/ecs/CombatSystem";
import { ChaseSystem } from "@/ecs/ChaseSystem";

// Wrapper that provides NavMesh context and handles click-to-move
const GameSceneWithNavMesh = ({
  enemies,
  pathfindingRef,
}: {
  enemies: { id: string; position: THREE.Vector3 }[];
  pathfindingRef: React.MutableRefObject<any>;
}) => {
  const handleGridClick = useCallback(
    (event: any) => {
      if (!pathfindingRef.current?.isReady) {
        console.warn("NavMesh not ready yet");
        return;
      }

      // Find the player entity
      const playerEntity = world.with("player", "position").first;
      if (!playerEntity || !playerEntity.position) {
        console.warn("Player entity not found");
        return;
      }

      const clickPoint = new THREE.Vector3(
        event.point.x,
        event.point.y,
        event.point.z
      );

      // Snap click point to navmesh
      const targetPoint = pathfindingRef.current.getClosestPoint(clickPoint);
      if (!targetPoint) {
        console.warn("Click point not on navmesh");
        return;
      }

      // Find path from current position to target
      const path = pathfindingRef.current.findPath(
        playerEntity.position,
        targetPoint
      );
      if (path.length > 0) {
        // Update ECS components
        world.update(playerEntity, {
          path,
          currentWaypointIndex: 0,
          isMoving: true,
          // Reset traversal state if any
          traversalState: undefined,
        });
        console.log("Path found, updating entity moving to", targetPoint);
      }
    },
    [pathfindingRef]
  );

  return (
    <>
      <NavigationGrid
        width={10}
        height={10}
        cellSize={3}
        showNavMesh={true}
        onClick={handleGridClick}
      >
        <GameSceneContent pathfindingRef={pathfindingRef} />
        {enemies.map((e) => (
          <EnemyEntity key={e.id} position={e.position} patrolRadius={8} />
        ))}
      </NavigationGrid>
    </>
  );
};

interface GameSceneContentProps {
  pathfindingRef: React.MutableRefObject<any>;
}

const GameSceneContent = ({ pathfindingRef }: GameSceneContentProps) => {
  const { navMesh, offMeshConnections } = useNavMesh();
  const pathfinding = usePathfinding(navMesh, offMeshConnections ?? []);

  // Store ref for parent access (click handler)
  useEffect(() => {
    pathfindingRef.current = pathfinding;
  }, [pathfinding, pathfindingRef]);

  return (
    <>
      <MovementSystem offMeshConnections={offMeshConnections ?? []} />
      <PatrolSystem pathfinding={pathfinding} />
      <CombatSystem />
      <ChaseSystem pathfinding={pathfinding} />
      <RenderSystem />
      <CameraSystem />
      <PlayerEntity position={useRef(new THREE.Vector3(0, 0, 0)).current} />
    </>
  );
};

export const GameBoard = ({}: GameBoardProps) => {
  const pathfindingRef = useRef<any>(null);
  const [enemies, setEnemies] = useState<
    { id: string; position: THREE.Vector3 }[]
  >([]);
  const [playerSpeedState, setPlayerSpeedState] = useState(3);
  const [enemySpeedState, setEnemySpeedState] = useState(3);

  // Combat stats state
  const [playerAttackDamage, setPlayerAttackDamage] = useState(10);
  const [playerAttackSpeed, setPlayerAttackSpeed] = useState(1);
  const [playerAttackRange, setPlayerAttackRange] = useState(5);
  const [enemyAttackDamage, setEnemyAttackDamage] = useState(5);
  const [enemyAttackSpeed, setEnemyAttackSpeed] = useState(0.8);
  const [enemyAttackRange, setEnemyAttackRange] = useState(3);

  const handleSpawnEnemy = useCallback(() => {
    if (!pathfindingRef.current?.isReady) {
      console.warn("Pathfinding not ready to spawn enemy");
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 10;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    const target = new THREE.Vector3(x, 0, z);
    const closest = pathfindingRef.current.getClosestPoint(target);

    if (closest) {
      console.log("[SpawnEnemy] Spawned enemy at", closest);
      setEnemies((prev) => [...prev, { id: uuidv4(), position: closest }]);
    } else {
      console.warn("Could not find valid spawn point for enemy");
    }
  }, []);

  const handlePlayerSpeedChange = useCallback((speed: number) => {
    setPlayerSpeedState(speed);
    setPlayerSpeed(speed);
  }, []);

  const handleEnemySpeedChange = useCallback((speed: number) => {
    setEnemySpeedState(speed);
    setEnemySpeed(speed);
  }, []);

  // Combat stat handlers
  const handlePlayerAttackDamageChange = useCallback((value: number) => {
    setPlayerAttackDamage(value);
    const playerEntity = world.with("player").first;
    if (playerEntity) {
      world.update(playerEntity, { attackDamage: value });
    }
  }, []);

  const handlePlayerAttackSpeedChange = useCallback((value: number) => {
    setPlayerAttackSpeed(value);
    const playerEntity = world.with("player").first;
    if (playerEntity) {
      world.update(playerEntity, { attackSpeed: value });
    }
  }, []);

  const handlePlayerAttackRangeChange = useCallback((value: number) => {
    setPlayerAttackRange(value);
    const playerEntity = world.with("player").first;
    if (playerEntity) {
      world.update(playerEntity, { attackRange: value });
    }
  }, []);

  const handleEnemyAttackDamageChange = useCallback((value: number) => {
    setEnemyAttackDamage(value);
    for (const enemy of world.with("enemy")) {
      world.update(enemy, { attackDamage: value });
    }
  }, []);

  const handleEnemyAttackSpeedChange = useCallback((value: number) => {
    setEnemyAttackSpeed(value);
    for (const enemy of world.with("enemy")) {
      world.update(enemy, { attackSpeed: value });
    }
  }, []);

  const handleEnemyAttackRangeChange = useCallback((value: number) => {
    setEnemyAttackRange(value);
    for (const enemy of world.with("enemy")) {
      world.update(enemy, { attackRange: value });
    }
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
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

        <GameSceneWithNavMesh
          enemies={enemies}
          pathfindingRef={pathfindingRef}
        />

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

      <ControlPanel
        onSpawnEnemy={handleSpawnEnemy}
        playerSpeed={playerSpeedState}
        enemySpeed={enemySpeedState}
        onPlayerSpeedChange={handlePlayerSpeedChange}
        onEnemySpeedChange={handleEnemySpeedChange}
        playerAttackDamage={playerAttackDamage}
        playerAttackSpeed={playerAttackSpeed}
        playerAttackRange={playerAttackRange}
        enemyAttackDamage={enemyAttackDamage}
        enemyAttackSpeed={enemyAttackSpeed}
        enemyAttackRange={enemyAttackRange}
        onPlayerAttackDamageChange={handlePlayerAttackDamageChange}
        onPlayerAttackSpeedChange={handlePlayerAttackSpeedChange}
        onPlayerAttackRangeChange={handlePlayerAttackRangeChange}
        onEnemyAttackDamageChange={handleEnemyAttackDamageChange}
        onEnemyAttackSpeedChange={handleEnemyAttackSpeedChange}
        onEnemyAttackRangeChange={handleEnemyAttackRangeChange}
      />
    </div>
  );
};

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
