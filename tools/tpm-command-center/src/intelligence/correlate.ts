import { Entity, Workstream } from "../model";

/**
 * Correlation / entity linking (spec §8.1), Phase 1 scope: explicit references
 * and shared identifiers only — the cheap, high-precision signals. LLM-assisted
 * matching for the residue is Phase 2. Bias is precision over recall: leave
 * things unlinked rather than mis-linked (spec §11).
 */

/** Ticket-key shaped identifiers: PAY-1200, INFRA-42, etc. */
const TICKET_KEY = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;

function keysIn(text: string): Set<string> {
  return new Set(text.match(TICKET_KEY) ?? []);
}

interface UnionFind {
  parent: Map<string, string>;
}

function find(uf: UnionFind, x: string): string {
  let root = x;
  while (uf.parent.get(root) !== root) root = uf.parent.get(root)!;
  return root;
}

function union(uf: UnionFind, a: string, b: string): void {
  uf.parent.set(find(uf, a), find(uf, b));
}

/**
 * Links entities in place (filling each entity's `links`) and returns the
 * derived Workstream groupings, each with the evidence for why it exists.
 */
export function correlate(entities: Entity[]): Workstream[] {
  const uf: UnionFind = { parent: new Map(entities.map((e) => [e.id, e.id])) };
  const evidence = new Map<string, string[]>(); // pair-key -> reasons

  // Index work items by their source-native key (e.g. Jira key "PAY-1200").
  const byKey = new Map<string, Entity>();
  for (const e of entities) {
    if (e.kind === "work_item") byKey.set(e.sourceNativeId, e);
  }

  const link = (a: Entity, b: Entity, why: string) => {
    if (a.id === b.id) return;
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
    union(uf, a.id, b.id);
    const pair = [a.id, b.id].sort().join("|");
    evidence.set(pair, [...(evidence.get(pair) ?? []), why]);
  };

  for (const e of entities) {
    // Explicit references: ticket keys named in any entity's title or body.
    for (const key of keysIn(`${e.title} ${e.body}`)) {
      const target = byKey.get(key);
      if (target) link(e, target, `"${e.title}" references ${key}`);
    }
    // Shared identifiers: dependency links between work items.
    if (e.kind === "work_item") {
      for (const dep of e.dependsOn) {
        const target = byKey.get(dep);
        if (target) link(e, target, `${e.sourceNativeId} depends on ${dep}`);
      }
    }
  }

  // Collect union-find groups of size >= 2 into workstreams.
  const groups = new Map<string, Entity[]>();
  for (const e of entities) {
    const root = find(uf, e.id);
    groups.set(root, [...(groups.get(root) ?? []), e]);
  }

  const workstreams: Workstream[] = [];
  let n = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    n += 1;
    const memberIds = members.map((m) => m.id);
    const why = [...evidence.entries()]
      .filter(([pair]) => pair.split("|").some((id) => memberIds.includes(id)))
      .flatMap(([, reasons]) => reasons);
    // Name the workstream after its most senior work item, else the first member.
    const anchor = members.find((m) => m.kind === "work_item") ?? members[0];
    workstreams.push({
      id: `ws:${n}`,
      name: anchor.title,
      memberIds,
      evidence: [...new Set(why)],
    });
  }
  return workstreams;
}
