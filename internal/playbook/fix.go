package playbook

import (
	"bytes"
	"fmt"

	"gopkg.in/yaml.v3"
)

// ApplyRequiresApprovalFix sets requires_approval: true on the named actions
// within a playbook YAML document, editing the parsed node tree rather than
// re-marshaling the decoded struct so comments and formatting elsewhere in
// the file survive. It is a no-op for action names not found in the
// document.
func ApplyRequiresApprovalFix(data []byte, actionNames []string) ([]byte, error) {
	if len(actionNames) == 0 {
		return data, nil
	}
	want := make(map[string]bool, len(actionNames))
	for _, n := range actionNames {
		want[n] = true
	}

	var doc yaml.Node
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse playbook for fix: %w", err)
	}
	if len(doc.Content) == 0 {
		return data, nil
	}
	root := doc.Content[0]
	if root.Kind != yaml.MappingNode {
		return data, nil
	}

	actionsNode := mappingValue(root, "actions")
	if actionsNode == nil || actionsNode.Kind != yaml.SequenceNode {
		return data, nil
	}

	changed := false
	for _, actionNode := range actionsNode.Content {
		if actionNode.Kind != yaml.MappingNode {
			continue
		}
		nameNode := mappingValue(actionNode, "name")
		if nameNode == nil || !want[nameNode.Value] {
			continue
		}
		setRequiresApprovalTrue(actionNode)
		changed = true
	}
	if !changed {
		return data, nil
	}

	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(&doc); err != nil {
		return nil, fmt.Errorf("encode playbook fix: %w", err)
	}
	if err := enc.Close(); err != nil {
		return nil, fmt.Errorf("encode playbook fix: %w", err)
	}
	return buf.Bytes(), nil
}

// mappingValue returns the value node for key in a YAML mapping node, or nil.
func mappingValue(mapping *yaml.Node, key string) *yaml.Node {
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

// setRequiresApprovalTrue sets (or adds) requires_approval: true on an
// action mapping node.
func setRequiresApprovalTrue(actionNode *yaml.Node) {
	for i := 0; i+1 < len(actionNode.Content); i += 2 {
		if actionNode.Content[i].Value == "requires_approval" {
			value := actionNode.Content[i+1]
			value.Kind = yaml.ScalarNode
			value.Tag = "!!bool"
			value.Value = "true"
			value.Style = 0
			return
		}
	}
	keyNode := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "requires_approval"}
	valueNode := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"}
	actionNode.Content = append(actionNode.Content, keyNode, valueNode)
}
