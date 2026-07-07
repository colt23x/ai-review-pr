# TPM-Agent

A collection of automation tools for technical program / project management work — reporting, status rollups, and other recurring TPM tasks that are easy to automate but tedious to do by hand.

Each tool lives in its own directory under `tools/`, with its own README, dependencies, and (if scheduled) GitHub Actions workflow. This keeps tools independent so they can be added, run, and maintained without affecting each other.

## Tools

| Tool | What it does |
|------|---------------|
| [`tpm-command-center`](tools/tpm-command-center/README.md) | A unified, MCP-connected work surface for TPMs. Connects Jira, calendar, and other tools through MCP servers into a single attention-ranked view of what actually needs you today — with cross-tool workstream correlation, deterministic risk detection (blocked / slipping / stale / owed), and meeting-prep context packs. Not a merged feed; a synthesis layer. See the full [spec](tools/tpm-command-center/SPEC.md). |
| [`sprint-report-agent`](tools/sprint-report-agent/README.md) | Generates sprint summary, stakeholder update, and weekly rollup reports from GitHub (and optionally Jira / Linear) issue/PR data. Can run on a schedule via GitHub Actions and post to Slack. |

See each tool's README for setup, configuration, and usage details.

## Repo Layout

```
tools/
├── tpm-command-center/     # MCP-connected TPM work surface (see table above)
│   ├── README.md
│   ├── SPEC.md             # Full design spec
│   ├── package.json
│   ├── src/
│   └── servers.example.json
└── sprint-report-agent/    # Sprint report generator (see table above)
    ├── README.md
    ├── package.json
    ├── src/
    └── .env.example

.github/workflows/          # Scheduled/triggered runs for individual tools
```

## Adding a New Tool

1. Create a new directory under `tools/<tool-name>/` with its own `package.json`, source, and `README.md`.
2. Keep dependencies and config scoped to that directory so tools stay independent.
3. If the tool needs to run on a schedule or via CI, add a workflow under `.github/workflows/` (workflows must live at the repo root) and point its `working-directory` at `tools/<tool-name>`.
4. Add a row to the **Tools** table above with a one-line description.
