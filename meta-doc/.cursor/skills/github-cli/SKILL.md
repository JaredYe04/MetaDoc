# GitHub CLI Issue Management SKILL

> **Skill ID**: `github-cli-issue-management`  
> **Version**: 2.0.0 - OpenClaw Heartbeat Compatible  
> **Scope**: MetaDoc Repository Only  
> **Last Updated**: 2026-02-26

---

## Overview

This SKILL enables Agents to intelligently manage GitHub issues using the `gh` CLI tool, integrated with **OpenClaw's HEARTBEAT.md** periodic checklist pattern.

### Core Principle (From OpenClaw)

> The AI reads `HEARTBEAT.md` periodically (default: every 30 min) and checks GitHub issues when the checklist instructs it to.

**Key Innovation**: Instead of background daemons or scheduled syncs, the AI **actively checks** GitHub issues during its periodic heartbeat runs when the HEARTBEAT.md checklist includes GitHub-related items.

### How It Works

1. **HEARTBEAT.md** contains checklist items like:  
   `- Check GitHub for urgent issues or mentions`
   
2. **During heartbeat**, the AI reads this checklist  

3. **If check is needed**, AI runs:  
   ```bash
   gh status                    # Check notifications
   gh issue list --state open   # Check open issues
   ```

4. **If something urgent found**, AI alerts the user  

5. **If nothing urgent**, AI responds `HEARTBEAT_OK` (suppressed)  

---

## HEARTBEAT.md Template for GitHub

Create `HEARTBEAT.md` in your workspace:

```markdown
# GitHub Issue Checklist

## Periodic Checks (Every 30 min)

- [ ] Check `gh status` for notifications, mentions, review requests
- [ ] List open issues with `gh issue list --state open`
- [ ] If any issue labeled "urgent" or "critical", alert immediately
- [ ] If user was mentioned in last hour, summarize the mention

## Contextual Checks (When Working)

When user reports a bug:
- [ ] Search `gh issue list --search "keywords"` for existing issues
- [ ] If match found, suggest working on existing issue
- [ ] If no match, create new issue with `gh issue create`

When closing a fix:
- [ ] Comment on issue with fix details
- [ ] Close issue with `gh issue close #N`
- [ ] Document lessons learned in comment
```

### Response Contract (OpenClaw Standard)

| Response | Behavior |
|----------|----------|
| `HEARTBEAT_OK` | Nothing needs attention; message suppressed if ≤300 chars |
| Specific alert | Delivered to user: "Issue #42 needs attention: ..." |
| Issue list | Delivered as summary: "3 open issues: #42, #38, #35" |

---

## When to Check GitHub

### Trigger 1: HEARTBEAT.md Checklist Item

During periodic heartbeat, if checklist says:
```markdown
- [ ] Check GitHub for urgent issues
```

Agent runs:
```bash
gh issue list --state open --label "urgent,critical"
```

### Trigger 2: User Reports Problem (Contextual)

When user says: "The tab drag crashes"

**Agent MUST check BEFORE doing anything else:**
```bash
gh issue list --search "tab drag crash" --state open
```

**Then decide:**
- If issue found → Suggest working on it
- If no issue → Create one

### Trigger 3: User Explicitly Asks

When user says: "Check GitHub issues" or "Any notifications?"

Agent runs immediately:
```bash
gh status
gh issue list --state open
```

### Trigger 4: Before Starting Work

Before working on any feature/fix, Agent checks:
```bash
gh issue list --search "feature-name" --state open
```

---

## Essential Commands

### Quick Reference

```bash
# Check notifications (run during EVERY heartbeat)
gh status

# Check open issues  
gh issue list --state open

# Search for specific problem
gh issue list --search "crash drag" --state open

# View issue details
gh issue view 42

# Create issue from bug report
gh issue create --title "[BUG] Crash on startup" --label bug

# Comment on issue
gh issue comment 42 --body "Investigating..."

# Close issue with documentation
gh issue close 42 --comment "Fixed in commit abc123. Root cause: race condition."
```

### Environment Setup

```bash
# One-time setup
gh auth login
gh repo set-default meta-doc/meta-doc
```

---

## Workflows

### Workflow 1: HEARTBEAT Check → Alert User

```
[Heartbeat triggers every 30 min]
        ↓
Read HEARTBEAT.md
        ↓
See checklist item: "Check gh status"
        ↓
Run: gh status
        ↓
┌─────────────────────────────────────┐
│ Found: Mentioned in issue #42       │
│        Review requested on PR #50   │
└─────────────────────────────────────┘
        ↓
Alert user: "You have notifications: Mentioned in #42, review requested on PR #50"
        ↓
[NOT HEARTBEAT_OK - alert delivered]
```

### Workflow 2: User Reports Bug → Check → Link

```
User: "The tab drag crashes when I move between windows"
        ↓
[Agent checks BEFORE responding]
        ↓
gh issue list --search "tab drag crash" --state open
        ↓
Found: #42 "Tab drag crashes when moving between windows" (90% match)
        ↓
gh issue view 42
        ↓
Agent: "This matches issue #42 that's already open. Should I work on fixing it?"
```

### Workflow 3: No Existing Issue → Create

```
User: "The search is really slow with 1000+ documents"
        ↓
gh issue list --search "search slow performance" --state open
        ↓
No matches found
        ↓
Agent: "No existing issue found. Creating one to track this..."
        ↓
gh issue create \
  --title "[PERF] Search is slow with 1000+ documents" \
  --body "## Problem..." \
  --label "performance,bug"
```

### Workflow 4: Fix Complete → Document → Close

```
[Fix implemented, tests pass]
        ↓
gh issue comment 42 --body "## Fix Complete

**Root cause**: Race condition in drag-manager.ts  
**Solution**: Added null check  
**Testing**: All tests pass  

Fixed in commit abc123"
        ↓
gh issue close 42 --comment "Fixed! See detailed notes above."
        ↓
HEARTBEAT_OK (nothing else needs attention)
```

---

## Smart Detection (Check Before Acting)

### Pattern 1: Bug Report Detection

```typescript
const bugKeywords = [
  'crash', 'error', 'bug', 'broken', 'not working',
  'failed', 'fail', 'exception', 'problem'
]

if (bugKeywords.some(k => userMessage.includes(k))) {
  // MUST check GitHub first!
  const issues = await exec('gh issue list --search "' + 
    extractKeywords(userMessage) + '"')
  
  if (issues.length > 0) {
    return `This might be issue #${issues[0].number}. Should I work on it?`
  }
}
```

### Pattern 2: Issue Reference Detection

```typescript
const issuePattern = /#(\d+)|issue\s+(\d+)/gi
const refs = extractIssueReferences(userMessage)

for (const num of refs) {
  const issue = await exec(`gh issue view ${num}`)
  showIssueToUser(issue)
}
```

### Pattern 3: HEARTBEAT Checklist Parsing

```typescript
// Parse HEARTBEAT.md for GitHub-related items
function shouldCheckGitHub(heartbeatContent: string): boolean {
  const githubPatterns = [
    /check.*github/i,
    /check.*issue/i,
    /check.*notification/i,
    /gh\s+status/i,
    /gh\s+issue/i
  ]
  
  return githubPatterns.some(p => p.test(heartbeatContent))
}
```

---

## Best Practices

### ✅ DO

1. **Check GitHub BEFORE creating issues**
   ```bash
   # Always run this first!
   gh issue list --search "your keywords" --state open
   ```

2. **Use HEARTBEAT.md checklist**
   ```markdown
   - [ ] Check gh status for notifications
   - [ ] Check open issues labeled urgent
   ```

3. **Document fixes before closing**
   ```bash
   gh issue comment 42 --body-file fix-details.md
   gh issue close 42
   ```

4. **Search broadly first**
   ```bash
   gh issue list --search "drag"
   # Then narrow if needed
   gh issue list --search "drag crash windows"
   ```

### ❌ DON'T

1. **Don't create duplicates** - Always search first!
2. **Don't ignore existing issues** - Link your work to them
3. **Don't close without comment** - Document the fix
4. **Don't use daemon/scheduled sync** - Use HEARTBEAT.md pattern instead

---

## HEARTBEAT_OK Suppression

When nothing needs attention:

```
[Heartbeat check]
        ↓
gh status → No notifications
gh issue list → No urgent issues
        ↓
Response: "HEARTBEAT_OK - No GitHub issues need attention"
        ↓
[Message suppressed, user not bothered]
```

When something needs attention:

```
[Heartbeat check]
        ↓
gh status → Mentioned in issue #42
        ↓
Response: "⚠️ You were mentioned in issue #42 'Tab drag crash'"
        ↓
[Alert delivered to user]
```

---

## Decision Tree

```
HEARTBEAT triggers / User sends message
        ↓
┌─────────────────────────────────────┐
│ HEARTBEAT.md has GitHub check item? │
└──────────────┬──────────────────────┘
               │
          ┌────┴────┐
          ▼         ▼
        Yes         No
          │         │
          ▼         ▼
┌──────────────────┐  ┌──────────────────┐
│ Run gh commands  │  │ Check message    │
│ from checklist   │  │ for triggers     │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    ▼
         ┌──────────────────────┐
         │ Issue found or       │
         │ notification?        │
         └──────────┬───────────┘
                    │
               ┌────┴────┐
               ▼         ▼
             Yes         No
               │         │
               ▼         ▼
        ┌──────────┐  ┌──────────┐
        │ Alert    │  │ Respond  │
        │ user     │  │ HEARTBEAT_OK
        └──────────┘  │ (suppressed)
                      └──────────┘
```

---

## Quick Start

### 1. Setup
```bash
gh auth login
gh repo set-default meta-doc/meta-doc
```

### 2. Create HEARTBEAT.md
```markdown
# GitHub Checklist

- [ ] Check gh status
- [ ] Check open issues
- [ ] If urgent issues found, alert user
```

### 3. Test
```bash
gh status
gh issue list --state open
```

---

## Summary

**OpenClaw Pattern Applied to GitHub:**

1. **No daemon** - Check during heartbeat or when triggered
2. **HEARTBEAT.md checklist** - User defines what to check
3. **HEARTBEAT_OK suppression** - Quiet when nothing's wrong
4. **Active alerts** - Notify only when attention needed
5. **Contextual checks** - Check BEFORE creating issues

**Golden Rules:**
- User reports bug → `gh issue list --search "keywords"`
- HEARTBEAT.md says check → `gh status && gh issue list`
- Before creating → Search first!
- Fix complete → Comment details, then close
