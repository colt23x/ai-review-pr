import { Config, isMe } from "../config";
import { Entity, WorkItem } from "../model";

/**
 * Risk detection (spec §8.3): rule-based, not model-based, so it's trustworthy.
 * A blocked ticket is blocked because a field says so or a dependency link
 * exists — never because a model guessed. Flags are set in place on entities;
 * ranking and the risk view consume them.
 */
export function detectRisks(entities: Entity[], config: Config, now = new Date()): void {
  const byNativeId = new Map<string, WorkItem>();
  for (const e of entities) {
    if (e.kind === "work_item") byNativeId.set(e.sourceNativeId, e);
  }

  for (const e of entities) {
    e.flags = [];

    if (e.kind === "work_item") {
      // Blocked: explicit blocked state, or an open dependency on an unresolved item.
      if (e.itemStatus === "blocked") {
        e.flags.push({ type: "blocked", reason: `status is "${e.status ?? "blocked"}"` });
      }
      for (const dep of e.dependsOn) {
        const target = byNativeId.get(dep);
        if (target && target.itemStatus !== "done") {
          e.flags.push({ type: "blocked", reason: `depends on unresolved ${dep}` });
        }
      }

      // Slipping: due date moved out more than once, or due soon with no recent activity.
      const moves = (e.dueDateHistory ?? []).length;
      if (moves > 1) {
        e.flags.push({ type: "slipping", reason: `due date has moved ${moves} times` });
      }
      if (e.dueDate && e.itemStatus !== "done") {
        const daysToDue = (Date.parse(e.dueDate) - now.getTime()) / 86400_000;
        const daysSinceActivity = e.updatedAt
          ? (now.getTime() - Date.parse(e.updatedAt)) / 86400_000
          : Infinity;
        if (daysToDue <= 5 && daysSinceActivity > 3) {
          e.flags.push({
            type: "slipping",
            reason: `due in ${Math.max(0, Math.round(daysToDue))} day(s) with no activity for ${Math.round(daysSinceActivity)} day(s)`,
          });
        }
        if (daysToDue < 0) {
          e.flags.push({ type: "slipping", reason: `due date passed ${Math.round(-daysToDue)} day(s) ago` });
        }
      }

      // Stale: an item the TPM owns with no activity in N days.
      if (isMe(config, e.owner) && e.itemStatus !== "done" && e.updatedAt) {
        const idle = (now.getTime() - Date.parse(e.updatedAt)) / 86400_000;
        if (idle > config.staleAfterDays) {
          e.flags.push({ type: "stale", reason: `you own this and it has been idle ${Math.round(idle)} day(s)` });
        }
      }
    }

    // Owed: a thread whose last message is an unanswered question directed at the TPM.
    if (e.kind === "thread" && e.lastMessageIsQuestion && isMe(config, e.directedAt)) {
      e.flags.push({
        type: "owed",
        reason: `${e.lastMessageAuthor ?? "someone"} asked you a question and is waiting on an answer`,
      });
    }
  }

  // Propagate slippage upstream: a dependency that's slipping makes its dependents slipping.
  for (const e of entities) {
    if (e.kind !== "work_item") continue;
    for (const dep of e.dependsOn) {
      const target = byNativeId.get(dep);
      if (target?.flags.some((f) => f.type === "slipping")) {
        e.flags.push({ type: "slipping", reason: `dependency ${dep} is slipping` });
      }
    }
  }
}
