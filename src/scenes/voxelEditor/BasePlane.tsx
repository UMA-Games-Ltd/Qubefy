import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import {
  inBounds,
  worldToCell,
  type Cell,
  type GridSize,
} from './coords'

interface Props {
  onAdd: (cell: Cell) => void
  enabled: boolean
  size: GridSize
  isOccupied: (cell: Cell) => boolean
}

export function BasePlane({ onAdd, enabled, size, isOccupied }: Props) {
  const linesRef = useRef<THREE.LineSegments>(null)

  const lineGeometry = useMemo(() => {
    const points: number[] = []
    const halfX = size.x / 2
    const halfZ = size.z / 2
    for (let i = 0; i <= size.z; i++) {
      const t = i - halfZ
      points.push(-halfX, 0, t, halfX, 0, t)
    }
    for (let i = 0; i <= size.x; i++) {
      const t = i - halfX
      points.push(t, 0, -halfZ, t, 0, halfZ)
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    )
    return geom
  }, [size.x, size.z])

  useEffect(() => {
    return () => lineGeometry.dispose()
  }, [lineGeometry])

  // Grid lines are purely visual; clicks must fall through to the base mesh.
  useEffect(() => {
    if (linesRef.current) linesRef.current.raycast = () => {}
  }, [])

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!enabled) return
    e.stopPropagation()
    const cell = worldToCell({ x: e.point.x, z: e.point.z }, size, 0)
    if (!inBounds(cell, size) || isOccupied(cell)) return
    onAdd(cell)
  }

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleClick}
        receiveShadow
      >
        <planeGeometry args={[size.x, size.z]} />
        <meshLambertMaterial
          color="#f0e5cd"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments ref={linesRef} position={[0, 0.002, 0]} geometry={lineGeometry}>
        <lineBasicMaterial color="#7a6755" transparent opacity={0.35} />
      </lineSegments>
    </group>
  )
}
