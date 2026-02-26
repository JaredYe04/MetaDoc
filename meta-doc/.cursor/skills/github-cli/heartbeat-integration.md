# heartbeat.md Integration Specification

> Technical specification for integrating GitHub CLI with local heartbeat tracking  
> **Version**: 1.0.0  
> **Scope**: MetaDoc Agent Framework

---

## Overview

The `heartbeat.md` file serves as the bridge between GitHub issues (cloud state) and local Agent context (working state). This document specifies the data structures, sync protocols, and integration patterns.

### Purpose

1. **Local Cache**: Fast access to issue data without API calls
2. **Work Log**: Track what Agents are working on
3. **Knowledge Base**: Accumulate fix experiences
4. **Sync Point**: Reconcile GitHub state with local state

---

## File Structure

### Location
```
meta-doc/
└── .opencode/
    ├── heartbeat.md          # Main tracking file (this spec)
    └── .gh-state/
        ├── issues.json       # Cached GitHub issues
        ├── notifications.json # Cached notifications
        └── last-sync.timestamp
```

### heartbeat.md Schema

```markdown
# MetaDoc Issue Heartbeat

> Auto-generated issue tracking for Agent workflows  
> Last sync: 2026-02-26T10:30:00Z  
> Repository: meta-doc/meta-doc

---

## Active Issues

| # | Title | Status | Agent Context | Last Update |
|---|-------|--------|---------------|-------------|
| #42 | Fix tab drag crash | 🔧 in-progress | tab-refactor-2026-02 | 2h ago |
| #38 | Add mermaid dark mode | ⏸️ paused | svg-themes | 1d ago |

### Issue #42 Details

**GitHub State**: Open  
**Local Status**: In Progress (75%)  
**Assigned Agent**: opencode-k2p5  
**Started**: 2026-02-26T08:00:00Z  
**Est. Completion**: 2026-02-26T12:00:00Z

**Files Being Modified**:
- `src/renderer/src/components/TabBar.vue`
- `src/renderer/src/utils/drag-manager.ts`

**Current Blockers**:
- None

**Next Steps**:
1. Add null check in drag handler
2. Test cross-window drag
3. Update unit tests

---

## Recent Activity

### 2026-02-26
- **10:30** - Agent `opencode-k2p5` started work on #42 (tab drag)
- **09:15** - Comment added to #38: "Found root cause in SVG renderer"
- **08:00** - Issue #42 synced from GitHub

### 2026-02-25
- **16:00** - Issue #42 created from user report
- **15:30** - Fix confirmed for #37, closed via gh
- **14:00** - Sync completed: 3 new issues, 2 closed

---

## Fix Knowledge Base

| Issue | Root Cause | Solution | Files Changed | Agent |
|-------|------------|----------|---------------|-------|
| #42 | Race condition | Add mutex + null check | drag-manager.ts:145 | k2p5 |
| #37 | Memory leak | Cleanup listeners | workspace.ts:892 | k2p5 |
| #35 | CSS specificity | Use !important | tab-bar.css:23 | gpt4 |

### Detailed Fix Log

#### #42: Tab Drag Crash
**Date**: 2026-02-26  
**Duration**: 3h 15m  
**Agent**: opencode-k2p5

**Problem**: Race condition when dragging tabs between windows

**Root Cause Analysis**:
The drag manager accessed `tab.id` before the tab object was fully initialized when receiving cross-window drag events.

**Solution**:
```typescript
// Added defensive checks
const targetTab = this.tabs.find(t => t.id === data.tabId)
if (!targetTab) {
  console.warn('Tab not found, queuing for later')
  this.pendingDrags.set(data.tabId, data)
  return
}
```

**Testing**:
- Cross-window drag simulation ✅
- Rapid tab switching stress test ✅
- Memory leak check ✅

**Lessons Learned**:
1. Always validate IPC data at process boundaries
2. Add defensive checks - better to queue than crash
3. Test multi-window scenarios thoroughly

---

## Related Commits

| Commit | Issue | Description | Agent |
|--------|-------|-------------|-------|
| `abc123` | #42 | fix: tab drag race condition | k2p5 |
| `def456` | #38 | feat: mermaid dark mode | gpt4 |
| `ghi789` | #37 | fix: memory leak in workspace | k2p5 |

---

## Sync Status

**Last Sync**: 2026-02-26T10:30:00Z  
**Sync Status**: ✅ Success  
**Issues Synced**: 12 open, 45 closed  
**API Calls**: 3  
**Rate Limit Remaining**: 4997/5000

**Next Scheduled Sync**: 2026-02-26T11:30:00Z

---

*This file is auto-generated. Do not edit manually unless you know what you're doing.*
```

---

## Data Structures

### Issue Entry

```typescript
interface HeartbeatIssue {
  // GitHub data (mirrored from API)
  number: number
  title: string
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  closedAt?: string
  body: string
  url: string
  
  // Local context (Agent-added)
  localStatus: 'pending' | 'in-progress' | 'paused' | 'blocked' | 'completed'
  agentContext?: string  // Identifier for Agent working on it
  progressPercent?: number  // 0-100
  filesModified?: string[]  // Relative paths
  blockers?: string[]
  nextSteps?: string[]
  
  // Sync metadata
  lastSyncedAt: string
  lastLocalUpdateAt: string
}
```

### Activity Log Entry

```typescript
interface ActivityLogEntry {
  timestamp: string  // ISO 8601
  agent: string  // Agent identifier
  issue: number  // Issue number
  action: 'synced' | 'started' | 'paused' | 'resumed' | 'commented' | 'closed' | 'created'
  details: string
  commitHash?: string
}
```

### Fix Knowledge Entry

```typescript
interface FixKnowledgeEntry {
  issue: number
  date: string
  duration: string  // e.g., "3h 15m"
  agent: string
  rootCause: string
  solution: string
  filesChanged: string[]
  testingNotes?: string
  lessonsLearned: string[]
  relatedIssues?: number[]
}
```

### Sync Metadata

```typescript
interface SyncMetadata {
  lastSyncAt: string
  status: 'success' | 'partial' | 'failed'
  issuesSynced: {
    open: number
    closed: number
    total: number
  }
  apiCalls: number
  rateLimitRemaining: number
  errors?: string[]
}
```

---

## Sync Protocol

### 1. Pull from GitHub (Inbound Sync)

**Trigger**: Scheduled (every 30 min) or on-demand  
**Command**:
```bash
gh issue list \
  --state all \
  --json number,title,state,labels,assignees,createdAt,updatedAt,closedAt,body \
  --limit 100 \
  > .opencode/.gh-state/issues.json
```

**Process**:
1. Fetch issues from GitHub
2. Parse JSON
3. Merge with existing heartbeat data
4. Update `lastSyncedAt`
5. Preserve local-only fields (`localStatus`, `agentContext`, etc.)
6. Write updated heartbeat.md

**Conflict Resolution**:
```typescript
if (githubIssue.updatedAt > localIssue.lastSyncedAt) {
  // GitHub has newer data - update mirror fields
  localIssue.title = githubIssue.title
  localIssue.state = githubIssue.state
  localIssue.labels = githubIssue.labels
  // Preserve local-only fields
  localIssue.lastSyncedAt = now
}
```

### 2. Push to GitHub (Outbound Sync)

**Trigger**: On Agent action  
**Actions**:
- Create issue: `gh issue create ...`
- Update issue: `gh issue edit ...`
- Comment: `gh issue comment ...`
- Close: `gh issue close ...`

**Process**:
1. Agent performs action
2. Update heartbeat.md immediately (optimistic)
3. Execute gh command
4. On success: Update sync metadata
5. On failure: Revert heartbeat.md, log error

### 3. Bidirectional Reconciliation

**Algorithm**:
```typescript
function reconcile() {
  // 1. Pull latest from GitHub
  const githubIssues = fetchGitHubIssues()
  
  // 2. Load local heartbeat
  const localIssues = parseHeartbeat()
  
  // 3. Detect conflicts
  for (const issue of githubIssues) {
    const local = localIssues.find(i => i.number === issue.number)
    
    if (!local) {
      // New issue on GitHub - add to heartbeat
      addToHeartbeat(issue)
    } else if (issue.updatedAt > local.lastSyncedAt) {
      // GitHub has updates - merge
      mergeUpdates(local, issue)
    }
  }
  
  // 4. Detect local-only issues (created but not synced)
  for (const local of localIssues) {
    if (!githubIssues.find(i => i.number === local.number)) {
      // Issue was deleted on GitHub - archive locally
      archiveIssue(local)
    }
  }
  
  // 5. Write updated heartbeat
  writeHeartbeat(localIssues)
}
```

---

## Integration Points

### 1. Agent Tool Integration

**Tool**: `issue-tracker`  
**Interface**:
```typescript
class IssueTracker {
  private heartbeat: HeartbeatManager
  private ghState: GitHubStateCache
  
  async sync(): Promise<SyncResult> {
    const issues = await this.fetchGitHubIssues()
    return this.heartbeat.sync(issues)
  }
  
  async detectRelatedIssues(context: WorkContext): Promise<IssueMatch[]> {
    const candidates = this.heartbeat.getActiveIssues()
    return this.calculateSimilarity(context, candidates)
  }
  
  async createIssue(report: ProblemReport): Promise<Issue> {
    // Create on GitHub
    const issue = await this.ghCreateIssue(report)
    
    // Add to heartbeat
    this.heartbeat.addIssue({
      ...issue,
      localStatus: 'pending',
      agentContext: report.agentId
    })
    
    return issue
  }
  
  async closeIssue(issueNumber: number, resolution: Resolution): Promise<void> {
    // Update heartbeat first (optimistic)
    this.heartbeat.updateIssue(issueNumber, {
      localStatus: 'completed',
      state: 'closed'
    })
    
    // Close on GitHub
    await this.ghCloseIssue(issueNumber, resolution)
    
    // Move to fix knowledge base
    this.heartbeat.archiveFix(issueNumber, resolution)
  }
}
```

### 2. Trigger Integration

**Triggers** watch for patterns and auto-update heartbeat:

```typescript
interface IssueTrigger {
  name: string
  pattern: RegExp | string[]
  action: (match: TriggerMatch) => Promise<void>
}

const triggers: IssueTrigger[] = [
  {
    name: 'commit-ref',
    pattern: /(?:fix|fixes|close|closes|resolve|resolves)\s+#(\d+)/i,
    action: async (match) => {
      const issueNumber = parseInt(match.groups[1])
      await heartbeat.linkCommit(issueNumber, match.commitHash)
    }
  },
  {
    name: 'problem-report',
    pattern: ['not working', 'crash', 'broken', 'error', 'bug'],
    action: async (match) => {
      const similar = await issueTracker.detectRelatedIssues(match.context)
      if (similar.length > 0) {
        notifyUser(`This might be related to issue #${similar[0].number}`)
      }
    }
  }
]
```

### 3. Heartbeat Update Hooks

**On Issue Create**:
```typescript
async onIssueCreate(issue: Issue) {
  heartbeat.activityLog.push({
    timestamp: new Date().toISOString(),
    agent: currentAgent.id,
    issue: issue.number,
    action: 'created',
    details: `Created issue: ${issue.title}`
  })
  
  heartbeat.activeIssues.push({
    ...issue,
    localStatus: 'pending'
  })
}
```

**On Work Start**:
```typescript
async onWorkStart(issueNumber: number, context: WorkContext) {
  heartbeat.updateIssue(issueNumber, {
    localStatus: 'in-progress',
    agentContext: currentAgent.id,
    filesModified: context.files,
    startedAt: new Date().toISOString()
  })
  
  heartbeat.activityLog.push({
    timestamp: new Date().toISOString(),
    agent: currentAgent.id,
    issue: issueNumber,
    action: 'started',
    details: `Started work on files: ${context.files.join(', ')}`
  })
}
```

**On Fix Complete**:
```typescript
async onFixComplete(issueNumber: number, fix: FixDetails) {
  // Add to fix knowledge base
  heartbeat.fixKnowledge.push({
    issue: issueNumber,
    date: new Date().toISOString(),
    duration: fix.duration,
    agent: currentAgent.id,
    rootCause: fix.rootCause,
    solution: fix.solution,
    filesChanged: fix.filesChanged,
    testingNotes: fix.testingNotes,
    lessonsLearned: fix.lessonsLearned
  })
  
  // Update activity log
  heartbeat.activityLog.push({
    timestamp: new Date().toISOString(),
    agent: currentAgent.id,
    issue: issueNumber,
    action: 'closed',
    details: `Fixed in ${fix.duration}. Root cause: ${fix.rootCause}`,
    commitHash: fix.commitHash
  })
}
```

---

## File Format Specifications

### Markdown Tables

**Active Issues Table**:
```markdown
| # | Title | Status | Agent Context | Last Update |
|---|-------|--------|---------------|-------------|
| #42 | Fix tab drag crash | 🔧 in-progress | tab-refactor-2026-02 | 2h ago |
| #38 | Add mermaid dark mode | ⏸️ paused | svg-themes | 1d ago |
```

**Status Icons**:
- 🔧 in-progress
- ⏸️ paused
- 🚫 blocked
- ✅ completed
- ⏳ pending

### YAML Frontmatter (Optional)

For machine-readable metadata:
```markdown
---
sync:
  lastSyncAt: "2026-02-26T10:30:00Z"
  status: success
  issues:
    open: 12
    closed: 45
repository: meta-doc/meta-doc
---

# MetaDoc Issue Heartbeat
```

---

## API for Agents

### Reading Heartbeat

```typescript
// Get all active issues
const activeIssues = heartbeat.getActiveIssues()

// Get specific issue
const issue = heartbeat.getIssue(42)

// Get fix knowledge
const fix = heartbeat.getFixKnowledge(42)

// Get recent activity
const recentActivity = heartbeat.getActivity({ since: '1d ago' })
```

### Writing Heartbeat

```typescript
// Update issue status
heartbeat.updateIssue(42, {
  localStatus: 'in-progress',
  progressPercent: 50
})

// Log activity
heartbeat.logActivity({
  agent: 'k2p5',
  issue: 42,
  action: 'started',
  details: 'Investigating drag-manager.ts'
})

// Add fix knowledge
heartbeat.addFixKnowledge(42, {
  rootCause: 'Race condition',
  solution: 'Added mutex',
  filesChanged: ['drag-manager.ts']
})
```

---

## Best Practices

### 1. Sync Frequency
- **Active work**: Sync before starting work on issue
- **Background**: Auto-sync every 30 minutes
- **On-demand**: User-triggered refresh
- **Post-action**: Immediately after creating/updating issue

### 2. Data Retention
- **Active issues**: Keep indefinitely
- **Closed issues**: Archive after 30 days
- **Fix knowledge**: Keep forever (knowledge base)
- **Activity log**: Keep 90 days, then archive

### 3. Conflict Resolution
1. GitHub state wins for issue metadata (title, labels, state)
2. Local state wins for Agent context (status, progress, blockers)
3. Timestamp comparison determines "freshness"
4. Manual review for ambiguous conflicts

### 4. Error Handling
```typescript
try {
  await heartbeat.sync()
} catch (error) {
  // Log error but don't fail
  heartbeat.logError(error)
  
  // Retry with exponential backoff
  await retry(() => heartbeat.sync(), { maxAttempts: 3 })
}
```

---

## Example Workflows

### Workflow: Start Working on Issue

```typescript
// 1. User says: "Fix the tab drag issue"

// 2. Agent detects context
const matches = await issueTracker.detectRelatedIssues({
  keywords: ['tab', 'drag'],
  files: []
})

// 3. Agent confirms: "Working on issue #42?"
// User: "Yes"

// 4. Agent updates heartbeat
await heartbeat.updateIssue(42, {
  localStatus: 'in-progress',
  agentContext: 'k2p5',
  startedAt: new Date().toISOString()
})

// 5. Agent posts progress comment
await gh.issueComment(42, 'Starting investigation...')

// 6. Agent works on fix
// ... work happens ...

// 7. Agent updates progress
await heartbeat.updateIssue(42, {
  progressPercent: 75,
  filesModified: ['drag-manager.ts']
})

// 8. Agent completes fix
await issueTracker.closeIssue(42, {
  commitHash: 'abc123',
  rootCause: 'Race condition',
  solution: 'Added null check',
  duration: '3h 15m'
})
```

### Workflow: Detect Related Issue

```typescript
// User reports: "The drag feature crashes"

// Agent analyzes context
const context = {
  keywords: ['drag', 'crash'],
  component: 'tab-management',
  errorMessage: 'Cannot read property id of undefined'
}

// Search for matches
const matches = await issueTracker.detectRelatedIssues(context)

// Result: [{ issue: 42, confidence: 0.92, reason: 'keyword-match' }]

// Agent notifies user
if (matches[0].confidence > 0.8) {
  return `This sounds like issue #42 (Tab drag crash - ${matches[0].confidence * 100}% match). 
          Would you like me to work on fixing this?`
}
```

---

## Implementation Notes

### Performance
- Cache GitHub API responses for 5 minutes
- Use `--paginate` for large issue lists
- Batch updates to heartbeat.md (don't write on every change)
- Lazy-load issue details (only fetch when needed)

### Security
- Never store GH_TOKEN in heartbeat.md
- Sanitize issue bodies (remove sensitive data)
- Use `.gitignore` for `.gh-state/` if it contains sensitive data
- Encrypt local cache if needed

### Extensibility
- Heartbeat format is versioned
- Unknown fields are preserved (forward compatibility)
- Plugins can add custom sections
- Export to JSON for external tools

---

## Migration Guide

### From GitHub-Only to Heartbeat Integration

1. **Initial Sync**:
   ```bash
   gh issue list --state all --json number,title,state > issues.json
   node scripts/init-heartbeat.js issues.json
   ```

2. **Verify**:
   ```bash
   cat .opencode/heartbeat.md
   ```

3. **Enable Auto-Sync**:
   ```bash
   # Add to crontab or scheduler
   */30 * * * * cd /path/to/repo && node scripts/sync-issues.js
   ```

---

## References

- **SKILL.md**: Usage guide for Agents
- **reference.md**: gh-cli command reference
- **GitHub Issues API**: https://docs.github.com/en/rest/issues
- **gh CLI**: https://cli.github.com/manual/

---

*This specification is living documentation. Update as the integration evolves.*
