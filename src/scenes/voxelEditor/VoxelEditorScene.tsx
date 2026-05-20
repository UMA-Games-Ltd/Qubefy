import { useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BackButton } from '../../components/editor/BackButton'
import { BasePlaneToggle } from '../../components/editor/BasePlaneToggle'
import { ColorBar } from '../../components/editor/ColorBar'
import { GenerationInfoPanel } from '../../components/editor/GenerationInfoPanel'
import { ShareButton } from '../../components/editor/ShareButton'
import { Toolbar } from '../../components/editor/Toolbar'
import type { GenerationInfo } from '../../capture/generateVoxelScene'
import { playAdd, playRemove } from '../../lib/sfx'
import { BasePlane } from './BasePlane'
import { Voxels, type NormalTuple } from './Voxels'
import { cellKey, PALETTE, type Cell, type Voxel } from './coords'
import { encodeScene } from './share'
import { useVoxelEditor } from './useVoxelEditor'

interface Props {
  active: boolean
  onBack: () => void
  initialVoxels?: Voxel[]
  generationInfo?: GenerationInfo | null
  onDismissGenerationInfo?: () => void
}

export function VoxelEditorScene({
  active,
  onBack,
  initialVoxels,
  generationInfo,
  onDismissGenerationInfo,
}: Props) {
  const { state, dispatch, voxelList } = useVoxelEditor(initialVoxels)
  const [showBasePlane, setShowBasePlane] = useState(true)
  const [pendingNormals] = useState<Map<string, NormalTuple>>(() => new Map())

  const handlePlaneAdd = useCallback(
    (cell: Cell) => {
      const k = cellKey(cell)
      if (!state.voxels.has(k)) {
        playAdd()
        pendingNormals.set(k, [0, 1, 0])
      }
      dispatch({
        type: 'ADD_VOXEL',
        voxel: { ...cell, color: state.color },
      })
    },
    [dispatch, pendingNormals, state.color, state.voxels],
  )

  const handleVoxelAdd = useCallback(
    (cell: Cell, normal: NormalTuple) => {
      const k = cellKey(cell)
      if (!state.voxels.has(k)) {
        playAdd()
        pendingNormals.set(k, normal)
      }
      dispatch({
        type: 'ADD_VOXEL',
        voxel: { ...cell, color: state.color },
      })
    },
    [dispatch, pendingNormals, state.color, state.voxels],
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
        {showBasePlane && (
          <BasePlane onAdd={handlePlaneAdd} enabled={state.tool === 'add'} />
        )}
        <Voxels
          voxels={voxelList}
          onAdd={handleVoxelAdd}
          onRemove={handleVoxelRemove}
          tool={state.tool}
          pendingNormals={pendingNormals}
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
      {generationInfo && (
        <GenerationInfoPanel
          info={generationInfo}
          onDismiss={onDismissGenerationInfo}
        />
      )}
      <BasePlaneToggle
        visible={showBasePlane}
        onToggle={() => setShowBasePlane((v) => !v)}
      />
      <ShareButton onShare={() => encodeScene(state.voxels)} />
      <ColorBar
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
