import { useFrame } from "@react-three/fiber";
import { world } from "../ecs";
import * as THREE from "three";
import { OffMeshConnectionType } from "@/utils/generateCity";

// Export speed settings so they can be modified
export let playerSpeed = 3;
export let enemySpeed = 3;
const rotationSpeed = 8;
const climbSpeed = 2;
const jumpSpeed = 2;

// Functions to update speeds
export const setPlayerSpeed = (speed: number) => {
  playerSpeed = speed;
};
export const setEnemySpeed = (speed: number) => {
  enemySpeed = speed;
};

function interpolateTraversal(
  start: THREE.Vector3,
  end: THREE.Vector3,
  progress: number,
  type: OffMeshConnectionType
): THREE.Vector3 {
  switch (type) {
    case OffMeshConnectionType.Teleport:
      return progress < 0.5 ? start.clone() : end.clone();
    case OffMeshConnectionType.Ladder:
      return new THREE.Vector3().lerpVectors(start, end, progress);
    case OffMeshConnectionType.Jump:
      const horizontal = new THREE.Vector3().lerpVectors(start, end, progress);
      const heightDiff = end.y - start.y;
      const midHeight = Math.max(start.y, end.y) + 2;
      const arcProgress = -4 * Math.pow(progress - 0.5, 2) + 1;
      const yOffset = arcProgress * (midHeight - Math.max(start.y, end.y));
      horizontal.y = start.y + heightDiff * progress + yOffset;
      return horizontal;
    default:
      return new THREE.Vector3().lerpVectors(start, end, progress);
  }
}

function getTraversalDuration(type: OffMeshConnectionType): number {
  switch (type) {
    case OffMeshConnectionType.Teleport:
      return 0.1;
    case OffMeshConnectionType.Ladder:
      return 2.0 / climbSpeed;
    case OffMeshConnectionType.Jump:
      return 1.0 / jumpSpeed;
    default:
      return 1.0;
  }
}

export function PatrolSystem({ pathfinding }: { pathfinding: any }) {
  useFrame((state, delta) => {
    if (!pathfinding?.isReady) return;

    for (const entity of world.with("position", "patrol", "isMoving")) {
      // If moving, do nothing (MovementSystem handles it)
      if (entity.isMoving) continue;

      // Updating timer
      if (entity.patrol.timer > 0) {
        entity.patrol.timer -= delta;
        continue;
      }

      // Time to pick a new point!
      // Simple random point in circle (flat disc logic, relying on navmesh snap)
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * entity.patrol.radius;
      const offsetX = Math.cos(angle) * dist;
      const offsetZ = Math.sin(angle) * dist;

      const targetPosCandidate = new THREE.Vector3(
        entity.patrol.spawnPoint.x + offsetX,
        entity.patrol.spawnPoint.y,
        entity.patrol.spawnPoint.z + offsetZ
      );

      // Snap to navmesh
      const closestPoint = pathfinding.getClosestPoint(targetPosCandidate);

      if (closestPoint) {
        const path = pathfinding.findPath(entity.position, closestPoint);
        if (path && path.length > 0) {
          console.log("[PatrolSystem] New patrol path found for enemy");
          world.update(entity, {
            path,
            currentWaypointIndex: 0,
            isMoving: true,
            patrol: { ...entity.patrol, timer: entity.patrol.waitTime },
          });
        }
      }
    }
  });
  return null;
}

export function MovementSystem({
  offMeshConnections: _,
}: {
  offMeshConnections: any[];
}) {
  useFrame((state, delta) => {
    // console.log("MovementSystem tick", delta); // Very spammy, uncomment if needed

    // Entities that are moving
    for (const entity of world.with(
      "position",
      "path",
      "currentWaypointIndex",
      "isMoving"
    )) {
      if (!entity.isMoving) continue;

      // console.log(
      //   `[MovementSystem] Entity moving. Pos: ${entity.position
      //     .toArray()
      //     .join(",")}, WaypointIdx: ${entity.currentWaypointIndex}, PathLen: ${
      //     entity.path?.length
      //   }`
      // );

      if (!entity.path || entity.path.length === 0) {
        console.warn("[MovementSystem] Entity set to moving but has no path!");
        continue;
      }

      const { position, path } = entity;
      let { currentWaypointIndex } = entity;

      // Handle Traversal (Ladders/Jumps)
      if (entity.traversalState) {
        // console.log("[MovementSystem] Handling Traversal");
        const { type, startPos, endPos, progress } = entity.traversalState;
        const duration = getTraversalDuration(type);
        const newProgress = progress + delta / duration;

        if (newProgress >= 1) {
          // Traversal Complete
          position.copy(endPos);
          world.removeComponent(entity, "traversalState");

          if (currentWaypointIndex < path.length - 1) {
            world.update(entity, {
              currentWaypointIndex: currentWaypointIndex + 1,
            });
          } else {
            world.update(entity, { isMoving: false });
          }
        } else {
          // Continue Traversal
          const newPos = interpolateTraversal(
            startPos,
            endPos,
            newProgress,
            type
          );
          position.copy(newPos);
          world.update(entity, {
            traversalState: {
              ...entity.traversalState,
              progress: newProgress,
            },
          });

          // Face direction
          const dir = new THREE.Vector3()
            .subVectors(endPos, startPos)
            .normalize();
          if (dir.lengthSq() > 0.01) {
            const targetRot = Math.atan2(dir.x, dir.z);
            if (entity.rotation) entity.rotation.y = targetRot;
          }
        }
        continue; // Skip normal movement
      }

      // Normal Path Following
      if (currentWaypointIndex >= path.length) {
        console.log("[MovementSystem] Reached end of path");
        world.update(entity, { isMoving: false });
        continue;
      }

      const targetWaypoint = path[currentWaypointIndex];
      const direction = new THREE.Vector3().subVectors(
        targetWaypoint,
        position
      );
      const dist = direction.length();

      // console.log(`[MovementSystem] Dist to waypoint: ${dist}`);

      if (dist < 0.3) {
        // Reached Waypoint
        if (currentWaypointIndex < path.length - 1) {
          console.log(
            `[MovementSystem] Waypoint ${currentWaypointIndex} reached, advancing to ${
              currentWaypointIndex + 1
            }`
          );
          world.update(entity, {
            currentWaypointIndex: currentWaypointIndex + 1,
          });
        } else {
          console.log("[MovementSystem] Destination reached");
          world.update(entity, { isMoving: false });
        }
      } else {
        // Move towards waypoint
        direction.normalize();
        // Use different speed for player vs enemy
        const entitySpeed = entity.player ? playerSpeed : enemySpeed;
        const moveDist = Math.min(entitySpeed * delta, dist);
        position.add(direction.multiplyScalar(moveDist));

        // console.log(
        //   `[MovementSystem] Moving. New Pos: ${position.toArray().join(",")}`
        // );

        // Rotate
        const targetRot = Math.atan2(direction.x, direction.z);
        if (entity.rotation) {
          let currentRot = entity.rotation.y;
          let diff = targetRot - currentRot;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const step = rotationSpeed * delta;
          if (Math.abs(diff) < step) currentRot = targetRot;
          else currentRot += Math.sign(diff) * step;
          entity.rotation.y = currentRot;
        }
      }
    }
  });

  return null;
}

export function RenderSystem() {
  useFrame(() => {
    // Sync Scene Objects
    for (const { position, rotation, sceneObject } of world.with(
      "position",
      "rotation",
      "sceneObject"
    )) {
      if (sceneObject) {
        // Debug log for syncing (throttled/conditional recommended usually, but user asked for logs)
        if (Math.random() < 0.01) {
          console.log(
            `[RenderSystem] Syncing ${sceneObject.uuid} to ${position.x.toFixed(
              2
            )},${position.y.toFixed(2)},${position.z.toFixed(2)}`
          );
        }
        sceneObject.position.copy(position);
        sceneObject.rotation.copy(rotation);
      } else {
        console.warn("[RenderSystem] Entity has no sceneObject!");
      }
    }
  });
  return null;
}

export function CameraSystem() {
  useFrame((_, _delta) => {
    // Simple camera follow
    const player = world.with("player", "position").first;
    if (!player) return;
  });
  return null;
}
