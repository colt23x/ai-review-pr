package playbook

import (
	"testing"

	"github.com/kunchenguid/no-mistakes/internal/types"
)

func boolPtr(b bool) *bool { return &b }

func TestEvaluate_CleanActionHasNoFindings(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name:             "restart-web-service",
		RiskLevel:        "high",
		BlastRadius:      "us-east-1/web-fleet",
		Rollback:         &Rollback{Action: "restart-web-service-rollback"},
		Idempotent:       boolPtr(true),
		RequiresApproval: boolPtr(true),
		Permissions:      []string{"service:restart"},
	}}}

	if results := Evaluate(pb, nil); len(results) != 0 {
		t.Fatalf("expected no findings, got %+v", results)
	}
}

func TestEvaluate_MissingRollback(t *testing.T) {
	pb := &Playbook{Actions: []Action{{Name: "a", BlastRadius: "x", Idempotent: boolPtr(true)}}}
	results := Evaluate(pb, nil)
	assertHasRule(t, results, "rollback-present", types.ActionAskUser)
}

func TestEvaluate_EmptyRollbackFieldsCountAsMissing(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name: "a", BlastRadius: "x", Idempotent: boolPtr(true),
		Rollback: &Rollback{},
	}}}
	assertHasRule(t, Evaluate(pb, nil), "rollback-present", types.ActionAskUser)
}

func TestEvaluate_WildcardBlastRadius(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name: "a", BlastRadius: "*", Idempotent: boolPtr(true),
		Rollback: &Rollback{Description: "manual revert"},
	}}}
	assertHasRule(t, Evaluate(pb, nil), "blast-radius-scoped", types.ActionAskUser)
}

func TestEvaluate_MissingBlastRadius(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name: "a", Idempotent: boolPtr(true),
		Rollback: &Rollback{Description: "manual revert"},
	}}}
	assertHasRule(t, Evaluate(pb, nil), "blast-radius-scoped", types.ActionAskUser)
}

func TestEvaluate_HighRiskWithoutApprovalIsAutoFixable(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name: "a", RiskLevel: "critical", BlastRadius: "x", Idempotent: boolPtr(true),
		Rollback: &Rollback{Description: "manual revert"},
	}}}
	assertHasRule(t, Evaluate(pb, nil), "high-risk-requires-approval", types.ActionAutoFix)
}

func TestEvaluate_HighRiskWithApprovalFalseStillFlagged(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name: "a", RiskLevel: "high", BlastRadius: "x", Idempotent: boolPtr(true),
		RequiresApproval: boolPtr(false),
		Rollback:         &Rollback{Description: "manual revert"},
	}}}
	assertHasRule(t, Evaluate(pb, nil), "high-risk-requires-approval", types.ActionAutoFix)
}

func TestEvaluate_LowRiskWithoutApprovalIsFine(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name: "a", RiskLevel: "low", BlastRadius: "x", Idempotent: boolPtr(true),
		Rollback: &Rollback{Description: "manual revert"},
	}}}
	for _, r := range Evaluate(pb, nil) {
		if r.RuleID == "high-risk-requires-approval" {
			t.Fatalf("did not expect approval finding for low-risk action, got %+v", r)
		}
	}
}

func TestEvaluate_MissingIdempotency(t *testing.T) {
	pb := &Playbook{Actions: []Action{{
		Name: "a", BlastRadius: "x", Rollback: &Rollback{Description: "manual revert"},
	}}}
	assertHasRule(t, Evaluate(pb, nil), "idempotency-declared", types.ActionAskUser)
}

func TestEvaluate_PermissionScopeWidened(t *testing.T) {
	prev := &Playbook{Actions: []Action{{Name: "a", Permissions: []string{"service:read"}}}}
	curr := &Playbook{Actions: []Action{{
		Name: "a", BlastRadius: "x", Idempotent: boolPtr(true),
		Rollback:    &Rollback{Description: "manual revert"},
		Permissions: []string{"service:read", "service:restart"},
	}}}
	assertHasRule(t, Evaluate(curr, prev), "permission-scope-unchanged", types.ActionAskUser)
}

func TestEvaluate_PermissionScopeUnchangedOrNarrowedIsFine(t *testing.T) {
	prev := &Playbook{Actions: []Action{{Name: "a", Permissions: []string{"service:read", "service:restart"}}}}
	curr := &Playbook{Actions: []Action{{
		Name: "a", BlastRadius: "x", Idempotent: boolPtr(true),
		Rollback:    &Rollback{Description: "manual revert"},
		Permissions: []string{"service:read"},
	}}}
	for _, r := range Evaluate(curr, prev) {
		if r.RuleID == "permission-scope-unchanged" {
			t.Fatalf("did not expect permission-scope finding when permissions only shrink, got %+v", r)
		}
	}
}

func TestEvaluate_NewActionHasNoPermissionBaselineToWiden(t *testing.T) {
	curr := &Playbook{Actions: []Action{{
		Name: "brand-new", BlastRadius: "x", Idempotent: boolPtr(true),
		Rollback:    &Rollback{Description: "manual revert"},
		Permissions: []string{"service:restart"},
	}}}
	for _, r := range Evaluate(curr, nil) {
		if r.RuleID == "permission-scope-unchanged" {
			t.Fatalf("did not expect permission-scope finding for a brand-new action, got %+v", r)
		}
	}
}

func assertHasRule(t *testing.T, results []RuleResult, ruleID, action string) {
	t.Helper()
	for _, r := range results {
		if r.RuleID == ruleID {
			if r.Action != action {
				t.Fatalf("rule %q action = %q, want %q", ruleID, r.Action, action)
			}
			return
		}
	}
	t.Fatalf("expected rule %q in results %+v", ruleID, results)
}
