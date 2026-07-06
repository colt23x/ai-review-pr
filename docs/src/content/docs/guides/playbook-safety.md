---
title: Playbook Safety Gate
description: A safety gate for any AIOps system with autonomous remediation, built as a custom pipeline stage on top of no-mistakes.
---

This fork adds one stage to the pipeline that isn't about code quality: the [Playbook Safety](/no-mistakes/reference/pipeline-steps/#playbook-safety) step. It exists for a specific class of system - anything where an agent is authorized to take production-impacting actions (restart a service, reroute traffic, scale a resource) without a human in the loop at execution time.

## The problem it targets

A remediation playbook that compiles, passes its tests, and gets a human PR approval can still be *unsafe to run unattended*. Standard lint and test gates only verify a playbook works - they say nothing about whether it's safe to let an agent run it in production with no one watching. The failure modes that matter here aren't code-quality problems:

- A new action has no rollback or reversal step defined.
- A new action has no blast-radius scoping - it defaults to "everywhere" instead of one region, one host, one canary.
- A high-risk action (anything touching customer traffic or data) ships without a required human-approval flag.
- An action isn't idempotent, so retrying it after a partial failure makes things worse.
- A change silently widens what the agent is allowed to touch, beyond what the original design review approved.

These are structural safety properties, not correctness bugs, and they're exactly the kind of thing that's easy to miss in a review when the diff "looks right."

## Why build this on top of `no-mistakes` instead of from scratch

`no-mistakes` already solved the hard, unglamorous infrastructure: a git-native gate, a disposable-worktree pipeline runner, a structured auto-fix/ask-user finding model, an agent-native driving interface, a TUI for reviewing findings. None of that is specific to safety validation - it's all reusable. The actual value-add here is narrow and domain-specific: five safety checks. It's a better use of effort to plug that into infrastructure that already exists and works than to rebuild a gate pipeline just to add one stage to it.

Before writing any code, the open question was *how* to plug in: does the existing config surface (`commands.lint`, `commands.test`) support a custom stage with structured findings, or does this need a native step? It turned out the config-driven command hooks only return pass/fail - they can't carry the auto-fix/ask-user distinction the rest of the pipeline uses. So this ships as a native pipeline step (`internal/pipeline/steps/playbook_safety.go`, backed by a small standalone `internal/playbook` package), registered in the fixed step sequence between `lint` and `push`, reusing the exact `Finding`/`StepOutcome` types every other step already uses.

## What makes it different from every other step

Every other step in the pipeline calls an agent. This one deliberately doesn't. Whether a playbook is safe to run unattended is a judgment call about intent and risk tolerance, not a code-quality issue an LLM should paper over - and a deterministic, rule-based check is auditable in a way an agent's judgment isn't: the same playbook always produces the same findings, there's no prompt-injection surface from playbook content, and the rule set is a versioned, declarative list (`internal/playbook/rules.go`) that can grow without touching the step's execution logic.

The one exception is mechanical: a high-risk action missing `requires_approval: true` gets that flag added automatically (never removed - this only ever tightens the requirement) and committed without pausing the pipeline. Every other finding - missing rollback, unscoped blast radius, undeclared idempotency, widened permissions, or a playbook that fails to parse - is `ask-user`. Those are deliberate calls for the human who owns the playbook, not something to auto-resolve.

## Using it

The step activates only when a run's diff touches a file matching `playbook_safety.patterns` (default `["playbooks/**"]`), so it costs nothing for repos with no playbooks. See the [Repo Config reference](/no-mistakes/reference/repo-config/#playbook_safety) for the config fields, and [`playbooks/examples/`](https://github.com/colt23x/ai-review-pr/tree/main/playbooks/examples) in the repo for synthetic playbooks that exercise each check.

## Applying this beyond this fork

Nothing about the rule set or the playbook schema here is specific to this repository. Any platform where an agent executes remediation autonomously - closing the loop from detection to action with no human approving each individual step - has the same gap: the highest-leverage place to catch a dangerous playbook is before it merges, not after it's already been selected and run. The schema this step checks against (`version`, `name`, and a list of `actions` with `risk_level`, `blast_radius`, `rollback`, `idempotent`, `requires_approval`, and `permissions`) is intentionally generic, so the same approach - a small, versioned, declarative rule set enforced by tooling instead of trusted to reviewer memory - applies to any YAML-defined playbook format, not just this one.
