import { useCallback, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BackButton } from '../../components/editor/BackButton'
import { ColorPicker } from '../../components/editor/ColorPicker'
import { GenerationInfoPanel } from '../../components/editor/GenerationInfoPanel'
import { HomeButton } from '../../components/editor/HomeButton'
import { ShareButton } from '../../components/editor/ShareButton'
import { Toolbar } from '../../components/editor/Toolbar'
import type { GenerationInfo } from '../../capture/generateVoxelScene'
import { playAdd, playRemove } from '../../lib/sfx'
import { BasePlane } from './BasePlane'
import { Voxels, type NormalTuple } from './Voxels'
import {
  cellIndex,
  cellKey,
  PALETTE,
  type Cell,
  type GridSize,
  type Voxel,
} from './coords'
import { encodeScene } from './share'
import { useVoxelEditor } from './useVoxelEditor'

interface Props {
  active: boolean
  onBack: () => void
  onHome: () => void
  initialVoxels?: Voxel[]
  initialSize?: GridSize
  generationInfo?: GenerationInfo | null
  onDismissGenerationInfo?: () => void
}

export function VoxelEditorScene({
  active,
  onBack,
  onHome,
  initialVoxels,
  initialSize,
  generationInfo,
  onDismissGenerationInfo,
}: Props) {
  const { state, dispatch, voxelList } = useVoxelEditor(
    initialVoxels,
    initialSize,
  )
  const [pendingNormals] = useState<Map<string, NormalTuple>>(() => new Map())

  // Drop stale click-normals from the previous scene whenever a new one loads.
  // Without this, a coord shared by the old and new scene would inherit the
  // old face-pop direction.
  useEffect(() => {
    pendingNormals.clear()
  }, [state.sceneVersion, pendingNormals])

  const isOccupied = useCallback(
    (cell: Cell) => state.occupancy[cellIndex(cell, state.size)] === 1,
    [state.occupancy, state.size],
  )

  const handlePlaneAdd = useCallback(
    (cell: Cell) => {
      if (isOccupied(cell)) return
      playAdd()
      pendingNormals.set(cellKey(cell), [0, 1, 0])
      dispatch({
        type: 'ADD_VOXEL',
        voxel: { ...cell, color: state.color },
      })
    },
    [dispatch, isOccupied, pendingNormals, state.color],
  )

  const handleVoxelAdd = useCallback(
    (cell: Cell, normal: NormalTuple) => {
      if (isOccupied(cell)) return
      playAdd()
      pendingNormals.set(cellKey(cell), normal)
      dispatch({
        type: 'ADD_VOXEL',
        voxel: { ...cell, color: state.color },
      })
    },
    [dispatch, isOccupied, pendingNormals, state.color],
  )

  const handleVoxelRemove = useCallback(
    (cell: Cell) => {
      playRemove()
      dispatch({ type: 'REMOVE_VOXEL', cell })
    },
    [dispatch],
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f6efe0]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_#fffaf0_0%,_#f6efe0_55%,_#ece2cc_100%)]" />
      <div className="pointer-events-none absolute -top-32 -right-32 h-[28rem] w-[28rem] rounded-full bg-[#dd6a4a]/18 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-[#f3c44a]/15 blur-3xl" />

      <Canvas
        className="absolute inset-0"
        camera={{ position: [28, 22, 28], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        frameloop={active ? 'always' : 'demand'}
        shadows="percentage"
      >
        <hemisphereLight args={['#fbf4e6', '#cbbfa8', 0.6]} />
        <directionalLight
          position={[14, 22, 12]}
          intensity={1.05}
          color="#fff7ec"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0005}
          shadow-normalBias={0.04}
          shadow-camera-near={0.5}
          shadow-camera-far={70}
          shadow-camera-left={-22}
          shadow-camera-right={22}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
        />
        <directionalLight
          position={[-12, 8, -10]}
          intensity={0.28}
          color="#f3c44a"
        />
        <BasePlane
          onAdd={handlePlaneAdd}
          enabled={state.tool === 'add'}
          size={state.size}
          isOccupied={isOccupied}
        />
        <Voxels
          key={state.sceneVersion}
          voxels={voxelList}
          size={state.size}
          onAdd={handleVoxelAdd}
          onRemove={handleVoxelRemove}
          tool={state.tool}
          pendingNormals={pendingNormals}
          isOccupied={isOccupied}
        />
        <OrbitControls
          target={[0, 4, 0]}
          enablePan
          enableZoom
          maxPolarAngle={Math.PI / 2 - 0.01}
          minDistance={8}
          maxDistance={60}
        />
      </Canvas>

      <BackButton onClick={onBack} />
      <HomeButton onClick={onHome} />
      {generationInfo && (
        <GenerationInfoPanel
          info={generationInfo}
          onDismiss={onDismissGenerationInfo}
        />
      )}
      <ShareButton onShare={() => encodeScene(state.voxels, state.size)} />
      <ColorPicker
        palette={PALETTE}
        active={state.color}
        onPick={(color) => {
          dispatch({ type: 'SET_COLOR', color })
          dispatch({ type: 'SET_TOOL', tool: 'add' })
        }}
      />
      <Toolbar
        tool={state.tool}
        canUndo={state.history.length > 0}
        canClear={state.voxels.size > 0}
        onTool={(tool) => dispatch({ type: 'SET_TOOL', tool })}
        onUndo={() => dispatch({ type: 'UNDO' })}
        onClear={() => dispatch({ type: 'CLEAR' })}
      />
    </div>
  )
}
