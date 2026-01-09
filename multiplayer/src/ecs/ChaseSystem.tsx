import { useFrame } from "@react-three/fiber";
import { world } from "../ecs";

export function ChaseSystem({ pathfinding }: { pathfinding: any }) {
  useFrame(() => {
    if (!pathfinding?.isReady) return;

    // Check player entity
    const playerEntity = world.with("player", "position", "attackTarget").first;
    if (!playerEntity || !playerEntity.attackTarget) return;

    // Check if target is valid and alive
    if (
      !playerEntity.attackTarget.health ||
      playerEntity.attackTarget.health <= 0 ||
      !playerEntity.attackTarget.position
    ) {
      // Target is dead or invalid
      return;
    }

    const distance = playerEntity.position.distanceTo(
      playerEntity.attackTarget.position
    );

    // If target is out of attack range and player is not manually moving
    if (distance > playerEntity.attackRange) {
      // Check if player is not manually moving (no path or path is complete)
      if (
        !playerEntity.isMoving ||
        !playerEntity.path ||
        playerEntity.path.length === 0
      ) {
        // Find path to target
        const path = pathfinding.findPath(
          playerEntity.position,
          playerEntity.attackTarget.position
        );

        if (path && path.length > 0) {
          world.update(playerEntity, {
            path,
            currentWaypointIndex: 0,
            isMoving: true,
            traversalState: undefined,
          });
          console.log("[ChaseSystem] Player chasing attack target");
        }
      }
    }
  });

  return null;
}
