#!/usr/bin/env node
/**
 * One-command self-hosted server for the Taskmarket Live Market Visualizer.
 * Fetches live data server-side from https://api.taskmarket.dev with a 60-second
 * in-memory cache (respecting browser CORS constraints) and serves the static UI.
 */
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {extname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {buildSnapshot} from './scripts/fetch-snapshot.mjs'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), 'docs')
const PORT = Number(process.env.PORT || 8080)
const CACHE_TTL_MS = Math.max(60_000, Number(process.env.CACHE_TTL_MS || 60_000))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
}

let cachedJson = null
let cachedAt = 0
let inflight = null

async function getSnapshotJson() {
  const now = Date.now()
  if (cachedJson && now - cachedAt < CACHE_TTL_MS) return cachedJson
  if (!inflight) {
    inflight = buildSnapshot()
      .then(snap => {
        cachedJson = JSON.stringify(snap)
        cachedAt = Date.now()
        return cachedJson
      })
      .catch(async err => {
        console.error('[refresh failed, falling back to baked snapshot]', err.message)
        if (cachedJson) return cachedJson
        return readFile(join(ROOT, 'data/snapshot.json'), 'utf8')
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, {'Content-Type': 'text/plain'})
      res.end('Method Not Allowed')
      return
    }
    if (url.pathname === '/healthz') {
      res.writeHead(200, {'Content-Type': 'application/json'})
      res.end(JSON.stringify({ok: true, cacheAgeSec: cachedAt ? Math.round((Date.now() - cachedAt) / 1000) : null}))
      return
    }
    if (url.pathname === '/data/snapshot.json' || url.pathname === '/api/snapshot') {
      const body = await getSnapshotJson()
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      })
      res.end(req.method === 'HEAD' ? '' : body)
      return
    }
    let rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '')
    const abs = resolve(ROOT, rel)
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    const bytes = await readFile(abs)
    const mime = MIME[extname(abs).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': extname(abs) === '.html' ? 'public, max-age=60' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(req.method === 'HEAD' ? '' : bytes)
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, {'Content-Type': 'text/plain'})
    res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Taskmarket Visualizer listening on http://localhost:${PORT} (server-side cache ${CACHE_TTL_MS / 1000}s)`)
})
