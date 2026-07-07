import { Config, isMe } from "../config";
import { Entity, RankedItem } from "../model";

/**
 * Attention ranking (spec §8.2): score every item for how much it needs the
 * TPM *right now*. The point is suppression as much as surfacing — most items
 * should score low and stay out of the way. Every score comes with
 * human-readable reasons; never an opaque number.
 */

/** Items scoring below this are suppressed from the "today" view. */
export const ATTENTION_THRESHOLD = 30;

export function rank(entities: Entity[], config: Config, now = new Date()): RankedItem[] {
  const byId = new Map(entities.map((e) => [e.id, e]));

  const ranked = entities
    .filter((e) => e.kind !== "signal" && e.kind !== "event") // events render in the schedule, not the attention list
    .filter((e) => !(e.kind === "work_item" && e.itemStatus === "done"))
    .map((e): RankedItem => {
      let score = 0;
      const reasons: string[] = [];

      // Ownership: yours outranks watched.
      if (isMe(config, e.owner)) {
        score += 25;
        reasons.push("you own this");
      }

      // Risk flags are the strongest signal something needs the TPM.
      for (const flag of e.flags) {
        const weight = { blocked: 40, owed: 40, slipping: 30, stale: 15 }[flag.type];
        score += weight;
        reasons.push(`${flag.type}: ${flag.reason}`);
      }

      // Priority of the underlying item.
      if (e.kind === "work_item") {
        if (e.priority === "critical") {
          score += 20;
          reasons.push("critical priority");
        } else if (e.priority === "high") {
          score += 10;
          reasons.push("high priority");
        }
        // Deadline proximity.
        if (e.dueDate) {
          const days = (Date.parse(e.dueDate) - now.getTime()) / 86400_000;
          if (days <= 2) {
            score += 20;
            reasons.push(days < 0 ? "past due" : "due within 2 days");
          } else if (days <= 7) {
            score += 10;
            reasons.push("due this week");
          }
        }
      }

      // Recency of change: recently-moved items are live.
      if (e.updatedAt) {
        const hours = (now.getTime() - Date.parse(e.updatedAt)) / 3600_000;
        if (hours <= 24) {
          score += 10;
          reasons.push("changed in the last day");
        }
      }

      // Proximity to a linked meeting: context needed soon.
      for (const linkId of e.links) {
        const linked = byId.get(linkId);
        if (linked?.kind === "event") {
          const hoursAway = (Date.parse(linked.start) - now.getTime()) / 3600_000;
          if (hoursAway >= 0 && hoursAway <= 8) {
            score += 25;
            reasons.push(`linked to "${linked.title}" in ${Math.round(hoursAway)}h`);
            break;
          }
        }
      }

      return { entity: e, score, reasons };
    });

  return ranked.sort((a, b) => b.score - a.score);
}

/** The attention view: ranked items above the suppression threshold. */
export function needsAttention(entities: Entity[], config: Config, now = new Date()): RankedItem[] {
  return rank(entities, config, now).filter((r) => r.score >= ATTENTION_THRESHOLD);
}
