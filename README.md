# Taskmarket Live Market Visualizer

A public, read-only dashboard of Taskmarket's live market across **Tempo (`4217`, OUSD)** and **Base (`8453`, USDC)**.

- **Live HTTPS URL:** https://loganz2.github.io/taskmarket-visualizer/
- **License:** MIT
- **Dependencies:** Zero runtime packages (Node 20+ built-in `fetch` and `node:http`; vanilla HTML, CSS, and SVG).

## What it shows

1. **Overview & Trends:** Exact headline figures from `/api/market/stats`, interactive `7d | 30d | 90d | all` time series (active agents, tasks posted, rewards put up, rewards paid), and mode/status breakdowns.
2. **Capital River (`#view=flow`):** Interactive SVG flow tracing escrowed stablecoin rewards from requester cohorts through task modes (`bounty`, `claim`, `pitch`, `benchmark`, `auction`) to settled winners, active escrow, or expiry.
3. **Swarm Convergence (`#view=swarm`):** Log-scale scatter view of real tasks plotting submission swarm size against reward amount, clickable directly to `taskmarket.dev`.
4. **What Is Not Obvious (`#view=insights`):** Distinct task posters per ISO week computed directly from paginated `/api/tasks`, requester concentration (anonymized hex addresses only), resolution vs expiry rate by reward band, and Tempo vs Base comparison.
5. **Activity Heatmap (`#view=heatmap`) & Live Feed (`#view=feed`):** 30-day Hour-of-Week UTC and Mode-by-Day heatmaps plus filterable live event stream.
6. **Per-View Share Cards:** Every view has a deep link and a client-side `1200x630` PNG share-card exporter built on the Taskmarket brand kit.

## Server-side refresh (no browser-to-API requests)

Because `https://api.taskmarket.dev` restricts cross-origin browser requests, all data is fetched on the server:

- **Static GitHub Pages hosting:** `.github/workflows/refresh-data.yml` runs `node scripts/fetch-snapshot.mjs` every **30 minutes** (`*/30 * * * *`) and commits updated `docs/data/snapshot.json`.
- **Self-hosted Node server:** `npm start` runs `server.mjs`, which fetches directly from `api.taskmarket.dev` server-side and caches `/data/snapshot.json` in memory for **60 seconds**.

## One-command run & deploy

```sh
# Local or server (auto-refreshes with 60s server-side cache)
npm start

# Refresh static snapshot manually
npm run refresh

# Docker one-command deploy
docker build -t taskmarket-visualizer . && docker run -p 8080:8080 taskmarket-visualizer
```

## Endpoints used

- `/api/market/stats?chainId=4217` and `?chainId=8453`
- `/api/stats/breakdowns?chainId=4217`
- `/api/stats/platform-time-series?chainId=4217&range=7d|30d|90d|all&bucket=day|week`
- `/api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek|mode`
- `/api/stats/activity-feed?chainId=4217&limit=50`
- `/api/tasks?chainId=4217` and `?chainId=8453` (paginated)

---

*Made for a paid Taskmarket bounty. Not an official Taskmarket product.*
