import { codeScheme } from './codeScheme'
import { pointsScheme } from './pointsScheme'
import type { GenerateScheme, SchemeDescriptor } from './types'

export const SCHEMES: readonly SchemeDescriptor[] = [pointsScheme, codeScheme]

export function schemeById(id: GenerateScheme): SchemeDescriptor {
  return SCHEMES.find((s) => s.id === id) ?? SCHEMES[0]
}

export type { GenerateScheme, SchemeDescriptor } from './types'
