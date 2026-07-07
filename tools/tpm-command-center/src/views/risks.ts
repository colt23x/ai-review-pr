import { Entity } from "../model";

/**
 * "What's at risk?" (spec §5.3) — blockers and slipping items across programs,
 * surfaced before someone else surfaces them. Purely a render of the
 * deterministic flags from risk detection.
 */
export function renderRisks(entities: Entity[]): string {
  const flagged = entities.filter((e) => e.flags.length > 0);
  const lines: string[] = ["# At risk", ""];
  if (flagged.length === 0) {
    lines.push("No blocked, slipping, stale, or owed items detected.");
    return lines.join("\n");
  }
  for (const type of ["blocked", "slipping", "owed", "stale"] as const) {
    const items = flagged.filter((e) => e.flags.some((f) => f.type === type));
    if (items.length === 0) continue;
    lines.push(`## ${type[0].toUpperCase()}${type.slice(1)} (${items.length})`);
    for (const e of items) {
      const ref = e.kind === "work_item" ? `${e.sourceNativeId} — ${e.title}` : e.title;
      lines.push(`- **${ref}**${e.owner ? ` (owner: ${e.owner})` : ""}`);
      for (const f of e.flags.filter((f) => f.type === type)) lines.push(`  - ${f.reason}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
