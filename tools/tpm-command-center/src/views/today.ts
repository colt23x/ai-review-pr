import { Config } from "../config";
import { Entity, Event } from "../model";
import { needsAttention } from "../intelligence/rank";

/**
 * "What needs me today?" (spec §5.1) — the morning open. A ranked list of
 * things requiring the TPM's attention with the noise suppressed, plus
 * today's schedule with prep-needed markers.
 */
export function renderToday(entities: Entity[], config: Config, now = new Date()): string {
  const lines: string[] = [];
  lines.push(`# Today — ${now.toDateString()}`);
  lines.push("");

  const attention = needsAttention(entities, config, now);
  lines.push(`## Needs you (${attention.length})`);
  if (attention.length === 0) {
    lines.push("Nothing is waiting on you right now.");
  }
  for (const item of attention) {
    const e = item.entity;
    const ref = e.kind === "work_item" ? e.sourceNativeId : e.title;
    lines.push(`- **${ref}** ${e.kind === "work_item" ? e.title : ""} _(score ${item.score})_`);
    for (const reason of item.reasons) lines.push(`  - ${reason}`);
  }
  lines.push("");

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59);
  const events = entities.filter((e): e is Event => e.kind === "event");
  const upcoming = (until: number) =>
    events
      .filter((e) => Date.parse(e.start) >= now.getTime() - 3600_000 && Date.parse(e.start) <= until)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  let todaysEvents = upcoming(endOfDay.getTime());
  let scheduleTitle = `Schedule (${todaysEvents.length})`;
  if (todaysEvents.length === 0) {
    todaysEvents = upcoming(now.getTime() + 24 * 3600_000);
    scheduleTitle = `Schedule — nothing left today; next 24h (${todaysEvents.length})`;
  }
  lines.push(`## ${scheduleTitle}`);
  if (todaysEvents.length === 0) lines.push("No upcoming meetings.");
  for (const ev of todaysEvents) {
    const t = new Date(ev.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
    const linked = ev.links.length > 0 ? ` — ${ev.links.length} linked item(s), run \`prep "${ev.title}"\`` : "";
    lines.push(`- ${t}  **${ev.title}**${linked}`);
  }
  lines.push("");

  const suppressed = entities.filter(
    (e) => e.kind === "work_item" && e.itemStatus !== "done"
  ).length - attention.filter((a) => a.entity.kind === "work_item").length;
  lines.push(`_${suppressed} open item(s) suppressed as not needing you today._`);
  return lines.join("\n");
}
