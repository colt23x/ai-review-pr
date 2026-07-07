package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kunchenguid/no-mistakes/internal/git"
	"github.com/kunchenguid/no-mistakes/internal/pipeline"
	"github.com/kunchenguid/no-mistakes/internal/playbook"
	"github.com/kunchenguid/no-mistakes/internal/types"
)

// PlaybookSafetyStep checks autonomous remediation playbooks against a fixed
// set of structural safety properties - rollback presence, blast-radius
// scoping, approval-gating for high-risk actions, idempotency, and
// permission-scope creep - before they can merge. It only activates when
// the diff touches a file matching one of the configured activation
// patterns, so it is a no-op for every other change.
//
// Unlike the other steps, it never invokes an agent. Whether a playbook is
// safe to run unattended in production is a structural judgment call, not a
// code-quality issue an LLM should paper over, so evaluation here is
// deterministic and auditable: the same playbook always produces the same
// findings, and there is no prompt-injection surface from playbook content.
type PlaybookSafetyStep struct{}

func (s *PlaybookSafetyStep) Name() types.StepName { return types.StepPlaybookSafety }

func (s *PlaybookSafetyStep) Execute(sctx *pipeline.StepContext) (*pipeline.StepOutcome, error) {
	ctx := sctx.Ctx
	if !sctx.Config.PlaybookSafety.Enabled {
		return &pipeline.StepOutcome{}, nil
	}

	baseSHA := resolveBranchBaseSHA(ctx, sctx.WorkDir, sctx.Run.BaseSHA, sctx.Repo.DefaultBranch)
	changedFiles, err := git.Run(ctx, sctx.WorkDir, "diff", "--name-only", baseSHA+".."+sctx.Run.HeadSHA)
	if err != nil {
		return nil, fmt.Errorf("get changed files: %w", err)
	}

	playbookFiles := matchingPlaybookFiles(changedFiles, sctx.Config.PlaybookSafety.Patterns)
	if len(playbookFiles) == 0 {
		sctx.Log("no playbook files changed, skipping playbook safety checks")
		return &pipeline.StepOutcome{}, nil
	}

	var findings []Finding
	fixedFiles := 0
	for _, path := range playbookFiles {
		absPath := filepath.Join(sctx.WorkDir, path)
		current, err := os.ReadFile(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue // deleted in this change; nothing to check
			}
			return nil, fmt.Errorf("read %s: %w", path, err)
		}

		pb, err := playbook.Parse(current)
		if err != nil {
			findings = append(findings, Finding{
				Severity:    "error",
				File:        path,
				Description: fmt.Sprintf("could not parse playbook: %v", err),
				Action:      types.ActionAskUser,
			})
			continue
		}

		results := playbook.Evaluate(pb, previousPlaybook(ctx, sctx.WorkDir, baseSHA, path))
		if len(results) == 0 {
			continue
		}

		var autoFixActions []string
		for _, r := range results {
			if r.Action == types.ActionAutoFix {
				autoFixActions = append(autoFixActions, r.ActionName)
				sctx.Log(fmt.Sprintf("playbook-safety: auto-fixing %s (%s)", path, r.Message))
				continue
			}
			findings = append(findings, Finding{
				Severity:    r.Severity,
				File:        path,
				Description: r.Message,
				Action:      r.Action,
			})
		}

		if len(autoFixActions) == 0 {
			continue
		}
		fixed, err := playbook.ApplyRequiresApprovalFix(current, autoFixActions)
		if err != nil {
			return nil, fmt.Errorf("apply playbook auto-fix to %s: %w", path, err)
		}
		if err := os.WriteFile(absPath, fixed, 0o644); err != nil {
			return nil, fmt.Errorf("write playbook auto-fix to %s: %w", path, err)
		}
		fixedFiles++
	}

	if fixedFiles > 0 {
		summary := "require approval for high-risk playbook actions"
		if err := commitAgentFixes(sctx, s.Name(), summary, summary); err != nil {
			return nil, err
		}
	}

	if len(findings) == 0 {
		sctx.Log("playbook safety checks passed")
		return &pipeline.StepOutcome{}, nil
	}

	out := Findings{
		Items:   findings,
		Summary: fmt.Sprintf("%d playbook safety finding(s) need a decision", len(findings)),
	}
	findingsJSON, _ := json.Marshal(out)
	sctx.Log(fmt.Sprintf("playbook safety: %d finding(s) require a decision", len(findings)))
	return &pipeline.StepOutcome{
		NeedsApproval: true,
		AutoFixable:   false,
		Findings:      string(findingsJSON),
	}, nil
}

// previousPlaybook reads and parses path as it existed at baseSHA, for
// comparing permission scope. Returns nil when the file did not exist at
// baseSHA (new playbook) or fails to parse there.
func previousPlaybook(ctx context.Context, workDir, baseSHA, path string) *playbook.Playbook {
	prevRaw, err := git.Run(ctx, workDir, "show", baseSHA+":"+path)
	if err != nil {
		return nil
	}
	prev, err := playbook.Parse([]byte(prevRaw))
	if err != nil {
		return nil
	}
	return prev
}

// matchingPlaybookFiles returns changed file paths that match any configured
// playbook activation pattern, using the same gitignore-like semantics as
// ignore_patterns.
func matchingPlaybookFiles(changedFiles string, patterns []string) []string {
	var matched []string
	for _, path := range strings.Split(changedFiles, "\n") {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		for _, pattern := range patterns {
			if matchIgnorePattern(path, pattern) {
				matched = append(matched, path)
				break
			}
		}
	}
	return matched
}
