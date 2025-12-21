// Controls by @giulioz
import React, { useRef, useEffect, useState } from 'react'
import { useThree, useFrame } from 'react-three-fiber'
import * as THREE from 'three'
import { useGesture } from 'react-use-gesture'

const upVector = new THREE.Vector3(0, 1, 0)
const zoomSpeed = 1
const moveSpeed = 1
const moveSpeedDrag = 3
const moveSpeedDistanceFactor = 2500

export function useScrollControlsProps() {
  const stateRef = useRef({
    distance: 20,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    rotation: 0
  })
  const [dragging, setDragging] = useState(false)

  return { stateRef, dragging, setDragging }
}

export default React.memo(function ScrollControls({
  lookVector = [0.301847, 0.674125, 0.674125],
  planes = [1, 1000],
  minDistance = 5,
  maxDistance = 1000,
  debounceThreshold = 80,
  stateRef,
  setDragging
}) {
  const { camera, invalidate, gl } = useThree()

  const rotatedLookVector = useRef(new THREE.Vector3())
  const targetVector = useRef(new THREE.Vector3())
  const movementYVector = useRef(new THREE.Vector3())
  const movementXVector = useRef(new THREE.Vector3())
  const rotationEuler = useRef(new THREE.Euler())

  useFrame(() => {
    const { targetX, targetY, targetZ, rotation, distance } = stateRef.current

    rotationEuler.current.y = rotation
    rotatedLookVector.current
      .set(lookVector[0], lookVector[1], lookVector[2])
      .applyEuler(rotationEuler.current)
      .multiplyScalar(distance)

    targetVector.current.set(targetX, targetY, targetZ)
    movementYVector.current.copy(rotatedLookVector.current).normalize()

    movementXVector.current
      .copy(movementYVector.current)
      .crossVectors(movementYVector.current, upVector)
    camera.near = planes[0]
    camera.far = planes[1]

    camera.position.copy(targetVector.current).add(rotatedLookVector.current)
    camera.updateProjectionMatrix()
    camera.lookAt(targetVector.current)
  })

  const bind = useGesture(
    {
      onDrag: ({ delta, movement, event, last }) => {
        const deltaXR =
          delta[0] * movementXVector.current.x +
          delta[1] * -movementXVector.current.z
        const deltaYR =
          delta[0] * movementYVector.current.x +
          delta[1] * -movementYVector.current.z

        // debounce for click events that moves camera
        // (item select)
        const d = movement[0] ** 2 + movement[1] ** 2
        if (d > debounceThreshold) {
          setDragging(true)

          stateRef.current.targetX =
            stateRef.current.targetX +
            deltaXR *
              (stateRef.current.distance / moveSpeedDistanceFactor) *
              moveSpeedDrag
          stateRef.current.targetZ =
            stateRef.current.targetZ +
            deltaYR *
              (stateRef.current.distance / moveSpeedDistanceFactor) *
              moveSpeedDrag

          event.stopPropagation()
          event.preventDefault()
          invalidate()
          return false
        }

        if (last) {
          setDragging(false)
        }
      },
      onWheel: ({ event, delta }) => {
        event.stopPropagation()
        event.preventDefault()

        if (event.ctrlKey || event.metaKey) {
          // Zoom
          const amount =
            Math.log(Math.abs(delta[1]) / 2 + 1) * Math.sign(delta[1]) * 6
          const result =
            ((amount * (stateRef.current.distance / 5)) / 30) *
            (amount < 0 ? zoomSpeed : zoomSpeed * 1.3)
          const clamped = Math.min(
            maxDistance,
            Math.max(minDistance, stateRef.current.distance + result)
          )

          stateRef.current.distance = clamped
        } else {
          // Pan
          const deltaXR =
            delta[0] * -movementXVector.current.x +
            delta[1] * movementXVector.current.z
          const deltaYR =
            delta[0] * -movementYVector.current.x +
            delta[1] * movementYVector.current.z

          stateRef.current.targetX =
            stateRef.current.targetX +
            deltaXR *
              (stateRef.current.distance / moveSpeedDistanceFactor) *
              moveSpeed
          stateRef.current.targetZ =
            stateRef.current.targetZ +
            deltaYR *
              (stateRef.current.distance / moveSpeedDistanceFactor) *
              moveSpeed
        }

        invalidate()

        return false
      },
      onPinch: ({ event, delta }) => {
        event.stopPropagation()
        event.preventDefault()

        const d = Math.sqrt(delta[0] ** 2 + delta[1] ** 2) * Math.sign(delta[1])
        const amount = Math.log(Math.abs(d) / 2 + 1) * Math.sign(d) * 6
        const result =
          ((amount * (stateRef.current.distance / 5)) / 30) *
          (amount < 0 ? zoomSpeed : zoomSpeed * 1.3)
        const clamped = Math.min(
          maxDistance,
          Math.max(minDistance, stateRef.current.distance + result)
        )

        stateRef.current.distance = clamped

        invalidate()
        return false
      }
    },
    {
      domTarget: gl.domElement,
      eventOptions: { passive: false, capture: true }
    }
  )
  useEffect(bind, [bind])

  // Fix for iOS Scrolling
  useEffect(() => {
    document.addEventListener(
      'touchmove',
      (event) => {
        event = event.originalEvent || event
        if (event.scale !== 1) {
          event.preventDefault()
        }
      },
      false
    )
  }, [])

  return null
})
