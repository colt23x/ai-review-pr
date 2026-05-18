import { Ticket, Metrics } from "./types";

export function computeMetrics(tickets: Ticket[]): Metrics {
  const done = tickets.filter((t) => t.status === "done");
  const blocked = tickets.filter((t) => t.status === "blocked");
  const inProgress = tickets.filter((t) => t.status === "in_progress");
  const inReview = tickets.filter((t) => t.status === "in_review");
  const todo = tickets.filter((t) => t.status === "todo");
  const spillover = [...inProgress, ...inReview, ...blocked];

  const allPoints = tickets.map((t) => t.storyPoints).filter((p) => p !== undefined);
  const velocityAvailable = allPoints.length > 0;

  const pointsCommitted = tickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const pointsCompleted = done.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  const byAssignee: Metrics["byAssignee"] = {};
  for (const t of tickets) {
    const a = t.assignee;
    if (!byAssignee[a]) byAssignee[a] = { done: 0, inProgress: 0, blocked: 0 };
    if (t.status === "done") byAssignee[a].done++;
    else if (t.status === "in_progress" || t.status === "in_review")
      byAssignee[a].inProgress++;
    else if (t.status === "blocked") byAssignee[a].blocked++;
  }

  return {
    total: tickets.length,
    done: done.length,
    inProgress: inProgress.length,
    inReview: inReview.length,
    blocked: blocked.length,
    todo: todo.length,
    completionRate: tickets.length > 0 ? Math.round((done.length / tickets.length) * 100) : 0,
    pointsCommitted,
    pointsCompleted,
    velocityAvailable,
    byAssignee,
    blockedTickets: blocked,
    spillover,
    doneTickets: done,
  };
}
