# TPM-Agent

A collection of automation tools for technical program / project management work — reporting, status rollups, and other recurring TPM tasks that are easy to automate but tedious to do by hand.

Each tool lives in its own directory under `tools/`, with its own README, dependencies, and (if scheduled) GitHub Actions workflow. This keeps tools independent so they can be added, run, and maintained without affecting each other.

## Tools

| Tool | What it does |
|------|---------------|
| [`sprint-report-agent`](tools/sprint-report-agent/README.md) | Generates sprint summary, stakeholder update, and weekly rollup reports from GitHub (and optionally Jira / Linear) issue/PR data. Can run on a schedule via GitHub Actions and post to Slack. |

See each tool's README for setup, configuration, and usage details.

## Repo Layout

```
tools/
└── sprint-report-agent/   # Sprint report generator (see table above)
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
