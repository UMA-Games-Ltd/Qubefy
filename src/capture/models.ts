export interface GenerateModel {
  id: string
  label: string
  tag?: string
}

export const GENERATE_MODELS: GenerateModel[] = [
  { id: 'anthropic/claude-haiku-4.5', label: 'Haiku', tag: 'fast' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Sonnet', tag: 'balanced' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini Flash', tag: 'fast' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', tag: 'cheap' },
]
