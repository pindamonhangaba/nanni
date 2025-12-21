import React, { Suspense, useRef, useEffect } from 'react'
import { Line as Line_ } from 'three'
import { Canvas, extend, useLoader } from 'react-three-fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { Vehicle } from 'yuka'
import { Manager, useYuka } from './useYuka'
import { useStore } from './state'
import { Sky } from 'drei'
import ScrollControls, { useScrollControlsProps } from './ScrollControls'

extend({ Line_ })

function Player(props) {
  const [ref] = useYuka({ type: Vehicle, ...props })

  return (
    <group position={[0, 0.6, 0]}>
      <mesh ref={ref}>
        <mesh ref={ref}>
          <boxBufferGeometry args={[0.5, 1, 0.5]} attach="geometry" />
          <meshBasicMaterial color="blue" attach="material" />
        </mesh>
      </mesh>
    </group>
  )
}

function Ghost(props) {
  const [ref] = useYuka({ type: Vehicle, ...props })

  return (
    <group position={[0, 1, 0]}>
      <mesh ref={ref}>
        <boxBufferGeometry args={[0.5, 1, 0.5]} attach="geometry" />
        <meshBasicMaterial
          color="white"
          attach="material"
          opacity={0.6}
          transparent
        />
      </mesh>
    </group>
  )
}

function PathHelper(props) {
  const ref = useRef()

  // Register ref with store
  useEffect(() => {
    if (ref.current) {
      useStore.setState((state) => ({
        refs: {
          ...state.refs,
          pathHelper: ref.current
        }
      }))
    }
  }, [])

  return (
    <line_ ref={ref} visible={false} position={[0, 0.02, 0]}>
      <lineBasicMaterial color={0xff0000} attach="material" />
      <bufferGeometry attach="geometry" />
    </line_>
  )
}

function Level(props) {
  const ref = useRef()
  const level = useStore((state) => state.level)
  const { nodes } = useLoader(GLTFLoader, '/level_applied.glb')

  // Register ref with store
  useEffect(() => {
    if (ref.current) {
      useStore.setState((state) => ({
        refs: {
          ...state.refs,
          level: ref.current
        }
      }))
    }
  }, [])

  return (
    <group dispose={null} position={[0, 0, 0]}>
      <group position={[0, 0.01, 0]}>
        <mesh material={level.material} geometry={level.geometry} ref={ref} />
      </group>
      <group>
        <mesh
          rotation-x={Math.PI * -0.5}
          material={nodes.Plane001.material}
          geometry={nodes.Plane001.geometry}
        />
      </group>
    </group>
  )
}

function App() {
  const actions = useStore((state) => state.actions)
  const scrollProps = useScrollControlsProps()

  return (
    <Canvas
      onPointerMove={actions.updateMouse}
      onPointerDown={actions.handleMouseDown}
      onCreated={({ gl, camera }) => {
        gl.setPixelRatio = window.devicePixelRatio
        camera.fov = 40
        camera.aspect = window.innerWidth / window.innerHeight
        camera.near = 0.1
        camera.far = 1000
        actions.init(camera)
        actions.loadNavMesh('/navmesh_applied.glb')
      }}
    >
      <ScrollControls {...scrollProps} />
      <hemisphereLight
        position={[0, 100, 0]}
        args={[0xffffff, 0x444444, 0.6]}
      />
      <directionalLight position={[0, 20, 10]} args={[0xffffff, 0.8]} />
      <Manager>
        <Suspense fallback={null}>
          <Player name="Player" />
          <Ghost name="Ghost" />
          <Level />
          <PathHelper />
        </Suspense>
      </Manager>
      <Sky />
    </Canvas>
  )
}

export default App
