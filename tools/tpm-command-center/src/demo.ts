import { Entity, entityId } from "./model";
import { Config } from "./config";

/**
 * Demo mode: a realistic in-memory dataset so the whole pipeline
 * (normalize -> correlate -> risk -> rank -> views) can be exercised without
 * any MCP servers configured. Also doubles as the fixture for eyeballing
 * ranking/suppression behavior when tuning weights.
 */
export const demoConfig: Config = {
  me: { names: ["Colton Wirth"], emails: ["colt23x@gmail.com"] },
  staleAfterDays: 5,
  servers: {},
};

export function demoEntities(now = new Date()): Entity[] {
  const h = (hours: number) => new Date(now.getTime() + hours * 3600_000).toISOString();
  const d = (days: number) => new Date(now.getTime() + days * 86400_000).toISOString();

  const wi = (
    key: string,
    title: string,
    extra: Partial<Extract<Entity, { kind: "work_item" }>>
  ): Entity => ({
    id: entityId("jira", "work_item", key),
    kind: "work_item",
    source: "jira",
    sourceNativeId: key,
    title,
    body: "",
    links: [],
    flags: [],
    dependsOn: [],
    labels: [],
    itemStatus: "in_progress",
    ...extra,
  });

  return [
    wi("PAY-1200", "Payments launch: provider migration epic", {
      owner: "Colton Wirth",
      status: "In Progress",
      priority: "critical",
      dueDate: d(4),
      updatedAt: d(-4),
      dependsOn: ["PAY-1207"],
    }),
    wi("PAY-1207", "Provider sandbox credentials for load test", {
      owner: "Dana K",
      status: "Blocked",
      itemStatus: "blocked",
      priority: "high",
      updatedAt: d(-2),
    }),
    wi("PAY-1215", "Update payments runbook", {
      owner: "Colton Wirth",
      status: "To Do",
      itemStatus: "todo",
      priority: "low",
      updatedAt: d(-9),
    }),
    wi("INFRA-88", "Rotate build-fleet TLS certs", {
      owner: "Sam R",
      status: "In Progress",
      priority: "medium",
      dueDate: d(20),
      updatedAt: h(-3),
    }),
    wi("MOB-301", "Android release 8.2 cut", {
      owner: "Priya N",
      status: "In Review",
      itemStatus: "in_review",
      priority: "medium",
      updatedAt: h(-20),
    }),
    {
      id: entityId("calendar", "event", "evt-paysync"),
      kind: "event",
      source: "calendar",
      sourceNativeId: "evt-paysync",
      title: "Payments sync",
      body: "Weekly sync on the payments migration. Tracking epic: PAY-1200. Blocker review for PAY-1207.",
      start: h(2),
      end: h(2.5),
      attendees: ["colt23x@gmail.com", "dana@example.com", "lee@example.com"],
      recurring: true,
      links: [],
      flags: [],
    },
    {
      id: entityId("calendar", "event", "evt-1on1"),
      kind: "event",
      source: "calendar",
      sourceNativeId: "evt-1on1",
      title: "1:1 with Priya",
      body: "",
      start: h(5),
      end: h(5.5),
      attendees: ["colt23x@gmail.com", "priya@example.com"],
      links: [],
      flags: [],
    },
    {
      id: entityId("slack", "thread", "th-424242"),
      kind: "thread",
      source: "slack",
      sourceNativeId: "th-424242",
      title: "#payments: cutover date question",
      body: "Thread about PAY-1200 cutover. Last message: 'Colton — are we still good for the 15th?'",
      participants: ["dana@example.com", "colt23x@gmail.com"],
      lastMessageAt: h(-6),
      lastMessageAuthor: "Dana K",
      lastMessageIsQuestion: true,
      directedAt: "colt23x@gmail.com",
      updatedAt: h(-6),
      links: [],
      flags: [],
    },
  ];
}
