import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fetchGitHub } from "./fetch/github";
import { normalizeTickets } from "./normalize";
import { computeMetrics } from "./metrics";
import { generateSprintSummary } from "./reports/sprintSummary";
import { generateStakeholderUpdate } from "./reports/stakeholderUpdate";
import { generateWeeklyRollup } from "./reports/weeklyRollup";
import { FetchConfig, ReportConfig, Ticket } from "./types";

// ── Config ────────────────────────────────────────────────────────────────────

const lookbackDays = parseInt(process.env.LOOKBACK_DAYS ?? "7", 10);
const teamName = process.env.TEAM_NAME ?? "Engineering";
const sprintGoal = process.env.SPRINT_GOAL;

const today = new Date();
const fromDate = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

const dateStr = today.toISOString().split("T")[0];
const sprintName =
  process.env.SPRINT_NAME ?? `Week of ${dateStr}`;

const fetchConfig: FetchConfig = {
  lookbackDays,
  milestone: process.env.GITHUB_MILESTONE,
};

const reportConfig: ReportConfig = {
  teamName,
  sprintName,
  sprintGoal,
  dateRange: {
    from: fromDate.toISOString().split("T")[0],
    to: dateStr,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeSlug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeReport(slug: string, content: string): string {
  const reportsDir = path.resolve(process.cwd(), "reports");
  ensureDir(reportsDir);
  const filename = `${dateStr}_${safeSlug(sprintName)}_${slug}.md`;
  const filepath = path.join(reportsDir, filename);
  fs.writeFileSync(filepath, content, "utf8");
  return filepath;
}

async function postToSlack(content: string, label: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl || process.env.POST_TO_SLACK !== "true") return;

  try {
    const { default: axios } = await import("axios");
    await axios.post(webhookUrl, {
      text: `*${label}*\n\`\`\`\n${content.slice(0, 2900)}\n\`\`\``,
    });
    console.log(`[slack] Posted: ${label}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[slack] Failed to post "${label}": ${msg}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🚀 Sprint Report Agent`);
  console.log(`   Team:   ${teamName}`);
  console.log(`   Sprint: ${sprintName}`);
  console.log(`   Range:  ${reportConfig.dateRange.from} → ${reportConfig.dateRange.to}\n`);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const rawTickets: Ticket[] = [];

  const githubTickets = await fetchGitHub(fetchConfig);
  rawTickets.push(...githubTickets);

  // Add more sources here as needed:
  // const jiraTickets = await fetchJira(fetchConfig);
  // rawTickets.push(...jiraTickets);
  // const linearTickets = await fetchLinear(fetchConfig);
  // rawTickets.push(...linearTickets);

  const tickets = normalizeTickets(rawTickets);
  console.log(`\n📋 Normalized ${tickets.length} tickets from ${rawTickets.length} raw items\n`);

  if (tickets.length === 0) {
    console.warn(
      "⚠️  No ticket data available. Reports will be generated with a data-unavailable notice.\n"
    );
  }

  // ── Compute metrics ────────────────────────────────────────────────────────
  const metrics = computeMetrics(tickets);

  // ── Generate reports ───────────────────────────────────────────────────────
  const sprintSummary = generateSprintSummary(tickets, metrics, reportConfig);
  const stakeholderUpdate = generateStakeholderUpdate(tickets, metrics, reportConfig);
  const weeklyRollup = generateWeeklyRollup(tickets, metrics, reportConfig);

  // ── Write files ────────────────────────────────────────────────────────────
  const paths = {
    sprintSummary: writeReport("sprint-summary", sprintSummary),
    stakeholderUpdate: writeReport("stakeholder-update", stakeholderUpdate),
    weeklyRollup: writeReport("weekly-rollup", weeklyRollup),
  };

  // ── Slack ──────────────────────────────────────────────────────────────────
  if (process.env.POST_TO_SLACK === "true") {
    await postToSlack(weeklyRollup, `Weekly Rollup — ${sprintName}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("✅ Reports written:");
  console.log(`   A (Engineering):  ${paths.sprintSummary}`);
  console.log(`   B (Leadership):   ${paths.stakeholderUpdate}`);
  console.log(`   C (Weekly):       ${paths.weeklyRollup}`);
  console.log(`\n📊 Metrics:`);
  console.log(`   Total tickets:    ${metrics.total}`);
  console.log(`   Done:             ${metrics.done} (${metrics.completionRate}%)`);
  console.log(`   Blocked:          ${metrics.blocked}`);
  if (metrics.velocityAvailable) {
    console.log(`   Velocity:         ${metrics.pointsCompleted}/${metrics.pointsCommitted} pts`);
  } else {
    console.log(`   Velocity:         N/A (no story points)`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
