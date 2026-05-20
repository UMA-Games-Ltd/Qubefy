export interface GenerateModel {
  id: string
  label: string
  tag?: string
}

export const GENERATE_MODELS: GenerateModel[] = [
  { id: 'anthropic/claude-haiku-4.5', label: 'Haiku', tag: 'fast' },
  { id: 'google/gemini-3.5-flash', label: 'Gemini Flash', tag: 'fast' },
  { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview', tag: 'fast' },
  { id: 'moonshotai/kimi-k2.5', label: 'Kimi 2.5' },
  { id: 'x-ai/grok-4.20', label: 'Grok' },
  { id: 'openai/gpt-5.5', label: 'GPT-5.5', tag: 'smart' },
]
