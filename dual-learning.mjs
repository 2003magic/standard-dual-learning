// dual-learning.mjs — zero-dependency Cordis plugin for the standard-dual-learning
// DSH agent preset. Distilled from github.com/2003magic/agent-dual-learning.
//
// Layer 1 (prevention): on agent/session-start, inject a "learn before you
//   build" directive naming the project guidance files it found.
// Layer 2 (recovery): on tools/post-execute, fingerprint failed calls; when the
//   same fingerprint repeats `threshold` times, append a "stop retrying —
//   learn, then verify once" notice to the model context. Events persist to a
//   JSONL knowledge store in the session workspace.
//
// The plugin never blocks, vetoes, or rewrites a tool call. Every listener
// delegates, every injection is advisory, and every failure of the plugin
// itself fails open. It imports only Node built-ins, so it travels with the
// preset directory and needs no npm resolution.

import {
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
  appendFileSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export const name = 'dual-learning'

const MAX_EVENT_FILE_BYTES = 1_000_000
const SOURCE = { kind: 'plugin', plugin: 'dual-learning' }

// ── helpers ─────────────────────────────────────────────────────────────────

/** Compile one `*`-wildcard pattern to an anchored RegExp (other regex metacharacters match literally). */
function wildcardToRegExp(pattern) {
  const escaped = String(pattern).replace(/[|\\{}()\[\]^$+?.]/g, String.raw`\$&`)
  return new RegExp(`^${escaped.split('*').join('.*')}$`)
}

/** Normalize a message for fuzzy comparison: drop volatile detail, keep structure. */
function normalizeText(text) {
  return String(text)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+\b/g, '<ts>')
    .replace(/(?:file:\/\/|\/Users\/|\/Volumes\/|\/home\/|\/tmp\/|\/private\/)[^\s"']+/g, '<path>')
    .replace(/\b0x[0-9a-f]{4,}\b/gi, '<hex>')
    .toLowerCase()
    .replace(/[^a-z0-9<>=:.\/@_\- \n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extract stable failure tokens: status/risk codes, exception classes, status tags. */
function extractTokens(text) {
  const tokens = new Set()
  const raw = String(text)
  const codes = raw.match(/\b\d{3,5}\b/g) ?? []
  for (const code of codes.slice(0, 8)) tokens.add(`code:${code}`)
  const classes = raw.match(/\b[A-Za-z][A-Za-z0-9]*(?:Error|Exception|Fault|Failure|Rejected|Denied|Timeout|Refused)\b/g) ?? []
  for (const cls of classes.slice(0, 4)) tokens.add(`class:${cls}`)
  const tagged = raw.match(/\b(?:status|exit[ _-]?code|error)[ _-]?[:=][ _-]?\d+/gi)
  if (tagged) tokens.add(`tag:${String(tagged[0]).toLowerCase().replace(/\s+/g, '')}`)
  return [...tokens].slice(0, 10)
}

/** Collapse a failure into one comparable fingerprint string. */
function fingerprintOf(toolName, text) {
  const tokens = extractTokens(text)
  const prefix = normalizeText(text).slice(0, 80)
  if (tokens.length === 0 && prefix.length < 6) return undefined
  return `${toolName} | ${tokens.join(' ')} | ${prefix}`.slice(0, 220)
}

/** Best-effort text out of a tool result (ToolResult content blocks, plus common error fields). */
function resultText(result) {
  if (result == null) return ''
  if (typeof result === 'string') return result
  const parts = []
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block && typeof block === 'object' && typeof block.text === 'string') parts.push(block.text)
      else if (typeof block === 'string') parts.push(block)
    }
  }
  for (const key of ['message', 'error', 'stderr', 'stdout']) {
    if (typeof result[key] === 'string') parts.push(result[key])
  }
  return parts.join('\n')
}

/** The session's workspace directory, with fallbacks (never throws). */
function workspaceOf(agent) {
  try {
    if (agent?.session?.cwd && typeof agent.session.cwd === 'string') return agent.session.cwd
  } catch { /* fall through */ }
  try {
    if (agent?.cwd && typeof agent.cwd === 'string') return agent.cwd
  } catch { /* fall through */ }
  try {
    if (typeof process.env.DSH_WORKSPACE === 'string' && process.env.DSH_WORKSPACE) return process.env.DSH_WORKSPACE
  } catch { /* fall through */ }
  return process.cwd()
}

/** Append one event line to the JSONL store, rotating the file past 1 MB. */
function appendEvent(baseDir, event) {
  try {
    const storeDir = resolve(baseDir, '.dual-learning')
    const file = join(storeDir, 'events.jsonl')
    mkdirSync(dirname(file), { recursive: true })
    try {
      const st = statSync(file)
      if (st.size > MAX_EVENT_FILE_BYTES) {
        renameSync(file, join(storeDir, 'events.prev.jsonl'))
      }
    } catch {
      // file does not exist yet — first write
    }
    appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n')
  } catch {
    // storage is best-effort; a broken store must never break the session
  }
}

/** Build a full UserMessage-shaped object (role + id + content + plugin source). */
function userMessage(text, form, summary) {
  const source = summary === undefined
    ? { ...SOURCE, form }
    : { ...SOURCE, form, summary }
  return {
    role: 'user',
    id: randomUUID(),
    content: [{ type: 'text', text }],
    source,
  }
}

// ── directive builders ──────────────────────────────────────────────────────

/** Layer 1: the learn-before-you-build directive injected at session start. */
function initDirective(workspace) {
  const guidance = []
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    if (existsSync(join(workspace, file))) guidance.push(file)
  }
  try {
    for (const file of readdirSync(join(workspace, '.cursor', 'rules'))) {
      if (file.endsWith('.mdc')) guidance.push(`.cursor/rules/${file}`)
    }
  } catch {
    // no .cursor/rules directory
  }
  const found = guidance.length > 0 ? guidance.join(', ') : 'none found — locate the project guidance yourself'
  return [
    '[dual-learning · Layer 1] Task start: learn before you build.',
    `1. Project guidance found: ${found}. Read it before changing anything.`,
    '2. If the domain is unfamiliar, fast-moving, or your knowledge may be stale,',
    '   use web_search first for current official docs and open-source implementations.',
    '3. Before coding, write a short cognitive brief: constraints, likely pitfalls,',
    '   2-3 candidate approaches. Then start with the cheapest decisive experiment.',
    '4. Persist lessons in .dual-learning/lessons.md (failure events are logged',
    '   automatically to .dual-learning/events.jsonl).',
    'Full protocol: load the dual-layer-learning skill from the skill catalog.',
  ].join('\n')
}

/** Layer 2: the stop-retrying notice injected after a same-fingerprint streak. */
function streakNotice(toolName, count, threshold, fingerprint) {
  return [
    `[dual-learning · Layer 2] ${count} consecutive failures share the same fingerprint (threshold ${threshold}).`,
    `Fingerprint: ${fingerprint}`,
    'Stop mechanical retries — a repeated same-class failure is a cognitive blind',
    'spot, not a parameter problem:',
    '1. Pause same-class attempts and name the assumption that is failing.',
    '2. Learn: web_search the fingerprint + current docs; read the source; find how',
    '   open-source projects solved it.',
    '3. Revise the hypothesis.',
    '4. Run ONE decisive validation experiment — do not sweep variants.',
    'Record the lesson in .dual-learning/lessons.md before moving on.',
  ].join('\n')
}

// ── plugin ──────────────────────────────────────────────────────────────────

/**
 * @param {object} ctx Cordis plugin context
 * @param {object} [config] raw row config (threshold, storeDir, include, exclude)
 */
export function apply(ctx, config = {}) {
  const threshold =
    Number.isInteger(config.threshold) && config.threshold >= 2 ? config.threshold : 3
  const include = Array.isArray(config.include) ? config.include.map(wildcardToRegExp) : []
  const exclude = Array.isArray(config.exclude) ? config.exclude.map(wildcardToRegExp) : []

  const chains = new WeakMap() // Agent -> { key, count }

  function tracked(toolName) {
    if (include.length > 0 && !include.some((pattern) => pattern.test(toolName))) return false
    return !exclude.some((pattern) => pattern.test(toolName))
  }

  /** Advance the agent's failure chain for one call; return a notice when it fires. */
  function observe(exec, result) {
    if (!exec?.agent) return undefined
    if (!tracked(exec.name)) return undefined
    const workspace = workspaceOf(exec.agent)
    if (result?.isError !== true) {
      chains.delete(exec.agent) // a success resets the streak
      return undefined
    }
    const fingerprint = fingerprintOf(exec.name, resultText(result))
    if (!fingerprint) return undefined
    const previous = chains.get(exec.agent)
    const count = previous && previous.key === fingerprint ? previous.count + 1 : 1
    chains.set(exec.agent, { key: fingerprint, count })
    appendEvent(workspace, { tool: exec.name, ok: false, fingerprint, count })
    if (count !== threshold && count % threshold !== 0) return undefined
    return {
      text: streakNotice(exec.name, count, threshold, fingerprint),
      summary: `${exec.name} 同类失败 ×${count}`,
    }
  }

  // Layer 1 — prevention at session start. Pure notification: seed context, never
  // gate. `agent.inject` takes a full UserMessage (role + id + content + source).
  ctx.on('agent/session-start', async ({ agent }) => {
    try {
      const workspace = workspaceOf(agent)
      if (agent && typeof agent.inject === 'function') {
        agent.inject(userMessage(initDirective(workspace), 'instructions'))
        appendEvent(workspace, { tool: 'session-start', ok: true, note: 'layer-1 directive injected', workspace })
      } else {
        appendEvent(workspace, { tool: 'session-start', ok: false, note: 'no agent.inject', workspace })
      }
    } catch (error) {
      try { appendEvent(workspaceOf(agent), { tool: 'session-start', ok: false, note: String(error) }) } catch { /* best-effort */ }
    }
  })

  // Layer 2 — recovery on tool failures. Observe-and-enrich, never veto: count
  // first, DELEGATE, then fold the notice onto whatever came back, including a
  // downstream block decision.
  ctx.on('tools/post-execute', async (exec, result, next) => {
    let notice
    try {
      notice = observe(exec, result)
    } catch {
      notice = undefined
    }
    const downstream = await next()
    if (!notice) return downstream
    const message = userMessage(notice.text, 'notice', notice.summary)
    if (downstream && downstream.kind === 'block') {
      return {
        kind: 'block',
        feedback: downstream.feedback,
        additionalContexts: [...(downstream.additionalContexts ?? []), message],
      }
    }
    return {
      ...downstream,
      additionalContexts: [...(downstream?.additionalContexts ?? []), message],
    }
  })

  // A user interjection changes the context; a streak across it is not a loop.
  // Pure reset hook: always delegates.
  ctx.on('agent/pre-step', ({ agent, messages }, next) => {
    try {
      if (
        agent &&
        Array.isArray(messages) &&
        messages.some((message) => message?.source?.kind === 'user')
      ) {
        chains.delete(agent)
      }
    } catch {
      // reset is best-effort
    }
    return next()
  })
}
