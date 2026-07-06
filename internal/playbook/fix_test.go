package playbook

import (
	"strings"
	"testing"
)

func TestApplyRequiresApprovalFix_AddsMissingField(t *testing.T) {
	input := `version: 1
name: restart-service
actions:
  - name: restart-web-service
    risk_level: high
    blast_radius: us-east-1/web-fleet
`
	out, err := ApplyRequiresApprovalFix([]byte(input), []string{"restart-web-service"})
	if err != nil {
		t.Fatal(err)
	}

	pb, err := Parse(out)
	if err != nil {
		t.Fatalf("re-parse fixed playbook: %v\n%s", err, out)
	}
	if len(pb.Actions) != 1 || pb.Actions[0].RequiresApproval == nil || !*pb.Actions[0].RequiresApproval {
		t.Fatalf("expected requires_approval: true, got %+v", pb.Actions)
	}
	if !strings.Contains(string(out), "blast_radius: us-east-1/web-fleet") {
		t.Fatalf("expected unrelated fields to survive the fix, got:\n%s", out)
	}
}

func TestApplyRequiresApprovalFix_OverwritesFalseValue(t *testing.T) {
	input := `actions:
  - name: a
    requires_approval: false
`
	out, err := ApplyRequiresApprovalFix([]byte(input), []string{"a"})
	if err != nil {
		t.Fatal(err)
	}
	pb, err := Parse(out)
	if err != nil {
		t.Fatal(err)
	}
	if pb.Actions[0].RequiresApproval == nil || !*pb.Actions[0].RequiresApproval {
		t.Fatalf("expected requires_approval overwritten to true, got %+v", pb.Actions[0])
	}
}

func TestApplyRequiresApprovalFix_NoMatchingActionIsNoOp(t *testing.T) {
	input := `actions:
  - name: a
`
	out, err := ApplyRequiresApprovalFix([]byte(input), []string{"does-not-exist"})
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != input {
		t.Fatalf("expected unchanged output, got:\n%s", out)
	}
}

func TestApplyRequiresApprovalFix_OnlyTouchesNamedAction(t *testing.T) {
	input := `actions:
  - name: a
    risk_level: high
  - name: b
    risk_level: high
`
	out, err := ApplyRequiresApprovalFix([]byte(input), []string{"a"})
	if err != nil {
		t.Fatal(err)
	}
	pb, err := Parse(out)
	if err != nil {
		t.Fatal(err)
	}
	if pb.Actions[0].RequiresApproval == nil || !*pb.Actions[0].RequiresApproval {
		t.Fatalf("expected action a fixed, got %+v", pb.Actions[0])
	}
	if pb.Actions[1].RequiresApproval != nil {
		t.Fatalf("expected action b untouched, got %+v", pb.Actions[1])
	}
}
