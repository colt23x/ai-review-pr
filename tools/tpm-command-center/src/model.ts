/**
 * Unified work model (spec §7).
 *
 * Every MCP source maps its raw objects into this small set of tool-agnostic
 * entities. Everything above the MCP host layer (correlation, ranking, risk,
 * views) operates only on these types and never sees a tool-specific schema.
 */

export type EntityKind = "work_item" | "event" | "thread" | "document" | "signal";

/** Fields shared by every ingested entity. */
export interface EntityBase {
  /** Stable ID within the command center: `<source>:<kind>:<sourceNativeId>` */
  id: string;
  kind: EntityKind;
  /** Which configured MCP server this came from (config key, e.g. "jira"). */
  source: string;
  /** The ID the source tool knows this object by — used to link back and to write back. */
  sourceNativeId: string;
  title: string;
  /** Free text: description, event body, message text. Correlation mines this. */
  body: string;
  url?: string;
  owner?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  /** IDs of other entities this one is linked to (populated by correlation). */
  links: string[];
  /** Risk flags set by the deterministic rules (spec §8.3). */
  flags: RiskFlag[];
}

export interface WorkItem extends EntityBase {
  kind: "work_item";
  itemStatus: "todo" | "in_progress" | "in_review" | "blocked" | "done";
  dueDate?: string;
  /** Prior due dates, oldest first, if the source exposes the change history. */
  dueDateHistory?: string[];
  priority?: "critical" | "high" | "medium" | "low";
  /** Source-native IDs of items this one depends on (e.g. "is blocked by" links). */
  dependsOn: string[];
  labels: string[];
}

export interface Event extends EntityBase {
  kind: "event";
  start: string;
  end: string;
  attendees: string[];
  recurring?: boolean;
}

export interface Thread extends EntityBase {
  kind: "thread";
  participants: string[];
  lastMessageAt?: string;
  lastMessageAuthor?: string;
  /** True when the last message ends in a question addressed at `directedAt`. */
  lastMessageIsQuestion?: boolean;
  directedAt?: string;
}

export interface Document extends EntityBase {
  kind: "document";
}

export interface Signal extends EntityBase {
  kind: "signal";
  /** What changed, e.g. "status: In Progress -> Blocked". */
  change: string;
  at: string;
  /** Entity ID (or source-native ID) the signal is about. */
  about?: string;
}

export type Entity = WorkItem | Event | Thread | Document | Signal;

/**
 * The one computed entity (spec §7): a derived grouping of entities that are
 * facets of the same real work. Produced by correlation, never ingested.
 */
export interface Workstream {
  id: string;
  name: string;
  memberIds: string[];
  /** Why these were grouped — explainability is a hard requirement (spec §8.2). */
  evidence: string[];
}

export interface RiskFlag {
  type: "blocked" | "slipping" | "stale" | "owed";
  reason: string;
}

/** An attention-ranked item: entity + explainable score (spec §8.2). */
export interface RankedItem {
  entity: Entity;
  score: number;
  /** Human-readable reasons; never an opaque number. */
  reasons: string[];
}

export function entityId(source: string, kind: EntityKind, nativeId: string): string {
  return `${source}:${kind}:${nativeId}`;
}
