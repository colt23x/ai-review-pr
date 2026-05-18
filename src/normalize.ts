/**
 * normalize.ts
 *
 * Each fetch module already returns Ticket[] shaped to the interface.
 * This module provides a post-fetch pass to deduplicate across sources
 * and apply any cross-source normalization rules.
 */

import { Ticket } from "./types";

export function normalizeTickets(tickets: Ticket[]): Ticket[] {
  const seen = new Map<string, Ticket>();

  for (const ticket of tickets) {
    const existing = seen.get(ticket.id);
    if (!existing) {
      seen.set(ticket.id, sanitize(ticket));
      continue;
    }
    // If same ID appears from multiple sources, prefer the one with more data
    const merged = mergeTickets(existing, sanitize(ticket));
    seen.set(ticket.id, merged);
  }

  return Array.from(seen.values());
}

function sanitize(t: Ticket): Ticket {
  return {
    ...t,
    title: t.title.trim(),
    assignee: t.assignee?.trim() || "unassigned",
    labels: t.labels.map((l) => l.toLowerCase().trim()),
    priority: t.priority ?? "medium",
  };
}

function mergeTickets(a: Ticket, b: Ticket): Ticket {
  return {
    ...a,
    // Prefer done status; otherwise keep the more advanced status
    status: pickStatus(a.status, b.status),
    // Prefer the entry that has story points
    storyPoints: a.storyPoints ?? b.storyPoints,
    completedAt: a.completedAt ?? b.completedAt,
    // Union labels
    labels: Array.from(new Set([...a.labels, ...b.labels])),
  };
}

const statusOrder: Record<Ticket["status"], number> = {
  done: 5,
  in_review: 4,
  in_progress: 3,
  blocked: 2,
  todo: 1,
};

function pickStatus(a: Ticket["status"], b: Ticket["status"]): Ticket["status"] {
  return statusOrder[a] >= statusOrder[b] ? a : b;
}
