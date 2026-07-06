package playbook

import (
	"fmt"
	"strings"

	"github.com/kunchenguid/no-mistakes/internal/types"
)

// RuleSetVersion identifies the version of the safety rule set applied by
// Evaluate. Bump it whenever a rule is added, removed, or its semantics
// change materially, so findings can be traced to the rule set that
// produced them. New rules are added by extending the rule list in this
// file - the pipeline step that calls Evaluate never needs to change.
const RuleSetVersion = 1

// RuleResult is a single safety-rule violation found on one action.
type RuleResult struct {
	RuleID     string
	ActionName string
	Message    string
	Severity   string // "error" | "warning"
	Action     string // types.ActionAutoFix | types.ActionAskUser
}

// highRiskLevels are risk_level values that must carry requires_approval: true.
var highRiskLevels = map[string]bool{
	"high":     true,
	"critical": true,
}

// Evaluate checks every action in current against the fixed safety rule
// set. previous is the same file's content before the change (nil when
// there is none, or it failed to parse), used only to detect permission
// scope creep on actions that already existed.
func Evaluate(current, previous *Playbook) []RuleResult {
	if current == nil {
		return nil
	}
	prevActions := map[string]Action{}
	if previous != nil {
		for _, a := range previous.Actions {
			prevActions[a.Name] = a
		}
	}

	var results []RuleResult
	for _, a := range current.Actions {
		results = append(results, checkRollback(a)...)
		results = append(results, checkBlastRadius(a)...)
		results = append(results, checkApproval(a)...)
		results = append(results, checkIdempotent(a)...)
		if prev, ok := prevActions[a.Name]; ok {
			results = append(results, checkPermissionScope(a, prev)...)
		}
	}
	return results
}

func checkRollback(a Action) []RuleResult {
	if !a.Rollback.isEmpty() {
		return nil
	}
	return []RuleResult{{
		RuleID:     "rollback-present",
		ActionName: a.Name,
		Message:    fmt.Sprintf("action %q has no rollback/reversal step defined", a.Name),
		Severity:   "warning",
		Action:     types.ActionAskUser,
	}}
}

func checkBlastRadius(a Action) []RuleResult {
	scope := strings.TrimSpace(a.BlastRadius)
	if scope != "" && scope != "*" {
		return nil
	}
	return []RuleResult{{
		RuleID:     "blast-radius-scoped",
		ActionName: a.Name,
		Message:    fmt.Sprintf("action %q has no explicit blast-radius scope (defaults to everywhere)", a.Name),
		Severity:   "warning",
		Action:     types.ActionAskUser,
	}}
}

func checkApproval(a Action) []RuleResult {
	if !highRiskLevels[strings.ToLower(strings.TrimSpace(a.RiskLevel))] {
		return nil
	}
	if a.RequiresApproval != nil && *a.RequiresApproval {
		return nil
	}
	return []RuleResult{{
		RuleID:     "high-risk-requires-approval",
		ActionName: a.Name,
		Message:    fmt.Sprintf("high-risk action %q must set requires_approval: true", a.Name),
		Severity:   "warning",
		Action:     types.ActionAutoFix,
	}}
}

func checkIdempotent(a Action) []RuleResult {
	if a.Idempotent != nil {
		return nil
	}
	return []RuleResult{{
		RuleID:     "idempotency-declared",
		ActionName: a.Name,
		Message:    fmt.Sprintf("action %q does not declare whether it is idempotent", a.Name),
		Severity:   "warning",
		Action:     types.ActionAskUser,
	}}
}

func checkPermissionScope(current, previous Action) []RuleResult {
	added := extraStrings(current.Permissions, previous.Permissions)
	if len(added) == 0 {
		return nil
	}
	return []RuleResult{{
		RuleID:     "permission-scope-unchanged",
		ActionName: current.Name,
		Message:    fmt.Sprintf("action %q widens permission scope with new grant(s): %s", current.Name, strings.Join(added, ", ")),
		Severity:   "warning",
		Action:     types.ActionAskUser,
	}}
}

// extraStrings returns entries in a that are not present in b.
func extraStrings(a, b []string) []string {
	have := make(map[string]bool, len(b))
	for _, v := range b {
		have[v] = true
	}
	var extra []string
	for _, v := range a {
		if !have[v] {
			extra = append(extra, v)
		}
	}
	return extra
}
