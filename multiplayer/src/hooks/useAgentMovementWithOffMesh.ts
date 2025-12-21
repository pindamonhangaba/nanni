import { useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OffMeshConnectionType } from '@/utils/generateCity';

interface OffMeshConnection {
  startPosition: { x: number; y: number; z: number };
  endPosition: { x: number; y: number; z: number };
  type: OffMeshConnectionType;
  radius: number;
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
  const findOffMeshConnection = useCallback((from: THREE.Vector3, to: THREE.Vector3): OffMeshConnection | null => {
    console.log('[findOffMeshConnection] Checking segment from', from, 'to', to);
    console.log('[findOffMeshConnection] Available connections:', offMeshConnections.length);
    
    const heightDiff = Math.abs(to.y - from.y);
    console.log('[findOffMeshConnection] Height difference:', heightDiff);
    
    // Check for large vertical movement that indicates an off-mesh connection
    if (heightDiff > 2) {
      console.log('[findOffMeshConnection] Large height change detected, searching for matching connection...');
      
      // Find the closest matching connection by position
      let bestMatch: OffMeshConnection | null = null;
      let bestScore = Infinity;
      
      for (const conn of offMeshConnections) {
        // Calculate 3D distances
        const startDist = new THREE.Vector3(conn.startPosition.x, conn.startPosition.y, conn.startPosition.z)
          .distanceTo(from);
        const endDist = new THREE.Vector3(conn.endPosition.x, conn.endPosition.y, conn.endPosition.z)
          .distanceTo(to);
        
        const forwardScore = startDist + endDist;
        
        // Check reversed
        const startDistRev = new THREE.Vector3(conn.endPosition.x, conn.endPosition.y, conn.endPosition.z)
          .distanceTo(from);
        const endDistRev = new THREE.Vector3(conn.startPosition.x, conn.startPosition.y, conn.startPosition.z)
          .distanceTo(to);
        
        const reverseScore = startDistRev + endDistRev;
        
        const score = Math.min(forwardScore, reverseScore);
        
        console.log('[findOffMeshConnection] Connection', conn.type, 'score:', score, '(forward:', forwardScore, 'reverse:', reverseScore, ')');
        
        if (score < bestScore && score < 5) { // Within 5 units total
          bestScore = score;
          bestMatch = conn;
        }
      }
      
      if (bestMatch) {
        console.log('[findOffMeshConnection] ✓ Found matching off-mesh connection:', bestMatch.type, 'with score:', bestScore);
        return bestMatch;
      } else {
        console.log('[findOffMeshConnection] ✗ No matching connection found');
      }
    }
    
    return null;
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
        const offMeshConn = findOffMeshConnection(targetWaypoint, nextWaypoint);
        
        if (offMeshConn) {
          console.log('[useAgentMovementWithOffMesh] Starting', offMeshConn.type, 'traversal');
          setTraversalState({
            type: offMeshConn.type,
            startPos: targetWaypoint.clone(),
            endPos: nextWaypoint.clone(),
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
