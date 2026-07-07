# Example playbooks

Synthetic, non-production playbooks used to dogfood the [Playbook Safety](https://kunchenguid.github.io/no-mistakes/guides/playbook-safety/) pipeline step. They exist to exercise the rule set end-to-end, not as real remediation logic.

- `compliant-restart.yaml` - passes every check: rollback defined, blast radius scoped, `requires_approval` set on the high-risk action, idempotency declared, permissions unchanged from the previous version.
- `needs-attention.yaml` - trips every ask-user check (missing rollback, wildcard blast radius, undeclared idempotency) plus the one auto-fixable check (a high-risk action missing `requires_approval: true`).

Push a change under `playbooks/**` (the default `playbook_safety.patterns` activation glob) to see the gate run against these.
