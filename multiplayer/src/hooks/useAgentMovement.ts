import { useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

interface UseAgentMovementProps {
  speed?: number;
  rotationSpeed?: number;
}

export function useAgentMovement({ speed = 2, rotationSpeed = 5 }: UseAgentMovementProps = {}) {
  const [path, setPath] = useState<THREE.Vector3[]>([]);
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const targetRotationRef = useRef<number>(0);

  const moveTo = useCallback((newPath: THREE.Vector3[]) => {
    if (newPath.length === 0) {
      setIsMoving(false);
      setPath([]);
      return;
    }

    setPath(newPath);
    setCurrentWaypointIndex(0);
    setIsMoving(true);
    console.log('[useAgentMovement] Moving to target with', newPath.length, 'waypoints');
  }, []);

  const stop = useCallback(() => {
    setIsMoving(false);
    setPath([]);
    setCurrentWaypointIndex(0);
  }, []);

  const update = useCallback((
    currentPosition: THREE.Vector3,
    delta: number,
    onPositionChange: (position: THREE.Vector3) => void,
    onRotationChange: (rotation: number) => void
  ) => {
    if (!isMoving || path.length === 0 || currentWaypointIndex >= path.length) {
      if (isMoving) {
        setIsMoving(false);
        console.log('[useAgentMovement] Reached destination');
      }
      return { isMoving: false, velocity: 0 };
    }

    const targetWaypoint = path[currentWaypointIndex];
    const direction = new THREE.Vector3().subVectors(targetWaypoint, currentPosition);
    const distance = direction.length();

    // Check if we've reached the current waypoint
    if (distance < 0.3) {
      if (currentWaypointIndex < path.length - 1) {
        setCurrentWaypointIndex(currentWaypointIndex + 1);
      } else {
        setIsMoving(false);
        console.log('[useAgentMovement] Reached final waypoint');
        return { isMoving: false, velocity: 0 };
      }
      return { isMoving: true, velocity: speed };
    }

    // Move towards waypoint
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
  }, [isMoving, path, currentWaypointIndex, speed, rotationSpeed]);

  return {
    moveTo,
    stop,
    update,
    isMoving,
    path,
    currentWaypointIndex,
  };
}
