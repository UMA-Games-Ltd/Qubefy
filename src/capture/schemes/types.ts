import type { Voxel } from '../../scenes/voxelEditor/coords'
import type { JsonSchemaResponseFormat } from '../../lib/openrouter'
import type { EffortPreset } from '../types'

export type GenerateScheme = 'points' | 'code'

export interface SchemeDescriptor {
  id: GenerateScheme
  label: string
  hint: string
  systemPrompt: string
  jsonSchema: JsonSchemaResponseFormat['json_schema']
  parseToVoxels(content: string, effort: EffortPreset): Promise<Voxel[]>
}
