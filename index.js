// dsh-ponytail — Host half.
//
// The ponytail level is per session: a session starts off and its switch turns
// it on. It feeds three things: the always-on rules section of the system
// prompt, the `/ponytail` command family, and the band/board data the Client
// half reads over /ponytail/api.

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'ponytail'
export const inject = ['systemPrompt', 'commands', 'skills', 'webServer', 'sessions']

const ROOT = dirname(fileURLToPath(import.meta.url))
const MODES = ['off', 'lite', 'full', 'ultra']
const DEFAULT_MODE = 'full'
// Where the ledger and the state live, the same tree upstream's board reads.
const STATE_FILE = () => join(configDir(), 'state.json')
const BAND_DIR = () => join(configDir(), 'band')
const RULES_FILE = join(ROOT, 'skills', 'ponytail', 'SKILL.md')
const SKILL_DIRS = ['ponytail', 'ponytail-review', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help']

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, 'ponytail')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'ponytail')
  return join(homedir(), '.config', 'ponytail')
}

// Upstream's resolver, in its order: env, config.json, then full.
function defaultMode() {
  const env = normalizeMode(process.env.PONYTAIL_DEFAULT_MODE)
  if (env) return env
  try {
    const config = JSON.parse(readFileSync(join(configDir(), 'config.json'), 'utf8').replace(/^\uFEFF/, ''))
    const mode = normalizeMode(config.defaultMode)
    if (mode) return mode
  } catch {}
  return DEFAULT_MODE
}

function normalizeMode(mode) {
  if (typeof mode !== 'string') return null
  const normalized = mode.trim().toLowerCase()
  return MODES.includes(normalized) ? normalized : null
}

// Only a standalone phrase turns ponytail off; "add a normal mode toggle" must not.
function isDeactivationCommand(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/[.!?\s]+$/, '')
  return t === 'stop ponytail' || t === 'normal mode'
}

// The rules a level injects. Both mode-specific blocks are keyed by a level
// name, so the other levels' rows and worked examples drop out.
function filterSkillBodyForMode(body, mode) {
  const effective = normalizeMode(mode) ?? DEFAULT_MODE
  return String(body ?? '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .split(/\r?\n/)
    .filter(line => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/)
      if (tableLabel) {
        const label = normalizeMode(tableLabel[1].trim())
        if (label) return label === effective
      }
      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/)
      if (exampleLabel) {
        const label = normalizeMode(exampleLabel[1].trim())
        if (label) return label === effective
      }
      return true
    })
    .join('\n')
}

const rulesCache = new Map()
function rulesFor(mode) {
  if (!rulesCache.has(mode)) {
    let body = ''
    try {
      body = readFileSync(RULES_FILE, 'utf8')
    } catch {
      body = ''
    }
    rulesCache.set(mode, body === ''
      ? `PONYTAIL MODE ACTIVE — level: ${mode}\n\nYou are a lazy senior developer. The best code is the code never written.`
      : `PONYTAIL MODE ACTIVE — level: ${mode}\n\n${filterSkillBodyForMode(body, mode)}`)
  }
  return rulesCache.get(mode)
}

// ---------------------------------------------------------------------------
// Metrics: one fold per Session over its own event log.

const TEST_CMD = /\b(?:npm (?:run )?test|pnpm (?:run )?test|yarn (?:run )?test|node --test|pytest|python -m (?:pytest|unittest)|go test|cargo test|vitest|jest|mocha|rspec|phpunit|dotnet test|mvn (?:-\S+ )*test|gradle(?:w)? test)\b/
const MAX_TASKS = 200
const MAX_SESSIONS = 300

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.filter(block => block?.type === 'text').map(block => block.text).join(' ')
}

function pathsOf(args) {
  try {
    const parsed = JSON.parse(args)
    return [parsed?.file_path, parsed?.path, parsed?.notebook_path].filter(value => typeof value === 'string')
  } catch {
    return []
  }
}

// Bounded: a long session touching thousands of files must not keep every path.
const MAX_PATHS = 500

function addUnique(list, value) {
  if (value !== '' && list.length < MAX_PATHS && !list.includes(value)) list.push(value)
}

function testCounts(output) {
  const num = re => {
    const m = re.exec(output)
    return m ? Number(m[1]) : undefined
  }
  return {
    passed: num(/(\d+) (?:passed|passing)\b/) ?? num(/(?:ℹ |# )pass (\d+)/),
    failed: num(/(\d+) (?:failed|failing)\b/) ?? num(/(?:ℹ |# )fail (\d+)/),
  }
}

const percent = (reused, created) => reused + created < 3
  ? null
  : Math.round((reused / (reused + created)) * 100)

function costOf(task, prices) {
  const price = prices?.[task.model]
  if (price === undefined) return null
  const { input = 0, output = 0, cacheRead = input, cacheWrite = input } = price
  const t = task.tokens
  return (t.input * input + t.output * output + t.cacheRead * cacheRead + t.cacheWrite * cacheWrite) / 1_000_000
}

// What to call this task: the goal it serves, else the session title, else the
// first human prompt.
const displayName = task => task.goal || task.title || task.firstMessage || ''

const stamp = ms => {
  const d = new Date(ms)
  const two = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

const totalTokens = t => t.input + t.output + t.cacheRead + t.cacheWrite

function testsLabel(tests) {
  if (tests.state === 'pass') return `${tests.passed ?? ''} passed`.trim()
  if (tests.state === 'fail') return `${tests.failed ?? ''} failed`.trim()
  return tests.state === 'stale' ? 'stale' : 'not run'
}

// Upstream's sixteen columns, plus the full Session id so a board row can open
// its conversation. Upstream reads by column name, so the extra column is inert
// there and is dropped if a Claude Code board rewrites the file.
const CSV_HEADER = 'key,started,project,name,cost_usd,turns,agent_minutes,tokens_total,tokens_output,reuse_pct,reused,new,callers_open,tests,level,model,session'

const csvField = value => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// One row per task, replaced on every turn, so the file stays a table. Parsing
// rather than splitting lines keeps a quoted field that spans lines intact.
function upsertCsv(existing, row) {
  const table = parseCsv(existing)
  const rows = table.length > 0 && table[0][0] === 'key' ? table.slice(1) : table
  const kept = rows.filter(cells => cells[0] !== row[0])
  return [CSV_HEADER, ...kept.map(cells => cells.map(csvField).join(',')), row.map(csvField).join(',')].join('\n') + '\n'
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(cells => cells.some(cell => cell !== ''))
}

// ---------------------------------------------------------------------------
// Debt ledger: every deliberate shortcut the repo marks.

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.output', 'coverage', 'vendor', 'target', '.venv', 'venv', 'env', '__pycache__', '.cache', '.turbo', '.parcel-cache', 'Pods', '.gradle', '.idea', '.vscode', 'bin', 'obj'])
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tar', '.7z', '.exe', '.dll', '.so', '.dylib', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mp3', '.wasm', '.class', '.jar', '.bin', '.lock'])
const MAX_FILES = 4000
const MAX_FILE_BYTES = 512 * 1024

async function scanDebt(root, marker = 'shortcut|ponytail') {
  const pattern = new RegExp(`(?:#|//|/\\*|<!--)\\s*(${marker}):\\s*(.*)$`)
  const hits = []
  let files = 0
  const queue = [root]
  while (queue.length > 0 && files < MAX_FILES) {
    const dir = queue.shift()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (files >= MAX_FILES) break
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(full)
        continue
      }
      if (!entry.isFile() || SKIP_EXT.has(extname(entry.name).toLowerCase())) continue
      let info
      try {
        info = await stat(full)
      } catch {
        continue
      }
      if (info.size > MAX_FILE_BYTES) continue
      files += 1
      let text
      try {
        text = await readFile(full, 'utf8')
      } catch {
        continue
      }
      if (text.includes('\u0000')) continue
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i += 1) {
        const match = pattern.exec(lines[i])
        if (!match) continue
        const body = match[2].trim().replace(/\s*\*\/\s*$/, '').replace(/\s*-+>\s*$/, '').trim()
        // A Chinese comma separates the ceiling from the upgrade just as often.
        const comma = body.search(/[,，]/)
        const ceiling = comma === -1 ? body : body.slice(0, comma).trim()
        const upgrade = comma === -1 ? '' : body.slice(comma + 1).trim()
        hits.push({
          file: relative(root, full).split('\\').join('/'),
          line: i + 1,
          marker: match[1],
          text: body,
          ceiling,
          upgrade,
          noTrigger: upgrade === '' || /^no |^none$/i.test(upgrade),
        })
      }
    }
  }
  return { hits, files, truncated: files >= MAX_FILES }
}

function debtReport(scan) {
  if (scan.hits.length === 0) return '没有 shortcut 债务，账本干净。'
  const lines = []
  let untriggered = 0
  for (const hit of scan.hits) {
    if (hit.noTrigger) untriggered += 1
    lines.push(`${hit.file}:${hit.line}，${hit.text}。上限：${hit.ceiling}。改期：${hit.upgrade === '' ? '未写明' : hit.upgrade}。${hit.noTrigger ? '［缺少触发条件］' : ''}`)
  }
  lines.push('', `共 ${scan.hits.length} 条标记，其中 ${untriggered} 条没写触发条件。`)
  if (scan.truncated) lines.push('（扫到 4000 个文件后停止）')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// The benchmark scoreboard: the published numbers, verbatim.

const GAIN = [
  'Ponytail 5：在 Claude Code 上测的 39 个任务（Opus 5.5，每个跑 5 次），相对「不用技能」的基线：',
  '',
  '  代码行数     47%（-53%）',
  '  耗时         59%（-41%）',
  '  花费         74%（-26%）',
  '  输出 token   55%（-45%）',
  '',
  '而且 98% 的风险逻辑都带了测试，不用技能时是 68%。',
  '方法和逐任务表格：ponytail 仓库的 benchmarks/results/2026-10-07-agentic.md。',
]

const HELP = [
  'ponytail — 懒惰资深开发模式。',
  '',
  '  /ponytail [lite | full | ultra | off]     设定级别，或关掉',
  '  /ponytail band [on | off]                 显示或隐藏提示词上方的横条',
  '  /ponytail default <lite|full|ultra|off>   新会话使用的默认级别',
  '  /ponytail-review [范围]                   像会被半夜叫起来的人那样审阅这次改动',
  '  /ponytail-audit                           同样的检查，跑整个仓库',
  '  /ponytail-debt [标记词]                   把欠下的 `shortcut:` 汇成一份账本',
  '  /ponytail-gain                            实测省下来多少',
  '',
  '级别：lite 只做被要求的事；full 是默认；ultra 还会质疑需求本身。',
  '关闭：/ponytail off，或单独说「stop ponytail」「normal mode」。',
]

// ---------------------------------------------------------------------------
// Plugin

export function apply(ctx, config = {}) {
  const prices = config.prices ?? {}
  const ledger = config.ledger !== false
  // Ponytail is per session: a fresh session is off until its switch turns it on.
  let defaultLevel = defaultMode() === 'off' ? DEFAULT_MODE : defaultMode()
  let bandVisible = true
  const levels = new Map()
  const levelOf = id => levels.get(id) ?? 'off'
  const setLevel = (id, mode) => {
    levels.delete(id)
    levels.set(id, mode)
    while (levels.size > MAX_SESSIONS) levels.delete(levels.keys().next().value)
  }
  const tasks = new Map()

  const taskOf = session => {
    let task = tasks.get(session.id)
    if (task === undefined) {
      task = {
        id: session.id,
        cwd: session.header.cwd ?? '',
        project: basename(session.header.cwd ?? '') || '',
        startedAt: session.header.createdAt,
        // A subagent run is part of its parent task, not a task of its own.
        child: session.header.parentSession !== undefined || session.header.origin === 'subagent',
        firstMessage: '',
        title: '',
        goal: '',
        seededThrough: -1,
        model: '',
        turns: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        busyMs: 0,
        reused: [],
        created: [],
        tests: { state: 'none' },
        turnStart: 0,
        pendingTests: new Map(),
      }
      tasks.set(session.id, task)
      if (tasks.size > MAX_TASKS) tasks.delete(tasks.keys().next().value)
      // Replay what already happened: a reload, or a plugin installed mid-session,
      // must not show "not run" for a session that ran its tests an hour ago.
      if (!task.child) {
        try {
          for (const event of session.snapshotEvents()) {
            foldEvent(task, event, false)
            if (typeof event.seq === 'number' && event.seq > task.seededThrough) task.seededThrough = event.seq
          }
        } catch {}
      }
    }
    return task
  }

  // Read once at activation: the first prompt must already see the saved levels,
  // so nothing later has to wait on a promise for it.
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE(), 'utf8'))
    const savedDefault = normalizeMode(saved?.default)
    if (savedDefault !== null && savedDefault !== 'off') defaultLevel = savedDefault
    if (typeof saved?.band === 'boolean') bandVisible = saved.band
    if (saved?.sessions !== null && typeof saved?.sessions === 'object') {
      for (const [id, mode] of Object.entries(saved.sessions)) {
        const normalized = normalizeMode(mode)
        if (normalized !== null) levels.set(id, normalized)
      }
    }
  } catch {}

  let saving = Promise.resolve()
  const saveState = () => {
    saving = saving.then(() => writeState()).catch(() => {})
    return saving
  }
  async function writeState() {
    await mkdir(dirname(STATE_FILE()), { recursive: true })
    await writeFile(STATE_FILE(), JSON.stringify({
      default: defaultLevel,
      band: bandVisible,
      sessions: Object.fromEntries(levels),
    }, null, 2), 'utf8')
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'ponytail:rules',
    order: 650,
    interpolate: false,
    // The assembly carries its agent, so each session gets its own ruleset.
    text: context => {
      const id = context?.agent?.id ?? ''
      const mode = id === '' ? 'off' : levelOf(id)
      return mode === 'off' ? '' : rulesFor(mode)
    },
  }), 'ponytail: rules section')

  // --- skills: the six the plugin ships -------------------------------------
  for (const dir of SKILL_DIRS) {
    let body
    try {
      body = readFileSync(join(ROOT, 'skills', dir, 'SKILL.md'), 'utf8')
    } catch {
      continue
    }
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)
    const description = front === null
      ? ''
      : (/\bdescription:\s*(>-?|\|)?\s*([\s\S]*?)(?=\n[a-zA-Z-]+:|\n*$)/.exec(front[1])?.[2] ?? '')
          .split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(' ')
    ctx.effect(() => ctx.skills.register({
      name: dir,
      description: description === '' ? dir : description,
      source: 'bundled',
      provider: 'dsh-ponytail',
      content: body,
    }), `ponytail: skill ${dir}`)
  }

  // --- commands --------------------------------------------------------------
  const say = text => ({ kind: 'success', text })

  const submit = (agent, text) => {
    const live = ctx.get('agents')?.get?.(agent.id)
    if (live === undefined || typeof live.followup !== 'function') return false
    // The shape the host's own message factory produces: identified and frozen.
    live.followup(Object.freeze({
      id: randomUUID(),
      role: 'user',
      content: Object.freeze([Object.freeze({ type: 'text', text })]),
      source: Object.freeze({ kind: 'user' }),
    }))
    return true
  }

  ctx.effect(() => ctx.commands.register({
    name: 'ponytail',
    description: '为当前会话设定 ponytail 级别（lite / full / ultra / off），或显示/隐藏横条。',
    input: { hint: '[lite | full | ultra | off | band on|off | default <mode>]' },
    handler: async invocation => {
      const parts = invocation.rawInput.trim().toLowerCase().split(/\s+/).filter(Boolean)
      const arg = parts[0] ?? ''
      const sessionId = String(invocation.agent.id)

      if (arg === 'default') {
        const mode = normalizeMode(parts[1])
        if (mode === null || mode === 'off') return { kind: 'error', text: 'PONYTAIL 开启级别：请给出 lite、full 或 ultra。' }
        defaultLevel = mode
        await saveState()
        return say(`PONYTAIL 开启级别已设为 ${mode}：会话的开关打开时用这个级别。`)
      }

      if (arg === 'band') {
        const next = parts[1] === 'on' ? true : parts[1] === 'off' ? false : !bandVisible
        bandVisible = next
        await saveState()
        return say(next
          ? 'PONYTAIL 横条已显示，级别不变。'
          : 'PONYTAIL 横条已隐藏，用 /ponytail band on 可以再打开，级别不变。')
      }

      const current = levelOf(sessionId)

      if (arg === '') {
        if (current !== 'off') return say(`PONYTAIL 当前会话级别：${current}`)
        setLevel(sessionId, defaultLevel)
        await saveState()
        return say(`PONYTAIL 本会话已开启，级别：${defaultLevel}`)
      }

      const mode = normalizeMode(arg)
      if (mode === null) return { kind: 'error', text: `PONYTAIL：没有 "${arg}" 这个级别，可用 off、lite、full、ultra，或 band on|off。` }
      if (mode === 'off') {
        setLevel(sessionId, 'off')
        await saveState()
        return say('PONYTAIL 本会话已关闭，不再注入规则。')
      }
      setLevel(sessionId, mode)
      await saveState()
      return say(`PONYTAIL 本会话级别已切换为 ${mode}。`)
    },
  }), 'ponytail: level command')

  ctx.effect(() => ctx.commands.register({
    name: 'ponytail-debt',
    description: '把欠下的 `shortcut:` 注释汇成一份债务账本。',
    input: { hint: '[标记词]' },
    handler: async invocation => {
      const marker = invocation.rawInput.trim().replace(/[^\w|]/g, '')
      const cwd = ctx.get('workingDirectory')?.get?.(invocation.agent) ?? process.cwd()
      const scan = await scanDebt(cwd, marker === '' ? 'shortcut|ponytail' : marker)
      return say(debtReport(scan))
    },
  }), 'ponytail: debt command')

  ctx.effect(() => ctx.commands.register({
    name: 'ponytail-gain',
    description: '看实测省下来多少。',
    handler: () => say(GAIN.join('\n')),
  }), 'ponytail: gain command')

  ctx.effect(() => ctx.commands.register({
    name: 'ponytail-help',
    description: 'ponytail 命令速查。',
    handler: () => say(HELP.join('\n')),
  }), 'ponytail: help command')

  for (const [command, skill] of [['ponytail-review', 'ponytail-review'], ['ponytail-audit', 'ponytail-audit']]) {
    ctx.effect(() => ctx.commands.register({
      name: command,
      description: command === 'ponytail-review'
        ? '审阅这次改动：正确性、安全、真实负载、缺测试、慢路径、能删的代码。'
        : '同样的检查跑整个仓库，最重要的排前面。',
      ...(command === 'ponytail-review' ? { input: { hint: '[未提交 | 已暂存 | 分支 | PR 链接]' } } : {}),
      handler: invocation => {
        let body = ''
        try {
          body = readFileSync(join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8')
        } catch {
          return { kind: 'error', text: `PONYTAIL：插件包里缺少 ${skill} 技能文件。` }
        }
        const target = invocation.rawInput.trim()
        const text = body.replace(/^---[\s\S]*?---\s*/, '')
          + (target === '' ? '' : `\n\n本次范围：${target}`)
          + '\n\n报告用中文写，按上面的格式给全。'
        if (!submit(invocation.agent, text)) {
          return { kind: 'error', text: `PONYTAIL：这个会话现在收不了提示词，直接调用 ${skill} 技能吧。` }
        }
        return say(target === ''
          ? `PONYTAIL ${command === 'ponytail-review' ? '审阅' : '审计'}已开始，报告用中文给。`
          : `PONYTAIL ${command === 'ponytail-review' ? '审阅' : '审计'}已开始，范围：${target}，报告用中文给。`)
      },
    }), `ponytail: ${command} command`)
  }

  // --- metrics ---------------------------------------------------------------
  let writing = Promise.resolve()
  const recordTask = task => {
    // A session that never switched ponytail on is not a ponytail task.
    if (!ledger || task.project === '' || task.child || levelOf(task.id) === 'off') return
    const cost = costOf(task, prices)
    const row = [
      `${String(task.id).slice(0, 8)}-${task.startedAt}`,
      stamp(task.startedAt),
      task.project,
      displayName(task),
      // An unpriced model leaves the cell empty; writing 0.00 would claim it is free.
      cost === null ? '' : cost.toFixed(2),
      task.turns,
      (task.busyMs / 60000).toFixed(1),
      totalTokens(task.tokens),
      task.tokens.output,
      percent(task.reused.length, task.created.length),
      task.reused.length,
      task.created.length,
      0,
      testsLabel(task.tests),
      levelOf(task.id),
      task.model,
      String(task.id),
    ]
    writing = writing.then(async () => {
      const dir = BAND_DIR()
      const file = join(dir, `${task.project.replace(/[^\w.-]/g, '_')}.csv`)
      await mkdir(dir, { recursive: true })
      let existing = ''
      try {
        existing = await readFile(file, 'utf8')
      } catch {}
      await writeFile(file, upsertCsv(existing, row), 'utf8')
    }).catch(() => {})
  }

  // One fold, two callers: live events, and the session's own history when the
  // plugin first sees it. A reload must not reset the band to "not run".
  const foldEvent = (task, event, record) => {
    switch (event.type) {
      case 'turn/start':
        task.turnStart = event.time
        task.turns = Math.max(task.turns, event.data?.turn ?? 0)
        break
      case 'turn/end':
        if (task.turnStart > 0) task.busyMs += Math.max(0, event.time - task.turnStart)
        task.turnStart = 0
        task.turns = Math.max(task.turns, event.data?.turn ?? 0)
        if (record) recordTask(task)
        break
      case 'user/message':
        if (task.firstMessage === '' && event.data?.source?.kind === 'user') {
          // One line: the editor accepts multi-line prompts, and a newline here
          // would split the ledger row.
          task.firstMessage = textOf(event.data.content).replace(/\s+/g, ' ').trim().slice(0, 60)
        }
        break
      case 'assistant/message': {
        const usage = event.data?.usage
        if (usage) {
          task.tokens.input += usage.inputTokens ?? 0
          task.tokens.output += usage.outputTokens ?? 0
          task.tokens.cacheRead += usage.cacheReadTokens ?? 0
          task.tokens.cacheWrite += usage.cacheWriteTokens ?? 0
        }
        const model = event.data?.message?.source?.model
        if (typeof model === 'string' && model !== '') task.model = model
        break
      }
      case 'tool/call': {
        const tool = event.data?.name ?? ''
        const paths = pathsOf(event.data?.arguments ?? '')
        if (tool === 'edit') for (const path of paths) addUnique(task.reused, path)
        else if (tool === 'write') for (const path of paths) addUnique(task.created, path)
        else if (tool === 'bash' || tool === 'pwsh') {
          let command = ''
          try {
            command = String(JSON.parse(event.data.arguments)?.command ?? '')
          } catch {}
          // Keyed by call: tool calls run in parallel, so one slot would let a
          // second test command claim the first one's result.
          if (TEST_CMD.test(command)) task.pendingTests.set(String(event.data.callId ?? ''), command)
        }
        break
      }
      case 'tool/result': {
        const callId = String(event.data?.message?.toolCallId ?? event.data?.message?.source?.callId ?? '')
        if (task.pendingTests.has(callId)) {
          const output = textOf(event.data?.message?.content)
          const counts = testCounts(output)
          task.tests = event.data?.error === undefined
            ? { state: 'pass', passed: counts.passed, failed: counts.failed }
            : { state: 'fail', passed: counts.passed, failed: counts.failed }
          task.pendingTests.delete(callId)
        }
        break
      }
      case 'session/title':
        // The sidebar title: an LLM short title or the user's rename.
        if (typeof event.data?.title === 'string') {
          task.title = event.data.title.replace(/\s+/g, ' ').trim().slice(0, 60)
        }
        break
      case 'goal/change': {
        const goal = event.data?.goal
        const phase = goal?.phase
        task.goal = typeof goal?.objective === 'string' && phase !== 'complete'
          ? goal.objective.replace(/\s+/g, ' ').trim().slice(0, 60)
          : ''
        break
      }
      default:
        break
    }
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => {
    const task = taskOf(session)
    // The triggering event was already committed when it was raised, so the
    // replay folded it; folding it again would double its tokens.
    if (typeof event.seq === 'number' && event.seq <= task.seededThrough) return
    foldEvent(task, event, true)
  }), 'ponytail: session metrics')

  // A phrase that turns ponytail off, matched on the human's own message only.
  ctx.effect(() => ctx.on('agent/pre-step', async (payload, next) => {
    for (const message of payload.messages ?? []) {
      if (message?.source?.kind !== 'user') continue
      if (!isDeactivationCommand(textOf(message.content))) continue
      const sessionId = String(payload.agent?.id ?? '')
      if (sessionId === '' || levelOf(sessionId) === 'off') continue
      setLevel(sessionId, 'off')
      await saveState()
      break
    }
    return next()
  }), 'ponytail: deactivation')

  // --- the band and the board ------------------------------------------------
  const bandPayload = sessionId => {
    const session = ctx.sessions.get(sessionId)
    const mode = levelOf(sessionId)
    if (session === undefined) return { level: mode, default: defaultLevel, band: bandVisible, session: sessionId, task: null }
    const task = taskOf(session)
    const cost = costOf(task, prices)
    return {
      level: mode,
      default: defaultLevel,
      band: bandVisible,
      session: sessionId,
      project: task.project,
      cwd: task.cwd,
      task: {
        name: displayName(task),
        firstMessage: task.firstMessage,
        model: task.model,
        startedAt: task.startedAt,
        turns: task.turns,
        tokens: task.tokens,
        totalTokens: totalTokens(task.tokens),
        busyMs: task.busyMs,
        reused: task.reused.length,
        created: task.created.length,
        reuse: percent(task.reused.length, task.created.length),
        tests: task.tests,
        testsLabel: testsLabel(task.tests),
        cost,
        priced: cost !== null,
      },
    }
  }

  const boardPayload = async () => {
    const dir = BAND_DIR()
    let files = []
    try {
      files = (await readdir(dir)).filter(file => file.endsWith('.csv'))
    } catch {}
    const rows = []
    for (const file of files) {
      let text = ''
      try {
        text = await readFile(join(dir, file), 'utf8')
      } catch {
        continue
      }
      const table = parseCsv(text)
      if (table.length === 0) continue
      const head = table[0]
      for (const cells of table.slice(1)) {
        const get = column => cells[head.indexOf(column)] ?? ''
        rows.push({
          key: get('key'),
          started: get('started'),
          project: get('project'),
          name: get('name'),
          // Empty means "no price for this model", not "free".
          cost: get('cost_usd') === '' ? null : Number(get('cost_usd')) || 0,
          turns: Number(get('turns')) || 0,
          agentMinutes: Number(get('agent_minutes')) || 0,
          tokens: Number(get('tokens_total')) || 0,
          output: Number(get('tokens_output')) || 0,
          reuse: get('reuse_pct') === '' ? null : Number(get('reuse_pct')),
          reused: Number(get('reused')) || 0,
          created: Number(get('new')) || 0,
          tests: get('tests'),
          level: get('level'),
          model: get('model'),
          // Absent in a board written by the Claude Code plugin: the row stays,
          // it just cannot navigate.
          session: get('session'),
        })
      }
    }
    rows.sort((a, b) => (a.started < b.started ? 1 : a.started > b.started ? -1 : 0))

    const dayOf = started => started.slice(0, 10)
    const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const days = new Map()
    for (const row of rows) {
      const day = dayOf(row.started)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      const entry = days.get(day) ?? { day, tokens: 0, minutes: 0, cost: 0, tasks: 0, reuseSum: 0, reuseCount: 0, pass: 0, fail: 0 }
      entry.tokens += row.tokens
      entry.minutes += row.agentMinutes
      if (row.cost !== null) entry.cost += row.cost
      entry.tasks += 1
      if (row.reuse !== null) {
        entry.reuseSum += row.reuse
        entry.reuseCount += 1
      }
      if (/fail/i.test(row.tests)) entry.fail += 1
      else if (/pass/i.test(row.tests)) entry.pass += 1
      days.set(day, entry)
    }

    // A time chart must not draw two distant days as neighbours: the window is
    // exactly 30 days ending at the last task, empty days on the way are zero.
    const series = []
    const lastDay = [...days.keys()].sort().pop()
    if (lastDay !== undefined) {
      const byDay = new Map([...days.values()].map(entry => [entry.day, entry]))
      const cursor = new Date(`${lastDay}T00:00:00`)
      cursor.setDate(cursor.getDate() - 29)
      for (let index = 0; index < 30; index += 1) {
        const day = dayKey(cursor)
        const entry = byDay.get(day)
        series.push(entry === undefined
          ? { day, tokens: 0, minutes: 0, cost: 0, tasks: 0, reuse: null }
          : {
              day,
              tokens: entry.tokens,
              minutes: entry.minutes,
              cost: entry.cost,
              tasks: entry.tasks,
              reuse: entry.reuseCount === 0 ? null : Math.round(entry.reuseSum / entry.reuseCount),
            })
        cursor.setDate(cursor.getDate() + 1)
      }
    }

    let streak = 0
    const daySet = new Set(days.keys())
    const cursor = new Date()
    // Today may simply have no task yet; the run still counts from yesterday.
    if (!daySet.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
    for (;;) {
      if (!daySet.has(dayKey(cursor))) break
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }

    const totals = rows.reduce((acc, row) => {
      acc.tasks += 1
      acc.minutes += row.agentMinutes
      acc.tokens += row.tokens
      acc.output += row.output
      acc.turns += row.turns
      if (row.cost === null) acc.unpriced += 1
      else {
        acc.priced += 1
        acc.cost += row.cost
      }
      if (/fail/i.test(row.tests)) acc.tests.fail += 1
      else if (/pass/i.test(row.tests)) acc.tests.pass += 1
      else acc.tests.none += 1
      return acc
    }, { tasks: 0, minutes: 0, tokens: 0, output: 0, cost: 0, turns: 0, priced: 0, unpriced: 0, tests: { pass: 0, fail: 0, none: 0 } })

    const projects = [...rows.reduce((acc, row) => {
      const entry = acc.get(row.project) ?? { project: row.project, tasks: 0, minutes: 0, tokens: 0, cost: 0 }
      entry.tasks += 1
      entry.minutes += row.agentMinutes
      entry.tokens += row.tokens
      if (row.cost !== null) entry.cost += row.cost
      acc.set(row.project, entry)
      return acc
    }, new Map()).values()].sort((a, b) => b.tokens - a.tokens).slice(0, 8)

    return {
      dir,
      totals,
      series,
      streak,
      projects,
      rows: rows.slice(0, 40),
      count: rows.length,
      // A cost is only shown when at least one task actually has one.
      priced: totals.priced > 0,
    }
  }

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const readBody = async req => {
    const chunks = []
    let bytes = 0
    for await (const chunk of req) {
      bytes += chunk.length
      if (bytes > 65536) throw new Error('body too large')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  // The browser cookie guards the page, not these routes: they answer before it.
  // Only a request from this machine may read task names or switch the level.
  const isLoopback = req => {
    const address = req.socket?.remoteAddress ?? ''
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/ponytail/api',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      try {
        if (!isLoopback(req)) return json(res, 403, { error: 'forbidden' })
        if (req.method === 'GET' && url.pathname === '/ponytail/api/band') {
          return json(res, 200, bandPayload(url.searchParams.get('session') ?? ''))
        }
        if (req.method === 'GET' && url.pathname === '/ponytail/api/board') {
          return json(res, 200, await boardPayload())
        }
        if (req.method === 'GET' && url.pathname === '/ponytail/api/state') {
          return json(res, 200, { default: defaultLevel, band: bandVisible, revision: 4 })
        }
        if (req.method === 'POST' && (url.pathname === '/ponytail/api/level' || url.pathname === '/ponytail/api/band')) {
          // A write only from this page: JSON bodies cannot be sent cross-origin
          // without a preflight, and a foreign Origin never matches.
          const origin = req.headers.origin
          if (origin !== undefined && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'forbidden' })
          const body = JSON.parse((await readBody(req)) || '{}')
          if (url.pathname === '/ponytail/api/level') {
            const mode = normalizeMode(body.level)
            const sessionId = typeof body.session === 'string' ? body.session : ''
            if (mode === null || sessionId === '') return json(res, 400, { error: 'session and level are required' })
            setLevel(sessionId, mode)
          } else {
            bandVisible = body.band !== false
          }
          await saveState()
          return json(res, 200, { band: bandVisible, default: defaultLevel })
        }
        return json(res, 404, { error: 'not found' })
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'ponytail: api')

  ctx.logger?.info?.(`ponytail: per-session, default ${defaultLevel}${bandVisible ? '' : ', band hidden'}, ledger at ${BAND_DIR()}`)
}
