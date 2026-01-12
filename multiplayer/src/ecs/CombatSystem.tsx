import { useFrame } from "@react-three/fiber";
import { world } from "../ecs";

export function CombatSystem() {
  useFrame((state) => {
    const now = state.clock.elapsedTime;

    // Process all entities with combat stats
    for (const entity of world.with(
      "position",
      "attackDamage",
      "attackSpeed",
      "attackRange",
      "health"
    )) {
      // Skip if entity is dead
      if (entity.health <= 0) continue;

      // If entity has an attack target
      if (entity.attackTarget) {
        // SAFETY CHECK: Prevent self-targeting
        if (entity.attackTarget === entity) {
          console.warn(
            "[CombatSystem] Entity was targeting itself! Clearing target."
          );
          world.update(entity, { attackTarget: undefined });
          continue;
        }

        // Check if target is still valid (alive and has position)
        if (
          !entity.attackTarget.health ||
          entity.attackTarget.health <= 0 ||
          !entity.attackTarget.position
        ) {
          // Target is dead or invalid, clear it
          console.warn(
            "[CombatSystem] Target invalid! Health:",
            entity.attackTarget.health,
            "Position:",
            !!entity.attackTarget.position
          );
          world.update(entity, { attackTarget: undefined });
          continue;
        }

        const distance = entity.position.distanceTo(
          entity.attackTarget.position
        );

        // If target is in range
        if (distance <= entity.attackRange) {
          // Stop moving if chasing
          if (entity.isMoving && entity.path && entity.path.length > 0) {
            // Check if we're moving towards the target (not a manual move command)
            // We can tell by checking if the path endpoint is near the target
            const pathEnd = entity.path[entity.path.length - 1];
            if (
              pathEnd &&
              entity.attackTarget.position.distanceTo(pathEnd) < 1
            ) {
              world.update(entity, { isMoving: false, path: [] });
            }
          }

          // Check if we can attack (cooldown)
          const attackCooldown = 1 / entity.attackSpeed;
          const timeSinceLastAttack = now - (entity.lastAttackTime || 0);

          if (timeSinceLastAttack >= attackCooldown) {
            // Deal damage to target
            const newHealth = Math.max(
              0,
              entity.attackTarget.health - entity.attackDamage
            );
            world.update(entity.attackTarget, { health: newHealth });

            // Update last attack time
            world.update(entity, { lastAttackTime: now });

            const attackerType = entity.player ? "Player" : "Enemy";
            const targetType = entity.attackTarget.player ? "Player" : "Enemy";
            console.log(
              `[CombatSystem] ${attackerType} dealt ${entity.attackDamage} damage to ${targetType}. Target health: ${newHealth}`
            );

            // If target died, clear it
            if (newHealth <= 0) {
              world.update(entity, { attackTarget: undefined });
              console.log(`[CombatSystem] ${targetType} eliminated`);
            }
          }
        } else {
          // Target is out of range - chase logic will be handled in GameBoard
        }
      }

      // Auto-target for enemies: find nearest player in range
      if (entity.enemy && !entity.attackTarget) {
        const playerEntity = world.with("player", "position", "health").first;
        if (playerEntity && playerEntity.health > 0) {
          const distance = entity.position.distanceTo(playerEntity.position);
          if (distance <= entity.attackRange * 1.5) {
            // Slightly larger detection range
            world.update(entity, { attackTarget: playerEntity });
            console.log("[CombatSystem] Enemy acquired player target");
          }
        }
      }
    }
  });

  return null;
}
