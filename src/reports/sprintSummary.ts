/**
 * Report A — Sprint Summary
 * Audience: Engineering
 * Tone: factual, concise, technical
 */

import { Ticket, Metrics, ReportConfig } from "../types";

export function generateSprintSummary(
  tickets: Ticket[],
  metrics: Metrics,
  config: ReportConfig
): string {
  const lines: string[] = [];
  const { teamName, sprintName, sprintGoal, dateRange } = config;

  lines.push(`# Sprint Summary — ${sprintName}`);
  lines.push(`**Team:** ${teamName}  `);
  lines.push(`**Period:** ${dateRange.from} → ${dateRange.to}  `);
  lines.push(`**Generated:** ${new Date().toISOString().split("T")[0]}`);
  lines.push("");

  if (sprintGoal) {
    lines.push("## Sprint Goal");
    lines.push(`> ${sprintGoal}`);
    lines.push("");
  }

  // ── Velocity & Completion ──────────────────────────────────────────────────
  lines.push("## Velocity & Completion");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total tickets | ${metrics.total} |`);
  lines.push(`| Done | ${metrics.done} |`);
  lines.push(`| In Progress | ${metrics.inProgress} |`);
  lines.push(`| In Review | ${metrics.inReview} |`);
  lines.push(`| Blocked | ${metrics.blocked} |`);
  lines.push(`| Completion rate | **${metrics.completionRate}%** |`);

  if (metrics.velocityAvailable) {
    lines.push(`| Points committed | ${metrics.pointsCommitted} |`);
    lines.push(`| Points completed | ${metrics.pointsCompleted} |`);
    const pct =
      metrics.pointsCommitted > 0
        ? Math.round((metrics.pointsCompleted / metrics.pointsCommitted) * 100)
        : 0;
    lines.push(`| Velocity | ${metrics.pointsCompleted} / ${metrics.pointsCommitted} pts (${pct}%) |`);
  } else {
    lines.push(`| Velocity | _No story points found — skipped_ |`);
  }
  lines.push("");

  // ── Done this sprint ───────────────────────────────────────────────────────
  lines.push("## Done This Sprint");
  if (metrics.doneTickets.length === 0) {
    lines.push("_No tickets moved to done during this period._");
  } else {
    for (const t of metrics.doneTickets) {
      const pts = t.storyPoints != null ? ` _(${t.storyPoints}pts)_` : "";
      lines.push(`- [${t.id}](${t.url}) **${t.title}**${pts} — @${t.assignee}`);
    }
  }
  lines.push("");

  // ── Spillover ─────────────────────────────────────────────────────────────
  lines.push("## Carried Over / Spillover");
  if (metrics.spillover.length === 0) {
    lines.push("_No spillover — all committed work completed or not started._");
  } else {
    for (const t of metrics.spillover) {
      const badge = statusBadge(t.status);
      lines.push(`- [${t.id}](${t.url}) ${badge} **${t.title}** — @${t.assignee}`);
    }
  }
  lines.push("");

  // ── Blocked ───────────────────────────────────────────────────────────────
  lines.push("## Blocked Items");
  if (metrics.blockedTickets.length === 0) {
    lines.push("_No blocked items._");
  } else {
    for (const t of metrics.blockedTickets) {
      const blockerLabel = t.labels.find((l) => l.includes("blocker:")) ?? "";
      const blocker = blockerLabel ? ` — **Blocker:** ${blockerLabel.replace("blocker:", "").trim()}` : "";
      lines.push(`- [${t.id}](${t.url}) **${t.title}** — @${t.assignee}${blocker}`);
    }
  }
  lines.push("");

  // ── By-assignee breakdown ─────────────────────────────────────────────────
  lines.push("## By Assignee");
  lines.push("| Assignee | Done | In Progress | Blocked |");
  lines.push("|----------|------|-------------|---------|");
  const sorted = Object.entries(metrics.byAssignee).sort(
    ([, a], [, b]) => b.done - a.done
  );
  for (const [assignee, counts] of sorted) {
    lines.push(`| @${assignee} | ${counts.done} | ${counts.inProgress} | ${counts.blocked} |`);
  }
  lines.push("");

  // ── Key wins ─────────────────────────────────────────────────────────────
  lines.push("## Key Wins");
  const highlights = metrics.doneTickets
    .filter((t) => t.priority === "critical" || t.priority === "high")
    .slice(0, 3);
  if (highlights.length === 0) {
    const fallback = metrics.doneTickets.slice(0, 3);
    if (fallback.length === 0) {
      lines.push("_No completed items to highlight._");
    } else {
      for (const t of fallback) {
        lines.push(`- **${t.title}** ([${t.id}](${t.url}))`);
      }
    }
  } else {
    for (const t of highlights) {
      lines.push(`- **${t.title}** ([${t.id}](${t.url})) — ${t.priority} priority`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

function statusBadge(status: Ticket["status"]): string {
  const map: Record<Ticket["status"], string> = {
    in_progress: "`🔄 in progress`",
    in_review: "`👀 in review`",
    blocked: "`🚫 blocked`",
    todo: "`📋 todo`",
    done: "`✅ done`",
  };
  return map[status] ?? `\`${status}\``;
}
