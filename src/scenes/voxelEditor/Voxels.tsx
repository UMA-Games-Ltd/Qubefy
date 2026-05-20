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

export type NormalTuple = [number, number, number]

interface Props {
  voxels: Voxel[]
  onAdd: (cell: Cell, normal: NormalTuple) => void
  onRemove: (cell: Cell) => void
  tool: Tool
  pendingNormals: Map<string, NormalTuple>
}

const MAX_INSTANCES = 8000
const APPEAR_DUR = 0.42
const WOBBLE_FREQ = 14
const WOBBLE_DECAY = 9
const LANDING_AMP = 0.35
const OVERSHOOT_C = 2.7
const FLY_DUR = 0.65
const STAGGER_PER_LAYER = 0.07
const FLY_DIST_MIN = 18
const FLY_DIST_MAX = 30
const TINY = 0.001

type AnimEntry = {
  t0: number
  delay: number
  from: THREE.Vector3 | null
  to: THREE.Vector3
  normal: THREE.Vector3 | null
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

function easeOutBack(p: number): number {
  return (
    1 +
    (OVERSHOOT_C + 1) * Math.pow(p - 1, 3) +
    OVERSHOOT_C * Math.pow(p - 1, 2)
  )
}

export function Voxels({
  voxels,
  onAdd,
  onRemove,
  tool,
  pendingNormals,
}: Props) {
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
        obj.scale.setScalar(TINY)
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
            LANDING_AMP
          obj.scale.setScalar(1 + wobble)
        }
        continue
      }

      if (dt >= APPEAR_DUR) {
        obj.scale.set(1, 1, 1)
        obj.position.copy(anim.to)
        animRef.current.delete(key)
        continue
      }
      const p = dt / APPEAR_DUR
      const s = easeOutBack(p)
      const n = anim.normal
      if (n) {
        obj.scale.set(
          Math.abs(n.x) > 0.5 ? s : 1,
          Math.abs(n.y) > 0.5 ? s : 1,
          Math.abs(n.z) > 0.5 ? s : 1,
        )
        obj.position.set(
          anim.to.x + n.x * (s - 1) * 0.5,
          anim.to.y + n.y * (s - 1) * 0.5,
          anim.to.z + n.z * (s - 1) * 0.5,
        )
      } else {
        obj.scale.setScalar(s)
        obj.position.copy(anim.to)
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
    const nx = Math.round(e.face.normal.x)
    const ny = Math.round(e.face.normal.y)
    const nz = Math.round(e.face.normal.z)
    const target: Cell = {
      x: voxel.x + nx,
      y: voxel.y + ny,
      z: voxel.z + nz,
    }
    if (inBounds(target)) onAdd(target, [nx, ny, nz])
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
                  let normal: THREE.Vector3 | null = null
                  const pending = pendingNormals.get(k)
                  if (pending) {
                    normal = new THREE.Vector3(
                      pending[0],
                      pending[1],
                      pending[2],
                    )
                    pendingNormals.delete(k)
                  }
                  animRef.current.set(k, {
                    t0: clock.elapsedTime,
                    delay,
                    from,
                    to,
                    normal,
                  })
                  if (from) {
                    o.position.copy(from)
                    o.scale.setScalar(TINY)
                  } else if (normal) {
                    o.scale.set(
                      Math.abs(normal.x) > 0.5 ? TINY : 1,
                      Math.abs(normal.y) > 0.5 ? TINY : 1,
                      Math.abs(normal.z) > 0.5 ? TINY : 1,
                    )
                    o.position.set(
                      to.x + normal.x * (TINY - 1) * 0.5,
                      to.y + normal.y * (TINY - 1) * 0.5,
                      to.z + normal.z * (TINY - 1) * 0.5,
                    )
                  } else {
                    o.position.copy(to)
                    o.scale.setScalar(TINY)
                  }
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
