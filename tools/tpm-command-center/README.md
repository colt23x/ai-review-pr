# TPM Command Center

A unified, MCP-connected work surface for technical program managers. It connects Jira, your calendar, and other tools through **MCP servers** into a single view that tells you what actually needs your attention today — not just a merged feed of everything.

Full design rationale, goals, and phasing live in [SPEC.md](SPEC.md). This README covers what's implemented and how to run it.

## What's implemented (Phase 1 + deterministic intelligence)

- **MCP host/client layer** (`src/mcp/host.ts`) — connects to any configured MCP server over stdio or Streamable HTTP and calls its tools. The only layer that knows a given tool exists.
- **Unified work model** (`src/model.ts`) — MCP results are normalized into six tool-agnostic entities: `WorkItem`, `Event`, `Thread`, `Document`, `Signal`, and the computed `Workstream` (spec §7).
- **Source adapters** (`src/sources/`) — Jira and calendar for Phase 1. Adapters are mapping, not integration: transport/auth/API details live in the MCP server. Adding a source = one adapter + one config entry.
- **Correlation** (`src/intelligence/correlate.ts`) — links entities across tools via explicit references and shared identifiers (ticket keys, dependency links) into `Workstream` groupings with recorded evidence. Precision over recall; no LLM in the loop yet (that's Phase 2 residue-matching).
- **Risk detection** (`src/intelligence/risk.ts`) — deterministic rules, never model guesses: **blocked**, **slipping** (with upstream propagation), **stale**, **owed** (spec §8.3).
- **Attention ranking** (`src/intelligence/rank.ts`) — every item scored for how much it needs you *now*, with human-readable reasons and a suppression threshold. Most items should score low and stay out of the way.
- **Views** (`src/views/`) — `today` ("what needs me?"), `prep` ("prep me for this meeting"), `risks` ("what's at risk?"), plus an **HTML dashboard** (`html`/`serve`) that renders all of them on one page: stat tiles, the attention list with scores and reasons, the schedule with inline meeting prep, risk sections, and workstreams with linking evidence. Self-contained (no external assets), light/dark aware.

Not yet implemented (later phases per spec §10): LLM-assisted correlation, Slack/GitHub adapters, status generation, and the confirmed write-back surface.

## Quick start (no setup needed)

Demo mode runs the full pipeline — normalize → correlate → risk → rank → render — against built-in sample data, no MCP servers required:

```bash
npm install
npm run demo                                  # "what needs me today?"
npx ts-node src/index.ts --demo risks         # blocked / slipping / stale / owed
npx ts-node src/index.ts --demo prep "Payments sync"

# HTML dashboard (all views on one page)
npx ts-node src/index.ts --demo serve         # http://localhost:3141
npx ts-node src/index.ts --demo html          # or write dashboard.html and open it
```

## Connecting real sources

1. Copy the example config and fill in your MCP servers:

   ```bash
   cp servers.example.json servers.json
   ```

   Each entry names an adapter (`jira`, `calendar`) and how to reach the server — a `command`/`args` pair for stdio servers or a `url` for remote ones — plus its auth env vars. `servers.json` is gitignored; secrets never leave your machine except to the MCP server itself.

2. Set `me.names` / `me.emails` to how you appear as an assignee/attendee in your tools — that's what "is this mine / waiting on me" checks use.

3. Sync and open the views:

   ```bash
   npm run sync     # pull from all servers, build the local snapshot (.tpmcc/)
   npm run today
   npm run risks
   npx ts-node src/index.ts prep "<event title>"
   npx ts-node src/index.ts serve   # browser dashboard; hit /sync to force a re-pull
   ```

The local snapshot is a lens, not a system of record — delete `.tpmcc/` any time; everything re-fetches from the sources.

## Adding a new source

1. Write an adapter in `src/sources/<tool>.ts` that maps that MCP server's tool results into unified entities (~60 lines; see `jira.ts`).
2. Register it in `src/sources/index.ts`.
3. Add a server entry in `servers.json` pointing at the MCP server.

Everything above the adapter — correlation, risk, ranking, views — works unchanged, because it only ever sees the unified model.
