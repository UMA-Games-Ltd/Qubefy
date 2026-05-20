import type { Context } from '@netlify/functions'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const ALLOWED_FIELDS = [
  'model',
  'messages',
  'response_format',
  'temperature',
  'max_tokens',
  'top_p',
  'seed',
  'stop',
] as const

type AllowedField = (typeof ALLOWED_FIELDS)[number]

function pick(input: Record<string, unknown>): Record<AllowedField, unknown> {
  const out: Partial<Record<AllowedField, unknown>> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in input) out[key] = input[key]
  }
  return out as Record<AllowedField, unknown>
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return json({ error: 'OPENROUTER_API_KEY is not configured' }, 500)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return json({ error: 'Body must be a JSON object' }, 400)
  }

  const body = pick(raw as Record<string, unknown>)

  if (!body.model || typeof body.model !== 'string') {
    return json({ error: '`model` (string) is required' }, 400)
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: '`messages` (non-empty array) is required' }, 400)
  }

  const origin = req.headers.get('origin') ?? ''

  const upstream = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': origin,
      'X-Title': 'Qubefy',
    },
    body: JSON.stringify(body),
  })

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  })
}

export const config = {
  path: '/api/chat',
}
