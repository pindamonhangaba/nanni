import { useRef, useEffect, useState } from "react";
import { world, type Entity } from "../ecs";
import { Unicorn } from "@/components/models/Unicorn";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { HealthBar } from "../components/HealthBar";
import { v4 as uuidv4 } from "uuid";

export const PlayerEntity = ({ position }: { position: THREE.Vector3 }) => {
  const group = useRef<THREE.Group>(null);
  const [animation, setAnimation] = useState("still");
  const entityRef = useRef<Entity>(null);
  const [entityCreated, setEntityCreated] = useState(false);

  useEffect(() => {
    console.log("[PlayerEntity] MOUNTED");
    const entity = world.add({
      player: true,
      position: position.clone(),
      rotation: new THREE.Euler(0, 0, 0),
      velocity: new THREE.Vector3(),
      path: [],
      currentWaypointIndex: 0,
      isMoving: false,
      health: 100,
      maxHealth: 100,
      attackDamage: 10,
      attackSpeed: 1,
      attackRange: 5,
      lastAttackTime: 0,
    });
    entityRef.current = entity;
    setEntityCreated(true);

    if (group.current) {
      world.addComponent(entity, "sceneObject", group.current);
    }

    return () => {
      console.log("[PlayerEntity] UNMOUNTED");
      world.remove(entity);
    };
  }, []);

  useFrame(() => {
    if (entityRef.current) {
      const isRun = entityRef.current.isMoving;
      const newAnim = isRun ? "run" : "still";
      if (newAnim !== animation) setAnimation(newAnim);
    }
  });

  return (
    <group ref={group} dispose={null} scale={0.6}>
      <Unicorn animation={animation as any} />
      {entityCreated && entityRef.current && (
        <HealthBar
          health={entityRef.current.health || 0}
          maxHealth={entityRef.current.maxHealth || 100}
          position={[0, 1.5, 0]}
        />
      )}
    </group>
  );
};

export const EnemyEntity = ({
  position,
  patrolRadius = 5,
}: {
  position: THREE.Vector3;
  patrolRadius?: number;
}) => {
  const group = useRef<THREE.Group>(null);
  const entityRef = useRef<Entity>(null);
  const [entityCreated, setEntityCreated] = useState(false);

  useEffect(() => {
    const entityId = uuidv4();
    console.log(
      `[EnemyEntity] CREATING entity ${entityId} at`,
      position.toArray()
    );
    const entity = world.add({
      id: entityId,
      enemy: true,
      position: position.clone(),
      rotation: new THREE.Euler(0, 0, 0),
      velocity: new THREE.Vector3(),
      path: [],
      currentWaypointIndex: 0,
      isMoving: false,
      health: 50,
      maxHealth: 50,
      attackDamage: 5,
      attackSpeed: 0.8,
      attackRange: 3,
      lastAttackTime: 0,
      patrol: {
        spawnPoint: position.clone(),
        radius: patrolRadius,
        waitTime: 2,
        timer: 0,
      },
    });
    console.log(`[EnemyEntity] CREATED ${entityId}. Health:`, entity.health);
    entityRef.current = entity;
    setEntityCreated(true);

    if (group.current) {
      world.addComponent(entity, "sceneObject", group.current);
    }

    const intervalId = setInterval(() => {
      // Only log if health is unexpected (0 or undefined) or just occasionally
      if (entity.health === 0 || entity.health === undefined) {
        console.warn(
          `[EnemyEntity] WARNING: Entity ${entityId} has health ${entity.health}`
        );
      }
    }, 3000);

    return () => {
      console.log("[EnemyEntity] UNMOUNTED");
      clearInterval(intervalId);
      world.remove(entity);
    };
  }, []);

  return (
    <group ref={group} dispose={null}>
      <mesh
        position={[0, 0.75, 0]}
        onClick={(e) => {
          e.stopPropagation();
          // Set this enemy as the player's attack target
          const playerEntity = world.with("player").first;
          if (playerEntity && entityRef.current) {
            console.log("[EnemyEntity] Click detected on enemy");
            console.log(
              "[EnemyEntity] Player entity:",
              playerEntity.player ? "PLAYER" : "NOT PLAYER"
            );
            console.log(
              "[EnemyEntity] Enemy entity:",
              entityRef.current.enemy ? "ENEMY" : "NOT ENEMY",
              "ID:",
              entityRef.current.id
            );
            console.log(
              "[EnemyEntity] Setting player's attackTarget to this enemy"
            );
            world.update(playerEntity, { attackTarget: entityRef.current });
            console.log(
              "[EnemyEntity] Player now targeting enemy. Entity dump:",
              JSON.stringify(entityRef.current)
            );
            console.log("Health property:", entityRef.current.health);
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "crosshair";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <capsuleGeometry args={[0.3, 1, 4, 8]} />
        <meshStandardMaterial color="red" />
      </mesh>
      {entityCreated && entityRef.current && (
        <HealthBar
          health={entityRef.current.health || 0}
          maxHealth={entityRef.current.maxHealth || 50}
          position={[0, 2.2, 0]}
        />
      )}
    </group>
  );
};
