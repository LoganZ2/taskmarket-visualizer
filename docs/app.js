// Taskmarket Live Market Visualizer — pure vanilla ES module, zero external runtime dependencies.
const C = {
  ground: '#12100E',
  maroon: '#3A1420',
  panel: '#221E1A',
  line: '#453E37',
  cream: '#EFE9E2',
  paper: '#FFF6E8',
  muted: '#B0A79D',
  magenta: '#E74079',
  salmon: '#D9A097',
}

const state = {
  data: null,
  chain: '4217', // '4217' | '8453' | 'both'
  view: 'overview', // overview | flow | swarm | insights | heatmap | feed
  range: '30d',
  metric: 'agents', // agents | volume
  swarmStatus: 'all',
  heatmapDim: 'hourOfWeek',
  feedType: 'all',
}

const $ = id => document.getElementById(id)
const fmtInt = n => Number(n ?? 0).toLocaleString('en-US')
const fmtUsd = n => '$' + Number(n ?? 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
const fmtCompactUsd = n => {
  const v = Number(n ?? 0)
  if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'k'
  return '$' + v.toFixed(v < 10 ? 2 : 0)
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]))

function parseHash() {
  const raw = location.hash.replace(/^#/, '')
  const params = new URLSearchParams(raw)
  const ch = params.get('chain')
  const vw = params.get('view')
  const rng = params.get('range')
  if (['4217', '8453', 'both'].includes(ch)) state.chain = ch
  if (['overview', 'flow', 'swarm', 'insights', 'heatmap', 'feed'].includes(vw)) state.view = vw
  if (['7d', '30d', '90d', 'all'].includes(rng)) state.range = rng
}

function syncHash() {
  const qs = `chain=${state.chain}&view=${state.view}&range=${state.range}`
  if (location.hash !== '#' + qs) history.replaceState(null, '', '#' + qs)
}

function showToast(msg) {
  const el = $('toast')
  el.textContent = msg
  el.hidden = false
  clearTimeout(showToast._t)
  showToast._t = setTimeout(() => { el.hidden = true }, 2400)
}

function showTooltip(evt, head, lines) {
  const el = $('tooltip')
  el.innerHTML = `<div class="t-head">${esc(head)}</div><div class="t-mono">${lines.map(esc).join('<br>')}</div>`
  el.hidden = false
  const pad = 14
  let x = evt.clientX + pad
  let y = evt.clientY + pad
  const rect = el.getBoundingClientRect()
  if (x + rect.width > window.innerWidth - 10) x = evt.clientX - rect.width - pad
  if (y + rect.height > window.innerHeight - 10) y = evt.clientY - rect.height - pad
  el.style.left = Math.max(8, x) + 'px'
  el.style.top = Math.max(8, y) + 'px'
}
function hideTooltip() { $('tooltip').hidden = true }

function activeChainData() {
  const d = state.data
  if (state.chain === 'both') return null
  return d.chains[state.chain]
}

function renderHeaderAndMethods() {
  const d = state.data
  const utc = new Date(d.generatedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  $('data-as-of').textContent = `Data as of ${utc}`
  $('endpoint-list').innerHTML = d.endpoints.map(ep => `<li>${esc(ep)}</li>`).join('')
}

function renderKPIs() {
  const d = state.data
  const t = d.chains['4217'].stats
  const b = d.chains['8453'].stats
  const cur = state.chain === 'both' ? null : d.chains[state.chain]
  const unit = state.chain === '8453' ? 'USDC' : state.chain === '4217' ? 'OUSD' : 'OUSD + USDC'

  const paidWorkers = state.chain === 'both' ? (t.paidWorkers + b.paidWorkers) : cur.stats.paidWorkers
  const activeWallets = state.chain === 'both' ? (t.activeWallets + b.activeWallets) : cur.stats.activeWallets
  const samplePosters = state.chain === 'both'
    ? (d.chains['4217'].tasks.summary.distinctPosters + d.chains['8453'].tasks.summary.distinctPosters)
    : cur.tasks.summary.distinctPosters
  const openEscrow = state.chain === 'both'
    ? (d.chains['4217'].tasks.summary.openEscrowUsd + d.chains['8453'].tasks.summary.openEscrowUsd)
    : cur.tasks.summary.openEscrowUsd

  const cards = [
    {label: 'Registered Workers', scope: 'ALL', val: fmtInt(t.registeredWorkers), sub: 'Platform-wide registry'},
    {label: 'Active Agents (7d)', scope: 'ALL', val: fmtInt(t.activeAgents7d), sub: `${fmtInt(t.activeWorkers7d)} active workers total`, accent: true},
    {label: 'Open Tasks Now', scope: 'ALL', val: fmtInt(t.openTasks), sub: `${fmtUsd(openEscrow)} in sampled open escrow (${unit})`},
    {label: 'Paid Workers', scope: state.chain === 'both' ? 'BOTH' : cur.meta.name.toUpperCase(), val: fmtInt(paidWorkers), sub: state.chain === 'both' ? `Tempo ${fmtInt(t.paidWorkers)} · Base ${fmtInt(b.paidWorkers)}` : `Settled on ${cur.meta.name}`},
    {label: 'Active Wallets', scope: state.chain === 'both' ? 'BOTH' : cur.meta.name.toUpperCase(), val: fmtInt(activeWallets), sub: state.chain === 'both' ? `Tempo ${fmtInt(t.activeWallets)} · Base ${fmtInt(b.activeWallets)}` : `Chain ${cur.meta.id}`},
    {label: 'Distinct Posters', scope: state.chain === 'both' ? 'SAMPLE' : cur.meta.name.toUpperCase(), val: fmtInt(samplePosters), sub: state.chain === 'both' ? `From ${fmtInt(d.chains['4217'].tasks.sampleCount + d.chains['8453'].tasks.sampleCount)} sampled tasks` : `From ${fmtInt(cur.tasks.sampleCount)} recent tasks`},
  ]

  $('kpi-grid').innerHTML = cards.map(c => `
    <article class="kpi-card">
      <div class="kpi-label"><span>${esc(c.label)}</span><span class="kpi-scope">${esc(c.scope)}</span></div>
      <div class="kpi-value${c.accent ? ' accent' : ''}">${esc(c.val)}</div>
      <div class="kpi-sub">${esc(c.sub)}</div>
    </article>
  `).join('')
}

function renderTimeSeries() {
  const series = state.data.platform.series[state.range] || []
  const wrap = $('timeseries-chart')
  const legend = $('timeseries-legend')
  if (!series.length) {
    wrap.innerHTML = '<p class="muted-note">No time-series buckets returned for this range.</p>'
    return
  }

  const W = 960, H = 290, PL = 58, PR = 58, PT = 18, PB = 40
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const n = series.length
  const stepX = n > 1 ? plotW / (n - 1) : plotW / 2

  const isAgents = state.metric === 'agents'
  const barVals = series.map(s => isAgents ? Number(s.tasksCreated || 0) : Number(s.rewardVolume || 0) / 1e6)
  const lineVals = series.map(s => isAgents ? Number(s.activeAgents || 0) : Number(s.paidVolume || 0) / 1e6)

  const maxBar = Math.max(1, ...barVals) * 1.15
  const maxLine = Math.max(1, ...lineVals) * 1.15

  const xAt = i => PL + (n > 1 ? i * stepX : plotW / 2)
  const yBar = v => PT + plotH - (v / maxBar) * plotH
  const yLine = v => PT + plotH - (v / maxLine) * plotH
  const barW = Math.max(4, Math.min(26, (plotW / Math.max(n, 1)) * 0.56))

  let gridSvg = ''
  for (let i = 0; i <= 4; i++) {
    const y = PT + (plotH * i) / 4
    const leftVal = maxBar * (1 - i / 4)
    const rightVal = maxLine * (1 - i / 4)
    gridSvg += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="${C.line}" stroke-dasharray="3 4" stroke-opacity="0.7" />`
    gridSvg += `<text x="${PL - 8}" y="${y + 4}" text-anchor="end" fill="${C.muted}" font-family="Departure Mono" font-size="11">${isAgents ? Math.round(leftVal) : fmtCompactUsd(leftVal)}</text>`
    gridSvg += `<text x="${W - PR + 8}" y="${y + 4}" text-anchor="start" fill="${C.magenta}" font-family="Departure Mono" font-size="11">${isAgents ? Math.round(rightVal) : fmtCompactUsd(rightVal)}</text>`
  }

  let barsSvg = ''
  const pts = []
  let xLabels = ''
  const labelStride = Math.max(1, Math.ceil(n / 8))

  series.forEach((s, i) => {
    const cx = xAt(i)
    const bv = barVals[i]
    const lv = lineVals[i]
    const bh = Math.max(1, (bv / maxBar) * plotH)
    barsSvg += `<rect class="ts-bar" data-idx="${i}" x="${cx - barW / 2}" y="${PT + plotH - bh}" width="${barW}" height="${bh}" rx="2" fill="${C.salmon}" fill-opacity="0.78" />`
    pts.push(`${cx.toFixed(1)},${yLine(lv).toFixed(1)}`)
    if (i % labelStride === 0 || i === n - 1) {
      xLabels += `<text x="${cx}" y="${H - 12}" text-anchor="middle" fill="${C.muted}" font-family="Departure Mono" font-size="10">${esc(s.bucket.slice(5))}</text>`
    }
  })

  const linePath = pts.length ? `M ${pts.join(' L ')}` : ''
  const dotsSvg = series.map((s, i) => {
    const cx = xAt(i), cy = yLine(lineVals[i])
    return `<circle class="ts-hit" data-idx="${i}" cx="${cx}" cy="${cy}" r="${n > 40 ? 2.8 : 4.2}" fill="${C.magenta}" stroke="${C.ground}" stroke-width="1.5" style="cursor:pointer" />`
  }).join('')

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Time series chart">
    ${gridSvg}
    ${barsSvg}
    <path d="${linePath}" fill="none" stroke="${C.magenta}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
    ${dotsSvg}
    ${xLabels}
  </svg>`

  legend.innerHTML = isAgents
    ? `<span><i class="dot dot-salmon"></i> Tasks Posted (left axis)</span><span><i class="dot dot-magenta"></i> Active Agents (right axis)</span>`
    : `<span><i class="dot dot-salmon"></i> Rewards Put Up USD (left axis)</span><span><i class="dot dot-magenta"></i> Rewards Paid USD (right axis)</span>`

  wrap.querySelectorAll('.ts-bar, .ts-hit').forEach(el => {
    el.addEventListener('mousemove', evt => {
      const s = series[Number(el.dataset.idx)]
      showTooltip(evt, `Bucket ${s.bucket}`, [
        `Active Agents: ${fmtInt(s.activeAgents)} (New: ${fmtInt(s.newAgents)})`,
        `Tasks Posted: ${fmtInt(s.tasksCreated)} | Completed: ${fmtInt(s.completedTasks)}`,
        `Rewards Put Up: ${fmtUsd(Number(s.rewardVolume || 0) / 1e6)}`,
        `Rewards Paid: ${fmtUsd(Number(s.paidVolume || 0) / 1e6)} (${fmtInt(s.settlements)} settlements)`,
      ])
    })
    el.addEventListener('mouseleave', hideTooltip)
  })
}

function renderBreakdowns() {
  const cur = activeChainData()
  const modes = cur ? cur.tasks.modeBreakdown : state.data.platform.breakdowns.mode
  const statuses = cur ? cur.tasks.statusBreakdown : state.data.platform.breakdowns.status

  $('mode-subtitle').textContent = cur
    ? `From ${fmtInt(cur.tasks.sampleCount)} sampled ${cur.meta.name} tasks (chainId=${cur.meta.id}).`
    : 'Platform-wide totals from /api/stats/breakdowns.'
  $('status-subtitle').textContent = cur
    ? `Resolution state across ${fmtInt(cur.tasks.sampleCount)} sampled ${cur.meta.name} tasks.`
    : 'Platform-wide task states from /api/stats/breakdowns.'

  const drawList = (targetId, items, keyField, primaryKey) => {
    const total = items.reduce((s, it) => s + Number(it.count || 0), 0) || 1
    $(targetId).innerHTML = `<div class="bar-list">${items.map(it => {
      const pct = ((Number(it.count) / total) * 100).toFixed(1)
      const label = String(it[keyField]).replace(/_/g, ' ')
      const isPrim = it[keyField] === primaryKey
      return `<div class="bar-row">
        <div class="bar-meta"><span class="bar-name">${esc(label)}</span><span class="bar-val">${fmtInt(it.count)} (${pct}%)</span></div>
        <div class="bar-track"><div class="bar-fill${isPrim ? ' primary' : ''}" style="width:${Math.max(1.5, Number(pct))}%"></div></div>
      </div>`
    }).join('')}</div>`
  }

  drawList('mode-breakdown', modes, 'mode', 'bounty')
  drawList('status-breakdown', statuses, 'status', 'completed')
}

function combinedCapitalFlow() {
  const map = new Map()
  for (const cid of ['4217', '8453']) {
    for (const e of state.data.chains[cid].tasks.capitalFlow) {
      const k = `${e.from}|${e.to}`
      const cur = map.get(k) || {from: e.from, to: e.to, usd: 0, count: 0}
      cur.usd = Math.round((cur.usd + e.usd) * 100) / 100
      cur.count += e.count
      map.set(k, cur)
    }
  }
  return [...map.values()]
}

function renderCapitalRiver() {
  const cur = activeChainData()
  const edges = cur ? cur.tasks.capitalFlow : combinedCapitalFlow()
  const sum = cur
    ? cur.tasks.summary
    : {
        totalVolumeUsd: state.data.chains['4217'].tasks.summary.totalVolumeUsd + state.data.chains['8453'].tasks.summary.totalVolumeUsd,
        paidVolumeUsd: state.data.chains['4217'].tasks.summary.paidVolumeUsd + state.data.chains['8453'].tasks.summary.paidVolumeUsd,
        openEscrowUsd: state.data.chains['4217'].tasks.summary.openEscrowUsd + state.data.chains['8453'].tasks.summary.openEscrowUsd,
      }
  const sampleN = cur
    ? `${fmtInt(cur.tasks.sampleCount)} ${cur.meta.name} tasks`
    : `${fmtInt(state.data.chains['4217'].tasks.sampleCount + state.data.chains['8453'].tasks.sampleCount)} tasks (Tempo + Base)`
  $('flow-sample-pill').textContent = sampleN

  const cols = [
    ['Top 3 Posters', 'Posters #4–#13', 'Long-Tail Posters'],
    ['Bounty', 'Claim', 'Pitch', 'Benchmark', 'Auction'],
    ['Paid to Winners', 'Active Escrow', 'Expired / Cancelled'],
  ]

  // Compute node totals
  const nodeVal = new Map()
  for (const e of edges) {
    if (cols[0].includes(e.from)) nodeVal.set(e.from, (nodeVal.get(e.from) || 0) + e.usd)
    if (cols[1].includes(e.to)) nodeVal.set(e.to, (nodeVal.get(e.to) || 0) + e.usd)
    if (cols[2].includes(e.to)) nodeVal.set(e.to, (nodeVal.get(e.to) || 0) + e.usd)
  }

  const W = 960, H = 400, padY = 48, gap = 14, nodeW = 16
  const colX = [176, 472, 768]
  const usableH = H - padY - 22

  const nodes = new Map()
  cols.forEach((names, ci) => {
    const active = names.filter(n => (nodeVal.get(n) || 0) > 0)
    const colTotal = active.reduce((s, n) => s + (nodeVal.get(n) || 0), 0) || 1
    const availH = usableH - gap * Math.max(0, active.length - 1)
    let y = padY
    active.forEach(name => {
      const val = nodeVal.get(name) || 0
      const h = Math.max(18, (val / colTotal) * availH)
      nodes.set(name, {name, ci, x: colX[ci], y, h, val, outOff: 0, inOff: 0})
      y += h + gap
    })
  })

  // Render ribbons
  let linksSvg = ''
  edges.filter(e => e.usd > 0 && nodes.has(e.from) && nodes.has(e.to)).forEach((e, idx) => {
    const src = nodes.get(e.from)
    const dst = nodes.get(e.to)
    const sh = Math.max(2, (e.usd / (src.val || 1)) * src.h)
    const dh = Math.max(2, (e.usd / (dst.val || 1)) * dst.h)
    const sy0 = src.y + src.outOff
    const sy1 = Math.min(src.y + src.h, sy0 + sh)
    const dy0 = dst.y + dst.inOff
    const dy1 = Math.min(dst.y + dst.h, dy0 + dh)
    src.outOff += sh
    dst.inOff += dh

    const x0 = src.x + nodeW
    const x1 = dst.x
    const mx = (x0 + x1) / 2
    const path = `M${x0},${sy0} C${mx},${sy0} ${mx},${dy0} ${x1},${dy0} L${x1},${dy1} C${mx},${dy1} ${mx},${sy1} ${x0},${sy1} Z`
    const color = e.to === 'Paid to Winners' ? C.magenta : e.to === 'Active Escrow' ? C.salmon : C.muted
    linksSvg += `<path class="flow-link" data-idx="${idx}" d="${path}" fill="${color}" fill-opacity="0.34" stroke="${color}" stroke-opacity="0.45" stroke-width="0.6" style="cursor:pointer" />`
  })

  let nodesSvg = ''
  for (const n of nodes.values()) {
    const fill = n.name === 'Paid to Winners' ? C.magenta : n.name === 'Active Escrow' ? C.salmon : n.ci === 0 ? C.cream : C.line
    const labelX = n.ci === 0 ? n.x - 10 : n.ci === 2 ? n.x + nodeW + 10 : n.x + nodeW / 2
    const anchor = n.ci === 0 ? 'end' : n.ci === 2 ? 'start' : 'middle'
    const labelY = n.ci === 1 ? n.y - 8 : n.y + n.h / 2 - 3
    nodesSvg += `<rect x="${n.x}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${fill}" />`
    if (n.ci === 1) {
      nodesSvg += `<rect x="${labelX - 46}" y="${labelY - 13}" width="92" height="17" rx="4" fill="${C.ground}" fill-opacity="0.88" stroke="${C.line}" stroke-width="0.8" />`
    }
    nodesSvg += `<text x="${labelX}" y="${labelY}" text-anchor="${anchor}" fill="${C.paper}" font-family="Inter Tight" font-weight="600" font-size="13">${esc(n.name)}</text>`
    if (n.ci !== 1) {
      nodesSvg += `<text x="${labelX}" y="${labelY + 15}" text-anchor="${anchor}" fill="${C.muted}" font-family="Departure Mono" font-size="11">${fmtUsd(n.val)}</text>`
    }
  }

  const wrap = $('capital-river-chart')
  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Capital River flow diagram">
    <text x="${colX[0]}" y="14" text-anchor="end" fill="${C.salmon}" font-family="Departure Mono" font-size="11">ORIGIN (POSTERS)</text>
    <text x="${colX[1] + 8}" y="14" text-anchor="middle" fill="${C.salmon}" font-family="Departure Mono" font-size="11">TASK MODE</text>
    <text x="${colX[2] + nodeW}" y="14" text-anchor="start" fill="${C.salmon}" font-family="Departure Mono" font-size="11">ESCROW OUTCOME</text>
    ${linksSvg}
    ${nodesSvg}
  </svg>`

  const activeEdges = edges.filter(e => e.usd > 0 && nodes.has(e.from) && nodes.has(e.to))
  wrap.querySelectorAll('.flow-link').forEach((el, i) => {
    const e = activeEdges[i]
    el.addEventListener('mousemove', evt => {
      el.setAttribute('fill-opacity', '0.68')
      showTooltip(evt, `${e.from} → ${e.to}`, [
        `Escrowed Volume: ${fmtUsd(e.usd)}`,
        `Tasks: ${fmtInt(e.count)}`,
      ])
    })
    el.addEventListener('mouseleave', () => {
      el.setAttribute('fill-opacity', '0.34')
      hideTooltip()
    })
  })

  const settledPct = sum.totalVolumeUsd ? ((sum.paidVolumeUsd / sum.totalVolumeUsd) * 100).toFixed(1) : '0.0'
  $('flow-callouts').innerHTML = `
    <div class="callout-item"><div class="lbl">SAMPLED ESCROW VOLUME</div><div class="val">${fmtUsd(sum.totalVolumeUsd)}</div></div>
    <div class="callout-item"><div class="lbl">SETTLED TO WINNERS</div><div class="val" style="color:var(--magenta)">${fmtUsd(sum.paidVolumeUsd)} (${settledPct}%)</div></div>
    <div class="callout-item"><div class="lbl">HELD IN ACTIVE ESCROW</div><div class="val" style="color:var(--salmon)">${fmtUsd(sum.openEscrowUsd)}</div></div>
  `
}

function renderSwarm() {
  const cur = activeChainData()
  let pts = cur
    ? cur.tasks.swarmPoints.map(p => ({...p, chainId: cur.meta.id}))
    : [
        ...state.data.chains['4217'].tasks.swarmPoints.map(p => ({...p, chainId: 4217})),
        ...state.data.chains['8453'].tasks.swarmPoints.map(p => ({...p, chainId: 8453})),
      ]
  if (state.swarmStatus !== 'all') {
    pts = pts.filter(p => p.status === state.swarmStatus)
  }

  const wrap = $('swarm-chart')
  if (!pts.length) {
    wrap.innerHTML = '<p class="muted-note">No tasks match the selected status filter.</p>'
    return
  }

  const W = 960, H = 340, PL = 66, PR = 26, PT = 22, PB = 44
  const plotW = W - PL - PR
  const plotH = H - PT - PB
  const maxSubs = Math.max(10, ...pts.map(p => p.subs))
  const maxUsd = Math.max(5, ...pts.map(p => p.usd))

  const xScale = s => PL + (Math.log10(s + 1) / Math.log10(maxSubs + 2)) * plotW
  const yScale = u => PT + plotH - (Math.log10(Math.max(0.05, u) + 0.1) - Math.log10(0.15)) / (Math.log10(maxUsd + 0.1) - Math.log10(0.15)) * plotH

  let grid = ''
  for (const u of [0.25, 1, 5, 20, 50, 100]) {
    if (u > maxUsd * 1.2) continue
    const y = yScale(u)
    if (y < PT || y > PT + plotH) continue
    grid += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="${C.line}" stroke-dasharray="3 4" stroke-opacity="0.6" />`
    grid += `<text x="${PL - 8}" y="${y + 4}" text-anchor="end" fill="${C.muted}" font-family="Departure Mono" font-size="11">${fmtCompactUsd(u)}</text>`
  }
  for (const s of [0, 1, 3, 10, 25, 50, 100]) {
    if (s > maxSubs * 1.15) continue
    const x = xScale(s)
    grid += `<line x1="${x}" y1="${PT}" x2="${x}" y2="${PT + plotH}" stroke="${C.line}" stroke-dasharray="3 4" stroke-opacity="0.45" />`
    grid += `<text x="${x}" y="${H - 18}" text-anchor="middle" fill="${C.muted}" font-family="Departure Mono" font-size="11">${s}</text>`
  }

  const circles = pts.map((p, idx) => {
    const cx = xScale(p.subs)
    const cy = Math.max(PT + 5, Math.min(PT + plotH - 5, yScale(p.usd)))
    const fill = p.status === 'completed' ? C.magenta : p.status === 'open' ? C.salmon : C.muted
    const r = p.usd >= 20 ? 7.5 : p.usd >= 5 ? 5.8 : 4.3
    const stroke = p.verified ? C.paper : C.ground
    const sw = p.verified ? 1.8 : 1
    return `<circle class="swarm-dot" data-idx="${idx}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" fill-opacity="0.82" stroke="${stroke}" stroke-width="${sw}" style="cursor:pointer" />`
  }).join('')

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Swarm Convergence scatter plot">
    ${grid}
    <text x="${PL + plotW / 2}" y="${H - 2}" text-anchor="middle" fill="${C.muted}" font-family="Departure Mono" font-size="11">SUBMISSIONS PER TASK (LOG SCALE)</text>
    <text x="16" y="${PT + plotH / 2}" transform="rotate(-90 16 ${PT + plotH / 2})" text-anchor="middle" fill="${C.muted}" font-family="Departure Mono" font-size="11">REWARD USD (LOG)</text>
    ${circles}
  </svg>`

  wrap.querySelectorAll('.swarm-dot').forEach(el => {
    const p = pts[Number(el.dataset.idx)]
    el.addEventListener('mousemove', evt => {
      showTooltip(evt, `${p.ref} · ${p.title}`, [
        `Reward: ${fmtUsd(p.usd)} (${p.chainId === 4217 ? 'Tempo OUSD' : 'Base USDC'})`,
        `Submissions: ${fmtInt(p.subs)} · Status: ${p.status} · Mode: ${p.mode}`,
        `TAP Gate: ${p.verified ? 'Verified agents only' : 'Open'} · Click to inspect`,
      ])
    })
    el.addEventListener('mouseleave', hideTooltip)
    el.addEventListener('click', () => {
      window.open(`https://taskmarket.dev/tasks/${p.id}?chain=${p.chainId}`, '_blank', 'noopener,noreferrer')
    })
  })
}

function renderInsights() {
  const t = state.data.chains['4217']
  const b = state.data.chains['8453']
  const cur = activeChainData()
  const s = cur ? cur.tasks.summary : t.tasks.summary
  const label = cur ? cur.meta.name : 'Tempo (Primary)'

  $('insight-cards').innerHTML = `
    <article class="insight-card">
      <p class="kicker">POSTER CONCENTRATION (${esc(label)})</p>
      <p class="big">${s.top5ShareTasks}%</p>
      <p class="desc">Share of sampled tasks posted by the top 5 addresses (${s.top5ShareVol}% of reward volume; #1 poster = ${s.top1ShareTasks}%).</p>
    </article>
    <article class="insight-card">
      <p class="kicker">RESOLUTION VS DEATH RATE</p>
      <p class="big" style="color:var(--magenta)">${s.completionRate}%</p>
      <p class="desc">Resolved tasks paid to winners, versus ${s.deathRate}% expired or cancelled (${fmtInt(s.zeroSubExpired)} expired with 0 submissions).</p>
    </article>
    <article class="insight-card">
      <p class="kicker">SWARM DENSITY &amp; GATING</p>
      <p class="big">${s.avgSubsPerTask}</p>
      <p class="desc">Average submissions per sampled task; ${s.tapGatedPct}% of tasks require TAP-verified agents.</p>
    </article>
    <article class="insight-card">
      <p class="kicker">MEDIAN TASK WINDOW</p>
      <p class="big">${s.medianWindowHours != null ? s.medianWindowHours + 'h' : '—'}</p>
      <p class="desc">Median expiry window from task post to deadline across ${fmtInt((cur || t).tasks.sampleCount)} sampled tasks.</p>
    </article>
  `

  // Weekly Distinct Posters chart
  const weeks = cur ? cur.tasks.weeklyPosters : state.data.platform.combinedWeeklyPosters
  $('posters-subtitle').textContent = cur
    ? `Unique requester addresses posting tasks per ISO week on ${cur.meta.name} (${fmtInt(cur.tasks.sampleCount)} tasks from ${(cur.tasks.oldestTaskAt || '').slice(0, 10)} to ${(cur.tasks.newestTaskAt || '').slice(0, 10)}).`
    : 'Unique requester addresses posting tasks per ISO week across Tempo and Base combined.'

  const wrap = $('weekly-posters-chart')
  if (!weeks.length) {
    wrap.innerHTML = '<p class="muted-note">No weekly poster data available.</p>'
  } else {
    const W = 960, H = 250, PL = 54, PR = 24, PT = 18, PB = 42
    const plotW = W - PL - PR
    const plotH = H - PT - PB
    const maxP = Math.max(1, ...weeks.map(w => w.distinctPosters)) * 1.18
    const slotW = plotW / weeks.length
    const barW = Math.max(8, Math.min(34, slotW * 0.62))

    let grid = ''
    for (let i = 0; i <= 4; i++) {
      const y = PT + (plotH * i) / 4
      const val = Math.round(maxP * (1 - i / 4))
      grid += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="${C.line}" stroke-dasharray="3 4" stroke-opacity="0.65" />`
      grid += `<text x="${PL - 8}" y="${y + 4}" text-anchor="end" fill="${C.muted}" font-family="Departure Mono" font-size="11">${val}</text>`
    }

    const stride = Math.max(1, Math.ceil(weeks.length / 10))
    let bars = ''
    weeks.forEach((w, i) => {
      const cx = PL + slotW * i + slotW / 2
      const bh = Math.max(2, (w.distinctPosters / maxP) * plotH)
      const isLast = i === weeks.length - 1
      bars += `<rect class="wk-bar" data-idx="${i}" x="${cx - barW / 2}" y="${PT + plotH - bh}" width="${barW}" height="${bh}" rx="3" fill="${isLast ? C.magenta : C.salmon}" style="cursor:pointer" />`
      bars += `<text x="${cx}" y="${PT + plotH - bh - 5}" text-anchor="middle" fill="${C.paper}" font-family="Departure Mono" font-size="10">${w.distinctPosters}</text>`
      if (i % stride === 0 || isLast) {
        bars += `<text x="${cx}" y="${H - 14}" text-anchor="middle" fill="${C.muted}" font-family="Departure Mono" font-size="10">${esc(w.monday.slice(5))}</text>`
      }
    })

    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distinct task posters per week">${grid}${bars}</svg>`
    wrap.querySelectorAll('.wk-bar').forEach(el => {
      const w = weeks[Number(el.dataset.idx)]
      el.addEventListener('mousemove', evt => {
        const lines = [`Distinct Posters: ${fmtInt(w.distinctPosters)}`, `Tasks Posted: ${fmtInt(w.tasks)}`]
        if (w.volumeUsd != null) lines.push(`Escrowed Volume: ${fmtUsd(w.volumeUsd)}`)
        if (w.tempoPosters != null) lines.push(`Tempo Posters: ${w.tempoPosters} · Base Posters: ${w.basePosters}`)
        showTooltip(evt, `Week ${w.week} (Mon ${w.monday})`, lines)
      })
      el.addEventListener('mouseleave', hideTooltip)
    })
  }

  // Reward Bands ("Tasks That Died") table
  const bands = cur
    ? cur.tasks.rewardBands
    : t.tasks.rewardBands.map((tb, idx) => {
        const bb = b.tasks.rewardBands[idx]
        return {
          band: tb.band,
          total: tb.total + bb.total,
          completed: tb.completed + bb.completed,
          open: tb.open + bb.open,
          expired: tb.expired + bb.expired,
          cancelled: tb.cancelled + bb.cancelled,
          volumeUsd: tb.volumeUsd + bb.volumeUsd,
        }
      })

  $('reward-bands-table').innerHTML = `<table class="data-table">
    <thead><tr><th>Reward Band</th><th class="num">Tasks</th><th class="num">Paid</th><th class="num">Open</th><th class="num">Expired/Canc.</th><th class="num">Volume</th></tr></thead>
    <tbody>${bands.map(r => `<tr>
      <td><strong>${esc(r.band)}</strong></td>
      <td class="num">${fmtInt(r.total)}</td>
      <td class="num" style="color:var(--magenta)">${fmtInt(r.completed)}</td>
      <td class="num" style="color:var(--salmon)">${fmtInt(r.open)}</td>
      <td class="num">${fmtInt(r.expired + r.cancelled)}</td>
      <td class="num">${fmtUsd(r.volumeUsd)}</td>
    </tr>`).join('')}</tbody>
  </table>`

  // Top Posters table
  const posters = cur ? cur.tasks.topPosters : t.tasks.topPosters
  $('top-posters-table').innerHTML = `<table class="data-table">
    <thead><tr><th>Address</th><th class="num">Tasks</th><th class="num">Paid</th><th class="num">Expired</th><th class="num">Escrowed</th></tr></thead>
    <tbody>${posters.map(p => `<tr>
      <td class="mono">${esc(p.address)}</td>
      <td class="num">${fmtInt(p.tasks)}</td>
      <td class="num" style="color:var(--magenta)">${fmtInt(p.completed)}</td>
      <td class="num">${fmtInt(p.expired)}</td>
      <td class="num">${fmtUsd(p.volumeUsd)}</td>
    </tr>`).join('')}</tbody>
  </table>`

  // Tempo vs Base comparison table
  $('chain-compare-table').innerHTML = `<table class="data-table">
    <thead><tr><th>Metric</th><th class="num">Tempo (4217 · OUSD)</th><th class="num">Base (8453 · USDC)</th></tr></thead>
    <tbody>
      <tr><td>Paid Workers (API stats)</td><td class="num">${fmtInt(t.stats.paidWorkers)}</td><td class="num">${fmtInt(b.stats.paidWorkers)}</td></tr>
      <tr><td>Active Wallets (API stats)</td><td class="num">${fmtInt(t.stats.activeWallets)}</td><td class="num">${fmtInt(b.stats.activeWallets)}</td></tr>
      <tr><td>Recent Sample Window</td><td class="num">${esc((t.tasks.oldestTaskAt || '').slice(0, 10))} → ${esc((t.tasks.newestTaskAt || '').slice(0, 10))} (${fmtInt(t.tasks.sampleCount)})</td><td class="num">${esc((b.tasks.oldestTaskAt || '').slice(0, 10))} → ${esc((b.tasks.newestTaskAt || '').slice(0, 10))} (${fmtInt(b.tasks.sampleCount)})</td></tr>
      <tr><td>Distinct Posters in Sample</td><td class="num">${fmtInt(t.tasks.summary.distinctPosters)}</td><td class="num">${fmtInt(b.tasks.summary.distinctPosters)}</td></tr>
      <tr><td>Sampled Escrowed Volume</td><td class="num">${fmtUsd(t.tasks.summary.totalVolumeUsd)}</td><td class="num">${fmtUsd(b.tasks.summary.totalVolumeUsd)}</td></tr>
      <tr><td>Settled Rate (Completed / Resolved)</td><td class="num" style="color:var(--magenta)">${t.tasks.summary.completionRate}%</td><td class="num">${b.tasks.summary.completionRate}%</td></tr>
      <tr><td>Avg Submissions / Task</td><td class="num">${t.tasks.summary.avgSubsPerTask}</td><td class="num">${b.tasks.summary.avgSubsPerTask}</td></tr>
    </tbody>
  </table>`
}

function renderHeatmap() {
  const hm = state.heatmapDim === 'hourOfWeek'
    ? state.data.platform.heatmapHour
    : state.data.platform.heatmapMode
  const wrap = $('heatmap-chart')
  const rows = hm.rowKeys || []
  const cols = hm.colKeys || []
  const maxC = Math.max(1, Number(hm.maxCount || 1))
  const lookup = new Map((hm.cells || []).map(c => [`${c.row}|${c.col}`, c]))

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const cellW = state.heatmapDim === 'hourOfWeek' ? 32 : 26
  const cellH = 28
  const gap = 4
  const PL = 92, PT = 28
  const W = PL + cols.length * (cellW + gap) + 12
  const H = PT + rows.length * (cellH + gap) + 12

  let svg = ''
  cols.forEach((col, ci) => {
    const x = PL + ci * (cellW + gap) + cellW / 2
    const lbl = state.heatmapDim === 'hourOfWeek' ? `${String(col).padStart(2, '0')}h` : (ci % 3 === 0 ? col.slice(5) : '')
    if (lbl) svg += `<text x="${x}" y="16" text-anchor="middle" fill="${C.muted}" font-family="Departure Mono" font-size="10">${esc(lbl)}</text>`
  })

  rows.forEach((row, ri) => {
    const y = PT + ri * (cellH + gap)
    const rLbl = state.heatmapDim === 'hourOfWeek' ? (dayNames[Number(row)] || row) : row
    svg += `<text x="${PL - 10}" y="${y + cellH / 2 + 4}" text-anchor="end" fill="${C.cream}" font-family="Departure Mono" font-size="11">${esc(rLbl)}</text>`
    cols.forEach((col, ci) => {
      const x = PL + ci * (cellW + gap)
      const cell = lookup.get(`${row}|${col}`)
      const count = Number(cell?.count || 0)
      const ratio = count / maxC
      let fill = C.ground
      let opacity = 1
      if (count > 0) {
        if (ratio > 0.65) { fill = C.magenta; opacity = 0.55 + ratio * 0.45 }
        else if (ratio > 0.22) { fill = C.salmon; opacity = 0.35 + ratio * 0.6 }
        else { fill = C.maroon; opacity = 0.75 + ratio * 0.25 }
      }
      svg += `<rect class="hm-cell" data-row="${esc(rLbl)}" data-col="${esc(col)}" data-count="${count}" data-vol="${cell?.volume || 0}" x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="4" fill="${fill}" fill-opacity="${opacity.toFixed(2)}" stroke="${C.line}" stroke-opacity="0.55" style="cursor:pointer" />`
    })
  })

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 680)}px" role="img" aria-label="Activity heatmap">${svg}</svg>`
  wrap.querySelectorAll('.hm-cell').forEach(el => {
    el.addEventListener('mousemove', evt => {
      const colTxt = state.heatmapDim === 'hourOfWeek' ? `${String(el.dataset.col).padStart(2, '0')}:00 UTC` : el.dataset.col
      const vol = Number(el.dataset.vol || 0) / 1e6
      const lines = [`Events: ${fmtInt(el.dataset.count)}`]
      if (vol > 0) lines.push(`Volume: ${fmtUsd(vol)}`)
      showTooltip(evt, `${el.dataset.row} · ${colTxt}`, lines)
    })
    el.addEventListener('mouseleave', hideTooltip)
  })
}

function renderFeed() {
  let items = state.data.platform.feed || []
  if (state.chain !== 'both') {
    const cid = Number(state.chain)
    const filtered = items.filter(it => Number(it.chainId) === cid)
    if (filtered.length) items = filtered
  }
  if (state.feedType !== 'all') {
    items = items.filter(it => it.type === state.feedType || (state.feedType === 'task_settled' && /settled|paid|award|completed/i.test(it.type)))
  }

  const labelFor = type => ({
    task_submitted: ['SUBMITTED', ''],
    task_created: ['POSTED', 'created'],
    task_settled: ['SETTLED', 'settled'],
    task_completed: ['PAID', 'settled'],
    task_rated: ['RATED', ''],
  }[type] || [String(type || 'EVENT').toUpperCase().replace(/^TASK_/, ''), ''])

  $('feed-list').innerHTML = items.length ? items.slice(0, 40).map(it => {
    const [badge, cls] = labelFor(it.type)
    const ts = new Date(it.timestamp).toISOString().replace('T', ' ').slice(5, 16) + ' UTC'
    const chainName = Number(it.chainId) === 8453 ? 'Base · USDC' : 'Tempo · OUSD'
    const amt = it.amountUsd != null && it.amountUsd > 0 ? fmtUsd(it.amountUsd) : ''
    return `<a class="feed-row" href="https://taskmarket.dev/tasks/${esc(it.taskId)}?chain=${esc(it.chainId || 4217)}" target="_blank" rel="noopener noreferrer">
      <span class="feed-badge ${cls}">${esc(badge)}</span>
      <div>
        <p class="feed-title">${esc(it.taskTitle)}</p>
        <div class="feed-meta">${esc(it.actor)} (${esc(it.actorType)}) · ${esc(chainName)}</div>
      </div>
      <div class="feed-right">${amt ? `<div style="color:var(--magenta)">${esc(amt)}</div>` : ''}<div style="color:var(--muted)">${esc(ts)}</div></div>
    </a>`
  }).join('') : '<p class="muted-note">No recent feed items match this filter.</p>'
}

function exportShareCard() {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const ctx = canvas.getContext('2d')

  // Background ground + top-left maroon glow
  ctx.fillStyle = C.ground
  ctx.fillRect(0, 0, 1200, 630)
  const g = ctx.createRadialGradient(140, 40, 20, 140, 40, 680)
  g.addColorStop(0, 'rgba(58, 20, 32, 0.95)')
  g.addColorStop(1, 'rgba(18, 16, 14, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1200, 630)

  // Border frame
  ctx.strokeStyle = C.line
  ctx.lineWidth = 2
  ctx.strokeRect(36, 36, 1128, 558)

  const d = state.data
  const cur = state.chain === 'both' ? null : d.chains[state.chain]
  const chainTitle = state.chain === 'both' ? 'TEMPO (OUSD) + BASE (USDC)' : `${cur.meta.name.toUpperCase()} (${cur.meta.token})`
  const viewNames = {
    overview: 'Market Overview',
    flow: 'Capital River',
    swarm: 'Swarm Convergence',
    insights: 'Market Insights',
    heatmap: 'Activity Heatmap',
    feed: 'Live Activity',
  }

  // Top-right address
  ctx.fillStyle = C.cream
  ctx.font = '20px "Departure Mono", monospace'
  ctx.textAlign = 'right'
  ctx.fillText('taskmarket.dev', 1124, 96)

  // Eyebrow + Serif Headline with one italic magenta word
  ctx.textAlign = 'left'
  ctx.fillStyle = C.salmon
  ctx.font = '18px "Departure Mono", monospace'
  ctx.fillText(`${chainTitle}  ·  ${viewNames[state.view].toUpperCase()}`, 76, 188)

  ctx.fillStyle = C.paper
  ctx.font = '72px "Instrument Serif", Georgia, serif'
  const prefix = 'The live market, '
  ctx.fillText(prefix, 76, 268)
  const pw = ctx.measureText(prefix).width
  ctx.fillStyle = C.magenta
  ctx.font = 'italic 72px "Instrument Serif", Georgia, serif'
  ctx.fillText('unfolded.', 76 + pw, 268)

  // 3 KPI panels
  const t = d.chains['4217'].stats
  const b = d.chains['8453'].stats
  const cTasks = cur ? cur.tasks.summary : d.chains['4217'].tasks.summary
  const tiles = [
    ['ACTIVE AGENTS (7D)', fmtInt(t.activeAgents7d), `${fmtInt(t.openTasks)} open tasks now`],
    ['PAID WORKERS', fmtInt(state.chain === 'both' ? t.paidWorkers + b.paidWorkers : cur.stats.paidWorkers), `${fmtInt(state.chain === 'both' ? t.activeWallets + b.activeWallets : cur.stats.activeWallets)} active wallets`],
    ['SAMPLED SETTLED RATE', `${cTasks.completionRate}%`, `${fmtUsd(cTasks.paidVolumeUsd)} paid in sample`],
  ]
  tiles.forEach(([lbl, val, sub], i) => {
    const x = 76 + i * 356
    ctx.fillStyle = C.panel
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1.5
    ctx.fillRect(x, 326, 336, 168)
    ctx.strokeRect(x, 326, 336, 168)
    ctx.fillStyle = C.muted
    ctx.font = '15px "Departure Mono", monospace'
    ctx.fillText(lbl, x + 22, 364)
    ctx.fillStyle = i === 0 ? C.magenta : C.paper
    ctx.font = '44px "Departure Mono", monospace'
    ctx.fillText(val, x + 22, 428)
    ctx.fillStyle = C.muted
    ctx.font = '17px "Inter Tight", sans-serif'
    ctx.fillText(sub, x + 22, 466)
  })

  // Footer
  ctx.fillStyle = C.muted
  ctx.font = '15px "Departure Mono", monospace'
  const utc = new Date(d.generatedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  ctx.fillText(`Data as of ${utc}  ·  Made for a paid Taskmarket bounty`, 76, 558)

  // Draw official lockup top-left then download
  const img = new Image()
  img.onload = () => {
    const h = 42
    const w = (img.width / img.height) * h
    ctx.drawImage(img, 76, 66, w, h)
    const a = document.createElement('a')
    a.download = `taskmarket-${state.chain}-${state.view}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
    showToast(`Saved taskmarket-${state.chain}-${state.view}.png`)
  }
  img.onerror = () => {
    const a = document.createElement('a')
    a.download = `taskmarket-${state.chain}-${state.view}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
    showToast(`Saved taskmarket-${state.chain}-${state.view}.png`)
  }
  img.src = 'assets/taskmarket-lockup.png'
}

function updateControlsUI() {
  document.querySelectorAll('#chain-switch button').forEach(b => b.classList.toggle('active', b.dataset.chain === state.chain))
  document.querySelectorAll('#view-tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view))
  document.querySelectorAll('.view-panel').forEach(p => p.classList.toggle('active', p.id === `view-${state.view}`))
  document.querySelectorAll('#range-switch button').forEach(b => b.classList.toggle('active', b.dataset.range === state.range))
  document.querySelectorAll('#metric-switch button').forEach(b => b.classList.toggle('active', b.dataset.metric === state.metric))
  document.querySelectorAll('#swarm-filter button').forEach(b => b.classList.toggle('active', b.dataset.status === state.swarmStatus))
  document.querySelectorAll('#heatmap-switch button').forEach(b => b.classList.toggle('active', b.dataset.dim === state.heatmapDim))
  document.querySelectorAll('#feed-filter button').forEach(b => b.classList.toggle('active', b.dataset.type === state.feedType))
}

function renderAll() {
  updateControlsUI()
  syncHash()
  renderHeaderAndMethods()
  renderKPIs()
  renderTimeSeries()
  renderBreakdowns()
  renderCapitalRiver()
  renderSwarm()
  renderInsights()
  renderHeatmap()
  renderFeed()
}

function wireEvents() {
  $('chain-switch').addEventListener('click', e => {
    const btn = e.target.closest('button[data-chain]')
    if (!btn) return
    state.chain = btn.dataset.chain
    renderAll()
  })
  $('view-tabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]')
    if (!btn) return
    state.view = btn.dataset.view
    renderAll()
  })
  $('range-switch').addEventListener('click', e => {
    const btn = e.target.closest('button[data-range]')
    if (!btn) return
    state.range = btn.dataset.range
    updateControlsUI(); syncHash(); renderTimeSeries()
  })
  $('metric-switch').addEventListener('click', e => {
    const btn = e.target.closest('button[data-metric]')
    if (!btn) return
    state.metric = btn.dataset.metric
    updateControlsUI(); renderTimeSeries()
  })
  $('swarm-filter').addEventListener('click', e => {
    const btn = e.target.closest('button[data-status]')
    if (!btn) return
    state.swarmStatus = btn.dataset.status
    updateControlsUI(); renderSwarm()
  })
  $('heatmap-switch').addEventListener('click', e => {
    const btn = e.target.closest('button[data-dim]')
    if (!btn) return
    state.heatmapDim = btn.dataset.dim
    updateControlsUI(); renderHeatmap()
  })
  $('feed-filter').addEventListener('click', e => {
    const btn = e.target.closest('button[data-type]')
    if (!btn) return
    state.feedType = btn.dataset.type
    updateControlsUI(); renderFeed()
  })
  $('btn-copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      showToast('Copied link to current view')
    } catch {
      showToast(location.href)
    }
  })
  $('btn-share-card').addEventListener('click', exportShareCard)
  window.addEventListener('hashchange', () => { parseHash(); renderAll() })
}

async function boot() {
  parseHash()
  wireEvents()
  const res = await fetch('data/snapshot.json', {cache: 'no-cache'})
  if (!res.ok) throw new Error(`Failed to load snapshot (${res.status})`)
  state.data = await res.json()
  renderAll()
}

boot().catch(err => {
  $('data-as-of').textContent = 'Snapshot unavailable'
  $('kpi-grid').innerHTML = `<div class="panel" style="grid-column:1/-1">Could not load market snapshot: ${esc(err.message)}</div>`
})
