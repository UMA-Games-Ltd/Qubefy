import { useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { GRID_SIZE, inBounds, worldToCell, type Cell } from './coords'

interface Props {
  onAdd: (cell: Cell) => void
  enabled: boolean
}

export function BasePlane({ onAdd, enabled }: Props) {
  const linesRef = useRef<THREE.LineSegments>(null)

  const lineGeometry = useMemo(() => {
    const points: number[] = []
    const half = GRID_SIZE / 2
    for (let i = 0; i <= GRID_SIZE; i++) {
      const t = i - half
      points.push(-half, 0, t, half, 0, t)
      points.push(t, 0, -half, t, 0, half)
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    )
    return geom
  }, [])

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
    const cell = worldToCell({ x: e.point.x, z: e.point.z }, 0)
    if (inBounds(cell)) onAdd(cell)
  }

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onClick={handleClick}
        receiveShadow
      >
        <planeGeometry args={[GRID_SIZE, GRID_SIZE]} />
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
