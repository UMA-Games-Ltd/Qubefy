import { useEffect, useMemo, useReducer, useRef } from 'react'
import {
  cellIndex,
  cellKey,
  DEFAULT_GRID_SIZE,
  PALETTE,
  type Cell,
  type GridSize,
  type Voxel,
} from './coords'

export type Tool = 'add' | 'remove'

type Op =
  | { kind: 'add'; voxel: Voxel }
  | { kind: 'remove'; voxel: Voxel }
  | { kind: 'clear'; voxels: Voxel[] }

interface State {
  voxels: Map<string, Voxel>
  occupancy: Uint8Array
  size: GridSize
  history: Op[]
  color: string
  tool: Tool
  // Bumped on every full scene replacement (LOAD_SCENE). Consumers key
  // animation-bearing components on it so a new generation always replays the
  // entrance animation and never inherits stale per-cell anim refs.
  sceneVersion: number
}

export type Action =
  | { type: 'ADD_VOXEL'; voxel: Voxel }
  | { type: 'REMOVE_VOXEL'; cell: Cell }
  | { type: 'UNDO' }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'LOAD_SCENE'; voxels: Voxel[]; size: GridSize }
  | { type: 'CLEAR' }

const HISTORY_CAP = 100

interface InitialArgs {
  initialVoxels?: Voxel[]
  initialSize?: GridSize
}

function makeInitialState(args: InitialArgs): State {
  const size = args.initialSize ?? DEFAULT_GRID_SIZE
  const voxels = new Map<string, Voxel>()
  const occupancy = new Uint8Array(size.x * size.y * size.z)
  if (args.initialVoxels) {
    for (const v of args.initialVoxels) {
      voxels.set(cellKey(v), v)
      occupancy[cellIndex(v, size)] = 1
    }
  }
  return {
    voxels,
    occupancy,
    size,
    history: [],
    color: PALETTE[17],
    tool: 'add',
    sceneVersion: 0,
  }
}

function pushOp(history: Op[], op: Op): Op[] {
  const next = history.length >= HISTORY_CAP ? history.slice(1) : history.slice()
  next.push(op)
  return next
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_VOXEL': {
      const i = cellIndex(action.voxel, state.size)
      if (state.occupancy[i] === 1) return state
      const voxels = new Map(state.voxels)
      voxels.set(cellKey(action.voxel), action.voxel)
      const occupancy = new Uint8Array(state.occupancy)
      occupancy[i] = 1
      return {
        ...state,
        voxels,
        occupancy,
        history: pushOp(state.history, { kind: 'add', voxel: action.voxel }),
      }
    }
    case 'REMOVE_VOXEL': {
      const i = cellIndex(action.cell, state.size)
      if (state.occupancy[i] === 0) return state
      const key = cellKey(action.cell)
      const existing = state.voxels.get(key)
      if (!existing) return state
      const voxels = new Map(state.voxels)
      voxels.delete(key)
      const occupancy = new Uint8Array(state.occupancy)
      occupancy[i] = 0
      return {
        ...state,
        voxels,
        occupancy,
        history: pushOp(state.history, { kind: 'remove', voxel: existing }),
      }
    }
    case 'UNDO': {
      if (state.history.length === 0) return state
      const op = state.history[state.history.length - 1]
      const voxels = new Map(state.voxels)
      const occupancy = new Uint8Array(state.occupancy)
      if (op.kind === 'add') {
        voxels.delete(cellKey(op.voxel))
        occupancy[cellIndex(op.voxel, state.size)] = 0
      } else if (op.kind === 'remove') {
        voxels.set(cellKey(op.voxel), op.voxel)
        occupancy[cellIndex(op.voxel, state.size)] = 1
      } else {
        for (const v of op.voxels) {
          voxels.set(cellKey(v), v)
          occupancy[cellIndex(v, state.size)] = 1
        }
      }
      return { ...state, voxels, occupancy, history: state.history.slice(0, -1) }
    }
    case 'SET_COLOR':
      return { ...state, color: action.color }
    case 'SET_TOOL':
      return { ...state, tool: action.tool }
    case 'LOAD_SCENE': {
      const voxels = new Map<string, Voxel>()
      const occupancy = new Uint8Array(action.size.x * action.size.y * action.size.z)
      for (const v of action.voxels) {
        voxels.set(cellKey(v), v)
        occupancy[cellIndex(v, action.size)] = 1
      }
      return {
        ...state,
        voxels,
        occupancy,
        size: action.size,
        history: [],
        sceneVersion: state.sceneVersion + 1,
      }
    }
    case 'CLEAR': {
      if (state.voxels.size === 0) return state
      const snapshot = Array.from(state.voxels.values())
      const occupancy = new Uint8Array(state.size.x * state.size.y * state.size.z)
      return {
        ...state,
        voxels: new Map(),
        occupancy,
        history: pushOp(state.history, { kind: 'clear', voxels: snapshot }),
      }
    }
  }
}

export function useVoxelEditor(
  initialVoxels?: Voxel[],
  initialSize?: GridSize,
) {
  const [state, dispatch] = useReducer(
    reducer,
    { initialVoxels, initialSize },
    makeInitialState,
  )
  // Reload the editor when a fresh scene reference arrives after mount (e.g. a
  // freshly generated scene or a new size). The first render is already
  // handled by makeInitialState, so skip it here.
  const seededRef = useRef(true)
  useEffect(() => {
    if (seededRef.current) {
      seededRef.current = false
      return
    }
    if (!initialVoxels) return
    dispatch({
      type: 'LOAD_SCENE',
      voxels: initialVoxels,
      size: initialSize ?? DEFAULT_GRID_SIZE,
    })
  }, [initialVoxels, initialSize])

  const voxelList = useMemo(
    () => Array.from(state.voxels.values()),
    [state.voxels],
  )
  return { state, dispatch, voxelList }
}
