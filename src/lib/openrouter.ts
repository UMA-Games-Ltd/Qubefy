export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
  name?: string
}

export interface JsonSchemaResponseFormat {
  type: 'json_schema'
  json_schema: {
    name: string
    schema: Record<string, unknown>
    strict?: boolean
  }
}

export interface JsonObjectResponseFormat {
  type: 'json_object'
}

export type ResponseFormat = JsonSchemaResponseFormat | JsonObjectResponseFormat

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  response_format?: ResponseFormat
  temperature?: number
  max_tokens?: number
  top_p?: number
  seed?: number
  stop?: string | string[]
}

export interface ChatChoice {
  index: number
  message: ChatMessage
  finish_reason: string | null
}

export interface ChatResponse {
  id: string
  model: string
  choices: ChatChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class ChatError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = 'ChatError'
    this.status = status
    this.body = body
  }
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  })

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new ChatError(res.status, text, `Non-JSON response (${res.status})`)
  }

  if (!res.ok) {
    const msg =
      (parsed as { error?: string | { message?: string } } | null)?.error
    const message =
      typeof msg === 'string'
        ? msg
        : msg && typeof msg === 'object' && 'message' in msg
          ? String(msg.message)
          : `Request failed (${res.status})`
    throw new ChatError(res.status, parsed, message)
  }

  return parsed as ChatResponse
}
