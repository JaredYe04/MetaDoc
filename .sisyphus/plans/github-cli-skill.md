# GitHub CLI Integration SKILL Implementation Plan

## TL;DR

> **Quick Summary**: Create a comprehensive Agent-learnable SKILL for GitHub CLI integration that enables Agents to read, create, update, and close GitHub issues automatically. This transforms GitHub Issues into a living project knowledge base integrated with MetaDoc's agent framework.
> 
> **Deliverables**: 
> - `meta-doc/.cursor/skills/github-cli/` SKILL documentation
> - `heartbeat.md` integration specification
> - Issue lifecycle workflow definitions
> - Example Agent prompts and usage patterns
> - Authentication setup guide
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: SKILL documentation → Workflow examples → Integration guide

---

## Context

### Original Request
User wants to implement a GitHub CLI integration SKILL for MetaDoc that enables Agents to:
1. Read GitHub issues/notifications using gh-cli
2. Create issues automatically when users report bugs (include repro steps)
3. Update issues with progress as Agent works
4. Close issues when fixes are verified
5. Document lessons learned in issue comments
6. Use GitHub as project knowledge base

### Research Findings

**SKILL System Pattern** (from existing SKILLS at `meta-doc/.cursor/skills/`):
- Each skill has its own directory: `{skill-name}/`
- Main documentation: `SKILL.md` with YAML frontmatter
- Reference documentation: `reference.md` for detailed specs
- Frontmatter format: `name`, `description` fields
- Skills are Agent-learnable documentation (not code)

**Agent Tools Pattern** (from `src/renderer/src/utils/agent-tools/`):
- Tool definitions: `*-tool.ts` with `AgentToolConfig`
- Display components: `components/*Display.vue`
- Registration: `index.ts` in tool directory
- Support for i18n, streaming, callbacks

**GitHub CLI Already Used**:
- Found in `meta-doc/docs/releases/GITHUB_ACTIONS_SETUP.md`
- Uses `GH_TOKEN` secret for authentication
- Standard gh CLI patterns already established

**MetaDoc Architecture**:
- Electron + Vue 3 + TypeScript
- Agent framework in `src/renderer/src/utils/agent-framework/`
- Tools follow standardized patterns with i18n support

---

## Work Objectives

### Core Objective
Create a complete, Agent-learnable SKILL that transforms GitHub Issues into an integrated project knowledge base, enabling any Agent to manage issues automatically through gh CLI commands.

### Concrete Deliverables
1. **SKILL Documentation** (`meta-doc/.cursor/skills/github-cli/SKILL.md`)
   - Frontmatter with name and description
   - When-to-use guidelines
   - Core workflow (read → create → update → close)
   - Authentication setup
   - Command reference with examples

2. **Reference Documentation** (`meta-doc/.cursor/skills/github-cli/reference.md`)
   - Complete gh CLI command reference
   - Issue template formats
   - Error handling patterns
   - Integration with other tools

3. **Heartbeat Integration Specification** (`docs/heartbeat-integration.md`)
   - How issues sync with heartbeat.md
   - Status mapping between GitHub and local tracking
   - Automatic update workflows

4. **Example Agent Prompts** (embedded in SKILL.md)
   - Bug report → Issue creation prompts
   - Progress update prompts
   - Issue closing with verification prompts
   - Knowledge documentation prompts

5. **Workflow Definitions** (in SKILL.md)
   - Issue lifecycle: Open → In Progress → Review → Closed
   - Automatic label management
   - Comment templates for different stages

### Definition of Done
- [ ] Agents can read SKILL.md and understand how to use gh CLI
- [ ] Agents can create well-formatted issues with repro steps
- [ ] Agents can update issues with progress comments
- [ ] Agents can close issues with verification notes
- [ ] Integration with heartbeat.md is documented
- [ ] All gh CLI commands have examples

### Must Have
- Complete SKILL.md with frontmatter and workflows
- Reference.md with all gh CLI commands
- Authentication setup guide (GH_TOKEN)
- Issue templates (bug, feature, task)
- Example prompts for common scenarios
- Integration specification for heartbeat.md

### Must NOT Have (Guardrails)
- NO implementation code (this is a SKILL/documentation only)
- NO modifications to existing agent tools
- NO changes to release workflows
- NO breaking changes to existing patterns

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (this is documentation-only SKILL)
- **Automated tests**: NO (documentation, not code)
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY)

Since this is a documentation SKILL, verification is done through documentation review:

**Scenario 1: SKILL Documentation Completeness**
  Tool: Bash (file checks)
  Preconditions: Plan execution started
  Steps:
    1. Check SKILL.md exists at `meta-doc/.cursor/skills/github-cli/SKILL.md`
    2. Verify frontmatter contains `name` and `description`
    3. Verify all required sections present (When to Use, Core Flow, Authentication, Commands)
  Expected Result: All files exist with proper structure
  Evidence: `.sisyphus/evidence/task-1-skill-structure.txt`

**Scenario 2: Reference Documentation Quality**
  Tool: Bash (content validation)
  Preconditions: SKILL.md created
  Steps:
    1. Check reference.md exists with command reference
    2. Verify at least 10 gh CLI commands documented
    3. Verify each command has example output
  Expected Result: Comprehensive command reference
  Evidence: `.sisyphus/evidence/task-2-reference-quality.txt`

**Scenario 3: Example Prompts Validation**
  Tool: Bash (grep for patterns)
  Preconditions: Reference.md created
  Steps:
    1. Search for example prompts in SKILL.md
    2. Verify bug creation prompts exist
    3. Verify progress update prompts exist
    4. Verify knowledge documentation prompts exist
  Expected Result: At least 5 example prompts documented
  Evidence: `.sisyphus/evidence/task-3-example-prompts.txt`

**Scenario 4: heartbeat.md Integration Spec**
  Tool: Bash (file check)
  Preconditions: SKILL documentation complete
  Steps:
    1. Check `docs/heartbeat-integration.md` exists
    2. Verify sync workflow documented
    3. Verify status mapping table present
  Expected Result: Integration spec is complete
  Evidence: `.sisyphus/evidence/task-4-heartbeat-spec.txt`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Create SKILL.md main documentation
└── Task 2: Create reference.md command reference

Wave 2 (After Wave 1):
├── Task 3: Create heartbeat integration spec
└── Task 4: Final review and integration

Critical Path: Task 1 → Task 2 → Task 3
Parallel Speedup: 30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4 | 2 |
| 2 | None | 3, 4 | 1 |
| 3 | 1, 2 | 4 | None |
| 4 | 1, 2, 3 | None | None |

---

## TODOs

- [ ] 1. Create SKILL.md Main Documentation

  **What to do**:
  Create the main SKILL.md file at `meta-doc/.cursor/skills/github-cli/SKILL.md` with:
  - YAML frontmatter (name: github-cli, description: when to use)
  - "When to Use" section with clear triggers
  - "Core Flow" section with 4-step workflow
  - "Authentication" section with GH_TOKEN setup
  - "Command Reference" section with common operations
  - "Example Prompts" section with 5+ ready-to-use prompts
  - "Best Practices" section with guardrails

  **Must NOT do**:
  - Do not write implementation code
  - Do not modify existing files
  - Do not include sensitive example tokens

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: This task is documentation writing requiring clear, structured prose
  - **Skills**: [`git-master`]
    - `git-master`: Understanding gh CLI commands and GitHub workflows
  - **Skills Evaluated but Omitted**:
    - No additional skills needed - pure documentation task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing SKILL structure to follow):
  - `meta-doc/.cursor/skills/ai-task-streaming/SKILL.md:1-179` - Full SKILL structure with frontmatter
  - `meta-doc/.cursor/skills/metadoc-agent-tools/SKILL.md:1-118` - Tool-specific SKILL format

  **External References** (gh CLI documentation):
  - Official docs: `https://cli.github.com/manual/` - gh CLI command reference
  - Example patterns: GitHub CLI cheat sheets for issue management

  **WHY Each Reference Matters**:
  - ai-task-streaming SKILL.md: Shows complete SKILL structure, frontmatter format, section organization
  - metadoc-agent-tools SKILL.md: Shows how to document tool patterns for Agents
  - gh CLI docs: Source of truth for command syntax and options

  **Acceptance Criteria**:

  - [ ] File created: `meta-doc/.cursor/skills/github-cli/SKILL.md`
  - [ ] Frontmatter present with name and description fields
  - [ ] "When to Use" section lists at least 3 clear triggers
  - [ ] "Core Flow" section documents read → create → update → close workflow
  - [ ] "Authentication" section explains GH_TOKEN setup
  - [ ] "Command Reference" documents: gh issue list, create, view, comment, close
  - [ ] "Example Prompts" section contains 5+ ready-to-use prompts
  - [ ] "Best Practices" section includes guardrails and anti-patterns

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: SKILL.md structure validation
    Tool: Bash (file validation)
    Preconditions: Task execution started
    Steps:
      1. bash: Check file exists at meta-doc/.cursor/skills/github-cli/SKILL.md
      2. bash: Verify frontmatter with "grep -E '^---'" and "grep 'name:'"
      3. bash: Count sections with "grep '^## '"
      4. bash: Verify example prompts with "grep -A5 'Example Prompt'"
    Expected Result: File exists with proper structure and 5+ sections
    Evidence: .sisyphus/evidence/task-1-structure-check.txt

  Scenario: Content completeness validation
    Tool: Bash (content grep)
    Preconditions: File created
    Steps:
      1. bash: Verify "When to Use" section exists
      2. bash: Verify "Core Flow" or "Workflow" section exists
      3. bash: Verify "Authentication" or "Setup" section exists
      4. bash: Count code examples with "grep -c '```'"
    Expected Result: All required sections present, at least 10 code blocks
    Evidence: .sisyphus/evidence/task-1-content-check.txt
  ```

  **Evidence to Capture:**
  - [ ] File listing: `ls -la meta-doc/.cursor/skills/github-cli/`
  - [ ] Content preview: `head -50 SKILL.md`
  - [ ] Section count: `grep -c "^## " SKILL.md`
  - [ ] Evidence dir: `.sisyphus/evidence/task-1-*`

  **Commit**: YES
  - Message: `docs: add GitHub CLI SKILL documentation`
  - Files: `meta-doc/.cursor/skills/github-cli/SKILL.md`
  - Pre-commit: N/A (documentation only)

---

- [ ] 2. Create reference.md Command Reference

  **What to do**:
  Create detailed reference documentation at `meta-doc/.cursor/skills/github-cli/reference.md` with:
  - Complete gh CLI command reference for issue management
  - Each command: syntax, options, examples, output format
  - Issue template JSON structures
  - Error handling patterns
  - Rate limiting considerations
  - Integration patterns with other MetaDoc tools

  **Must NOT do**:
  - Do not duplicate SKILL.md content
  - Do not include proprietary information
  - Do not write code implementations

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical reference documentation
  - **Skills**: [`git-master`]
    - `git-master`: Deep knowledge of GitHub CLI and git operations
  - **Skills Evaluated but Omitted**:
    - No additional skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References**:
  - `meta-doc/.cursor/skills/ai-task-streaming/reference.md:1-58` - Reference structure format
  - `meta-doc/.cursor/skills/metadoc-agent-tools/reference.md:1-108` - Technical reference style

  **External References**:
  - `https://cli.github.com/manual/gh_issue` - Official gh issue command docs
  - `https://docs.github.com/en/rest/issues` - GitHub Issues API (for understanding data structures)

  **WHY Each Reference Matters**:
  - Existing reference.md files: Show consistent formatting, table structures, type definitions
  - gh CLI docs: Accurate command syntax and options
  - GitHub API docs: Understanding of issue data structures for templates

  **Acceptance Criteria**:

  - [ ] File created: `meta-doc/.cursor/skills/github-cli/reference.md`
  - [ ] Documents at least 10 gh CLI commands
  - [ ] Each command has: syntax, common options, example, sample output
  - [ ] Issue template JSON structures provided
  - [ ] Error handling section with common errors
  - [ ] Rate limiting guidance included

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Command reference completeness
    Tool: Bash (content analysis)
    Preconditions: File created
    Steps:
      1. bash: Count commands with "grep -c '### gh issue'"
      2. bash: Verify examples with "grep -c 'gh issue'"
      3. bash: Check for JSON templates with "grep -c '```json'"
      4. bash: Validate tables with "grep -c '|'"
    Expected Result: 10+ commands, 20+ examples, JSON templates, tables
    Evidence: .sisyphus/evidence/task-2-reference-completeness.txt

  Scenario: No duplicate content check
    Tool: Bash (cross-file comparison)
    Preconditions: Both files exist
    Steps:
      1. bash: Extract unique lines from reference.md
      2. bash: Ensure no large blocks identical to SKILL.md
      3. bash: Verify reference.md is more detailed than SKILL.md
    Expected Result: Reference.md supplements, doesn't duplicate SKILL.md
    Evidence: .sisyphus/evidence/task-2-uniqueness-check.txt
  ```

  **Evidence to Capture:**
  - [ ] Command count: `grep -c "^### gh" reference.md`
  - [ ] Example count: `grep -c "gh issue" reference.md`
  - [ ] File size: `wc -l reference.md`
  - [ ] Evidence dir: `.sisyphus/evidence/task-2-*`

  **Commit**: YES
  - Message: `docs: add GitHub CLI command reference`
  - Files: `meta-doc/.cursor/skills/github-cli/reference.md`
  - Pre-commit: N/A

---

- [ ] 3. Create heartbeat.md Integration Specification

  **What to do**:
  Create integration specification at `docs/heartbeat-integration.md` with:
  - Concept explanation: What is heartbeat.md and why integrate
  - Sync workflow: How issues update heartbeat.md automatically
  - Status mapping table: GitHub issue states ↔ heartbeat states
  - Automatic update triggers and actions
  - Example heartbeat.md format/template
  - Agent prompts for maintaining heartbeat sync

  **Must NOT do**:
  - Do not create actual heartbeat.md (spec only)
  - Do not modify existing agent tools
  - Do not assume heartbeat.md format is already defined

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical specification writing
  - **Skills**: []
    - No specific skills needed - conceptual documentation
  - **Skills Evaluated but Omitted**:
    - N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References**:
  - `meta-doc/docs/releases/GITHUB_ACTIONS_SETUP.md:1-270` - GitHub integration patterns
  - `meta-doc/docs/releases/RELEASE_GUIDE.md` - Workflow documentation style

  **External References**:
  - GitHub Issues API webhook documentation (for understanding triggers)
  - Project heartbeat/health documentation patterns from OSS projects

  **WHY Each Reference Matters**:
  - GITHUB_ACTIONS_SETUP.md: Shows how MetaDoc already integrates with GitHub
  - RELEASE_GUIDE.md: Consistent documentation style for workflows
  - External patterns: Best practices for project health tracking

  **Acceptance Criteria**:

  - [ ] File created: `docs/heartbeat-integration.md`
  - [ ] Concept section explains heartbeat.md purpose
  - [ ] Sync workflow documented with sequence diagram
  - [ ] Status mapping table present (GitHub ↔ heartbeat)
  - [ ] At least 3 automatic trigger scenarios documented
  - [ ] Example heartbeat.md template provided

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Integration spec completeness
    Tool: Bash (content validation)
    Preconditions: File created
    Steps:
      1. bash: Verify file exists at docs/heartbeat-integration.md
      2. bash: Check for "sync" or "Sync" keyword
      3. bash: Look for table syntax with "|"
      4. bash: Verify template/example section exists
    Expected Result: Comprehensive integration spec with examples
    Evidence: .sisyphus/evidence/task-3-integration-spec.txt

  Scenario: Status mapping validation
    Tool: Bash (grep patterns)
    Preconditions: File exists
    Steps:
      1. bash: Extract status mapping table
      2. bash: Verify GitHub states: open, closed, etc.
      3. bash: Verify heartbeat states defined
    Expected Result: Clear bidirectional status mapping
    Evidence: .sisyphus/evidence/task-3-status-mapping.txt
  ```

  **Evidence to Capture:**
  - [ ] Section count: `grep -c "^## " docs/heartbeat-integration.md`
  - [ ] Table count: `grep -c "^|" docs/heartbeat-integration.md`
  - [ ] Example templates: `grep -c "heartbeat" docs/heartbeat-integration.md`
  - [ ] Evidence dir: `.sisyphus/evidence/task-3-*`

  **Commit**: YES
  - Message: `docs: add heartbeat.md integration specification`
  - Files: `docs/heartbeat-integration.md`
  - Pre-commit: N/A

---

- [ ] 4. Final Review and Integration

  **What to do**:
  - Review all created documentation for consistency
  - Verify cross-references between SKILL.md and reference.md
  - Ensure example prompts are actionable
  - Add navigation links between documents
  - Update any relevant AGENTS.md or README files if needed
  - Create summary of deliverables

  **Must NOT do**:
  - Do not modify existing code
  - Do not break existing documentation links
  - Do not commit incomplete documentation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Review and finalization task
  - **Skills**: []
    - No specific skills needed
  - **Skills Evaluated but Omitted**:
    - N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References**:
  - All created files: SKILL.md, reference.md, heartbeat-integration.md
  - `meta-doc/AGENTS.md` - For any cross-references needed

  **WHY Each Reference Matters**:
  - Created files: Need to verify internal consistency
  - AGENTS.md: May need to reference new SKILL if appropriate

  **Acceptance Criteria**:

  - [ ] All 3 documentation files exist and are complete
  - [ ] Cross-references between SKILL.md and reference.md work
  - [ ] Example prompts are copy-paste ready
  - [ ] No broken internal links
  - [ ] Summary document created listing all deliverables

  **Agent-Executed QA Scenarios (MANDATORY):**

  ```
  Scenario: Final completeness check
    Tool: Bash (comprehensive validation)
    Preconditions: All previous tasks complete
    Steps:
      1. bash: List all created files with sizes
      2. bash: Verify no empty files
      3. bash: Check all files have proper markdown structure
      4. bash: Generate summary of lines/word counts
    Expected Result: All files complete and properly formatted
    Evidence: .sisyphus/evidence/task-4-final-summary.txt

  Scenario: Cross-reference validation
    Tool: Bash (link checking)
    Preconditions: All files exist
    Steps:
      1. bash: Find all internal links in markdown files
      2. bash: Verify referenced files exist
      3. bash: Check for broken anchors
    Expected Result: All cross-references valid
    Evidence: .sisyphus/evidence/task-4-cross-refs.txt
  ```

  **Evidence to Capture:**
  - [ ] File listing with sizes: `ls -la meta-doc/.cursor/skills/github-cli/ docs/heartbeat-integration.md`
  - [ ] Line counts: `wc -l meta-doc/.cursor/skills/github-cli/*.md docs/heartbeat-integration.md`
  - [ ] Summary report: `.sisyphus/evidence/final-summary.txt`
  - [ ] Evidence dir: `.sisyphus/evidence/task-4-*`

  **Commit**: YES (final)
  - Message: `docs: finalize GitHub CLI SKILL with cross-references`
  - Files: Any updated files from review
  - Pre-commit: N/A

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `docs: add GitHub CLI SKILL documentation` | `meta-doc/.cursor/skills/github-cli/SKILL.md` | File exists with proper structure |
| 2 | `docs: add GitHub CLI command reference` | `meta-doc/.cursor/skills/github-cli/reference.md` | Command reference complete |
| 3 | `docs: add heartbeat.md integration specification` | `docs/heartbeat-integration.md` | Integration spec complete |
| 4 | `docs: finalize GitHub CLI SKILL with cross-references` | Any updated files | All documentation consistent |

---

## Success Criteria

### Verification Commands
```bash
# Check all files exist
ls -la meta-doc/.cursor/skills/github-cli/SKILL.md
ls -la meta-doc/.cursor/skills/github-cli/reference.md
ls -la docs/heartbeat-integration.md

# Verify SKILL.md has proper structure
grep -q "^---" meta-doc/.cursor/skills/github-cli/SKILL.md && echo "✓ Frontmatter present"
grep -q "When to Use" meta-doc/.cursor/skills/github-cli/SKILL.md && echo "✓ Usage section present"

# Verify command reference
grep -c "gh issue" meta-doc/.cursor/skills/github-cli/reference.md
# Expected: >= 10

# Verify example prompts
grep -c "Example Prompt" meta-doc/.cursor/skills/github-cli/SKILL.md
# Expected: >= 5

# Verify heartbeat integration
grep -q "heartbeat" docs/heartbeat-integration.md && echo "✓ Integration documented"
```

### Final Checklist
- [ ] SKILL.md created with frontmatter and all required sections
- [ ] reference.md created with 10+ gh CLI commands documented
- [ ] heartbeat-integration.md created with sync workflow
- [ ] All example prompts are actionable and copy-paste ready
- [ ] Cross-references between documents are valid
- [ ] Documentation follows MetaDoc's existing patterns
- [ ] No breaking changes to existing files
- [ ] All commits follow conventional commit format

### Agent Capability Test
After implementation, an Agent should be able to:
1. Read SKILL.md and understand when to use GitHub CLI integration
2. Copy example prompts to create a bug issue with repro steps
3. Reference command syntax from reference.md
4. Understand heartbeat.md integration workflow

---

## Summary of Deliverables

| File | Purpose | Location |
|------|---------|----------|
| `SKILL.md` | Main Agent-learnable documentation | `meta-doc/.cursor/skills/github-cli/SKILL.md` |
| `reference.md` | Detailed command reference | `meta-doc/.cursor/skills/github-cli/reference.md` |
| `heartbeat-integration.md` | Integration specification | `docs/heartbeat-integration.md` |

### Key Features Documented

1. **Authentication**: GH_TOKEN setup via environment variables
2. **Issue Lifecycle**: Open → In Progress → Review → Closed
3. **Automatic Actions**: Issue creation from bug reports, progress updates, closure on verification
4. **Knowledge Base**: Documenting lessons learned in issue comments
5. **Heartbeat Integration**: Sync between GitHub issues and local heartbeat tracking

### Example Capabilities Enabled

**Bug Report → Issue**:
```
User reports bug → Agent creates issue with:
- Title: [Bug] Description
- Body: Repro steps, expected vs actual, environment info
- Labels: bug, priority
```

**Progress Tracking**:
```
Agent works on fix → Updates issue with:
- Comment: Progress update with commit references
- Labels: Update to "in-progress"
```

**Knowledge Documentation**:
```
Issue resolved → Agent adds comment:
- Root cause explanation
- Fix approach summary
- Lessons learned for future reference
```
