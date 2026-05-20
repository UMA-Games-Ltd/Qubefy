// Netlify Edge Function — streams OpenRouter chat completions through to the
// client. Lives on Deno Deploy at the CDN edge, which has no 26 s synchronous
// cap and is designed for streamed responses.

declare const Netlify: { env: { get(name: string): string | undefined } }

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
  'reasoning',
] as const

type AllowedField = (typeof ALLOWED_FIELDS)[number]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const apiKey = Netlify.env.get('OPENROUTER_API_KEY')
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

  const input = raw as Record<string, unknown>
  const body: Record<string, unknown> = {}
  for (const k of ALLOWED_FIELDS as readonly AllowedField[]) {
    if (k in input) body[k] = input[k]
  }

  if (!body.model || typeof body.model !== 'string') {
    return json({ error: '`model` (string) is required' }, 400)
  }
  if (!Array.isArray(body.messages) || (body.messages as unknown[]).length === 0) {
    return json({ error: '`messages` (non-empty array) is required' }, 400)
  }

  // Force streaming and usage accounting — the client always wants both.
  body.stream = true
  body.usage = { include: true }

  const origin = req.headers.get('origin') ?? ''
  const serialized = JSON.stringify(body)
  console.log(
    `chat: → model=${String(body.model)} msgs=${(body.messages as unknown[]).length} ` +
      `max_tokens=${String(body.max_tokens ?? 'default')} ` +
      `reasoning=${body.reasoning ? JSON.stringify(body.reasoning) : 'none'} ` +
      `bodyBytes=${serialized.length}`,
  )

  let upstream: Response
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': origin,
        'X-Title': 'Qubefy',
        accept: 'text/event-stream',
      },
      body: serialized,
      // Forward client disconnects so we don't keep streaming after the user
      // navigates away.
      signal: req.signal,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('chat: upstream fetch failed', message)
    return json({ error: `Upstream fetch failed: ${message}` }, 502)
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    console.error(
      `chat: ← upstream ${upstream.status} for model=${String(body.model)} — body:\n${text}`,
    )
    return json(
      { error: `Upstream ${upstream.status}`, body: text.slice(0, 4000) },
      502,
    )
  }

  console.log(`chat: ← streaming ${upstream.status} for model=${String(body.model)}`)

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}

export const config = { path: '/api/chat' }
