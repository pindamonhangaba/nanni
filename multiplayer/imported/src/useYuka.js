import React, {
  useRef,
  useEffect,
  useState,
  useContext,
  createContext
} from 'react'
import * as THREE from 'three'
import { useFrame } from 'react-three-fiber'
import {
  GameEntity,
  EntityManager,
  FollowPathBehavior,
  OnPathBehavior,
  OffsetPursuitBehavior,
  Vector3
} from 'yuka'
import { useStore } from './state'

const context = createContext()

export function Manager({ children }) {
  const [mgr] = useState(() => new EntityManager())
  const navMesh = useStore((state) => state.navMesh)
  const refs = useStore((state) => state.refs)

  useEffect(() => {
    if (!navMesh) {
      return
    }

    const player = mgr.entities.find((item) => item.name === 'Player')
    const ghost = mgr.entities.find((item) => item.name === 'Ghost')

    // Set up player
    const followPathBehavior = new FollowPathBehavior()
    const onPathBehavior = new OnPathBehavior()

    player.maxSpeed = 2.5
    player.maxForce = 10
    followPathBehavior.active = false
    onPathBehavior.active = false
    onPathBehavior.radius = 0.01
    player.steering.add(followPathBehavior)
    player.steering.add(onPathBehavior)

    // Set up ghost
    const seekBehavior = new OffsetPursuitBehavior(player, new Vector3(1, 0, 1))
    ghost.steering.add(seekBehavior)
    ghost.maxSpeed = 2
    ghost.position.z = -5

    useStore.subscribe(
      (intersects) => findPathTo(intersects),
      (state) => state.intersects
    )

    function findPathTo(target) {
      const from = player.position
      const to = target

      const path = navMesh.findPath(from, to)

      onPathBehavior.active = true
      onPathBehavior.path.clear()
      followPathBehavior.active = true
      followPathBehavior.path.clear()

      refs.pathHelper.visible = true
      refs.pathHelper.geometry.dispose()
      refs.pathHelper.geometry = new THREE.BufferGeometry().setFromPoints(path)

      for (const point of path) {
        followPathBehavior.path.add(point)
        onPathBehavior.path.add(point)
      }
    }
  }, [navMesh])

  useFrame((state, delta) => mgr.update(delta))

  return <context.Provider value={mgr}>{children}</context.Provider>
}

export function useYuka({
  type = GameEntity,
  position = [0, 0, 0],
  name = 'unnamed'
}) {
  // This hook makes set-up re-usable
  const ref = useRef()
  const mgr = useContext(context)
  const [entity] = useState(() => new type())
  useEffect(() => {
    entity.position.set(...position)
    entity.name = name
    entity.setRenderComponent(ref, (entity) => {
      ref.current.position.copy(entity.position)
      ref.current.quaternion.copy(entity.rotation)
    })
    mgr.add(entity)
    return () => mgr.remove(entity)
  }, [])
  return [ref, entity]
}
