import { Config } from "../config";
import { Entity, Event, RankedItem, RiskFlag, Workstream } from "../model";
import { rank, ATTENTION_THRESHOLD } from "../intelligence/rank";
import { Snapshot } from "../store";

/**
 * HTML dashboard: one self-contained page rendering all Phase 1 views —
 * attention list, schedule with inline meeting prep, risks, workstreams.
 * No external assets, no JS framework; works from file:// or `serve`.
 *
 * Status colors are reserved (never decorative) and always paired with an
 * icon + text label so state is never carried by color alone.
 */

const FLAG_STYLE: Record<RiskFlag["type"], { color: string; icon: string; label: string }> = {
  blocked: { color: "#d03b3b", icon: "⛔", label: "Blocked" },
  slipping: { color: "#ec835a", icon: "▲", label: "Slipping" },
  owed: { color: "#fab219", icon: "✉", label: "Owed" },
  stale: { color: "#8a8a85", icon: "○", label: "Stale" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function flagBadge(f: RiskFlag): string {
  const s = FLAG_STYLE[f.type];
  return `<span class="badge" style="--badge:${s.color}" title="${esc(f.reason)}">${s.icon} ${s.label}</span>`;
}

function refOf(e: Entity): string {
  return e.kind === "work_item" ? e.sourceNativeId : e.title;
}

function attentionCard(item: RankedItem): string {
  const e = item.entity;
  const title = e.kind === "work_item" ? `<strong>${esc(e.sourceNativeId)}</strong> ${esc(e.title)}` : `<strong>${esc(e.title)}</strong>`;
  const badges = e.flags.map(flagBadge).join(" ");
  const meta: string[] = [];
  if (e.owner) meta.push(`owner: ${esc(e.owner)}`);
  if (e.status) meta.push(esc(e.status));
  meta.push(`source: ${esc(e.source)}`);
  return `<div class="card">
    <div class="card-head">
      <span class="title">${title}</span>
      <span class="score" title="attention score">${item.score}</span>
    </div>
    <div class="badges">${badges}</div>
    <ul class="reasons">${item.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
    <div class="meta">${meta.join(" · ")}</div>
  </div>`;
}

function prepDetails(ev: Event, byId: Map<string, Entity>): string {
  const linked = ev.links.map((id) => byId.get(id)).filter((e): e is Entity => !!e);
  if (linked.length === 0) return `<p class="muted">Nothing linked to this meeting — no ticket references found in the event.</p>`;
  return `<ul class="prep-list">${linked
    .map((e) => {
      const flags = e.flags.map(flagBadge).join(" ");
      const last = e.updatedAt ? `<span class="muted"> · last activity ${new Date(e.updatedAt).toDateString()}</span>` : "";
      return `<li><strong>${esc(refOf(e))}</strong>${e.kind === "work_item" ? " — " + esc(e.title) : ""}
        ${e.status ? `<span class="muted">(${esc(e.status)})</span>` : ""}
        ${e.owner ? `<span class="muted"> · ${esc(e.owner)}</span>` : ""}${last} ${flags}</li>`;
    })
    .join("")}</ul>`;
}

export function renderHtml(snapshot: Snapshot, config: Config, now = new Date()): string {
  const { entities, workstreams } = snapshot;
  const byId = new Map(entities.map((e) => [e.id, e]));

  const ranked = rank(entities, config, now);
  const attention = ranked.filter((r) => r.score >= ATTENTION_THRESHOLD);
  const suppressed = ranked.length - attention.length;

  const events = entities
    .filter((e): e is Event => e.kind === "event")
    .filter((e) => Date.parse(e.start) >= now.getTime() - 3600_000 && Date.parse(e.start) <= now.getTime() + 48 * 3600_000)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const flagged = entities.filter((e) => e.flags.length > 0);
  const countOf = (t: RiskFlag["type"]) => flagged.filter((e) => e.flags.some((f) => f.type === t)).length;

  const tiles = [
    { label: "Needs you", value: attention.length },
    { label: "Blocked", value: countOf("blocked") },
    { label: "Slipping", value: countOf("slipping") },
    { label: "Owed", value: countOf("owed") },
    { label: "Stale", value: countOf("stale") },
    { label: "Suppressed", value: suppressed },
  ];

  const riskSections = (Object.keys(FLAG_STYLE) as RiskFlag["type"][])
    .map((type) => {
      const items = flagged.filter((e) => e.flags.some((f) => f.type === type));
      if (items.length === 0) return "";
      const s = FLAG_STYLE[type];
      return `<h3>${s.icon} ${s.label} (${items.length})</h3><ul class="risk-list">${items
        .map(
          (e) => `<li><strong>${esc(refOf(e))}</strong>${e.kind === "work_item" ? " — " + esc(e.title) : ""}
            ${e.owner ? `<span class="muted">(${esc(e.owner)})</span>` : ""}
            <ul class="reasons">${e.flags.filter((f) => f.type === type).map((f) => `<li>${esc(f.reason)}</li>`).join("")}</ul></li>`
        )
        .join("")}</ul>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TPM Command Center</title>
<style>
  :root {
    --surface: #fcfcfb; --panel: #f3f3f0; --ink: #24241f; --ink-2: #5b5b54; --muted: #8a8a85;
    --line: #e3e3de; --accent: #4a5fc4;
  }
  @media (prefers-color-scheme: dark) {
    :root { --surface: #1a1a19; --panel: #242422; --ink: #ecece8; --ink-2: #b3b3ac; --muted: #7d7d76; --line: #34342f; --accent: #93a4f2; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surface); color: var(--ink);
         font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 24px 20px 60px; }
  header h1 { font-size: 22px; margin: 0 0 2px; }
  header .sub { color: var(--ink-2); margin-bottom: 20px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 18px 0 26px; }
  .tile { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
  .tile .n { font-size: 26px; font-weight: 650; }
  .tile .l { color: var(--ink-2); font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 16.5px; margin: 30px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  h3 { font-size: 14.5px; margin: 18px 0 8px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
  .card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .score { color: var(--ink-2); font-size: 13px; font-variant-numeric: tabular-nums;
           border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; white-space: nowrap; }
  .badges { margin: 6px 0 2px; }
  .badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
           border: 1.5px solid var(--badge); color: var(--ink); margin-right: 6px; }
  ul.reasons { margin: 6px 0 4px; padding-left: 20px; color: var(--ink-2); font-size: 13.5px; }
  .meta { color: var(--muted); font-size: 12.5px; }
  .muted { color: var(--muted); }
  details.event { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
                  padding: 10px 14px; margin-bottom: 8px; }
  details.event summary { cursor: pointer; }
  details.event summary .when { color: var(--ink-2); font-variant-numeric: tabular-nums; margin-right: 10px; }
  .prep-body { border-top: 1px solid var(--line); margin-top: 10px; padding-top: 10px; }
  .prep-list, .risk-list { padding-left: 20px; }
  .prep-list li, .risk-list li { margin-bottom: 6px; }
  .evidence { color: var(--ink-2); font-size: 13.5px; }
  blockquote { border-left: 3px solid var(--line); margin: 8px 0; padding: 2px 12px; color: var(--ink-2); }
  footer { margin-top: 40px; color: var(--muted); font-size: 12.5px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>TPM Command Center</h1>
    <div class="sub">${now.toDateString()} · synced ${esc(new Date(snapshot.syncedAt).toLocaleString())}</div>
  </header>

  <div class="tiles">
    ${tiles.map((t) => `<div class="tile"><div class="n">${t.value}</div><div class="l">${t.label}</div></div>`).join("")}
  </div>

  <h2>Needs you (${attention.length})</h2>
  ${attention.length === 0 ? `<p class="muted">Nothing is waiting on you right now.</p>` : attention.map(attentionCard).join("")}
  <p class="muted">${suppressed} open item(s) suppressed as not needing you today.</p>

  <h2>Schedule — next 48h (${events.length})</h2>
  ${events.length === 0 ? `<p class="muted">No upcoming meetings.</p>` : events
    .map((ev) => {
      const when = new Date(ev.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      const linkNote = ev.links.length ? ` · ${ev.links.length} linked item(s) — expand for prep` : "";
      return `<details class="event"${ev.links.length ? " open" : ""}>
        <summary><span class="when">${esc(when)}</span><strong>${esc(ev.title)}</strong><span class="muted">${linkNote}</span></summary>
        <div class="prep-body">
          ${ev.attendees.length ? `<div class="muted">Who: ${esc(ev.attendees.join(", "))}</div>` : ""}
          ${ev.body ? `<blockquote>${esc(ev.body)}</blockquote>` : ""}
          ${prepDetails(ev, byId)}
        </div>
      </details>`;
    })
    .join("")}

  <h2>At risk (${flagged.length})</h2>
  ${flagged.length === 0 ? `<p class="muted">No blocked, slipping, stale, or owed items detected.</p>` : riskSections}

  <h2>Workstreams (${workstreams.length})</h2>
  ${workstreams.length === 0 ? `<p class="muted">No cross-tool groupings found yet.</p>` : workstreams
    .map(
      (ws: Workstream) => `<div class="card">
        <div class="card-head"><span class="title"><strong>${esc(ws.name)}</strong></span>
        <span class="score">${ws.memberIds.length} items</span></div>
        <div class="meta">${ws.memberIds.map((id) => esc(refOf(byId.get(id)!))).join(" · ")}</div>
        <div class="evidence">Why linked: ${ws.evidence.map(esc).join("; ")}</div>
      </div>`
    )
    .join("")}

  <footer>TPM Command Center · a lens over your tools, not a system of record · sources stay authoritative</footer>
</div>
</body>
</html>`;
}
