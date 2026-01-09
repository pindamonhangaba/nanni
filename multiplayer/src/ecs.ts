import { World } from "miniplex";
import * as THREE from "three";
import { OffMeshConnectionType } from "@/utils/generateCity"; // We need this type if possible, or just string/number

// Define simple types if import is tricky or circular, but best to import.
// For now, I'll use string or number for type to avoid complex imports in this definition file if not needed,
// but the hook uses OffMeshConnectionType enum. I'll rely on it.

export type Entity = {
  // Tags
  player?: boolean;
  camera?: boolean;
  
  // Transform
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  
  // Movement & Physics
  velocity?: THREE.Vector3;
  target?: THREE.Vector3;
  path?: THREE.Vector3[];
  currentWaypointIndex?: number;
  isMoving?: boolean;
  
  // Traversal (Off-mesh links)
  traversalState?: {
    type: OffMeshConnectionType;
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    progress: number;
  };
  
  // Render / Scene
  sceneObject?: THREE.Object3D;

  // Enemy Logic
  enemy?: boolean;
  patrol?: {
    spawnPoint: THREE.Vector3;
    radius: number;
    waitTime: number;
    timer: number;
  };

  // Health
  health?: number;
  maxHealth?: number;

  // Combat
  attackDamage?: number;
  attackSpeed?: number; // attacks per second
  attackRange?: number;
  lastAttackTime?: number;
  attackTarget?: Entity; // Current attack target
};

// Create the world
export const world = new World<Entity>();
