/**
 * Report B — Stakeholder Update
 * Audience: Leadership
 * Tone: business-oriented, no jargon, 1-page max
 */

import { Ticket, Metrics, ReportConfig } from "../types";

export function generateStakeholderUpdate(
  tickets: Ticket[],
  metrics: Metrics,
  config: ReportConfig
): string {
  const lines: string[] = [];
  const { teamName, sprintName, dateRange } = config;

  lines.push(`# ${teamName} Update — ${sprintName}`);
  lines.push(`_${dateRange.from} to ${dateRange.to}_`);
  lines.push("");

  // ── What we shipped ───────────────────────────────────────────────────────
  lines.push("## What We Shipped");
  if (metrics.doneTickets.length === 0) {
    lines.push("_No items completed during this period._");
  } else {
    // Group done tickets by their first label (treat as theme), falling back to "General"
    const byTheme = groupByTheme(metrics.doneTickets);
    for (const [theme, items] of Object.entries(byTheme)) {
      lines.push(`**${theme}**`);
      for (const t of items) {
        lines.push(`- ${t.title}`);
      }
      lines.push("");
    }
  }

  // ── What's in flight ─────────────────────────────────────────────────────
  lines.push("## What's In Flight");
  const inFlight = tickets.filter(
    (t) => t.status === "in_progress" || t.status === "in_review"
  );
  if (inFlight.length === 0) {
    lines.push("_No items currently in progress._");
  } else {
    for (const t of inFlight) {
      const stage = t.status === "in_review" ? "Under review" : "In progress";
      lines.push(`- **${t.title}** _(${stage})_`);
    }
  }
  lines.push("");

  // ── Risks / blockers ─────────────────────────────────────────────────────
  lines.push("## Risks & Blockers");
  if (metrics.blockedTickets.length === 0) {
    lines.push("_No blockers requiring attention at this time._");
  } else {
    lines.push(
      `> **${metrics.blockedTickets.length} item${metrics.blockedTickets.length > 1 ? "s" : ""} need${metrics.blockedTickets.length === 1 ? "s" : ""} attention.**`
    );
    lines.push("");
    for (const t of metrics.blockedTickets) {
      lines.push(`- **${t.title}** — owner: @${t.assignee}`);
    }
  }
  lines.push("");

  // ── What's next ───────────────────────────────────────────────────────────
  lines.push("## What's Next");
  const upcoming = tickets.filter((t) => t.status === "todo").slice(0, 5);
  if (upcoming.length === 0) {
    lines.push("_Upcoming work not yet tracked for the next period._");
  } else {
    for (const t of upcoming) {
      lines.push(`- ${t.title}`);
    }
  }
  lines.push("");

  // ── Snapshot ─────────────────────────────────────────────────────────────
  lines.push("## At a Glance");
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Completed | ${metrics.done} of ${metrics.total} items (${metrics.completionRate}%) |`);
  lines.push(`| In progress | ${metrics.inProgress + metrics.inReview} |`);
  lines.push(`| Blocked | ${metrics.blocked} |`);
  if (metrics.velocityAvailable) {
    lines.push(`| Story points delivered | ${metrics.pointsCompleted} / ${metrics.pointsCommitted} |`);
  }
  lines.push("");

  return lines.join("\n");
}

function groupByTheme(tickets: Ticket[]): Record<string, Ticket[]> {
  const groups: Record<string, Ticket[]> = {};

  for (const t of tickets) {
    // Use the first non-meta label as a theme, or "General"
    const themeLabel = t.labels.find(
      (l) =>
        !/^(priority|blocked|points?|sp|wip|bug|critical|high|low|medium)/i.test(l)
    );
    const theme = themeLabel
      ? capitalize(themeLabel.replace(/-/g, " "))
      : "General";
    if (!groups[theme]) groups[theme] = [];
    groups[theme].push(t);
  }

  // Always put "General" last
  const sorted: Record<string, Ticket[]> = {};
  for (const [k, v] of Object.entries(groups).sort(([a], [b]) =>
    a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b)
  )) {
    sorted[k] = v;
  }
  return sorted;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
