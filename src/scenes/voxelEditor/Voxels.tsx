import { Instance, Instances } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import {
  cellKey,
  cellToWorld,
  inBounds,
  type Cell,
  type Voxel,
} from './coords'
import type { Tool } from './useVoxelEditor'

interface Props {
  voxels: Voxel[]
  onAdd: (cell: Cell) => void
  onRemove: (cell: Cell) => void
  tool: Tool
}

const MAX_INSTANCES = 8000

export function Voxels({ voxels, onAdd, onRemove, tool }: Props) {
  const handleClick = (e: ThreeEvent<MouseEvent>, voxel: Voxel) => {
    e.stopPropagation()
    if (tool === 'remove') {
      onRemove(voxel)
      return
    }
    if (!e.face) return
    const n = e.face.normal
    const target: Cell = {
      x: voxel.x + Math.round(n.x),
      y: voxel.y + Math.round(n.y),
      z: voxel.z + Math.round(n.z),
    }
    if (inBounds(target)) onAdd(target)
  }

  return (
    <Instances
      limit={MAX_INSTANCES}
      range={Math.max(voxels.length, 1)}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.78} metalness={0} />
      {voxels.map((v) => (
        <Instance
          key={cellKey(v)}
          position={cellToWorld(v)}
          color={v.color}
          onClick={(e) => handleClick(e, v)}
        />
      ))}
    </Instances>
  )
}
