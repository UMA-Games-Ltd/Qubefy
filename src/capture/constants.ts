import { MAX_GRID_AXIS } from '../scenes/voxelEditor/coords'

// Safety stop for the voxel worker: never accept more writes than a full
// MAX_GRID_AXIS³ grid could physically hold. The prompt steers the model with
// per-complexity grid-size envelopes; this constant only guards runaway
// snippets, it is not a budget the model should reason about.
export const MAX_VOXELS = MAX_GRID_AXIS * MAX_GRID_AXIS * MAX_GRID_AXIS
