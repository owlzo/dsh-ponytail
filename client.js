// dsh-ponytail — Client half: the band above the prompt and the board panel.
//
// The band is one 36px row in `conversation.input.dock`, the same dock geometry
// and menu surface the Goal/Todo/Queue cards use; the board is one `main` panel
// with its `sidebar.panellist` icon, both keyed `ponytail`. Every colour is a
// theme token, so light and dark are the same drawing.

window.__ModuleLoader__.load({
  id: 'dsh-ponytail',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const LEVELS = ['off', 'lite', 'full', 'ultra']
    const NS = 'ponytail'
    const MORE_KEY = 'dsh.ponytail.more'

    const STRINGS = {
      zh: {
        'level.off': '关闭',
        'level.lite': '轻量',
        'level.full': '标准',
        'level.ultra': '极限',
        'band.review': '审阅改动',
        'band.audit': '审计仓库',
        'band.debt': '债务清单',
        'band.board': '打开看板',
        'band.more': '更多信息',
        'band.less': '收起',
        'band.idle': '等待第一轮',
        'band.offHint': '这个会话还没开启 ponytail',
        'band.switchOn': '为这个会话开启 ponytail',
        'band.switchOff': '为本会话关闭 ponytail',
        'band.turns': '轮',
        'band.tokens': 'tok',
        'band.reuse': '复用',
        'band.firstAsk': '首个问题',
        'band.cost': '花费',
        'band.started': '开始',
        'band.input': '输入',
        'band.output': '输出',
        'band.cache': '缓存',
        'band.files': '文件',
        'band.model': '模型',
        'board.title': 'Ponytail 看板',
        'board.subtitle': '本机任务记录',
        'board.tasks': '任务',
        'board.time': 'agent 时间',
        'board.tokens': 'token',
        'board.cost': '花费',
        'board.streak': '连续',
        'board.days': '天',
        'board.perTask': '每任务平均',
        'board.chart': '每日 token',
        'board.chartHint': '柱高为当天 token 总量',
        'board.reuseTrend': '复用率趋势',
        'board.testsHealth': '测试健康',
        'board.testsHint': '按任务统计最近一次测试结果',
        'board.projects': '项目排行',
        'board.projectsHint': '按 token 总量',
        'board.recent': '最近任务',
        'board.clickHint': '点一行打开会话',
        'board.open': '打开这个会话',
        'board.empty': '还没有任务记录，让 ponytail 跑完一轮就会出现。',
        'board.notEnough': '数据不足，至少需要两天',
        'board.refresh': '刷新',
        'board.started': '开始',
        'board.project': '项目',
        'board.name': '任务',
        'board.turns': '轮',
        'board.reuse': '复用',
        'board.tests': '测试',
        'board.level': '级别',
        'board.model': '模型',
        'board.noPrice': '未配置价目表，花费一栏留空',
        'board.notRun': '未运行',
        'board.latest': '最新',
        'board.peak': '峰值',
        'board.pass': '通过',
        'board.fail': '失败',
        'board.none': '未运行',
        'board.unpriced': '个任务无价格',
        'board.gone': '这个会话已经不在了。',
      },
      en: {
        'level.off': 'off',
        'level.lite': 'lite',
        'level.full': 'full',
        'level.ultra': 'ultra',
        'band.review': 'Review the change',
        'band.audit': 'Audit the repo',
        'band.debt': 'Debt ledger',
        'band.board': 'Open the board',
        'band.more': 'More',
        'band.less': 'Fold',
        'band.idle': 'waiting for the first turn',
        'band.offHint': 'Ponytail is off for this session',
        'band.switchOn': 'Turn ponytail on for this session',
        'band.switchOff': 'Turn ponytail off for this session',
        'band.turns': 'turns',
        'band.tokens': 'tok',
        'band.reuse': 'reuse',
        'band.firstAsk': 'first ask',
        'band.cost': 'cost',
        'band.started': 'started',
        'band.input': 'in',
        'band.output': 'out',
        'band.cache': 'cache',
        'band.files': 'files',
        'band.model': 'model',
        'board.title': 'Ponytail board',
        'board.subtitle': 'Every task on this machine',
        'board.tasks': 'Tasks',
        'board.time': 'Agent time',
        'board.tokens': 'Tokens',
        'board.cost': 'Cost',
        'board.streak': 'Streak',
        'board.days': 'days',
        'board.perTask': 'Per task',
        'board.chart': 'Tokens per day',
        'board.chartHint': 'Bar height is that day’s tokens',
        'board.reuseTrend': 'Reuse over time',
        'board.testsHealth': 'Test health',
        'board.testsHint': 'Last test result per task',
        'board.projects': 'Projects',
        'board.projectsHint': 'By total tokens',
        'board.recent': 'Latest tasks',
        'board.clickHint': 'Click a row to open it',
        'board.open': 'Open this session',
        'board.empty': 'No tasks yet. Finish one turn and the row appears here.',
        'board.notEnough': 'Not enough data, two days needed',
        'board.refresh': 'Refresh',
        'board.started': 'Started',
        'board.project': 'Project',
        'board.name': 'Task',
        'board.turns': 'Turns',
        'board.reuse': 'Reuse',
        'board.tests': 'Tests',
        'board.level': 'Level',
        'board.model': 'Model',
        'board.noPrice': 'No price table configured, the cost column stays empty',
        'board.notRun': 'not run',
        'board.latest': 'latest',
        'board.peak': 'peak',
        'board.pass': 'passed',
        'board.fail': 'failed',
        'board.none': 'not run',
        'board.unpriced': 'tasks unpriced',
        'board.gone': 'That session is gone.',
      },
    }

    // The same dock column GoalBar and the Queue panel use, with fallbacks for
    // the case where this entry is mounted outside the composer stack.
    const CSS = `
.pt-band{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance,0px) - var(--dsh-composer-side-clearance,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px));max-width:calc(var(--dsh-composer-card-max-width,860px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px) - var(--dsh-composer-dock-inset,0px));margin:0 auto;display:flex;flex-direction:column;gap:6px;font:500 13px/24px Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dsw-alias-label-primary)}
.pt-bar{position:relative;isolation:isolate;box-sizing:border-box;display:flex;align-items:center;gap:10px;height:36px;padding:3px 4px 3px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,12px);box-shadow:var(--dsw-elevation-panel,0 1px 2px rgba(0,0,0,.05))}
.pt-bar::before{position:absolute;z-index:-1;inset:0;border-radius:inherit;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));backdrop-filter:var(--dsw-menu-backdrop-filter,none);content:'';pointer-events:none}
.pt-dot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-idle-primary)}
.pt-dot[data-on="1"]{background:var(--dsw-alias-state-success-primary)}
.pt-name{flex:none;font-weight:600;color:var(--dsw-alias-label-primary);letter-spacing:.01em}
.pt-seg{flex:none;display:inline-flex;align-items:center;gap:1px;padding:2px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover)}
.pt-seg button{appearance:none;border:0;margin:0;padding:0 7px;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:600 11px/18px Inter,system-ui,sans-serif;cursor:pointer}
.pt-seg button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}
.pt-seg button[data-active="1"]{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}
.pt-facts{flex:1 1 auto;display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums}
.pt-facts b{font-weight:600;color:var(--dsw-alias-label-primary)}
.pt-facts .pt-sep{opacity:.45}
.pt-facts[data-off="1"]{opacity:.7}
.pt-tests{display:inline-flex;align-items:center;gap:5px}
.pt-tests i{flex:none;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-idle-primary)}
.pt-tests[data-state="pass"] i{background:var(--dsw-alias-state-success-primary)}
.pt-tests[data-state="fail"] i{background:var(--dsw-alias-state-error-primary)}
.pt-acts{flex:none;display:inline-flex;align-items:center;gap:2px}
.pt-icon{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.pt-icon:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.pt-icon:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pt-icon[data-open="1"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}
.pt-switch{position:relative;flex:none;width:34px;height:20px;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-interactive-bg-active);cursor:pointer;transition:background .16s ease}
.pt-switch::after{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:var(--dsw-alias-label-primary);transition:transform .16s ease;content:''}
.pt-switch[data-on="1"]{background:var(--dsw-alias-state-success-primary)}
.pt-switch[data-on="1"]::after{transform:translateX(14px)}
.pt-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.pt-chev svg{transition:transform .16s ease}
.pt-chev[data-open="1"] svg{transform:rotate(180deg)}
.pt-more{position:relative;isolation:isolate;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;padding:7px 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,12px);font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.pt-more-top{display:flex;align-items:baseline;gap:10px}
.pt-more-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--dsw-alias-label-primary)}
.pt-more-time{flex:none;white-space:nowrap}
.pt-more-stats{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px}
.pt-stat{display:inline-flex;align-items:baseline;gap:4px}
.pt-stat em{font-style:normal}
.pt-stat b{font-weight:600;color:var(--dsw-alias-label-primary)}
.pt-more::before{position:absolute;z-index:-1;inset:0;border-radius:inherit;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));content:'';pointer-events:none}
.pt-more b{font-weight:600;color:var(--dsw-alias-label-primary)}
.pt-board{box-sizing:border-box;height:100%;overflow:auto;padding:24px 28px 40px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:400 13px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.pt-board-inner{display:flex;flex-direction:column;gap:16px;max-width:1180px;margin:0 auto}
.pt-head{display:flex;align-items:center;gap:12px}
.pt-head-main{flex:1 1 auto;min-width:0}
.pt-head h1{margin:0;font-size:16px;line-height:24px;font-weight:600}
.pt-head p{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pt-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px}
.pt-card{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2)}
.pt-card .k{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.pt-card .v{margin-top:1px;font-size:18px;line-height:26px;font-weight:600;font-variant-numeric:tabular-nums}
.pt-card .s{margin-top:1px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.pt-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:14px;align-items:stretch}
.pt-span{grid-column:1 / -1}
@media (max-width:900px){.pt-grid{grid-template-columns:1fr}}
.pt-panel{display:flex;flex-direction:column;min-width:0;border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2)}
.pt-panel-head{display:flex;align-items:baseline;gap:8px;padding:12px 16px 6px}
.pt-panel-head h2{margin:0;font-size:13px;line-height:20px;font-weight:600}
.pt-panel-head span{margin-left:auto;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary);text-align:right}
.pt-panel-body{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.pt-chart{position:relative;display:flex;align-items:flex-end;gap:3px;flex:1 1 auto;min-height:132px;padding:0 16px}
.pt-col{flex:1 1 0;min-width:2px;border-radius:3px 3px 0 0;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,transparent)}
.pt-col[data-zero="1"]{border-radius:1px;background:var(--dsw-alias-interactive-bg-active)}
.pt-tip{position:absolute;z-index:3;transform:translateX(-50%);padding:4px 8px;border-radius:8px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 6px 18px rgba(0,0,0,.18);font-size:11px;line-height:16px;white-space:nowrap;pointer-events:none;font-variant-numeric:tabular-nums}
.pt-tip[data-point="1"]{transform:translate(-50%,-140%)}
.pt-axis{display:flex;justify-content:space-between;padding:6px 16px 12px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.pt-line-wrap{position:relative;display:flex;flex:1 1 auto;min-height:120px;padding:6px 16px 0}
.pt-line-box{position:relative;display:flex;flex:1 1 auto;min-height:112px}
.pt-line{position:absolute;inset:0;display:block;width:100%;height:100%}
.pt-line-hit{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:999px;cursor:default}
.pt-line-legend{display:flex;justify-content:space-between;padding:4px 16px 12px;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.pt-tests-body{display:flex;flex:1 1 auto;flex-direction:column;justify-content:space-between;gap:12px;padding:2px 16px 14px}
.pt-tests-row{display:flex;gap:20px}
.pt-tests-cell{display:flex;flex-direction:column;gap:1px}
.pt-tests-cell b{font-size:19px;line-height:24px;font-weight:600;font-variant-numeric:tabular-nums}
.pt-tests-cell span{display:inline-flex;align-items:center;gap:5px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.pt-tests-cell i{flex:none;width:7px;height:7px;border-radius:2px;background:var(--dsw-alias-state-idle-primary)}
.pt-tests-cell[data-kind="pass"] i{background:var(--dsw-alias-state-success-primary)}
.pt-tests-cell[data-kind="fail"] i{background:var(--dsw-alias-state-error-primary)}
.pt-stack{display:flex;height:12px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-interactive-bg-hover)}
.pt-stack div{height:100%}
.pt-stack div[data-kind="pass"]{background:var(--dsw-alias-state-success-primary)}
.pt-stack div[data-kind="fail"]{background:var(--dsw-alias-state-error-primary)}
.pt-stack div[data-kind="none"]{background:var(--dsw-alias-state-idle-primary)}
.pt-rank{display:flex;flex:1 1 auto;flex-direction:column;justify-content:space-between;gap:8px;padding:2px 16px 14px}
.pt-rank-row{display:grid;grid-template-columns:92px minmax(0,1fr) auto;align-items:center;gap:10px;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
.pt-rank-row .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.pt-rank-track{height:8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}
.pt-rank-fill{height:100%;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent)}
.pt-rank-row b{font-weight:600;color:var(--dsw-alias-label-primary)}
.pt-scroll{max-height:420px;overflow:auto}
.pt-table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
.pt-table th{position:sticky;top:0;z-index:1;text-align:left;white-space:nowrap;padding:8px 12px;font-weight:600;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 -1px 0 var(--dsw-alias-border-l1)}
.pt-table td{padding:8px 12px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;box-shadow:inset 0 -1px 0 var(--dsw-alias-border-l1)}
.pt-table tbody tr:last-child td{box-shadow:none}
.pt-table tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}
.pt-table tbody tr.pt-clickable{cursor:pointer}
.pt-table tbody tr.pt-clickable:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.pt-table .num{text-align:right}
.pt-go{margin-left:6px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.pt-pill{display:inline-flex;align-items:center;gap:5px;padding:0 7px;border-radius:999px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.pt-pill i{flex:none;width:5px;height:5px;border-radius:999px;background:var(--dsw-alias-state-idle-primary)}
.pt-pill[data-state="pass"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent)}
.pt-pill[data-state="pass"] i{background:var(--dsw-alias-state-success-primary)}
.pt-pill[data-state="fail"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent)}
.pt-pill[data-state="fail"] i{background:var(--dsw-alias-state-error-primary)}
.pt-empty{display:flex;flex:1 1 auto;align-items:center;justify-content:center;min-height:96px;padding:16px;color:var(--dsw-alias-label-secondary);font-size:12px}
.pt-note{padding:0 16px 12px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.pt-alert{padding:8px 12px;border-radius:8px;font-size:12px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.pt-more-first{margin-top:-2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

    const fmtTokens = n => {
      if (n >= 999_950) return `${(n / 1_000_000).toFixed(1)}M`
      if (n >= 1000) return `${Math.round(n / 1000)}k`
      return String(n)
    }
    const fmtMinutes = m => m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)}m`
    const fmtCost = c => c === null || c === undefined ? '—' : `$${c.toFixed(2)}`
    const fmtPct = p => p === null || p === undefined ? '—' : `${p}%`

    // 16px stroke icons, drawn once so the row never grows text it does not need.
    const icon = (paths, size = 15) => h('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
      stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
    }, paths.map((d, index) => h('path', { key: index, d })))

    const ICONS = {
      review: ['M2 7.6C3.4 5 5.5 3.6 8 3.6S12.6 5 14 7.6c-1.4 2.6-3.5 4-6 4s-4.6-1.4-6-4Z', 'M8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z'],
      audit: ['M5.5 4.2H13', 'M5.5 8H13', 'M5.5 11.8H13', 'M2.4 4.2l1 1 1.4-1.6', 'M2.4 8l1 1 1.4-1.6', 'M2.4 11.8l1 1 1.4-1.6'],
      debt: ['M4.5 2.5h7v11l-3.5-2.2-3.5 2.2v-11Z'],
      board: ['M3 13V8', 'M6.5 13V3.5', 'M10 13V6', 'M13.5 13V9.5'],
      chevron: ['M4 6.2 8 10l4-3.8'],
      refresh: ['M13 8a5 5 0 1 1-1.6-3.7', 'M13 2.5V5h-2.5'],
      bars: ['M3.2 13.2V9.4', 'M8 13.2V4.6', 'M12.8 13.2V7.2'],
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale !== undefined && typeof locale.register === 'function') {
          ctx.effect(() => locale.register(NS, STRINGS), 'ponytail: dictionaries')
        }
        const t = key => {
          try {
            const bound = locale !== undefined && typeof locale.bind === 'function' ? locale.bind(NS) : undefined
            const text = bound?.(key)
            if (typeof text === 'string' && text !== '' && text !== key) return text
          } catch {}
          return STRINGS.en[key] ?? key
        }

        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.dshPonytail = ''
          style.textContent = CSS
          document.head.append(style)
          return () => style.remove()
        }, 'ponytail: stylesheet')

        const post = (path, body) => fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })

        // One poll loop per mounted surface: local JSON, so a short interval is cheap.
        function useLive(path, intervalMs) {
          const [state, setState] = React.useState(null)
          const [tick, setTick] = React.useState(0)
          React.useEffect(() => {
            let alive = true
            const load = () => {
              fetch(path, { headers: { accept: 'application/json' } })
                .then(response => (response.ok ? response.json() : null))
                .then(value => { if (alive) setState(value) })
                .catch(() => {})
            }
            load()
            const timer = setInterval(load, intervalMs)
            return () => { alive = false; clearInterval(timer) }
          }, [path, tick, intervalMs])
          return [state, () => setTick(value => value + 1)]
        }

        const runCommand = (props, line) => {
          const actions = props.inputActions
          if (actions === undefined) return
          try {
            actions.setDraft?.(line)
            actions.submit?.()
          } catch {}
        }

        const Band = props => {
          const sessionId = props.session?.sessionId ?? props.sessionId ?? ''
          const [data, reload] = useLive(`/ponytail/api/band?session=${encodeURIComponent(sessionId)}`, 2500)
          const [more, setMore] = React.useState(() => {
            try { return window.localStorage.getItem(MORE_KEY) === '1' } catch { return false }
          })
          if (data === null || data.band === false) return null
          const level = data.level ?? 'full'
          const task = data.task
          const off = level === 'off'
          const toggleMore = () => {
            const next = !more
            setMore(next)
            try { window.localStorage.setItem(MORE_KEY, next ? '1' : '0') } catch {}
          }
          const switchLevel = next => { post('/ponytail/api/level', { session: sessionId, level: next }).then(reload).catch(() => {}) }
          const openBoard = () => {
            try { ctx.get('layout')?.selectPanel?.('ponytail') } catch {}
          }
          const toggle = () => switchLevel(off ? (data.default ?? 'full') : 'off')

          const startedAt = typeof task?.startedAt === 'number' ? new Date(task.startedAt) : null
          const startedLabel = startedAt === null ? '' : `${String(startedAt.getMonth() + 1).padStart(2, '0')}-${String(startedAt.getDate()).padStart(2, '0')} ${String(startedAt.getHours()).padStart(2, '0')}:${String(startedAt.getMinutes()).padStart(2, '0')}`
          const cacheTotal = (task?.tokens?.input ?? 0) + (task?.tokens?.cacheRead ?? 0)
          const cacheHit = cacheTotal === 0 ? null : Math.round(((task?.tokens?.cacheRead ?? 0) / cacheTotal) * 100)
          const stat = (key, label, value, title) => h('span', { key, className: 'pt-stat', title },
            h('em', null, label), h('b', null, value))

          const facts = []
          if (task === null) {
            facts.push(h('span', { key: 'idle', className: 'pt-sep' }, t('band.idle')))
          } else {
            facts.push(h('span', { key: 'turns' }, h('b', null, String(task.turns)), ` ${t('band.turns')}`))
            facts.push(h('span', { key: 's1', className: 'pt-sep' }, '·'))
            facts.push(h('span', { key: 'tok' }, h('b', null, fmtTokens(task.totalTokens)), ` ${t('band.tokens')}`))
            facts.push(h('span', { key: 's2', className: 'pt-sep' }, '·'))
            facts.push(h('span', { key: 'time' }, h('b', null, fmtMinutes(task.busyMs / 60000))))
            if (task.reuse !== null && task.reuse !== undefined) {
              facts.push(h('span', { key: 's3', className: 'pt-sep' }, '·'))
              facts.push(h('span', { key: 'reuse' }, `${t('band.reuse')} `, h('b', null, fmtPct(task.reuse))))
            }
            facts.push(h('span', { key: 's4', className: 'pt-sep' }, '·'))
            facts.push(h('span', {
              key: 'tests',
              className: 'pt-tests',
              'data-state': task.tests?.state ?? 'none',
            }, h('i', null), task.testsLabel ?? t('board.notRun')))
            if (task.priced) {
              facts.push(h('span', { key: 's5', className: 'pt-sep' }, '·'))
              facts.push(h('span', { key: 'cost' }, h('b', null, fmtCost(task.cost))))
            }
          }

          const action = (key, label, paths, onClick) => h('button', {
            key, type: 'button', className: 'pt-icon', title: label, 'aria-label': label, onClick,
          }, icon(paths))

          return h('div', { className: 'pt-band', role: 'group', 'aria-label': 'ponytail' },
            h('div', { className: 'pt-bar' },
              h('span', { className: 'pt-dot', 'data-on': off ? '0' : '1' }),
              h('span', { className: 'pt-name' }, 'ponytail'),
              off
                ? h('div', { className: 'pt-facts' }, t('band.offHint'))
                : h('div', { className: 'pt-seg', role: 'group', 'aria-label': 'ponytail level' },
                    LEVELS.filter(value => value !== 'off').map(value => h('button', {
                      key: value,
                      type: 'button',
                      'data-active': value === level ? '1' : '0',
                      'aria-pressed': value === level,
                      title: `/ponytail ${value}`,
                      onClick: () => switchLevel(value),
                    }, t(`level.${value}`)))),
              off ? null : h('div', { className: 'pt-facts' }, facts),
              off
                ? null
                : h('div', { className: 'pt-acts' },
                    action('review', t('band.review'), ICONS.review, () => runCommand(props, '/ponytail-review')),
                    action('audit', t('band.audit'), ICONS.audit, () => runCommand(props, '/ponytail-audit')),
                    action('debt', t('band.debt'), ICONS.debt, () => runCommand(props, '/ponytail-debt')),
                    action('board', t('band.board'), ICONS.board, openBoard)),
              off
                ? null
                : h('button', {
                    type: 'button',
                    className: 'pt-icon pt-chev',
                    title: more ? t('band.less') : t('band.more'),
                    'aria-label': more ? t('band.less') : t('band.more'),
                    'aria-expanded': more,
                    'data-open': more ? '1' : '0',
                    onClick: toggleMore,
                  }, icon(ICONS.chevron)),
              h('button', {
                type: 'button',
                className: 'pt-switch',
                role: 'switch',
                'aria-checked': !off,
                'aria-label': off ? t('band.switchOn') : t('band.switchOff'),
                title: off ? t('band.switchOn') : t('band.switchOff'),
                'data-on': off ? '0' : '1',
                onClick: toggle,
              })),
            more && !off
              ? h('div', { className: 'pt-more' },
                  h('div', { className: 'pt-more-top' },
                    h('span', { className: 'pt-more-name', title: data.cwd ?? undefined },
                      [data.project, task?.name].filter(Boolean).join(' · ') || '—'),
                    h('span', { className: 'pt-more-time' },
                      startedLabel === '' ? '' : `${t('band.started')} ${startedLabel} · `,
                      `agent ${fmtMinutes((task?.busyMs ?? 0) / 60000)}`)),
                  task?.firstMessage && task.firstMessage !== task.name
                    ? h('div', { className: 'pt-more-first', title: task.firstMessage }, `${t('band.firstAsk')} ${task.firstMessage}`)
                    : null,
                  h('div', { className: 'pt-more-stats' },
                    stat('in', t('band.input'), fmtTokens(task?.tokens?.input ?? 0)),
                    stat('out', t('band.output'), fmtTokens(task?.tokens?.output ?? 0)),
                    stat('cache', t('band.cache'), cacheHit === null
                      ? fmtTokens(task?.tokens?.cacheRead ?? 0)
                      : `${fmtTokens(task?.tokens?.cacheRead ?? 0)}（${cacheHit}%）`),
                    stat('files', t('band.files'), `${task?.reused ?? 0} / ${task?.created ?? 0}`),
                    stat('cost', t('band.cost'), task?.priced ? fmtCost(task.cost) : '—',
                      task?.priced ? undefined : t('board.noPrice')),
                    stat('model', t('band.model'), task?.model || '—')))
              : null)
        }

        const BoardIcon = props => {
          const size = props.size ?? 20
          return h('svg', {
            width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
            stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round',
            style: { display: 'block', opacity: props.active ? 1 : 0.9 },
          }, ICONS.bars.map((d, index) => h('path', { key: index, d })))
        }

        // Bars with a hover tip: the number is what the chart is for.
        const TokenChart = ({ series }) => {
          const [hover, setHover] = React.useState(null)
          const peak = series.reduce((max, day) => Math.max(max, day.tokens), 0) || 1
          if (series.length === 0) return h('div', { className: 'pt-empty' }, t('board.empty'))
          const bars = series.map((day, index) => {
            const height = day.tokens === 0 ? 2 : Math.max(4, Math.round((day.tokens / peak) * 118))
            return h('div', {
              key: day.day,
              className: 'pt-col',
              'data-zero': day.tokens === 0 ? '1' : '0',
              style: { height: `${height}px` },
              onMouseEnter: () => setHover({
                left: `${((index + 0.5) / series.length) * 100}%`,
                bottom: height + 6,
                text: `${day.day} · ${fmtTokens(day.tokens)} ${t('band.tokens')} · ${fmtMinutes(day.minutes)} · ${day.tasks}`,
              }),
            })
          })
          return h('div', { className: 'pt-chart', onMouseLeave: () => setHover(null) },
            bars,
            hover === null
              ? null
              : h('div', { className: 'pt-tip', style: { left: hover.left, bottom: `${hover.bottom}px` } }, hover.text))
        }

        // A 0..100 line over the sampled days, drawn in a 100x100 box and scaled
        // by CSS, so the stroke stays 1.5px at any width. Every point answers hover.
        const LineChart = ({ points }) => {
          const [hover, setHover] = React.useState(null)
          if (points.length < 2) return h('div', { className: 'pt-empty' }, t('board.notEnough'))
          const step = 100 / (points.length - 1)
          const coords = points.map((point, index) => [
            +(index * step).toFixed(2),
            +(100 - (Math.max(0, Math.min(100, point.value)) / 100) * 100).toFixed(2),
          ])
          const line = coords.map(([x, y]) => `${x},${y}`).join(' ')
          const dots = coords.map(([x, y], index) => h('div', {
            key: points[index].day,
            className: 'pt-line-hit',
            style: { left: `${x}%`, top: `${y}%` },
            onMouseEnter: () => setHover({
              left: `${x}%`,
              top: `${y}%`,
              text: `${points[index].day} · ${t('board.reuse')} ${points[index].value}%`,
            }),
          }))
          return h('div', { className: 'pt-line-wrap', onMouseLeave: () => setHover(null) },
            h('div', { className: 'pt-line-box' },
              h('svg', { className: 'pt-line', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': true },
                h('polygon', { points: `0,100 ${line} 100,100`, fill: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)' }),
                h('polyline', {
                  points: line, fill: 'none', stroke: 'var(--dsw-alias-brand-primary)',
                  strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round',
                })),
              dots,
              hover === null
                ? null
                : h('div', { className: 'pt-tip', 'data-point': '1', style: { left: hover.left, top: hover.top } }, hover.text)))
        }

        const TokensBody = ({ series }) => h('div', { className: 'pt-panel-body' },
          h(TokenChart, { series }),
          series.length === 0 ? null : h('div', { className: 'pt-axis' },
            h('span', null, series[0].day),
            h('span', null, series[series.length - 1].day)))

        const ReuseBody = ({ points }) => h('div', { className: 'pt-panel-body' },
          h(LineChart, { points }),
          points.length === 0 ? null : h('div', { className: 'pt-line-legend' },
            h('span', null, points[0].day),
            h('span', null, points[points.length - 1].day)))

        const TestsBody = ({ tests, total }) => {
          if (total === 0) return h('div', { className: 'pt-empty' }, t('board.empty'))
          const kinds = ['pass', 'fail', 'none']
          const counts = kinds.map(kind => h('div', { key: kind, className: 'pt-tests-cell', 'data-kind': kind },
            h('b', null, String(tests[kind])),
            h('span', null, h('i', null), t(`board.${kind}`))))
          const segments = kinds.map(kind => h('div', {
            key: kind,
            'data-kind': kind,
            style: { width: `${(tests[kind] / total) * 100}%` },
            title: `${t(`board.${kind}`)} ${tests[kind]}`,
          }))
          return h('div', { className: 'pt-tests-body' },
            h('div', { className: 'pt-tests-row' }, counts),
            h('div', { className: 'pt-stack' }, segments))
        }

        const ProjectsBody = ({ projects, peak }) => {
          if (projects.length === 0) return h('div', { className: 'pt-empty' }, t('board.empty'))
          const rows = projects.map(item => h('div', { key: item.project, className: 'pt-rank-row' },
            h('span', { className: 'n', title: item.project }, item.project),
            h('div', { className: 'pt-rank-track' },
              h('div', {
                className: 'pt-rank-fill',
                style: { width: `${Math.max(4, Math.round((item.tokens / peak) * 100))}%` },
              })),
            h('span', null, h('b', null, fmtTokens(item.tokens)), ` · ${item.tasks}`)))
          return h('div', { className: 'pt-rank' }, rows)
        }

        const Board = () => {
          const [data, reload] = useLive('/ponytail/api/board', 15000)
          const totals = data?.totals
          const series = data?.series ?? []
          const rows = data?.rows ?? []
          const reusePoints = series
            .filter(day => day.reuse !== null && day.reuse !== undefined)
            .map(day => ({ day: day.day, value: day.reuse }))
          const tests = totals?.tests ?? { pass: 0, fail: 0, none: 0 }
          const testsTotal = tests.pass + tests.fail + tests.none
          const projects = (data?.projects ?? []).slice(0, 6)
          const projectPeak = projects.reduce((max, item) => Math.max(max, item.tokens), 0) || 1
          const peak = series.reduce((max, day) => Math.max(max, day.tokens), 0)
          const clickable = rows.some(row => row.session)
          const [notice, setNotice] = React.useState('')

          const openSession = id => {
            if (!id) return
            try {
              const workspace = ctx.get('uiWorkspace')
              if (workspace === undefined || typeof workspace.openSession !== 'function') return
              workspace.openSession(id)
              setNotice('')
            } catch {
              // A row outlives its Session; without this the click looks broken.
              setNotice(t('board.gone'))
            }
          }

          const cards = [
            [t('board.tasks'), totals === undefined ? '—' : String(totals.tasks),
              totals !== undefined && totals.tasks > 0 ? `${t('board.perTask')} ${fmtTokens(Math.round(totals.tokens / totals.tasks))}` : ''],
            [t('board.time'), totals === undefined ? '—' : fmtMinutes(totals.minutes),
              totals !== undefined && totals.turns > 0 ? `${t('board.turns')} ${totals.turns}` : ''],
            [t('board.tokens'), totals === undefined ? '—' : fmtTokens(totals.tokens), ''],
            [t('board.cost'), data?.priced && totals !== undefined ? fmtCost(totals.cost) : '—',
              totals?.unpriced > 0 ? `${totals.unpriced} ${t('board.unpriced')}` : ''],
            [t('board.streak'), data === null || data === undefined ? '—' : `${data.streak} ${t('board.days')}`, ''],
          ]

          const panel = (key, title, hint, body, className) => h('section', {
            key,
            className: className === undefined ? 'pt-panel' : `pt-panel ${className}`,
          },
            h('div', { className: 'pt-panel-head' },
              h('h2', null, title),
              hint === '' ? null : h('span', null, hint)),
            body)

          return h('div', { className: 'pt-board' },
            h('div', { className: 'pt-board-inner' },
              h('header', { className: 'pt-head' },
                h('div', { className: 'pt-head-main' },
                  h('h1', null, t('board.title')),
                  h('p', null, `${t('board.subtitle')}${data?.dir ? ` · ${data.dir}` : ''}`)),
                h('button', {
                  type: 'button', className: 'pt-icon', title: t('board.refresh'),
                  'aria-label': t('board.refresh'), onClick: reload,
                }, icon(ICONS.refresh, 16))),

              notice === '' ? null : h('div', { className: 'pt-alert', role: 'status' }, notice),

              h('div', { className: 'pt-cards' },
                cards.map(([key, value, sub]) => h('div', { className: 'pt-card', key },
                  h('div', { className: 'k' }, key),
                  h('div', { className: 'v' }, value),
                  sub === '' ? null : h('div', { className: 's' }, sub)))),

              h('div', { className: 'pt-grid' },
                panel('tokens', t('board.chart'), `${t('board.peak')} ${fmtTokens(peak)}`, h(TokensBody, { series })),
                panel('tests', t('board.testsHealth'), t('board.testsHint'), h(TestsBody, { tests, total: testsTotal })),
                panel('reuse', t('board.reuseTrend'), reusePoints.length === 0
                  ? t('board.notEnough')
                  : `${t('board.latest')} ${fmtPct(reusePoints[reusePoints.length - 1].value)}`,
                  h(ReuseBody, { points: reusePoints })),
                panel('projects', t('board.projects'), t('board.projectsHint'),
                  h(ProjectsBody, { projects, peak: projectPeak })),
                panel('recent', t('board.recent'), clickable ? t('board.clickHint') : '',
                  rows.length === 0
                    ? h('div', { className: 'pt-empty' }, t('board.empty'))
                    : h('div', { className: 'pt-scroll' },
                        h('table', { className: 'pt-table' },
                          h('thead', null,
                            h('tr', null,
                              h('th', null, t('board.started')),
                              h('th', null, t('board.project')),
                              h('th', null, t('board.name')),
                              h('th', { className: 'num' }, t('board.turns')),
                              h('th', { className: 'num' }, t('board.tokens')),
                              h('th', { className: 'num' }, t('board.reuse')),
                              h('th', null, t('board.tests')),
                              h('th', null, t('board.level')),
                              h('th', null, t('board.model')))),
                          h('tbody', null,
                            rows.map(row => h('tr', {
                              key: row.key,
                              className: row.session ? 'pt-clickable' : undefined,
                              tabIndex: row.session ? 0 : undefined,
                              title: row.session ? t('board.open') : undefined,
                              onClick: row.session ? () => openSession(row.session) : undefined,
                              onKeyDown: row.session
                                ? event => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return
                                    event.preventDefault()
                                    openSession(row.session)
                                  }
                                : undefined,
                            },
                              h('td', null, row.started),
                              h('td', null, row.project),
                              h('td', { title: row.name }, row.name, row.session ? h('span', { className: 'pt-go', 'aria-hidden': true }, '↗') : null),
                              h('td', { className: 'num' }, String(row.turns)),
                              h('td', { className: 'num' }, fmtTokens(row.tokens)),
                              h('td', { className: 'num' }, fmtPct(row.reuse)),
                              h('td', null, h('span', {
                                className: 'pt-pill',
                                'data-state': /fail/i.test(row.tests) ? 'fail' : /pass/i.test(row.tests) ? 'pass' : 'none',
                              }, h('i', null), row.tests || t('board.notRun'))),
                              h('td', null, row.level),
                              h('td', { title: row.model }, row.model)))))),
                  'pt-span')),
              data?.priced === false
                ? h('div', { className: 'pt-note' }, t('board.noPrice'))
                : null))
        }

        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'ponytail',
          order: 5,
          label: () => 'ponytail',
        }, Band))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'ponytail',
          order: 20,
          label: () => t('board.title'),
        }, BoardIcon))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'ponytail',
        }, Board))
      },
    }
  },
})
