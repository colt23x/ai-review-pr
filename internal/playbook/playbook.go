// Package playbook parses and checks autonomous remediation playbooks
// against a fixed set of structural safety properties (rollback,
// blast-radius scoping, approval-gating for high-risk actions, idempotency,
// and permission-scope creep). It is deliberately schema-generic: the
// package makes no assumption about a specific platform's playbook format
// beyond the shape defined here, so it can gate any YAML-defined playbook
// that declares actions with these fields.
package playbook

import (
	"strings"

	"gopkg.in/yaml.v3"
)

// Rollback describes how an action can be reversed. Either field alone is
// enough to count as "defined" - a named rollback action, a free-text
// description, or both.
type Rollback struct {
	Action      string `yaml:"action"`
	Description string `yaml:"description"`
}

func (r *Rollback) isEmpty() bool {
	if r == nil {
		return true
	}
	return strings.TrimSpace(r.Action) == "" && strings.TrimSpace(r.Description) == ""
}

// Action is a single remediation step declared in a playbook.
type Action struct {
	Name             string    `yaml:"name"`
	RiskLevel        string    `yaml:"risk_level"`
	BlastRadius      string    `yaml:"blast_radius"`
	Rollback         *Rollback `yaml:"rollback"`
	Idempotent       *bool     `yaml:"idempotent"`
	RequiresApproval *bool     `yaml:"requires_approval"`
	Permissions      []string  `yaml:"permissions"`
}

// Playbook is a generic autonomous-remediation playbook definition.
type Playbook struct {
	Version int      `yaml:"version"`
	Name    string   `yaml:"name"`
	Actions []Action `yaml:"actions"`
}

// Parse decodes a playbook YAML document.
func Parse(data []byte) (*Playbook, error) {
	var pb Playbook
	if err := yaml.Unmarshal(data, &pb); err != nil {
		return nil, err
	}
	return &pb, nil
}
