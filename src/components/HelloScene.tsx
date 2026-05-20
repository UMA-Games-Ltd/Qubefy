import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PALETTE = [
  '#dd6a4a',
  '#f3c44a',
  '#7aa84a',
  '#4d8fd6',
  '#e58aa3',
  '#b03a4a',
  '#fffaf0',
]
const COUNT = 110
const X_SPREAD = 16
const Z_SPREAD = 6
const Y_TOP = 9
const Y_BOTTOM = -9

interface RainCube {
  x: number
  z: number
  y: number
  size: number
  speed: number
  rx: number
  ry: number
  rz: number
  rxSpeed: number
  rySpeed: number
  color: THREE.Color
}

function spawn(initial: boolean): RainCube {
  return {
    x: (Math.random() - 0.5) * X_SPREAD * 2,
    z: (Math.random() - 0.5) * Z_SPREAD * 2,
    y: initial
      ? Math.random() * (Y_TOP - Y_BOTTOM) + Y_BOTTOM
      : Y_TOP + Math.random() * 4,
    size: 0.14 + Math.random() * 0.22,
    speed: 0.6 + Math.random() * 1.2,
    rx: Math.random() * Math.PI * 2,
    ry: Math.random() * Math.PI * 2,
    rz: Math.random() * Math.PI * 2,
    rxSpeed: (Math.random() - 0.5) * 0.8,
    rySpeed: (Math.random() - 0.5) * 0.8,
    color: new THREE.Color(PALETTE[Math.floor(Math.random() * PALETTE.length)]),
  }
}

function VoxelRain() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const cubes = useMemo<RainCube[]>(
    () => Array.from({ length: COUNT }, () => spawn(true)),
    [],
  )

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < cubes.length; i++) {
      mesh.setColorAt(i, cubes[i].color)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [cubes])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(delta, 0.05)
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i]
      c.y -= c.speed * dt
      c.rx += c.rxSpeed * dt
      c.ry += c.rySpeed * dt
      if (c.y < Y_BOTTOM) {
        Object.assign(c, spawn(false))
        mesh.setColorAt(i, c.color)
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
      dummy.position.set(c.x, c.y, c.z)
      dummy.rotation.set(c.rx, c.ry, c.rz)
      dummy.scale.setScalar(c.size)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.55} metalness={0.05} />
    </instancedMesh>
  )
}

interface HelloSceneProps {
  active?: boolean
}

export function HelloScene({ active = true }: HelloSceneProps = {}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 14], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      frameloop={active ? 'always' : 'demand'}
      style={{ pointerEvents: 'none' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[6, 10, 8]} intensity={1.0} color="#ffd9a4" />
      <directionalLight position={[-6, -4, -2]} intensity={0.35} color="#dd6a4a" />
      <VoxelRain />
    </Canvas>
  )
}
