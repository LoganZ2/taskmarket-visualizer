#!/usr/bin/env node
/**
 * Server-side data aggregator for the Taskmarket Live Market Visualizer.
 * Fetches all six public endpoints from https://api.taskmarket.dev for Tempo (4217)
 * and Base (8453), preserves exact headline and time-series figures, and derives
 * reproducible analytics directly from /api/tasks.
 *
 * Zero external dependencies. Requires Node 20+.
 */
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const API_BASE = 'https://api.taskmarket.dev'
const CHAINS = [
  {id: 4217, slug: 'tempo', name: 'Tempo', token: 'OUSD'},
  {id: 8453, slug: 'base', name: 'Base', token: 'USDC'},
]
const MAX_TASK_PAGES = 15 // up to 1,500 most recent tasks per chain

const HEADERS = {
  'User-Agent': 'taskmarket-visualizer/1.0 (+https://github.com/LoganZ2/taskmarket-visualizer)',
  'Accept': 'application/json',
}

async function fetchJson(path) {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {headers: HEADERS, signal: AbortSignal.timeout(25000)})
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

function isoWeekKey(isoString) {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return null
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)
  // Return Monday date of that ISO week for readable chronological labeling
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = mon.getUTCDay() || 7
  mon.setUTCDate(mon.getUTCDate() - (dow - 1))
  return {
    week: `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`,
    monday: mon.toISOString().slice(0, 10),
  }
}

function shortAddr(addr) {
  if (!addr || typeof addr !== 'string' || addr.length < 12) return 'unknown'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function toUsd(baseUnits) {
  const n = Number(baseUnits ?? 0)
  return Number.isFinite(n) ? Math.round((n / 1e6) * 1e6) / 1e6 : 0
}

function cleanTitle(desc) {
  if (!desc || typeof desc !== 'string') return 'Untitled task'
  const firstLine = desc.split('\n').map(s => s.trim()).find(Boolean) || 'Untitled task'
  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}…` : firstLine
}

function rewardBand(usd) {
  if (usd < 1) return '< $1'
  if (usd < 5) return '$1 – $5'
  if (usd < 20) return '$5 – $20'
  return '$20+'
}

function analyzeTasks(tasks, chainMeta) {
  const weekMap = new Map()
  const posterMap = new Map()
  const modeCounts = {}
  const statusCounts = {}
  const bandStats = {
    '< $1': {band: '< $1', total: 0, completed: 0, open: 0, expired: 0, cancelled: 0, other: 0, volumeUsd: 0, paidUsd: 0},
    '$1 – $5': {band: '$1 – $5', total: 0, completed: 0, open: 0, expired: 0, cancelled: 0, other: 0, volumeUsd: 0, paidUsd: 0},
    '$5 – $20': {band: '$5 – $20', total: 0, completed: 0, open: 0, expired: 0, cancelled: 0, other: 0, volumeUsd: 0, paidUsd: 0},
    '$20+': {band: '$20+', total: 0, completed: 0, open: 0, expired: 0, cancelled: 0, other: 0, volumeUsd: 0, paidUsd: 0},
  }

  let totalVolumeUsd = 0
  let paidVolumeUsd = 0
  let openEscrowUsd = 0
  let expiredVolumeUsd = 0
  let tapGatedCount = 0
  let zeroSubExpired = 0
  let totalSubmissions = 0

  const winnerSet = new Set()
  const swarmPoints = []

  // For Capital River (Poster Tier -> Mode -> Outcome)
  const flowEdges = new Map()
  const addEdge = (from, to, usd, count) => {
    const k = `${from}|${to}`
    const cur = flowEdges.get(k) || {from, to, usd: 0, count: 0}
    cur.usd = Math.round((cur.usd + usd) * 100) / 100
    cur.count += count
    flowEdges.set(k, cur)
  }

  for (const t of tasks) {
    const usd = toUsd(t.reward)
    const status = t.status || 'unknown'
    const mode = t.mode || 'bounty'
    const req = (t.requester || 'unknown').toLowerCase()
    const subs = Number(t.submissionCount ?? 0)
    const verified = Array.isArray(t.verifiedBy) && t.verifiedBy.length > 0

    totalVolumeUsd += usd
    totalSubmissions += subs
    if (verified) tapGatedCount++

    modeCounts[mode] = (modeCounts[mode] || 0) + 1
    statusCounts[status] = (statusCounts[status] || 0) + 1

    const b = bandStats[rewardBand(usd)]
    b.total++
    b.volumeUsd += usd
    if (status === 'completed') {
      b.completed++
      b.paidUsd += usd
      paidVolumeUsd += usd
      if (t.primaryAward?.workerAddress) winnerSet.add(t.primaryAward.workerAddress.toLowerCase())
    } else if (status === 'open' || status === 'claimed' || status === 'worker_selected' || status === 'pending_approval') {
      b.open++
      openEscrowUsd += usd
    } else if (status === 'expired') {
      b.expired++
      expiredVolumeUsd += usd
      if (subs === 0) zeroSubExpired++
    } else if (status === 'cancelled') {
      b.cancelled++
    } else {
      b.other++
    }

    // Poster totals
    let p = posterMap.get(req)
    if (!p) {
      p = {address: shortAddr(t.requester), tasks: 0, volumeUsd: 0, completed: 0, expired: 0, open: 0}
      posterMap.set(req, p)
    }
    p.tasks++
    p.volumeUsd += usd
    if (status === 'completed') p.completed++
    else if (status === 'expired') p.expired++
    else if (status === 'open') p.open++

    // Weekly distinct posters
    const wk = isoWeekKey(t.createdAt)
    if (wk) {
      let w = weekMap.get(wk.week)
      if (!w) {
        w = {week: wk.week, monday: wk.monday, posters: new Set(), tasks: 0, volumeUsd: 0, completed: 0}
        weekMap.set(wk.week, w)
      }
      w.posters.add(req)
      w.tasks++
      w.volumeUsd += usd
      if (status === 'completed') w.completed++
    }
  }

  // Sort posters by escrowed volume to assign poster tiers for Capital River
  const sortedPosters = [...posterMap.entries()]
    .map(([key, v]) => ({key, ...v, volumeUsd: Math.round(v.volumeUsd * 100) / 100}))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)

  const top3Keys = new Set(sortedPosters.slice(0, 3).map(p => p.key))
  const next10Keys = new Set(sortedPosters.slice(3, 13).map(p => p.key))

  for (const t of tasks) {
    const usd = toUsd(t.reward)
    const req = (t.requester || 'unknown').toLowerCase()
    const tier = top3Keys.has(req) ? 'Top 3 Posters' : next10Keys.has(req) ? 'Posters #4–#13' : 'Long-Tail Posters'
    const modeLabel = (t.mode || 'bounty').replace(/^./, c => c.toUpperCase())
    const outcome =
      t.status === 'completed' ? 'Paid to Winners'
        : (t.status === 'open' || t.status === 'claimed' || t.status === 'worker_selected' || t.status === 'pending_approval') ? 'Active Escrow'
          : 'Expired / Cancelled'

    addEdge(tier, modeLabel, usd, 1)
    addEdge(modeLabel, outcome, usd, 1)
  }

  // Swarm convergence scatter: keep up to 240 representative recent tasks (all open + highest-signal completed/expired)
  const openTasks = tasks.filter(t => t.status === 'open')
  const nonOpen = tasks.filter(t => t.status !== 'open').slice(0, Math.max(0, 220 - openTasks.length))
  for (const t of [...openTasks, ...nonOpen]) {
    const usd = toUsd(t.reward)
    const createdMs = Date.parse(t.createdAt || '')
    const expiryMs = Date.parse(t.expiryTime || '')
    const windowHours = (Number.isFinite(createdMs) && Number.isFinite(expiryMs) && expiryMs > createdMs)
      ? Math.round(((expiryMs - createdMs) / 3600000) * 10) / 10
      : null
    swarmPoints.push({
      id: t.id,
      ref: t.referenceCode || t.id.slice(0, 10),
      title: cleanTitle(t.description),
      usd: Math.round(usd * 100) / 100,
      subs: Number(t.submissionCount ?? 0),
      status: t.status,
      mode: t.mode || 'bounty',
      verified: Array.isArray(t.verifiedBy) && t.verifiedBy.length > 0,
      windowHours,
      createdAt: t.createdAt,
    })
  }

  const weeklyPosters = [...weekMap.values()]
    .sort((a, b) => a.monday.localeCompare(b.monday))
    .map(w => ({
      week: w.week,
      monday: w.monday,
      distinctPosters: w.posters.size,
      tasks: w.tasks,
      volumeUsd: Math.round(w.volumeUsd * 100) / 100,
      completed: w.completed,
    }))

  const totalTasks = tasks.length
  const top1ShareTasks = totalTasks ? Math.round(((sortedPosters[0]?.tasks || 0) / totalTasks) * 1000) / 10 : 0
  const top5Tasks = sortedPosters.slice(0, 5).reduce((s, p) => s + p.tasks, 0)
  const top5ShareTasks = totalTasks ? Math.round((top5Tasks / totalTasks) * 1000) / 10 : 0
  const top5Vol = sortedPosters.slice(0, 5).reduce((s, p) => s + p.volumeUsd, 0)
  const top5ShareVol = totalVolumeUsd ? Math.round((top5Vol / totalVolumeUsd) * 1000) / 10 : 0

  const resolvedCount = (statusCounts.completed || 0) + (statusCounts.expired || 0) + (statusCounts.cancelled || 0)
  const completionRate = resolvedCount ? Math.round(((statusCounts.completed || 0) / resolvedCount) * 1000) / 10 : 0
  const deathRate = resolvedCount ? Math.round((((statusCounts.expired || 0) + (statusCounts.cancelled || 0)) / resolvedCount) * 1000) / 10 : 0

  // Window durations across tasks (createdAt -> expiryTime)
  const windows = tasks
    .map(t => (Date.parse(t.expiryTime) - Date.parse(t.createdAt)) / 3600000)
    .filter(h => Number.isFinite(h) && h > 0 && h < 8760)
    .sort((a, b) => a - b)
  const medianWindowHours = windows.length ? Math.round(windows[Math.floor(windows.length / 2)] * 10) / 10 : null

  return {
    chainId: chainMeta.id,
    sampleCount: totalTasks,
    oldestTaskAt: tasks.at(-1)?.createdAt || null,
    newestTaskAt: tasks[0]?.createdAt || null,
    summary: {
      distinctPosters: posterMap.size,
      distinctWinners: winnerSet.size,
      totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
      paidVolumeUsd: Math.round(paidVolumeUsd * 100) / 100,
      openEscrowUsd: Math.round(openEscrowUsd * 100) / 100,
      expiredVolumeUsd: Math.round(expiredVolumeUsd * 100) / 100,
      completionRate,
      deathRate,
      zeroSubExpired,
      tapGatedPct: totalTasks ? Math.round((tapGatedCount / totalTasks) * 1000) / 10 : 0,
      avgSubsPerTask: totalTasks ? Math.round((totalSubmissions / totalTasks) * 10) / 10 : 0,
      medianWindowHours,
      top1ShareTasks,
      top5ShareTasks,
      top5ShareVol,
    },
    modeBreakdown: Object.entries(modeCounts)
      .map(([mode, count]) => ({mode, count}))
      .sort((a, b) => b.count - a.count),
    statusBreakdown: Object.entries(statusCounts)
      .map(([status, count]) => ({status, count}))
      .sort((a, b) => b.count - a.count),
    weeklyPosters,
    topPosters: sortedPosters.slice(0, 8).map(({address, tasks: cnt, volumeUsd, completed, expired, open}) => ({
      address, tasks: cnt, volumeUsd, completed, expired, open,
    })),
    rewardBands: Object.values(bandStats).map(b => ({
      ...b,
      volumeUsd: Math.round(b.volumeUsd * 100) / 100,
      paidUsd: Math.round(b.paidUsd * 100) / 100,
    })),
    capitalFlow: [...flowEdges.values()],
    swarmPoints,
  }
}

async function fetchChainTasks(chainId) {
  const all = []
  let cursor = null
  for (let page = 0; page < MAX_TASK_PAGES; page++) {
    const qs = new URLSearchParams({
      chainId: String(chainId),
      sort: 'newest',
      limit: '100',
    })
    if (cursor) qs.set('cursor', cursor)
    const res = await fetchJson(`/api/tasks?${qs.toString()}`)
    const batch = Array.isArray(res) ? res : (res.tasks || [])
    if (!batch.length) break
    all.push(...batch)
    cursor = !Array.isArray(res) ? (res.nextCursor || res.cursor || null) : null
    if (!cursor || batch.length < 100) break
  }
  return all
}

export async function buildSnapshot() {
  const startedAt = new Date().toISOString()

  // Fetch platform-wide stats & chain-specific stats in parallel
  const [
    tempoStats,
    baseStats,
    breakdowns,
    series7d,
    series30d,
    series90d,
    seriesAll,
    heatmapHour,
    heatmapMode,
    feed,
    tempoTasks,
    baseTasks,
  ] = await Promise.all([
    fetchJson('/api/market/stats?chainId=4217'),
    fetchJson('/api/market/stats?chainId=8453'),
    fetchJson('/api/stats/breakdowns?chainId=4217'),
    fetchJson('/api/stats/platform-time-series?chainId=4217&range=7d&bucket=day'),
    fetchJson('/api/stats/platform-time-series?chainId=4217&range=30d&bucket=day'),
    fetchJson('/api/stats/platform-time-series?chainId=4217&range=90d&bucket=day'),
    fetchJson('/api/stats/platform-time-series?chainId=4217&range=all&bucket=week'),
    fetchJson('/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek'),
    fetchJson('/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=mode'),
    fetchJson('/api/stats/activity-feed?chainId=4217&limit=50'),
    fetchChainTasks(4217),
    fetchChainTasks(8453),
  ])

  const tempoAnalysis = analyzeTasks(tempoTasks, CHAINS[0])
  const baseAnalysis = analyzeTasks(baseTasks, CHAINS[1])

  // Compute exact settlement latency from recent completed feed items if available + time series
  const feedItems = (feed.items || []).map(it => ({
    type: it.type,
    timestamp: it.timestamp,
    taskId: it.taskId,
    taskTitle: it.taskTitle || 'Task',
    chainId: it.chainId,
    actor: shortAddr(it.actor),
    actorType: it.actorType || 'unknown',
    actorAgentId: it.actorAgentId || null,
    amountUsd: it.amount != null ? toUsd(it.amount) : null,
    rating: it.rating ?? null,
  }))

  // Combined weekly distinct posters across both chains
  const allTasks = [...tempoTasks, ...baseTasks]
  const combinedWeekMap = new Map()
  for (const t of allTasks) {
    const wk = isoWeekKey(t.createdAt)
    if (!wk) continue
    let w = combinedWeekMap.get(wk.week)
    if (!w) {
      w = {week: wk.week, monday: wk.monday, tempo: new Set(), base: new Set(), both: new Set(), tasks: 0}
      combinedWeekMap.set(wk.week, w)
    }
    const req = (t.requester || 'unknown').toLowerCase()
    w.both.add(req)
    if (Number(t.chainId) === 8453) w.base.add(req)
    else w.tempo.add(req)
    w.tasks++
  }
  const combinedWeeklyPosters = [...combinedWeekMap.values()]
    .sort((a, b) => a.monday.localeCompare(b.monday))
    .map(w => ({
      week: w.week,
      monday: w.monday,
      distinctPosters: w.both.size,
      tempoPosters: w.tempo.size,
      basePosters: w.base.size,
      tasks: w.tasks,
    }))

  return {
    generatedAt: startedAt,
    apiBase: API_BASE,
    endpoints: [
      '/api/market/stats?chainId=4217|8453',
      '/api/stats/breakdowns?chainId=4217',
      '/api/stats/platform-time-series?chainId=4217&range=7d|30d|90d|all&bucket=day|week',
      '/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek|mode',
      '/api/stats/activity-feed?chainId=4217&limit=50',
      '/api/tasks?chainId=4217|8453&sort=newest&limit=100&cursor=…',
    ],
    platform: {
      breakdowns,
      series: {
        '7d': series7d,
        '30d': series30d,
        '90d': series90d,
        'all': seriesAll,
      },
      heatmapHour,
      heatmapMode,
      feed: feedItems,
      combinedWeeklyPosters,
    },
    chains: {
      '4217': {
        meta: CHAINS[0],
        stats: tempoStats,
        tasks: tempoAnalysis,
      },
      '8453': {
        meta: CHAINS[1],
        stats: baseStats,
        tasks: baseAnalysis,
      },
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/data/snapshot.json')
  mkdirSync(dirname(outPath), {recursive: true})
  const snap = await buildSnapshot()
  writeFileSync(outPath, JSON.stringify(snap))
  console.log(JSON.stringify({
    ok: true,
    generatedAt: snap.generatedAt,
    outPath,
    tempoTasks: snap.chains['4217'].tasks.sampleCount,
    baseTasks: snap.chains['8453'].tasks.sampleCount,
    tempoPosters: snap.chains['4217'].tasks.summary.distinctPosters,
    basePosters: snap.chains['8453'].tasks.summary.distinctPosters,
  }))
}
