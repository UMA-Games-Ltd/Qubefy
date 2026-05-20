import { useEffect, useMemo, useReducer, useRef } from 'react'
import { cellKey, PALETTE, type Cell, type Voxel } from './coords'

export type Tool = 'add' | 'remove'

type Op =
  | { kind: 'add'; voxel: Voxel }
  | { kind: 'remove'; voxel: Voxel }
  | { kind: 'clear'; voxels: Voxel[] }

interface State {
  voxels: Map<string, Voxel>
  history: Op[]
  color: string
  tool: Tool
}

export type Action =
  | { type: 'ADD_VOXEL'; voxel: Voxel }
  | { type: 'REMOVE_VOXEL'; cell: Cell }
  | { type: 'UNDO' }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'LOAD_VOXELS'; voxels: Voxel[] }
  | { type: 'CLEAR' }

const HISTORY_CAP = 100

function makeInitialState(initialVoxels?: Voxel[]): State {
  const voxels = new Map<string, Voxel>()
  if (initialVoxels) {
    for (const v of initialVoxels) voxels.set(cellKey(v), v)
  }
  return {
    voxels,
    history: [],
    color: PALETTE[17],
    tool: 'add',
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
      const key = cellKey(action.voxel)
      if (state.voxels.has(key)) return state
      const voxels = new Map(state.voxels)
      voxels.set(key, action.voxel)
      return {
        ...state,
        voxels,
        history: pushOp(state.history, { kind: 'add', voxel: action.voxel }),
      }
    }
    case 'REMOVE_VOXEL': {
      const key = cellKey(action.cell)
      const existing = state.voxels.get(key)
      if (!existing) return state
      const voxels = new Map(state.voxels)
      voxels.delete(key)
      return {
        ...state,
        voxels,
        history: pushOp(state.history, { kind: 'remove', voxel: existing }),
      }
    }
    case 'UNDO': {
      if (state.history.length === 0) return state
      const op = state.history[state.history.length - 1]
      const voxels = new Map(state.voxels)
      if (op.kind === 'add') {
        voxels.delete(cellKey(op.voxel))
      } else if (op.kind === 'remove') {
        voxels.set(cellKey(op.voxel), op.voxel)
      } else {
        for (const v of op.voxels) voxels.set(cellKey(v), v)
      }
      return { ...state, voxels, history: state.history.slice(0, -1) }
    }
    case 'SET_COLOR':
      return { ...state, color: action.color }
    case 'SET_TOOL':
      return { ...state, tool: action.tool }
    case 'LOAD_VOXELS': {
      const voxels = new Map<string, Voxel>()
      for (const v of action.voxels) voxels.set(cellKey(v), v)
      return { ...state, voxels, history: [] }
    }
    case 'CLEAR': {
      if (state.voxels.size === 0) return state
      const snapshot = Array.from(state.voxels.values())
      return {
        ...state,
        voxels: new Map(),
        history: pushOp(state.history, { kind: 'clear', voxels: snapshot }),
      }
    }
  }
}

export function useVoxelEditor(initialVoxels?: Voxel[]) {
  const [state, dispatch] = useReducer(
    reducer,
    initialVoxels,
    makeInitialState,
  )
  // Reload the editor when a fresh initialVoxels reference arrives after mount
  // (e.g. a freshly generated scene). The first render is already handled by
  // makeInitialState, so skip it here.
  const seededRef = useRef(true)
  useEffect(() => {
    if (seededRef.current) {
      seededRef.current = false
      return
    }
    if (!initialVoxels) return
    dispatch({ type: 'LOAD_VOXELS', voxels: initialVoxels })
  }, [initialVoxels])

  const voxelList = useMemo(
    () => Array.from(state.voxels.values()),
    [state.voxels],
  )
  return { state, dispatch, voxelList }
}
