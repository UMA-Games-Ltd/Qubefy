import { Instance, Instances } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
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
const APPEAR_DUR = 0.42
const WOBBLE_FREQ = 14
const WOBBLE_DECAY = 9
const OVERSHOOT_AMP = 0.28
const FLY_DUR = 0.65
const STAGGER_PER_LAYER = 0.07
const FLY_DIST_MIN = 18
const FLY_DIST_MAX = 30

type AnimEntry = {
  t0: number
  delay: number
  from: THREE.Vector3 | null
  to: THREE.Vector3
}

function randomFlyFrom(target: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1
  const phi = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - u * u)
  const dist = FLY_DIST_MIN + Math.random() * (FLY_DIST_MAX - FLY_DIST_MIN)
  return new THREE.Vector3(
    target.x + Math.cos(phi) * r * dist,
    target.y + u * dist,
    target.z + Math.sin(phi) * r * dist,
  )
}

export function Voxels({ voxels, onAdd, onRemove, tool }: Props) {
  const animRef = useRef<Map<string, AnimEntry>>(new Map())
  const refsRef = useRef<Map<string, THREE.Object3D>>(new Map())
  const seenRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const clock = useThree((s) => s.clock)

  useEffect(() => {
    const live = new Set<string>()
    for (const v of voxels) live.add(cellKey(v))
    for (const k of Array.from(animRef.current.keys())) {
      if (!live.has(k)) animRef.current.delete(k)
    }
    for (const k of Array.from(seenRef.current)) {
      if (!live.has(k)) seenRef.current.delete(k)
    }
  }, [voxels])

  useEffect(() => {
    initializedRef.current = true
  }, [])

  useFrame(() => {
    if (animRef.current.size === 0) return
    const t = clock.elapsedTime
    for (const [key, anim] of animRef.current) {
      const obj = refsRef.current.get(key)
      if (!obj) continue
      const dt = t - anim.t0 - anim.delay

      if (dt < 0) {
        obj.scale.setScalar(0.001)
        if (anim.from) obj.position.copy(anim.from)
        continue
      }

      if (anim.from) {
        if (dt < FLY_DUR) {
          const p = dt / FLY_DUR
          const ease = 1 - Math.pow(1 - p, 3)
          obj.scale.setScalar(ease)
          obj.position.set(
            anim.from.x + (anim.to.x - anim.from.x) * ease,
            anim.from.y + (anim.to.y - anim.from.y) * ease,
            anim.from.z + (anim.to.z - anim.from.z) * ease,
          )
        } else {
          const wdt = dt - FLY_DUR
          if (wdt >= APPEAR_DUR) {
            obj.scale.setScalar(1)
            obj.position.copy(anim.to)
            animRef.current.delete(key)
            continue
          }
          obj.position.copy(anim.to)
          const wobble =
            Math.sin(wdt * WOBBLE_FREQ) *
            Math.exp(-wdt * WOBBLE_DECAY) *
            OVERSHOOT_AMP
          obj.scale.setScalar(1 + wobble)
        }
      } else {
        if (dt >= APPEAR_DUR) {
          obj.scale.setScalar(1)
          animRef.current.delete(key)
          continue
        }
        const p = dt / APPEAR_DUR
        const ease = 1 - Math.pow(1 - p, 3)
        const wobble =
          Math.sin(dt * WOBBLE_FREQ) *
          Math.exp(-dt * WOBBLE_DECAY) *
          OVERSHOOT_AMP
        obj.scale.setScalar(ease + wobble)
      }
    }
  })

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
      <meshStandardMaterial roughness={0.78} metalness={0} toneMapped={false} />
      {voxels.map((v) => {
        const k = cellKey(v)
        const targetTuple = cellToWorld(v)
        return (
          <Instance
            key={k}
            color={v.color}
            onClick={(e) => handleClick(e, v)}
            ref={(o: THREE.Object3D | null) => {
              if (o) {
                refsRef.current.set(k, o)
                if (!seenRef.current.has(k)) {
                  seenRef.current.add(k)
                  const to = new THREE.Vector3(
                    targetTuple[0],
                    targetTuple[1],
                    targetTuple[2],
                  )
                  const isInitial = !initializedRef.current
                  const from = isInitial ? randomFlyFrom(to) : null
                  const delay = isInitial ? v.y * STAGGER_PER_LAYER : 0
                  animRef.current.set(k, {
                    t0: clock.elapsedTime,
                    delay,
                    from,
                    to,
                  })
                  o.position.copy(from ?? to)
                  o.scale.setScalar(0.001)
                }
              } else {
                refsRef.current.delete(k)
              }
            }}
          />
        )
      })}
    </Instances>
  )
}
