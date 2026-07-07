import { Entity, Event, Workstream } from "../model";

/**
 * "Prep me for this meeting." (spec §5.2) — given a calendar event, assemble
 * the linked tickets, recent activity, and open flags so the TPM walks in loaded.
 */
export function renderPrep(
  query: string,
  entities: Entity[],
  workstreams: Workstream[]
): string {
  const events = entities.filter((e): e is Event => e.kind === "event");
  const q = query.toLowerCase();
  const event =
    events.find((e) => e.sourceNativeId === query) ??
    events.find((e) => e.title.toLowerCase().includes(q));

  if (!event) {
    const upcoming = events.map((e) => `- ${e.title} (${e.start})`).join("\n");
    return `No event matching "${query}".\n\nKnown events:\n${upcoming || "(none — run sync first)"}`;
  }

  const byId = new Map(entities.map((e) => [e.id, e]));
  const lines: string[] = [];
  lines.push(`# Prep: ${event.title}`);
  lines.push(`When: ${new Date(event.start).toLocaleString()} – ${new Date(event.end).toLocaleTimeString()}`);
  if (event.attendees.length) lines.push(`Who: ${event.attendees.join(", ")}`);
  if (event.body) lines.push(`\n> ${event.body.split("\n").join("\n> ")}`);
  lines.push("");

  const linked = event.links
    .map((id) => byId.get(id))
    .filter((e): e is Entity => !!e);

  lines.push(`## Linked work (${linked.length})`);
  if (linked.length === 0) {
    lines.push("Nothing linked to this meeting yet — no ticket references found in the event.");
  }
  for (const e of linked) {
    const ref = e.kind === "work_item" ? `${e.sourceNativeId} — ${e.title}` : e.title;
    lines.push(`- **${ref}**${e.status ? ` (${e.status})` : ""}${e.owner ? `, owner: ${e.owner}` : ""}`);
    for (const flag of e.flags) lines.push(`  - ⚠ ${flag.type}: ${flag.reason}`);
    if (e.updatedAt) lines.push(`  - last activity: ${new Date(e.updatedAt).toDateString()}`);
  }
  lines.push("");

  const ws = workstreams.find((w) => w.memberIds.includes(event.id));
  if (ws) {
    lines.push(`## Workstream: ${ws.name}`);
    lines.push("Why these are linked:");
    for (const ev of ws.evidence) lines.push(`- ${ev}`);
  }

  return lines.join("\n");
}
