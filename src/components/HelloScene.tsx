import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { Group } from 'three'

const VOXEL_SIZE = 0.95

const voxels: { position: [number, number, number]; color: string }[] = [
  { position: [0, 0, 0], color: '#a78bfa' },
  { position: [1, 0, 0], color: '#8b5cf6' },
  { position: [-1, 0, 0], color: '#c4b5fd' },
  { position: [0, 1, 0], color: '#7c3aed' },
  { position: [0, 0, 1], color: '#ec4899' },
  { position: [0, 0, -1], color: '#f472b6' },
  { position: [1, 1, 0], color: '#22d3ee' },
  { position: [-1, 0, 1], color: '#38bdf8' },
  { position: [1, 0, -1], color: '#60a5fa' },
]

function VoxelCluster() {
  const groupRef = useRef<Group>(null)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y += delta * 0.35
    groupRef.current.rotation.x += delta * 0.08
  })

  return (
    <group ref={groupRef}>
      {voxels.map((v, i) => (
        <mesh key={i} position={v.position} castShadow receiveShadow>
          <boxGeometry args={[VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE]} />
          <meshStandardMaterial
            color={v.color}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  )
}

export function HelloScene() {
  return (
    <Canvas
      camera={{ position: [4, 3.2, 5], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-4, -2, -3]} intensity={0.3} color="#7c3aed" />
      <VoxelCluster />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate={false}
      />
    </Canvas>
  )
}
