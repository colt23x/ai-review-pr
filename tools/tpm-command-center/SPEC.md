# TPM Command Center
### A unified, MCP-connected work surface for technical program managers
**Author:** Colton Wirth
**Status:** Draft spec — personal project
**One-line:** Connect Jira, calendar, and your other tools through MCP servers into a single view that tells you what actually needs your attention today — not just a merged feed of everything.
---
## 1. Summary
A TPM's work is scattered across a dozen tools: tickets in Jira, meetings in a calendar, decisions in Slack, docs in Drive, incidents in PagerDuty, PRs in GitHub. The job is largely the act of *reconciling* those surfaces in your head — which meeting is about which epic, which blocker is quietly slipping a launch, what you owe people by end of day. That reconciliation is manual, constant, and mostly wasted effort.

TPM Command Center connects those tools through **MCP servers** and does the reconciliation for you. It is explicitly **not** another aggregated dashboard. A merged feed of every ticket and event is noise, not signal. The value is a synthesis layer that answers TPM-shaped questions: *What's blocked and who's blocking it? What's slipping? What do I owe people today? Which of today's meetings actually need prep, and what's the context?*

The connector layer is MCP, so adding a new tool is adding a server config, not writing a bespoke integration. The intelligence layer is where the actual product lives.

## 2. Problem
The specific failure modes this targets, all of which are daily reality for a TPM:
- **Context is fragmented across N tools**, and switching between them to assemble a single mental picture of "the state of my programs" is the dominant tax on the role.
- **A raw aggregated feed doesn't help** — it recreates the same overwhelm in one window. TPMs don't need everything in one place; they need the *right* things surfaced and everything else suppressed.
- **Cross-tool correlations are invisible.** The calendar event "Payments sync" and the Jira epic PAY-1200 and the Slack thread where the decision got made are the same piece of work, but no tool knows that.
- **Status is reconstructed from scratch repeatedly** — for standup, for a status email, for a leadership rollup. The underlying data hasn't changed between any of these; only the framing has.
- **Slippage is detected late.** A dependency slips, and it's noticed when someone asks about the launch, not when the slip happened.

## 3. Goals
- One surface that ingests from arbitrary tools via MCP and produces a **prioritized, attention-ranked view** of a TPM's work — not a flat merge.
- **Cross-tool entity linking**: correlate a calendar event, a Jira epic, a Slack thread, and a doc as facets of the same program or workstream.
- **Derived TPM intelligence**: blocker detection, slippage/at-risk flagging, "what I owe others / what others owe me," and one-click status generation (standup, status email, leadership rollup) from the same underlying state.
- **MCP-native connector model** so onboarding a new tool is configuration, not code.
- **Read-first, write-carefully**: reading and synthesizing is the default; any write-back to a source tool (commenting on a ticket, moving a status) is explicit and confirmed.

## 4. Non-Goals
- Not a replacement for Jira/calendar/Slack — it's a lens over them, not a system of record. Source tools stay authoritative.
- Not a team-wide PM platform or a reporting product for others. v1 is a single-user command center for the TPM's own work; multi-user rollups are a later question.
- Not trying to *write* to every tool. The safe, high-value 80% is read-and-synthesize. Write-back is a small, deliberate surface, not a goal in itself.
- Not building custom API integrations per tool. If a tool has no MCP server, that's a gap to be filled by an MCP server (existing, community, or a thin one you write), not by a bespoke connector inside this app.

## 5. Users & primary jobs-to-be-done
Primary user: an individual TPM (initially, the author) running multiple concurrent programs.

The five jobs the app must nail, in rough priority:
1. **"What needs me today?"** — the morning open. A ranked list of things requiring the TPM's action or attention, drawn from all sources, with the noise suppressed.
2. **"Prep me for this meeting."** — given a calendar event, assemble the linked tickets, recent activity, open decisions, and last-time's notes so the TPM walks in loaded.
3. **"What's at risk?"** — surface blockers and slipping items across programs before someone else surfaces them.
4. **"Generate my status."** — produce standup notes / a status email / a leadership rollup from current state, in one action, in the right register for the audience.
5. **"Close the loop."** — from the command center, take the small follow-up action (comment, nudge, status change) without a full context-switch into the source tool.

## 6. Architecture
### 6.1 Shape
```
┌─────────────────────────────────────────────────────────┐
│                     TPM Command Center                   │
│                                                          │
│   ┌──────────────┐   ┌──────────────┐   ┌────────────┐   │
│   │  Views/UI    │   │ Intelligence │   │  Status    │   │
│   │ (attention,  │◄──│    layer     │──►│ generation │   │
│   │  prep, risk) │   │ (correlate,  │   │            │   │
│   └──────────────┘   │  rank, flag) │   └────────────┘   │
│                      └──────┬───────┘                    │
│                             │                            │
│                  ┌──────────▼──────────┐                 │
│                  │ Unified work model  │                 │
│                  │(normalized entities │                 │
│                  │  + cross-links)     │                 │
│                  └──────────┬──────────┘                 │
│                             │                            │
│                  ┌──────────▼──────────┐                 │
│                  │  MCP host/client    │                 │
│                  │ (connection mgmt,   │                 │
│                  │  auth, polling)     │                 │
│                  └──────────┬──────────┘                 │
└─────────────────────────────┼────────────────────────────┘
                              │  MCP
        ┌──────────┬──────────┼──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
     Jira MCP  Calendar   Slack MCP  GitHub MCP  ...more
                 MCP
```
### 6.2 Layers
**MCP host/client layer.** The app is an MCP host. It manages connections to configured MCP servers, handles their auth, and calls their tools to pull data. This is the only layer that knows a given tool exists; everything above it works on the normalized model. Adding Jira, calendar, Slack, GitHub, PagerDuty, etc. is adding server entries here.

**Unified work model.** Raw MCP tool results get normalized into a small set of tool-agnostic entities (see §7) and stored locally. This is what decouples the intelligence layer from any specific tool's schema — the ranking logic doesn't care whether a "work item" came from Jira or Linear.

**Intelligence layer.** The actual product. Operates only on the unified model:
- *Correlation:* link entities across sources into workstreams (§8.1).
- *Attention ranking:* score every item for how much it needs the TPM now (§8.2).
- *Risk detection:* flag blockers and slippage (§8.3).

**Status generation.** Turns current unified state into audience-specific output — standup, status email, leadership rollup — reusing one state, three framings.

**Views/UI.** Renders the five jobs from §5. Thin; all logic lives below it.

### 6.3 Where the LLM fits (and where it doesn't)
The LLM is used for the genuinely fuzzy tasks: entity correlation across tools, drafting status text, summarizing a meeting's context. It is **not** used for things that should be deterministic — a blocked ticket is blocked because a field says so or a dependency link exists, not because a model guessed. Keeping mechanical facts mechanical keeps the app trustworthy and cheap; reserve the model for the parts that are actually language/judgment problems. (This is the same read as the Playbook Safety Gate: don't put the LLM in the loop where a rule does the job.)

## 7. Unified data model
A deliberately small set of normalized entities. Every MCP source maps its raw objects into these:

| Entity | Represents | Example sources |
|---|---|---|
| **WorkItem** | A unit of tracked work | Jira issue, GitHub PR/issue, Linear task |
| **Event** | A time-bound commitment | Calendar event |
| **Thread** | A conversation/decision locus | Slack thread, PR review, ticket comments |
| **Document** | A referenced artifact | Drive/Confluence doc |
| **Signal** | A time-stamped state change | Ticket status change, incident, CI failure |
| **Workstream** | A derived grouping of the above | *(computed, not ingested — the correlation output)* |

Each entity carries: a stable ID, source + source-native ID (to link back and to write to), timestamps, owner/assignee, status, a free-text body, and a `links` list to other entity IDs. `Workstream` is the only computed one — it's what correlation produces.

## 8. The intelligence layer in detail
### 8.1 Correlation (entity linking)
Group entities that are facets of the same real work. Signals to use, cheapest first:
- Explicit references (a calendar event body that names PAY-1200; a Slack thread linking a ticket).
- Shared identifiers (ticket keys, PR numbers, epic links) parsed out of text.
- Temporal + participant overlap (a recurring "Payments sync" with the same attendees as the Payments epic's assignees).
- LLM-assisted matching only for the residue the above can't resolve.

Output: `Workstream` groupings that let the UI show "the Payments launch" as one thing spanning four tools.

### 8.2 Attention ranking
Every item gets a score for *how much it needs the TPM right now*. Inputs: is the TPM the assignee/owner or just watching; is something waiting on the TPM specifically; recency and velocity of change; proximity to a deadline or a linked event; whether it's flagged at-risk by §8.3. The point is suppression as much as surfacing — most items should score low and stay out of the way. Ranking is tunable and explainable ("this is here because you're blocking it and it's linked to a meeting in 2 hours"), never an opaque number.

### 8.3 Risk detection (deterministic)
Rule-based, not model-based, so it's trustworthy:
- **Blocked:** a WorkItem in a blocked state, or with an open dependency link to an unresolved item.
- **Slipping:** due date moved out more than once; or a due date approaching with no recent activity Signal; or a linked dependency that's itself slipping (propagates upstream).
- **Stale:** an item the TPM owns with no activity in N days.
- **Owed:** a Thread where the last message is a question directed at the TPM, unanswered.

Each fires a flag on the entity that ranking (§8.2) and the risk view (§5.3) consume.

## 9. Write-back (the careful part)
Reading is safe; writing to someone's real Jira/Slack is where a bug becomes visible and embarrassing. So write-back is deliberately minimal and gated:
- Small allowed set to start: comment on a WorkItem, change a status the TPM owns, post a Thread reply, create a follow-up WorkItem.
- **Every write is previewed and confirmed** — the app shows exactly what it will do in which tool, and the TPM approves. No silent writes.
- Writes go back through the same MCP server that provided the data (using the entity's stored source ID), so there's still no bespoke per-tool code.
- This mirrors the ask-user finding model from the Playbook Safety Gate: mechanical reads are automatic; anything that mutates a real system is a human decision.

## 10. Phasing
**Phase 1 — Read + unify (proves the connector model).**
Jira MCP + calendar MCP only. Ingest, normalize into the unified model, and render two views: "what needs me today" (basic ranking) and "prep me for this meeting" (event → linked tickets). No LLM correlation yet — start with explicit-reference and shared-ID linking only. This alone is useful daily and de-risks the whole MCP host layer.

**Phase 2 — Intelligence.**
Add risk detection (§8.3), fuller attention ranking (§8.2), and LLM-assisted correlation for the residue. Add a third and fourth source (Slack, GitHub) to prove "new tool = new config."

**Phase 3 — Status generation + write-back.**
One-click standup / status email / leadership rollup. Add the minimal, confirmed write-back surface (§9).

**Phase 4 — Polish for others (maybe).**
Only if it's worth it: make the source set and ranking weights configurable enough that another TPM could point it at their own stack. This is where the "single-user command center" non-goal gets revisited, not before.

## 11. Risks & open questions
- **MCP server availability & quality vary.** Jira, calendar, Slack, GitHub MCP servers exist in varying states of maturity. Which ones are solid enough to build on is the first thing to validate in Phase 1, before committing to the model shape.
- **Auth and token management across servers** is real work and a real security surface — multiple OAuth flows, token refresh, secret storage. Underestimating this is the most likely way Phase 1 runs long.
- **A merged feed is the failure mode, not the goal.** If ranking and suppression aren't good, this becomes exactly the noise it set out to replace. The intelligence layer is the product; if it's weak, there is no product.
- **Correlation precision.** Wrongly linking two unrelated items into one workstream is worse than not linking them — it produces confidently wrong context. Bias correlation toward precision over recall; leave things unlinked rather than mis-linked.
- **Staleness vs. rate limits.** Polling every source frequently hits rate limits; polling rarely means the "what needs me now" view is stale. Per-source polling cadence (and where webhooks/push exist instead of polling) is an open design question.
- **Is single-user the right ceiling?** The whole design assumes one user's view of their own work. A team rollup is a genuinely different product with different privacy and permission questions — flagged as out of scope, but worth a conscious revisit at Phase 4, not an accidental drift into it.

## 12. Why this is worth building
Beyond being personally useful, it demonstrates a specific stack of skills in public: MCP host/client architecture, multi-source data normalization, an intelligence layer with a clear line between deterministic rules and LLM judgment, and product restraint (read-first, single-user, suppression-over-surfacing). It's the same architectural instinct as an AIOps platform — ingest from many sources, correlate, rank by what needs attention, act carefully — applied to the TPM's own work instead of production infrastructure.
