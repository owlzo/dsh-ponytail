// Host-half checks: rules per level, the command family, the metrics fold, the
// ledger CSV, the debt scan, and the /ponytail/api routes. Runs the real apply()
// against a stub context, so it needs no Harness process.

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

delete process.env.PONYTAIL_DEFAULT_MODE
delete process.env.PONYTAIL_HIDE_STATUS
// The effective default reads env before config.json, so pinning it keeps every
// harness on `full` even after the config test writes another default.
process.env.PONYTAIL_DEFAULT_MODE = 'full'

const home = await mkdtemp(join(tmpdir(), 'pt-host-'))
process.env.XDG_CONFIG_HOME = home

const { apply } = await import('../index.js')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function fakeRes() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(body) { this.body = body === undefined ? undefined : JSON.parse(body) },
  }
}

function fakeReq(method, url, body, headers = {}, peer = '127.0.0.1') {
  return {
    method,
    url,
    headers,
    socket: { remoteAddress: peer },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
}

async function harness(config = {}) {
  // One ledger home per case: the board counts every file in the config dir.
  const home = config.home ?? await mkdtemp(join(tmpdir(), 'pt-case-'))
  process.env.XDG_CONFIG_HOME = home
  const commands = new Map()
  const skills = []
  const sections = []
  const listeners = new Map()
  const calls = { followup: [] }
  let route
  const cwd = config.cwd ?? home
  const session = { id: 'session-1', header: { cwd, createdAt: 1_700_000_000_000 } }
  if (config.sessionLog !== undefined) session.snapshotEvents = () => config.sessionLog
  const ctx = {
    effect(fn) { const disposer = fn(); return typeof disposer === 'function' ? disposer : () => {} },
    on(name, listener) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(listener)
      return () => {}
    },
    get(name) {
      if (name === 'agents') return { get: id => (id === 'session-1' ? { followup: message => calls.followup.push(message) } : undefined) }
      if (name === 'workingDirectory') return { get: () => cwd }
      return undefined
    },
    systemPrompt: { section(section) { sections.push(section); return () => {} } },
    commands: { register(definition) { commands.set(definition.name, definition); return () => {} } },
    skills: { register(skill) { skills.push(skill); return () => {} } },
    webServer: { register(entry) { route = entry; return () => {} } },
    sessions: { get: id => (id === 'session-1' ? session : undefined) },
    logger: { info() {} },
  }
  apply(ctx, config)
  await sleep(10)
  const emit = (name, ...args) => (listeners.get(name) ?? []).forEach(listener => listener(...args))
  const get = async (path, peer) => {
    const res = fakeRes()
    await route.handler(fakeReq('GET', path, undefined, {}, peer), res)
    return res
  }
  const post = async (path, body, headers, peer) => {
    const res = fakeRes()
    await route.handler(fakeReq('POST', path, body, headers, peer), res)
    return res
  }
  const run = (name, rawInput = '') => commands.get(name).handler({ rawInput, agent: { id: 'session-1' } })
  const runAs = (name, rawInput, agentId) => commands.get(name).handler({ rawInput, agent: { id: agentId } })
  return { commands, skills, sections, emit, get, post, run, runAs, session, calls, home }
}

test('the rules section follows the level and drops the other levels’ rows', async () => {
  const h = await harness()
  const section = h.sections[0]
  assert.equal(section.name, 'ponytail:rules')
  assert.equal(section.order, 650)
  assert.equal(section.interpolate, false)

  const asSession = { agent: { id: 'session-1' } }
  assert.equal(section.text(), '', 'no agent, no rules')
  assert.equal(section.text(asSession), '', 'a fresh session starts off')

  await h.run('ponytail', 'full')
  const full = section.text(asSession)
  assert.match(full, /^PONYTAIL MODE ACTIVE — level: full/)
  assert.match(full, /\| \*\*full\*\* \|/)
  assert.doesNotMatch(full, /\| \*\*lite\*\* \|/)
  assert.doesNotMatch(full, /\| \*\*ultra\*\* \|/)
  assert.match(full, /Does it need to exist\?/)

  await h.run('ponytail', 'ultra')
  const ultra = section.text(asSession)
  assert.match(ultra, /^PONYTAIL MODE ACTIVE — level: ultra/)
  assert.match(ultra, /\| \*\*ultra\*\* \|/)
  assert.doesNotMatch(ultra, /\| \*\*full\*\* \|/)

  await h.run('ponytail', 'off')
  assert.equal(section.text(asSession), '')
  assert.equal(section.text({ agent: { id: 'session-2' } }), '', 'another session stays off')
})

test('the six upstream skills ride along', async () => {
  const h = await harness()
  const names = h.skills.map(skill => skill.name).sort()
  assert.deepEqual(names, ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review'])
  for (const skill of h.skills) {
    assert.equal(skill.source, 'bundled')
    assert.match(skill.content, /^---/)
    assert.ok(skill.description.length > 20, `${skill.name} keeps its description`)
  }
})

test('/ponytail switches level, reports, and persists the default', async () => {
  const h = await harness()
  const changed = await h.run('ponytail', 'lite')
  assert.equal(changed.kind, 'success')
  assert.equal(changed.text, 'PONYTAIL 本会话级别已切换为 lite。')

  const reported = await h.run('ponytail', '')
  assert.equal(reported.text, 'PONYTAIL 当前会话级别：lite')

  const off = await h.run('ponytail', 'off')
  assert.equal(off.text, 'PONYTAIL 本会话已关闭，不再注入规则。')

  const back = await h.run('ponytail', '')
  assert.equal(back.text, 'PONYTAIL 本会话已开启，级别：full')

  const bad = await h.run('ponytail', 'ultra-max')
  assert.equal(bad.kind, 'error')

  const saved = await h.run('ponytail', 'default ultra')
  assert.equal(saved.text, 'PONYTAIL 开启级别已设为 ultra：会话的开关打开时用这个级别。')
  const state = JSON.parse(await readFile(join(h.home, 'ponytail', 'state.json'), 'utf8'))
  assert.equal(state.default, 'ultra')
})

test('/ponytail band toggles the band without touching the level', async () => {
  const h = await harness()
  const hidden = await h.run('ponytail', 'band off')
  assert.match(hidden.text, /^PONYTAIL 横条已隐藏/)
  const payload = (await h.get('/ponytail/api/band?session=session-1')).body
  assert.equal(payload.band, false)
  assert.equal(payload.level, 'off')

  const shown = await h.run('ponytail', 'band on')
  assert.match(shown.text, /^PONYTAIL 横条已显示/)
  assert.equal((await h.get('/ponytail/api/band?session=session-1')).body.band, true)
})

test('the metrics fold counts turns, tokens, time, reuse, tests and cost', async () => {
  const h = await harness({ prices: { 'deepseek-v4.1-flash': { input: 1, output: 2, cacheRead: 0 } } })
  const emit = h.emit
  emit('session/event', h.session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  emit('session/event', h.session, { type: 'user/message', time: 1_001, data: { content: [{ type: 'text', text: '把插件做好' }], source: { kind: 'user' } } })
  emit('session/event', h.session, { type: 'assistant/message', time: 2_000, data: { message: { source: { model: 'deepseek-v4.1-flash' } }, usage: { inputTokens: 1_000, outputTokens: 200, cacheReadTokens: 300 } } })
  emit('session/event', h.session, { type: 'tool/call', data: { name: 'edit', arguments: JSON.stringify({ file_path: 'a.js' }) } })
  emit('session/event', h.session, { type: 'tool/call', data: { name: 'edit', arguments: JSON.stringify({ file_path: 'b.js' }) } })
  emit('session/event', h.session, { type: 'tool/call', data: { name: 'write', arguments: JSON.stringify({ file_path: 'c.js' }) } })
  emit('session/event', h.session, { type: 'tool/call', data: { name: 'pwsh', arguments: JSON.stringify({ command: 'npm test' }) } })
  emit('session/event', h.session, { type: 'tool/result', data: { message: { content: [{ type: 'text', text: '12 passed' }] } } })
  emit('session/event', h.session, { type: 'turn/end', time: 61_000, data: { turn: 1, reason: { kind: 'completed' } } })

  const payload = (await h.get('/ponytail/api/band?session=session-1')).body
  assert.equal(payload.task.turns, 1)
  assert.equal(payload.task.busyMs, 60_000)
  assert.equal(payload.task.totalTokens, 1_500)
  assert.equal(payload.task.startedAt, 1_700_000_000_000)
  assert.equal(payload.task.tokens.cacheRead, 300)
  assert.equal(payload.task.reused, 2)
  assert.equal(payload.task.created, 1)
  assert.equal(payload.task.reuse, 67)
  assert.equal(payload.task.tests.state, 'pass')
  assert.equal(payload.task.tests.passed, 12)
  assert.equal(payload.task.name, '把插件做好')
  assert.equal(payload.task.model, 'deepseek-v4.1-flash')
  assert.equal(payload.task.priced, true)
  assert.ok(Math.abs(payload.task.cost - 0.0014) < 1e-9, `cost ${payload.task.cost}`)

  const other = (await h.get('/ponytail/api/band?session=missing')).body
  assert.equal(other.task, null)
})

test('the lever writes one CSV row per task in upstream’s format', async () => {
  const h = await harness()
  await h.run('ponytail', 'full')
  const emit = h.emit
  emit('session/event', h.session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  emit('session/event', h.session, { type: 'assistant/message', time: 2_000, data: { message: { source: { model: 'deepseek-v4.1-flash' } }, usage: { inputTokens: 10, outputTokens: 5 } } })
  emit('session/event', h.session, { type: 'turn/end', time: 31_000, data: { turn: 1, reason: { kind: 'completed' } } })

  let csv = ''
  for (let i = 0; i < 40 && !csv.includes('session'); i += 1) {
    await sleep(25)
    csv = await readFile(join(h.home, 'ponytail', 'band', `${h.session.header.cwd.split(/[\\/]/).pop().replace(/[^\w.-]/g, '_')}.csv`), 'utf8').catch(() => '')
  }
  const lines = csv.trim().split('\n')
  assert.equal(lines[0], 'key,started,project,name,cost_usd,turns,agent_minutes,tokens_total,tokens_output,reuse_pct,reused,new,callers_open,tests,level,model,session')
  assert.equal(lines.length, 2)
  const cells = lines[1].split(',')
  assert.equal(cells.length, 17)
  assert.match(cells[0], /^session--\d+$/)
  assert.equal(cells[2], h.session.header.cwd.split(/[\\/]/).pop())
  assert.deepEqual(cells.slice(4, 16), ['', '1', '0.5', '15', '5', '', '0', '0', '0', 'not run', 'full', 'deepseek-v4.1-flash'])
  assert.equal(cells[16], 'session-1')

  const board = (await h.get('/ponytail/api/board')).body
  assert.equal(board.count, 1)
  assert.equal(board.totals.tasks, 1)
  assert.equal(board.totals.tokens, 15)
  assert.equal(board.series.length, 30)
  assert.equal(board.series[29].tokens, 15)
  assert.equal(board.series[0].tokens, 0)
  assert.equal(board.priced, false)
  assert.equal(board.totals.unpriced, 1)
  assert.equal(board.rows[0].session, 'session-1')
  assert.equal(board.rows[0].started.length, 16)
})

test('/ponytail-debt harvests markers and flags the ones with no trigger', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pt-debt-'))
  await mkdir(join(cwd, 'src'), { recursive: true })
  await writeFile(join(cwd, 'src', 'a.js'), '// shortcut: 只支持 JSON，等需要二进制再改\nconst a = 1\n', 'utf8')
  await writeFile(join(cwd, 'src', 'b.js'), '/* ponytail: 单线程就够 */\nconst b = 2\n', 'utf8')
  const h = await harness({ cwd })
  const result = await h.run('ponytail-debt')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /src\/a\.js:1，只支持 JSON，等需要二进制再改。上限：只支持 JSON。改期：等需要二进制再改。/)
  assert.match(result.text, /src\/b\.js:1，单线程就够。上限：单线程就够。改期：未写明。［缺少触发条件］/)
  assert.match(result.text, /共 2 条标记，其中 1 条没写触发条件。/)
})

test('a clean repo says so', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pt-clean-'))
  await writeFile(join(cwd, 'a.txt'), 'nothing here\n', 'utf8')
  const h = await harness({ cwd })
  const result = await h.run('ponytail-debt')
  assert.equal(result.text, '没有 shortcut 债务，账本干净。')
})

test('the level route takes a same-origin write and refuses a foreign one', async () => {
  const h = await harness()
  const refused = await h.post('/ponytail/api/level', { session: 'session-1', level: 'lite' }, { origin: 'http://evil.example', host: '127.0.0.1:3080' })
  assert.equal(refused.status, 403)
  assert.equal((await h.get('/ponytail/api/band?session=session-1')).body.level, 'off')

  const accepted = await h.post('/ponytail/api/level', { session: 'session-1', level: 'lite' }, { origin: 'http://127.0.0.1:3080', host: '127.0.0.1:3080' })
  assert.equal(accepted.status, 200)
  assert.equal((await h.get('/ponytail/api/band?session=session-1')).body.level, 'lite')

  const invalid = await h.post('/ponytail/api/level', { level: 'turbo' }, { host: '127.0.0.1:3080' })
  assert.equal(invalid.status, 400)

  const noSession = await h.post('/ponytail/api/level', { level: 'full' }, { host: '127.0.0.1:3080' })
  assert.equal(noSession.status, 400)
})

test('each session carries its own level', async () => {
  const h = await harness()
  await h.runAs('ponytail', 'full', 'session-a')
  await h.runAs('ponytail', 'lite', 'session-b')

  const a = (await h.get('/ponytail/api/band?session=session-a')).body
  const b = (await h.get('/ponytail/api/band?session=session-b')).body
  const c = (await h.get('/ponytail/api/band?session=session-c')).body
  assert.equal(a.level, 'full')
  assert.equal(b.level, 'lite')
  assert.equal(c.level, 'off', 'a session nobody touched stays off')

  assert.match(h.sections[0].text({ agent: { id: 'session-a' } }), /level: full/)
  assert.match(h.sections[0].text({ agent: { id: 'session-b' } }), /level: lite/)
  assert.equal(h.sections[0].text({ agent: { id: 'session-c' } }), '')

  const state = JSON.parse(await readFile(join(h.home, 'ponytail', 'state.json'), 'utf8'))
  assert.deepEqual(state.sessions, { 'session-a': 'full', 'session-b': 'lite' })
})

test('“normal mode” typed alone turns the level off', async () => {
  const h = await harness()
  await h.run('ponytail', 'full')
  h.emit('agent/pre-step', { agent: { id: 'session-1' }, messages: [{ content: [{ type: 'text', text: 'normal mode' }], source: { kind: 'user' } }] }, () => {})
  await sleep(20)
  assert.equal(h.sections[0].text({ agent: { id: 'session-1' } }), '')

  const h2 = await harness()
  await h2.run('ponytail', 'full')
  h2.emit('agent/pre-step', { agent: { id: 'session-1' }, messages: [{ content: [{ type: 'text', text: 'add a normal mode toggle' }], source: { kind: 'user' } }] }, () => {})
  await sleep(20)
  assert.match(h2.sections[0].text({ agent: { id: 'session-1' } }), /^PONYTAIL MODE ACTIVE — level: full/)
})

test('/ponytail-review hands the skill body to the agent', async () => {
  const h = await harness()
  const result = await h.run('ponytail-review', 'uncommitted')
  assert.equal(result.kind, 'success')
  assert.equal(h.calls.followup.length, 1)
  const message = h.calls.followup[0]
  assert.equal(message.role, 'user')
  assert.match(message.content[0].text, /review/i)
  assert.match(message.content[0].text, /本次范围：uncommitted/)
  assert.match(message.content[0].text, /报告用中文写/)
  assert.ok(typeof message.id === 'string' && message.id.length > 10)
})


test('a multi-line first prompt stays one ledger row', async () => {
  const h = await harness()
  await h.run('ponytail', 'full')
  const emit = h.emit
  emit('session/event', h.session, { type: 'user/message', data: { content: [{ type: 'text', text: '第一行\n第二行\n第三行' }], source: { kind: 'user' } } })
  for (const turn of [1, 2]) {
    emit('session/event', h.session, { type: 'turn/start', time: 1_000 * turn, data: { turn } })
    emit('session/event', h.session, { type: 'turn/end', time: 1_000 * turn + 500, data: { turn, reason: { kind: 'completed' } } })
    await sleep(60)
  }
  await sleep(200)
  const file = join(h.home, 'ponytail', 'band', `${h.session.header.cwd.split(/[\\/]/).pop().replace(/[^\w.-]/g, '_')}.csv`)
  const csv = await readFile(file, 'utf8')
  const lines = csv.trim().split('\n')
  assert.equal(lines.length, 2, 'header plus exactly one row')
  assert.match(csv, /第一行 第二行 第三行/)
  assert.doesNotMatch(csv, /\n第二行/)
  const board = (await h.get('/ponytail/api/board')).body
  assert.equal(board.count, 1)
})

test('a model without a price is not booked as free', async () => {
  const h = await harness({ prices: { other: { input: 1, output: 1 } } })
  await h.run('ponytail', 'full')
  h.emit('session/event', h.session, { type: 'assistant/message', data: { message: { source: { model: 'unpriced-model' } }, usage: { inputTokens: 1_000_000, outputTokens: 0 } } })
  h.emit('session/event', h.session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  h.emit('session/event', h.session, { type: 'turn/end', time: 2_000, data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(200)
  const board = (await h.get('/ponytail/api/board')).body
  assert.equal(board.priced, false)
  assert.equal(board.totals.cost, 0)
  assert.equal(board.totals.unpriced, 1)
})

test('a subagent run does not become its own board row', async () => {
  process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), 'pt-case-'))
  const h = await harness()
  const child = { id: 'session-child', header: { cwd: h.session.header.cwd, createdAt: 1_700_000_100_000, parentSession: 'session-1', origin: 'subagent' } }
  h.emit('session/event', child, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  h.emit('session/event', child, { type: 'turn/end', time: 2_000, data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(200)
  const board = (await h.get('/ponytail/api/board')).body
  assert.equal(board.count, 0)
})

test('the chart fills the days between tasks', async () => {
  const h = await harness()
  await h.runAs('ponytail', 'full', 'session-old')
  await h.runAs('ponytail', 'full', 'session-new')
  const day = offset => {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    return { createdAt: date.getTime() }
  }
  const older = { id: 'session-old', header: { cwd: h.session.header.cwd, ...day(5) } }
  const newer = { id: 'session-new', header: { cwd: h.session.header.cwd, ...day(0) } }
  for (const session of [older, newer]) {
    h.emit('session/event', session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
    h.emit('session/event', session, { type: 'turn/end', time: 2_000, data: { turn: 1, reason: { kind: 'completed' } } })
    await sleep(60)
  }
  await sleep(200)
  const board = (await h.get('/ponytail/api/board')).body
  assert.equal(board.series.length, 30)
  const tasks = board.series.map(entry => entry.tasks)
  assert.equal(tasks.filter(count => count > 0).length, 2)
  assert.equal(tasks.filter(count => count === 0).length, 28)
})

test('the streak still counts when today has no task yet', async () => {
  const h = await harness()
  await h.runAs('ponytail', 'full', 'session-y')
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const session = { id: 'session-y', header: { cwd: h.session.header.cwd, createdAt: yesterday.getTime() } }
  h.emit('session/event', session, { type: 'turn/start', time: 1_000, data: { turn: 1 } })
  h.emit('session/event', session, { type: 'turn/end', time: 2_000, data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(200)
  const board = (await h.get('/ponytail/api/board')).body
  assert.equal(board.streak, 1)
})

test('two test commands in one step keep their own results', async () => {
  const h = await harness()
  h.emit('session/event', h.session, { type: 'tool/call', data: { name: 'pwsh', callId: 'call-a', arguments: JSON.stringify({ command: 'npm test' }) } })
  h.emit('session/event', h.session, { type: 'tool/call', data: { name: 'pwsh', callId: 'call-b', arguments: JSON.stringify({ command: 'pytest' }) } })
  h.emit('session/event', h.session, { type: 'tool/result', data: { message: { toolCallId: 'call-a', content: [{ type: 'text', text: '12 passed' }] } } })
  h.emit('session/event', h.session, { type: 'tool/result', data: { message: { toolCallId: 'call-b', content: [{ type: 'text', text: '3 failed' }] }, error: { name: 'ExitError', code: 'exit-1' } } })
  const payload = (await h.get('/ponytail/api/band?session=session-1')).body
  assert.equal(payload.task.tests.state, 'fail')
})

test('the api refuses a request that did not come from this machine', async () => {
  const h = await harness()
  const board = await h.get('/ponytail/api/board', '10.0.0.5')
  assert.equal(board.status, 403)
  const level = await h.post('/ponytail/api/level', { session: 'session-1', level: 'off' }, {}, '10.0.0.5')
  assert.equal(level.status, 403)
  assert.equal((await h.get('/ponytail/api/state')).body.default, 'full')
})

test('a reload mid-session keeps the first task name', async () => {
  const h = await harness()
  await h.runAs('ponytail', 'full', 'session-log')
  const withLog = {
    id: 'session-log',
    header: { cwd: h.session.header.cwd, createdAt: 1_700_000_000_000 },
    snapshotEvents: () => [
      { type: 'turn/start', time: 1_000, data: { turn: 1 } },
      { type: 'user/message', data: { content: [{ type: 'text', text: '第一件事\n带换行' }], source: { kind: 'user' } } },
      { type: 'user/message', data: { content: [{ type: 'text', text: '后面的事' }], source: { kind: 'user' } } },
      { type: 'assistant/message', time: 2_000, data: { message: { source: { model: 'deepseek-v4.1-flash' } }, usage: { inputTokens: 1_000, outputTokens: 500 } } },
      { type: 'tool/call', time: 3_000, data: { name: 'pwsh', callId: 'call-old', arguments: JSON.stringify({ command: 'node --test' }) } },
      { type: 'tool/result', time: 4_000, data: { message: { toolCallId: 'call-old', content: [{ type: 'text', text: '12 passed' }] } } },
      { type: 'turn/end', time: 60_000, data: { turn: 1, reason: { kind: 'completed' } } },
    ],
  }
  h.emit('session/event', withLog, { type: 'turn/start', time: 1_000, data: { turn: 2 } })
  h.emit('session/event', withLog, { type: 'user/message', data: { content: [{ type: 'text', text: '后面的事' }], source: { kind: 'user' } } })
  h.emit('session/event', withLog, { type: 'turn/end', time: 2_000, data: { turn: 2, reason: { kind: 'completed' } } })
  await sleep(200)
  const board = (await h.get('/ponytail/api/board')).body
  const row = board.rows.find(entry => entry.session === 'session-log')
  assert.equal(row.name, '第一件事 带换行')
  // Seeded from the log, not from the live events: the last test result and the
  // token total survive a reload.
  assert.equal(row.tests, '12 passed')
  assert.equal(row.turns, 2)
  assert.equal(row.tokens, 1_500)
})

test('the task name prefers the goal, then the title, then the first message', async () => {
  const first = { type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: '首个问题' }], source: { kind: 'user' } } }
  const title = { type: 'session/title', seq: 2, data: { title: '会话标题', messageSeqs: [], source: { kind: 'user' } } }
  const goal = (seq, phase) => ({
    type: 'goal/change',
    seq,
    data: { kind: 'goal/change', version: 1, operation: 'create', goal: { id: 'g', revision: 1, objective: '目标文本', phase, maxGoalRounds: 5 }, roundsStarted: 0, createdAt: 0, updatedAt: 0 },
  })

  const withGoal = await harness({ sessionLog: [first, title, goal(3, 'active')] })
  assert.equal((await withGoal.get('/ponytail/api/band?session=session-1')).body.task.name, '目标文本')

  const finished = await harness({ sessionLog: [first, title, goal(3, 'complete')] })
  assert.equal((await finished.get('/ponytail/api/band?session=session-1')).body.task.name, '会话标题')

  const plain = await harness({ sessionLog: [first] })
  assert.equal((await plain.get('/ponytail/api/band?session=session-1')).body.task.name, '首个问题')
})

test('the event that triggered the replay is not folded twice', async () => {
  const message = { type: 'assistant/message', seq: 2, time: 2_000, data: { message: { source: { model: 'm' } }, usage: { inputTokens: 1_000, outputTokens: 100 } } }
  const h = await harness({ sessionLog: [{ type: 'turn/start', seq: 1, time: 1_000, data: { turn: 1 } }, message] })
  h.emit('session/event', h.session, message)
  const body = (await h.get('/ponytail/api/band?session=session-1')).body
  assert.equal(body.task.totalTokens, 1_100)
})
