export interface GenerateModel {
  id: string
  label: string
  tag?: string
}

export const GENERATE_MODELS: GenerateModel[] = [
  { id: 'google/gemini-3.5-flash', label: 'Gemini Flash', tag: 'fast' },
  { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini Flash Lite', tag: 'fast' },
]
