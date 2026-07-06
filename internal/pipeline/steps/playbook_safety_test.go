package steps

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kunchenguid/no-mistakes/internal/config"
)

const cleanPlaybookYAML = `version: 1
name: restart-service
actions:
  - name: restart-web-service
    risk_level: high
    blast_radius: us-east-1/web-fleet
    rollback:
      action: restart-web-service-rollback
    idempotent: true
    requires_approval: true
    permissions:
      - service:restart
`

// commitFile writes path with content on top of the current HEAD in dir and
// returns the new HEAD SHA.
func commitFile(t *testing.T, dir, path, content string) string {
	t.Helper()
	full := filepath.Join(dir, path)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	gitCmd(t, dir, "add", "-A")
	gitCmd(t, dir, "commit", "-m", "update "+path)
	return gitCmd(t, dir, "rev-parse", "HEAD")
}

func TestPlaybookSafetyStep_NoPlaybookFilesChanged_Skips(t *testing.T) {
	t.Parallel()
	dir, baseSHA, headSHA := setupGitRepo(t)

	sctx := newTestContextWithDBRecords(t, &mockAgent{name: "test"}, dir, baseSHA, headSHA, config.Commands{})
	sctx.Config.PlaybookSafety = config.PlaybookSafety{Enabled: true, Patterns: []string{"playbooks/**"}}

	step := &PlaybookSafetyStep{}
	outcome, err := step.Execute(sctx)
	if err != nil {
		t.Fatal(err)
	}
	if outcome.NeedsApproval || outcome.Findings != "" {
		t.Fatalf("expected no-op outcome when no playbook files changed, got %+v", outcome)
	}
}

func TestPlaybookSafetyStep_Disabled_SkipsEvenWithPlaybookChanges(t *testing.T) {
	t.Parallel()
	dir, baseSHA, _ := setupGitRepo(t)
	headSHA := commitFile(t, dir, "playbooks/restart.yaml", `actions:
  - name: a
`)

	sctx := newTestContextWithDBRecords(t, &mockAgent{name: "test"}, dir, baseSHA, headSHA, config.Commands{})
	sctx.Config.PlaybookSafety = config.PlaybookSafety{Enabled: false}

	step := &PlaybookSafetyStep{}
	outcome, err := step.Execute(sctx)
	if err != nil {
		t.Fatal(err)
	}
	if outcome.NeedsApproval || outcome.Findings != "" {
		t.Fatalf("expected no-op outcome when disabled, got %+v", outcome)
	}
}

func TestPlaybookSafetyStep_CleanPlaybook_Passes(t *testing.T) {
	t.Parallel()
	dir, baseSHA, _ := setupGitRepo(t)
	headSHA := commitFile(t, dir, "playbooks/restart.yaml", cleanPlaybookYAML)

	sctx := newTestContextWithDBRecords(t, &mockAgent{name: "test"}, dir, baseSHA, headSHA, config.Commands{})
	sctx.Config.PlaybookSafety = config.PlaybookSafety{Enabled: true, Patterns: []string{"playbooks/**"}}

	step := &PlaybookSafetyStep{}
	outcome, err := step.Execute(sctx)
	if err != nil {
		t.Fatal(err)
	}
	if outcome.NeedsApproval || outcome.Findings != "" {
		t.Fatalf("expected clean playbook to produce no findings, got %+v", outcome)
	}
}

func TestPlaybookSafetyStep_MissingRollback_AsksUser(t *testing.T) {
	t.Parallel()
	dir, baseSHA, _ := setupGitRepo(t)
	headSHA := commitFile(t, dir, "playbooks/restart.yaml", `actions:
  - name: restart-web-service
    blast_radius: us-east-1/web-fleet
    idempotent: true
`)

	sctx := newTestContextWithDBRecords(t, &mockAgent{name: "test"}, dir, baseSHA, headSHA, config.Commands{})
	sctx.Config.PlaybookSafety = config.PlaybookSafety{Enabled: true, Patterns: []string{"playbooks/**"}}

	step := &PlaybookSafetyStep{}
	outcome, err := step.Execute(sctx)
	if err != nil {
		t.Fatal(err)
	}
	if !outcome.NeedsApproval {
		t.Fatal("expected approval required for missing rollback")
	}
	if !strings.Contains(outcome.Findings, "ask-user") || !strings.Contains(outcome.Findings, "rollback") {
		t.Fatalf("expected ask-user rollback finding, got %s", outcome.Findings)
	}
}

func TestPlaybookSafetyStep_HighRiskWithoutApproval_AutoFixesAndCommits(t *testing.T) {
	t.Parallel()
	dir, baseSHA, _ := setupGitRepo(t)
	headSHA := commitFile(t, dir, "playbooks/restart.yaml", `actions:
  - name: restart-web-service
    risk_level: high
    blast_radius: us-east-1/web-fleet
    idempotent: true
    rollback:
      description: manual revert
`)

	sctx := newTestContextWithDBRecords(t, &mockAgent{name: "test"}, dir, baseSHA, headSHA, config.Commands{})
	sctx.Config.PlaybookSafety = config.PlaybookSafety{Enabled: true, Patterns: []string{"playbooks/**"}}

	step := &PlaybookSafetyStep{}
	outcome, err := step.Execute(sctx)
	if err != nil {
		t.Fatal(err)
	}
	if outcome.NeedsApproval || outcome.Findings != "" {
		t.Fatalf("expected the approval-flag issue to be auto-fixed with no remaining findings, got %+v", outcome)
	}
	if status := gitStatusPorcelain(t, dir); status != "" {
		t.Fatalf("expected clean worktree after auto-fix commit, got %q", status)
	}
	if got := lastCommitMessage(t, dir); !strings.HasPrefix(got, "no-mistakes(playbook-safety): ") {
		t.Fatalf("last commit message = %q, want no-mistakes(playbook-safety) prefix", got)
	}
	fixed, err := os.ReadFile(filepath.Join(dir, "playbooks", "restart.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(fixed), "requires_approval: true") {
		t.Fatalf("expected requires_approval: true written to file, got:\n%s", fixed)
	}
}

func TestPlaybookSafetyStep_MalformedYAML_AsksUser(t *testing.T) {
	t.Parallel()
	dir, baseSHA, _ := setupGitRepo(t)
	headSHA := commitFile(t, dir, "playbooks/restart.yaml", "{{not valid yaml")

	sctx := newTestContextWithDBRecords(t, &mockAgent{name: "test"}, dir, baseSHA, headSHA, config.Commands{})
	sctx.Config.PlaybookSafety = config.PlaybookSafety{Enabled: true, Patterns: []string{"playbooks/**"}}

	step := &PlaybookSafetyStep{}
	outcome, err := step.Execute(sctx)
	if err != nil {
		t.Fatal(err)
	}
	if !outcome.NeedsApproval {
		t.Fatal("expected approval required for malformed playbook YAML")
	}
	if !strings.Contains(outcome.Findings, "could not parse playbook") {
		t.Fatalf("expected parse-error finding, got %s", outcome.Findings)
	}
}

func TestPlaybookSafetyStep_PermissionScopeWidened_AsksUser(t *testing.T) {
	t.Parallel()
	dir, _, _ := setupGitRepo(t)

	v1 := `actions:
  - name: restart-web-service
    blast_radius: us-east-1/web-fleet
    idempotent: true
    rollback:
      description: manual revert
    permissions:
      - service:read
`
	// Land v1 on main, simulating an already-approved baseline.
	gitCmd(t, dir, "checkout", "main")
	gitCmd(t, dir, "merge", "--no-ff", "-m", "merge feature scaffolding", "feature")
	commitFile(t, dir, "playbooks/restart.yaml", v1)
	mainSHA := gitCmd(t, dir, "rev-parse", "HEAD")

	// Widen permissions on a feature branch built on top of that baseline.
	gitCmd(t, dir, "checkout", "-b", "widen-permissions")
	v2 := strings.Replace(v1, "- service:read\n", "- service:read\n      - service:restart\n", 1)
	headSHA := commitFile(t, dir, "playbooks/restart.yaml", v2)

	sctx := newTestContextWithDBRecords(t, &mockAgent{name: "test"}, dir, mainSHA, headSHA, config.Commands{})
	sctx.Config.PlaybookSafety = config.PlaybookSafety{Enabled: true, Patterns: []string{"playbooks/**"}}

	step := &PlaybookSafetyStep{}
	outcome, err := step.Execute(sctx)
	if err != nil {
		t.Fatal(err)
	}
	if !outcome.NeedsApproval {
		t.Fatal("expected approval required for widened permission scope")
	}
	if !strings.Contains(outcome.Findings, "widens permission scope") {
		t.Fatalf("expected permission-scope finding, got %s", outcome.Findings)
	}
}
