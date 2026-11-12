// Render, contrast and interaction check of the ponytail Client half.
// Loads verify/fixture/index.html (React 18 UMD + the real client.js) with the
// real light and dark theme tokens, mounts both surfaces, clicks them, and
// prints measured DOM facts. No screenshots.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]
const CHROME = CANDIDATES.find(path => existsSync(path))
if (CHROME === undefined) throw new Error('no Chromium browser found')

const FIXTURE = 'file:///' + resolve('verify/fixture/index.html').split('\\').join('/')
for (const name of ['react.development.js', 'react-dom.development.js']) {
  if (!existsSync(resolve('verify/fixture', name))) {
    throw new Error(`missing verify/fixture/${name}; run: npm run verify:setup`)
  }
}
const PORT = 9334
const sleep = ms => new Promise(done => setTimeout(done, ms))
const profile = await mkdtemp(join(tmpdir(), 'pt-render-'))

const child = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--allow-file-access-from-files',
  '--window-size=1400,1000',
  FIXTURE,
], { stdio: 'ignore' })

async function target() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find(item => item.type === 'page' && item.url.startsWith('file://'))
      if (page) return page
    } catch {}
    await sleep(250)
  }
  throw new Error('no fixture target')
}

const page = await target()
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((done, fail) => {
  socket.addEventListener('open', done, { once: true })
  socket.addEventListener('error', fail, { once: true })
})
let nextId = 1
const pending = new Map()
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result)
})
const send = (method, params = {}) => new Promise((done, fail) => {
  const id = nextId++
  pending.set(id, { resolve: done, reject: fail })
  socket.send(JSON.stringify({ id, method, params }))
})

const evaluate = async expression => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
      return result.result.value
    } catch (error) {
      if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error
      await sleep(500)
    }
  }
  throw new Error('evaluation kept losing its context')
}

const waitFor = async (expression, label) => {
  for (let i = 0; i < 60; i += 1) {
    if (await evaluate(expression)) return true
    await sleep(120)
  }
  throw new Error(`timed out waiting for ${label}`)
}

// WCAG contrast for one element, resolving the dock card's ::before surface.
const CONTRAST_HELPER = `window.__contrast = (selector, index = 0) => {
  const el = [...document.querySelectorAll(selector)][index]
  if (!el) return null
  const parse = value => {
    const m = String(value).match(/[\\d.]+/g)
    if (!m) return null
    const [r, g, b, a = 1] = m.map(Number)
    return [r, g, b, a]
  }
  const solid = node => { const c = parse(getComputedStyle(node).backgroundColor); return c && c[3] > 0.9 ? c : null }
  const mix = (fg, bg) => [0, 1, 2].map(i => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3])))
  const pageBg = (() => { let n = document.body; while (n) { const c = solid(n); if (c) return c.slice(0, 3); n = n.parentElement } return [255, 255, 255] })()
  const background = (() => {
    const own = solid(el)
    if (own) return own.slice(0, 3)
    const card = el.closest('.pt-bar, .pt-more')
    if (card) {
      const menu = parse(getComputedStyle(card, '::before').backgroundColor)
      if (menu) return mix(menu, pageBg)
    }
    let n = el.parentElement
    while (n) { const c = solid(n); if (c) return c.slice(0, 3); n = n.parentElement }
    return pageBg
  })()
  const foreground = (parse(getComputedStyle(el).color) ?? [0, 0, 0, 1]).slice(0, 3)
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const a = lum(foreground), b = lum(background)
  return {
    fg: foreground.join(','), bg: background.join(','),
    ratio: +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)),
  }
}`

await waitFor('Boolean(window.__fixture)', 'fixture boot')
const registrations = await evaluate('window.__fixture.captured')
await evaluate(CONTRAST_HELPER)

await evaluate('window.__fixture.mountBand()')
await waitFor('document.querySelectorAll(".pt-band").length === 1', 'band render')
await sleep(150)

const offState = await evaluate(`(() => {
  const box = document.querySelector('.pt-band')
  const toggle = document.querySelector('.pt-switch')
  return {
    height: Math.round(box.getBoundingClientRect().height),
    text: box.textContent.trim().replace(/\\s+/g, ' ').slice(0, 120),
    switchChecked: toggle.getAttribute('aria-checked'),
    switchSize: [Math.round(toggle.getBoundingClientRect().width), Math.round(toggle.getBoundingClientRect().height)],
    switchTrack: getComputedStyle(toggle).backgroundColor,
    knob: getComputedStyle(toggle, '::after').backgroundColor,
    chips: document.querySelectorAll('.pt-seg button').length,
    actions: document.querySelectorAll('.pt-acts .pt-icon').length,
  }
})()`)

// The switch is the only entry when off; it turns this session on.
await evaluate(`document.querySelector('.pt-switch').click()`)
await sleep(450)
const onState = await evaluate(`(() => {
  const toggle = document.querySelector('.pt-switch')
  return {
    height: Math.round(document.querySelector('.pt-band').getBoundingClientRect().height),
    switchChecked: toggle.getAttribute('aria-checked'),
    switchTrack: getComputedStyle(toggle).backgroundColor,
    chips: [...document.querySelectorAll('.pt-seg button')].map(b => b.textContent),
    actions: document.querySelectorAll('.pt-acts .pt-icon').length,
    posts: window.__posts.slice(),
  }
})()`)

const measure = `((selector) => {
  const el = document.querySelector(selector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  return {
    width: Math.round(rect.width), height: Math.round(rect.height),
    background: style.backgroundColor, color: style.color,
    fontSize: style.fontSize, lineHeight: style.lineHeight,
    text: (el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 200),
  }
})`

const bandCollapsed = await evaluate(`${measure}('.pt-band')`)
const bar = await evaluate(`${measure}('.pt-bar')`)
const bandBox = await evaluate(`(() => {
  const bar = document.querySelector('.pt-band .pt-bar')
  const style = getComputedStyle(bar)
  return {
    radius: style.borderRadius,
    borderWidth: style.borderTopWidth,
    borderColor: style.borderTopColor,
    background: style.backgroundColor,
    height: Math.round(bar.getBoundingClientRect().height),
  }
})()`)

const chips = await evaluate(`[...document.querySelectorAll('.pt-seg button')].map(b => ({
  label: b.textContent, active: b.dataset.active, pressed: b.getAttribute('aria-pressed'),
  width: Math.round(b.getBoundingClientRect().width), height: Math.round(b.getBoundingClientRect().height),
  ratio: window.__contrast('.pt-seg button', [...document.querySelectorAll('.pt-seg button')].indexOf(b)).ratio,
}))`)
const facts = await evaluate(`${measure}('.pt-facts')`)
const icons = await evaluate(`[...document.querySelectorAll('.pt-acts .pt-icon')].map(b => ({
  label: b.getAttribute('aria-label'), size: Math.round(b.getBoundingClientRect().width),
  ratio: window.__contrast('.pt-acts .pt-icon', [...document.querySelectorAll('.pt-acts .pt-icon')].indexOf(b)).ratio,
}))`)
const bandContrast = await evaluate(`({
  name: window.__contrast('.pt-name'),
  facts: window.__contrast('.pt-facts > span'),
  factsValue: window.__contrast('.pt-facts b'),
  tests: window.__contrast('.pt-tests'),
  activeChip: window.__contrast('.pt-seg button[data-active="1"]'),
})`)

// A level chip reaches the Host with this session id.
await evaluate(`[...document.querySelectorAll('.pt-seg button')].find(b => b.textContent === 'lux' || b.textContent === 'ultra').click()`)
await sleep(450)
const afterSwitch = await evaluate(`({
  active: [...document.querySelectorAll('.pt-seg button')].filter(b => b.dataset.active === '1').map(b => b.textContent),
  posts: window.__posts.slice(),
})`)

// Switching it off hides everything but the switch.
await evaluate(`document.querySelector('.pt-switch').click()`)
await sleep(450)
const offAgain = await evaluate(`({
  checked: document.querySelector('.pt-switch').getAttribute('aria-checked'),
  chips: document.querySelectorAll('.pt-seg button').length,
  actions: document.querySelectorAll('.pt-acts .pt-icon').length,
  height: Math.round(document.querySelector('.pt-band').getBoundingClientRect().height),
})`)
await evaluate(`document.querySelector('.pt-switch').click()`)
await sleep(450)

// Review prefills and submits; the board button selects the panel.
await evaluate(`document.querySelector('.pt-acts .pt-icon[aria-label]').click()`)
await sleep(200)
const review = await evaluate('({ draft: window.__draft ?? null, submitted: window.__submitted ?? null })')
await evaluate(`document.querySelectorAll('.pt-acts .pt-icon')[3].click()`)
await sleep(150)
const panel = await evaluate('window.__selectedPanel ?? null')

// The chevron opens the second card, and closes it again.
const collapsedHeight = await evaluate('Math.round(document.querySelector(".pt-band").getBoundingClientRect().height)')
await evaluate('document.querySelector(".pt-chev").click()')
await sleep(250)
const expanded = await evaluate(`({
  more: Boolean(document.querySelector('.pt-more')),
  band: Math.round(document.querySelector('.pt-band').getBoundingClientRect().height),
  more_height: Math.round(document.querySelector('.pt-more')?.getBoundingClientRect().height ?? 0),
  text: document.querySelector('.pt-more')?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
  stats: [...document.querySelectorAll('.pt-stat')].map(stat => stat.textContent.replace(/\\s+/g, ' ').trim()),
})`)
await evaluate('document.querySelector(".pt-chev").click()')
await sleep(200)

// The board surface.
await evaluate('window.__fixture.mountBoard()')
await waitFor('document.querySelectorAll(".pt-board").length === 1', 'board render')
await sleep(200)
const boardBody = await evaluate(`(() => {
  const page = document.querySelector('.pt-board')
  const cards = [...document.querySelectorAll('.pt-card')].map(card => card.textContent.trim())
  const bars = [...document.querySelectorAll('.pt-chart > div')]
  const rows = document.querySelectorAll('.pt-table tbody tr')
  const style = getComputedStyle(page)
  return {
    width: Math.round(page.getBoundingClientRect().width),
    height: Math.round(page.getBoundingClientRect().height),
    background: style.backgroundColor,
    cards, bars: bars.length,
    barHeights: bars.slice(0, 3).map(bar => Math.round(bar.getBoundingClientRect().height)),
    emptyBars: bars.filter(bar => Math.round(bar.getBoundingClientRect().height) <= 2).length,
    rows: rows.length,
    firstRow: rows[0]?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 140) ?? null,
    headers: [...document.querySelectorAll('.pt-table th')].map(th => th.textContent),
    axis: [...document.querySelectorAll('.pt-axis span')].map(span => span.textContent),
    pills: [...document.querySelectorAll('.pt-pill')].map(pill => ({ text: pill.textContent, state: pill.dataset.state })),
    cardsSub: [...document.querySelectorAll('.pt-card .s')].map(sub => sub.textContent),
    line: (() => {
      const polyline = document.querySelector('.pt-line polyline')
      return polyline === null ? null : {
        points: polyline.getAttribute('points').split(' ').length,
        stroke: getComputedStyle(polyline).stroke,
        strokeWidth: getComputedStyle(polyline).strokeWidth,
        hasArea: Boolean(document.querySelector('.pt-line polygon')),
      }
    })(),
    stack: [...document.querySelectorAll('.pt-stack div')].map(segment => ({
      kind: segment.dataset.kind,
      width: Math.round(segment.getBoundingClientRect().width),
    })),
    legend: [...document.querySelectorAll('.pt-legend span')].map(span => span.textContent.trim()),
    rank: [...document.querySelectorAll('.pt-rank-row')].map(row => row.textContent.replace(/\\s+/g, ' ').trim()),
    clickableRows: document.querySelectorAll('.pt-table tbody tr.pt-clickable').length,
  }
})()`)

const layout = await evaluate(`(() => {
  const grid = document.querySelector('.pt-grid')
  const panels = [...document.querySelectorAll('.pt-grid > .pt-panel')]
  return {
    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    panelHeights: panels.map(panel => Math.round(panel.getBoundingClientRect().height)),
    cards: document.querySelectorAll('.pt-card').length,
    tokensPanelWidth: Math.round(panels[0].getBoundingClientRect().width),
    testsPanelWidth: Math.round(panels[1].getBoundingClientRect().width),
    barCount: document.querySelectorAll('.pt-board .pt-col').length,
    gapBelowCards: (() => {
      const cards = document.querySelector('.pt-cards').getBoundingClientRect()
      const first = panels[0].getBoundingClientRect()
      return Math.round(first.top - cards.bottom)
    })(),
  }
})()`)

// Hovering a bar shows its numbers.
await evaluate(`(() => {
  const bar = document.querySelectorAll('.pt-board .pt-chart .pt-col')[10]
  bar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
})()`)
await sleep(120)
const barTip = await evaluate(`(() => {
  const tip = document.querySelector('.pt-board .pt-chart .pt-tip')
  return tip === null ? null : { text: tip.textContent, left: tip.style.left, bottom: tip.style.bottom }
})()`)

const chartFill = await evaluate(`(() => {
  const col = document.querySelectorAll('.pt-board .pt-col')[10]
  const style = getComputedStyle(col)
  return { radius: style.borderTopLeftRadius, borderWidth: style.borderTopWidth, background: style.backgroundColor }
})()`)

// Hovering must not repaint the bar: the tip carries the number.
const hoverFill = await evaluate(`(() => {
  const col = document.querySelectorAll('.pt-board .pt-chart .pt-col')[10]
  const before = getComputedStyle(col).backgroundColor
  col.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  return { before }
})()`)
await sleep(120)
const hoverFillAfter = await evaluate(`(() => {
  const col = document.querySelectorAll('.pt-board .pt-chart .pt-col')[10]
  return { after: getComputedStyle(col).backgroundColor }
})()`)

// Hovering a reuse point shows the day and the share.
await evaluate(`(() => {
  const point = document.querySelectorAll('.pt-line-hit')[6]
  point.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
})()`)
await sleep(120)
const lineTip = await evaluate(`(() => {
  const tip = document.querySelector('.pt-board .pt-line-box .pt-tip')
  return tip === null ? null : { text: tip.textContent, left: tip.style.left, top: tip.style.top }
})()`)

// A click and an Enter on a row both open that Session.
await evaluate('document.querySelector(".pt-table tbody tr.pt-clickable").click()')
await sleep(150)
const openedByClick = await evaluate('window.__openedSession ?? null')
await evaluate(`(() => {
  window.__openedSession = null
  const row = document.querySelectorAll('.pt-table tbody tr.pt-clickable')[1]
  row.focus()
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return null
})()`)
await sleep(150)
const openedByKey = await evaluate('window.__openedSession ?? null')
const boardContrast = await evaluate(`({
  title: window.__contrast('.pt-head h1'),
  subtitle: window.__contrast('.pt-head p'),
  cardLabel: window.__contrast('.pt-card .k'),
  cardValue: window.__contrast('.pt-card .v'),
  panelTitle: window.__contrast('.pt-panel-head h2'),
  cell: window.__contrast('.pt-table td'),
  header: window.__contrast('.pt-table th'),
  pillPass: window.__contrast('.pt-pill[data-state="pass"]'),
  pillFail: window.__contrast('.pt-pill[data-state="fail"]'),
})`)
await evaluate('window.__fixture.mountIcon()')
await waitFor('document.querySelector("#icon-host svg") !== null', 'icon render')
const iconBox = await evaluate(`(() => {
  const svg = document.querySelector('#icon-host svg')
  const rect = svg.getBoundingClientRect()
  return { width: Math.round(rect.width), height: Math.round(rect.height), stroke: getComputedStyle(svg.querySelector('path')).stroke }
})()`)

// Same surfaces, dark tokens.
await evaluate('window.__fixture.setTheme("dark")')
await sleep(250)
const dark = await evaluate(`({
  band: (${measure})('.pt-band'),
  bar: (${measure})('.pt-bar'),
  contrast: {
    name: window.__contrast('.pt-name'),
    facts: window.__contrast('.pt-facts > span'),
    factsValue: window.__contrast('.pt-facts b'),
    tests: window.__contrast('.pt-tests'),
    inactiveChip: window.__contrast('.pt-seg button'),
    activeChip: window.__contrast('.pt-seg button[data-active="1"]'),
    icon: window.__contrast('.pt-acts .pt-icon'),
  },
  board: {
    title: window.__contrast('.pt-head h1'),
    subtitle: window.__contrast('.pt-head p'),
    cardLabel: window.__contrast('.pt-card .k'),
    cardValue: window.__contrast('.pt-card .v'),
    cell: window.__contrast('.pt-table td'),
    header: window.__contrast('.pt-table th'),
    pillPass: window.__contrast('.pt-pill[data-state="pass"]'),
  },
  switchOn: { track: getComputedStyle(document.querySelector('.pt-switch')).backgroundColor, knob: getComputedStyle(document.querySelector('.pt-switch'), '::after').backgroundColor },
  bandBox: (() => { const s = getComputedStyle(document.querySelector('.pt-band .pt-bar')); return { borderColor: s.borderTopColor, radius: s.borderRadius } })(),
  colFill: getComputedStyle(document.querySelector('.pt-board .pt-col')).backgroundColor,
  cardBg: getComputedStyle(document.querySelector('.pt-card')).backgroundColor,
  boardBg: getComputedStyle(document.querySelector('.pt-board')).backgroundColor,
  line: (() => {
    const polyline = document.querySelector('.pt-line polyline')
    return polyline === null ? null : { stroke: getComputedStyle(polyline).stroke, fill: getComputedStyle(document.querySelector('.pt-line polygon')).fill }
  })(),
  stack: [...document.querySelectorAll('.pt-stack div')].map(segment => ({ kind: segment.dataset.kind, background: getComputedStyle(segment).backgroundColor })),
  rankFill: getComputedStyle(document.querySelector('.pt-rank-fill')).backgroundColor,
})`)

await evaluate(`document.querySelector('.pt-switch').click()`)
await sleep(350)
const darkSwitchOff = await evaluate(`({
  track: getComputedStyle(document.querySelector('.pt-switch')).backgroundColor,
  knob: getComputedStyle(document.querySelector('.pt-switch'), '::after').backgroundColor,
})`)

console.log(JSON.stringify({
  registrations,
  light: { offState, onState, offAgain, layout, bandBox, chartFill, hoverFill, hoverFillAfter, barTip, lineTip, bandCollapsed, bar, chips, facts, icons, bandContrast, afterSwitch, review, panel, collapsedHeight, expanded, boardBody, boardContrast, iconBox, openedByClick, openedByKey },
  dark,
  darkSwitchOff,
  errors: await evaluate('window.__errors'),
}, null, 2))

socket.close()
child.kill()
await sleep(400)
await rm(profile, { recursive: true, force: true }).catch(() => {})
