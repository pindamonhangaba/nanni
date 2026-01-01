import { useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OffMeshConnectionType } from '@/utils/generateCity';

interface OffMeshConnection {
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  type: OffMeshConnectionType;
  radius: number;
  bidirectional?: boolean;
}

interface UseAgentMovementProps {
  speed?: number;
  rotationSpeed?: number;
  climbSpeed?: number;
  jumpSpeed?: number;
  offMeshConnections?: OffMeshConnection[];
}

interface TraversalState {
  type: OffMeshConnectionType;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  progress: number; // 0 to 1
}

export function useAgentMovementWithOffMesh({ 
  speed = 2, 
  rotationSpeed = 5,
  climbSpeed = 1.5,
  jumpSpeed = 3,
  offMeshConnections = []
}: UseAgentMovementProps = {}) {
  const [path, setPath] = useState<THREE.Vector3[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [traversalState, setTraversalState] = useState<TraversalState | null>(null);
  const targetRotationRef = useRef<number>(0);

  const moveTo = useCallback((newPath: THREE.Vector3[]) => {
    if (newPath.length === 0) {
      setIsMoving(false);
      setPath([]);
      setTraversalState(null);
      return;
    }

    setPath(newPath);
    setCurrentWaypointIndex(0);
    setIsMoving(true);
    setTraversalState(null);
    console.log('[useAgentMovementWithOffMesh] Moving to target with', newPath.length, 'waypoints');
    console.log('[useAgentMovementWithOffMesh] Available off-mesh connections:', offMeshConnections.length);
    newPath.forEach((wp, i) => {
      console.log(`  Waypoint ${i}:`, wp);
    });
  }, [offMeshConnections]);

  const stop = useCallback(() => {
    setIsMoving(false);
    setPath([]);
    setCurrentWaypointIndex(0);
    setTraversalState(null);
  }, []);

  // Check if there's an off-mesh connection between two waypoints
  const findOffMeshConnection = useCallback((from: THREE.Vector3, to: THREE.Vector3): { connection: OffMeshConnection, isReverse: boolean } | null => {
    console.log('[findOffMeshConnection] Checking segment from', from, 'to', to);
    
    // We prioritize XZ distance because Y might be different due to navmesh projection
    const getHorizontalDist = (v1: {x: number, z: number}, v2: {x: number, z: number}) => {
        return Math.sqrt(Math.pow(v1.x - v2.x, 2) + Math.pow(v1.z - v2.z, 2));
    };

      let bestMatch: { connection: OffMeshConnection, isReverse: boolean } | null = null;
      let bestScore = Infinity;
      
      // Thresholds
      const XZ_THRESHOLD = 2.5; // Match generation radius (2.0) plus margin
      const Y_THRESHOLD = 10.0; // Loose vertical match (ladders can be tall)

      for (const conn of offMeshConnections) {
        // Check forward direction
        const startDistXZ = getHorizontalDist(conn.startPosition, from);
        const endDistXZ = getHorizontalDist(conn.endPosition, to);
        const startDistY = Math.abs(conn.startPosition.y - from.y);
        const endDistY = Math.abs(conn.endPosition.y - to.y);
        
        const forwardScore = startDistXZ + endDistXZ;
        
        // Check reverse direction
        const startDistXZRev = getHorizontalDist(conn.endPosition, from);
        const endDistXZRev = getHorizontalDist(conn.startPosition, to);
        const startDistYRev = Math.abs(conn.endPosition.y - from.y);
        const endDistYRev = Math.abs(conn.startPosition.y - to.y);
        
        const reverseScore = startDistXZRev + endDistXZRev;

        // Check forward match
        if (startDistXZ < XZ_THRESHOLD && endDistXZ < XZ_THRESHOLD && 
            startDistY < Y_THRESHOLD && endDistY < Y_THRESHOLD) {
            
            if (forwardScore < bestScore) {
                bestScore = forwardScore;
                bestMatch = { connection: conn, isReverse: false };
            }
        }

        // Check reverse match
        if (conn.bidirectional && 
            startDistXZRev < XZ_THRESHOLD && endDistXZRev < XZ_THRESHOLD &&
            startDistYRev < Y_THRESHOLD && endDistYRev < Y_THRESHOLD) {
            
            if (reverseScore < bestScore) {
                bestScore = reverseScore;
                bestMatch = { connection: conn, isReverse: true };
            }
        }
      }
      
      if (bestMatch) {
        console.log('[findOffMeshConnection] Found match!', bestMatch.connection.type, bestMatch.isReverse ? '(Reverse)' : '(Forward)');
      }
      
      return bestMatch;
  }, [offMeshConnections]);

  const update = useCallback((
    currentPosition: THREE.Vector3,
    delta: number,
    onPositionChange: (position: THREE.Vector3) => void,
    onRotationChange: (rotation: number) => void
  ) => {
    if (!isMoving || path.length === 0 || currentWaypointIndex >= path.length) {
      if (isMoving) {
        setIsMoving(false);
        setTraversalState(null);
        console.log('[useAgentMovementWithOffMesh] Reached destination');
      }
      return { isMoving: false, velocity: 0 };
    }

    // Handle special traversal (ladder, jump, teleport)
    if (traversalState) {
      const newProgress = traversalState.progress + (delta / getTraversalDuration(traversalState.type, climbSpeed, jumpSpeed));
      
      if (newProgress >= 1) {
        // Traversal complete
        onPositionChange(traversalState.endPos.clone());
        setTraversalState(null);
        
        // Move to next waypoint
        if (currentWaypointIndex < path.length - 1) {
          setCurrentWaypointIndex(currentWaypointIndex + 1);
        } else {
          setIsMoving(false);
          console.log('[useAgentMovementWithOffMesh] Reached final waypoint');
          return { isMoving: false, velocity: 0 };
        }
        return { isMoving: true, velocity: speed };
      }
      
      // Interpolate position based on traversal type
      const newPosition = interpolateTraversal(
        traversalState.startPos,
        traversalState.endPos,
        newProgress,
        traversalState.type
      );
      
      onPositionChange(newPosition);
      setTraversalState({ ...traversalState, progress: newProgress });
      
      // Update rotation to face direction
      const direction = new THREE.Vector3().subVectors(traversalState.endPos, traversalState.startPos);
      if (direction.lengthSq() > 0.01) {
        direction.normalize();
        const targetRotation = Math.atan2(direction.x, direction.z);
        targetRotationRef.current = targetRotation;
        onRotationChange(targetRotation);
      }
      
      return { isMoving: true, velocity: speed };
    }

    const targetWaypoint = path[currentWaypointIndex];
    const direction = new THREE.Vector3().subVectors(targetWaypoint, currentPosition);
    const distance = direction.length();

    // Check if we've reached the current waypoint
    if (distance < 0.3) {
      if (currentWaypointIndex < path.length - 1) {
        // Check if next segment is an off-mesh connection
        const nextWaypoint = path[currentWaypointIndex + 1];
        const match = findOffMeshConnection(targetWaypoint, nextWaypoint);
        
        if (match) {
          const { connection, isReverse } = match;
          console.log('[useAgentMovementWithOffMesh] Starting', connection.type, 'traversal');
          
          // Use the STORED connection coordinates, not the pathfinder's coordinates
          // This ensures we actually climb to the roof even if pathfinder gave ground coords
          const startPos = isReverse 
            ? new THREE.Vector3(connection.endPosition.x, connection.endPosition.y, connection.endPosition.z)
            : new THREE.Vector3(connection.startPosition.x, connection.startPosition.y, connection.startPosition.z);
            
          const endPos = isReverse
            ? new THREE.Vector3(connection.startPosition.x, connection.startPosition.y, connection.startPosition.z)
            : new THREE.Vector3(connection.endPosition.x, connection.endPosition.y, connection.endPosition.z);

          setTraversalState({
            type: connection.type,
            startPos: startPos,
            endPos: endPos,
            progress: 0
          });
          setCurrentWaypointIndex(currentWaypointIndex + 1);
          return { isMoving: true, velocity: speed };
        }
        
        setCurrentWaypointIndex(currentWaypointIndex + 1);
      } else {
        setIsMoving(false);
        console.log('[useAgentMovementWithOffMesh] Reached final waypoint');
        return { isMoving: false, velocity: 0 };
      }
      return { isMoving: true, velocity: speed };
    }

    // Normal movement towards waypoint
    direction.normalize();
    const moveDistance = Math.min(speed * delta, distance);
    const newPosition = currentPosition.clone().add(direction.multiplyScalar(moveDistance));
    onPositionChange(newPosition);

    // Calculate target rotation (looking direction)
    const targetRotation = Math.atan2(direction.x, direction.z);
    
    // Smoothly interpolate rotation
    let currentRotation = targetRotationRef.current;
    let rotationDiff = targetRotation - currentRotation;
    
    // Normalize the angle difference to [-PI, PI]
    while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
    while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
    
    const rotationStep = rotationSpeed * delta;
    if (Math.abs(rotationDiff) < rotationStep) {
      currentRotation = targetRotation;
    } else {
      currentRotation += Math.sign(rotationDiff) * rotationStep;
    }
    
    targetRotationRef.current = currentRotation;
    onRotationChange(currentRotation);

    return { isMoving: true, velocity: speed };
  }, [isMoving, path, currentWaypointIndex, speed, rotationSpeed, climbSpeed, jumpSpeed, traversalState, findOffMeshConnection]);

  return {
    moveTo,
    stop,
    update,
    isMoving,
    path,
    currentWaypointIndex,
    traversalState,
  };
}

// Helper function to calculate traversal duration based on type
function getTraversalDuration(type: OffMeshConnectionType, climbSpeed: number, jumpSpeed: number): number {
  switch (type) {
    case OffMeshConnectionType.Teleport:
      return 0.1; // Near instant
    case OffMeshConnectionType.Ladder:
      return 2.0 / climbSpeed; // Slower climb
    case OffMeshConnectionType.Jump:
      return 1.0 / jumpSpeed; // Quick jump
    default:
      return 1.0;
  }
}

// Helper function to interpolate position based on traversal type
function interpolateTraversal(
  start: THREE.Vector3,
  end: THREE.Vector3,
  progress: number,
  type: OffMeshConnectionType
): THREE.Vector3 {
  switch (type) {
    case OffMeshConnectionType.Teleport:
      // Instant transition
      return progress < 0.5 ? start.clone() : end.clone();
      
    case OffMeshConnectionType.Ladder:
      // Linear interpolation, moving straight up/down along the wall
      return new THREE.Vector3().lerpVectors(start, end, progress);
      
    case OffMeshConnectionType.Jump:
      // Parabolic arc
      const horizontal = new THREE.Vector3().lerpVectors(start, end, progress);
      const heightDiff = end.y - start.y;
      const midHeight = Math.max(start.y, end.y) + 2; // Arc peak 2 units above highest point
      
      // Parabola equation: -4 * (t - 0.5)^2 + 1, normalized to [0, 1]
      const arcProgress = -4 * Math.pow(progress - 0.5, 2) + 1;
      const yOffset = arcProgress * (midHeight - Math.max(start.y, end.y));
      
      horizontal.y = start.y + (heightDiff * progress) + yOffset;
      return horizontal;
      
    default:
      return new THREE.Vector3().lerpVectors(start, end, progress);
  }
}
