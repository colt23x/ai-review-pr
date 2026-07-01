/**
 * Report C — Weekly Rollup
 * Audience: All
 * Tone: neutral, structured
 */

import { Ticket, Metrics, ReportConfig } from "../types";

export function generateWeeklyRollup(
  tickets: Ticket[],
  metrics: Metrics,
  config: ReportConfig
): string {
  const lines: string[] = [];
  const { teamName, sprintName, dateRange } = config;

  lines.push(`# Weekly Rollup — ${teamName}`);
  lines.push(`**${sprintName}** | ${dateRange.from} → ${dateRange.to}`);
  lines.push("");

  // ── Metrics snapshot ──────────────────────────────────────────────────────
  lines.push("## Metrics Snapshot");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Completion rate | ${metrics.completionRate}% (${metrics.done}/${metrics.total}) |`);
  if (metrics.velocityAvailable) {
    lines.push(`| Velocity | ${metrics.pointsCompleted} pts completed / ${metrics.pointsCommitted} pts committed |`);
  } else {
    lines.push(`| Velocity | Not available (no story points set) |`);
  }
  lines.push(`| Blocked | ${metrics.blocked} item${metrics.blocked !== 1 ? "s" : ""} |`);
  lines.push(`| In flight | ${metrics.inProgress + metrics.inReview} item${metrics.inProgress + metrics.inReview !== 1 ? "s" : ""} |`);
  lines.push("");

  // ── Highlights ────────────────────────────────────────────────────────────
  lines.push("## Highlights");
  const highlights = metrics.doneTickets
    .filter((t) => t.priority === "critical" || t.priority === "high")
    .slice(0, 5);
  const showItems = highlights.length > 0 ? highlights : metrics.doneTickets.slice(0, 5);

  if (showItems.length === 0) {
    lines.push("_No completed items this period._");
  } else {
    for (const t of showItems) {
      lines.push(`- [${t.id}](${t.url}) ${t.title}`);
    }
    if (metrics.doneTickets.length > 5) {
      lines.push(
        `- _…and ${metrics.doneTickets.length - 5} more completed items_`
      );
    }
  }
  lines.push("");

  // ── Blockers and asks ─────────────────────────────────────────────────────
  lines.push("## Blockers & Asks");
  if (metrics.blockedTickets.length === 0) {
    lines.push("_No active blockers._");
  } else {
    for (const t of metrics.blockedTickets) {
      lines.push(`- **${t.title}** — @${t.assignee} | [${t.id}](${t.url})`);
    }
  }
  lines.push("");

  // ── Upcoming work ─────────────────────────────────────────────────────────
  lines.push("## Upcoming Work");
  const upcoming = tickets.filter((t) => t.status === "todo").slice(0, 8);
  if (upcoming.length === 0) {
    lines.push("_No upcoming items tracked yet._");
  } else {
    for (const t of upcoming) {
      const pts = t.storyPoints != null ? ` (${t.storyPoints}pts)` : "";
      lines.push(`- [${t.id}](${t.url}) ${t.title}${pts} — @${t.assignee}`);
    }
  }
  lines.push("");

  // ── By-assignee summary ───────────────────────────────────────────────────
  lines.push("## Team Summary");
  lines.push("| Person | Done | In Flight | Blocked |");
  lines.push("|--------|------|-----------|---------|");
  const sorted = Object.entries(metrics.byAssignee).sort(
    ([, a], [, b]) => b.done - a.done
  );
  for (const [assignee, counts] of sorted) {
    lines.push(
      `| @${assignee} | ${counts.done} | ${counts.inProgress} | ${counts.blocked} |`
    );
  }
  lines.push("");

  return lines.join("\n");
}
