# TPM-Agent — Sprint Report Automation

Automatically generates three report types from GitHub (and optionally Jira / Linear) data:

| Report | Audience | File suffix |
|--------|----------|-------------|
| **A — Sprint Summary** | Engineering | `_sprint-summary.md` |
| **B — Stakeholder Update** | Leadership | `_stakeholder-update.md` |
| **C — Weekly Rollup** | All | `_weekly-rollup.md` |

Reports are written to `reports/YYYY-MM-DD_{sprint-name}_{type}.md`.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | ✅ | Personal access token with `repo` + `read:org` scopes |
| `GITHUB_REPOS` | ✅ | Comma-separated `org/repo` list, e.g. `acme/api,acme/web` |
| `TEAM_NAME` | — | Displayed in report headers (default: `Engineering`) |
| `LOOKBACK_DAYS` | — | Days of history to pull (default: `7`) |
| `SPRINT_NAME` | — | Sprint label in headers (default: `Week of YYYY-MM-DD`) |
| `SPRINT_GOAL` | — | Added to the engineering summary if provided |
| `GITHUB_MILESTONE` | — | Filter by milestone name instead of date range |
| `POST_TO_SLACK` | — | Set `true` to post the weekly rollup to Slack |
| `SLACK_WEBHOOK_URL` | — | Slack incoming webhook URL |

### 3. Run

```bash
# Development (no build step)
npm run dev

# Production
npm run build && npm start
```

---

## Story Points Convention

GitHub has no native story-points field. The agent reads them from labels using these patterns:

- `points:3` or `points-3`
- `sp:5`
- `3 points`
- `story-points-8`

If no tickets have matching labels, velocity is omitted from the reports.

---

## Status Mapping (GitHub)

| GitHub state / label | Ticket status |
|---------------------|---------------|
| Closed issue | `done` |
| Merged PR | `done` |
| Open issue with `blocked` label | `blocked` |
| Open issue with `in-review` label | `in_review` |
| Open issue with `in-progress` / `wip` label | `in_progress` |
| Open PR (not merged) | `in_review` |
| All other open issues | `todo` |

---

## Adding a New Data Source

1. Create `src/fetch/mysource.ts` — export `async function fetchMySource(config: FetchConfig): Promise<Ticket[]>`
2. Map the API response to the `Ticket` interface (see `src/types.ts`)
3. Import and call it in `src/index.ts` alongside the GitHub fetch
4. Add credentials to `.env.example`

---

## GitHub Actions — Scheduled Reports

The workflow `.github/workflows/sprint-report.yml` runs every **Friday at 4 PM UTC** and commits the reports back to the repo.

### Required secrets / variables in your GitHub repo

| Name | Type | Value |
|------|------|-------|
| `REPORT_GITHUB_TOKEN` | Secret | PAT with `repo` scope |
| `SLACK_WEBHOOK_URL` | Secret | Slack webhook (if using Slack) |
| `GITHUB_REPOS` | Variable | `org/repo,org/repo2` |
| `TEAM_NAME` | Variable | Your team name |
| `POST_TO_SLACK` | Variable | `true` or `false` |

You can also trigger it manually from the **Actions** tab with custom `lookback_days`, `sprint_name`, and `sprint_goal` inputs.

---

## Project Structure

```
src/
├── index.ts            # Orchestrator — fetch → normalize → metrics → reports
├── types.ts            # Ticket, Metrics, ReportConfig interfaces
├── normalize.ts        # Dedup and cross-source merge
├── metrics.ts          # Velocity, completion rate, blockers, by-assignee
├── fetch/
│   └── github.ts       # GitHub Issues + PRs fetcher
└── reports/
    ├── sprintSummary.ts       # Report A (engineering)
    ├── stakeholderUpdate.ts   # Report B (leadership)
    └── weeklyRollup.ts        # Report C (all)
.env.example
.github/workflows/sprint-report.yml
```
