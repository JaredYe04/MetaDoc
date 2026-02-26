# Agent Workflow Examples

> Concrete examples of how Agents use GitHub CLI + heartbeat integration  
> **Use Case**: Training Agents on real-world patterns

---

## Example 1: Bug Report → Issue → Fix → Close

### Scenario
User reports a crash when dragging tabs between windows.

### Conversation Flow

**User**: "The tab drag feature crashes when I move tabs between windows"

**Agent** (Internal Thought):
```
1. User is reporting a bug
2. Keywords: "tab drag", "crash", "between windows"
3. Should check if this matches existing issues
4. Need to gather more context before creating issue
```

**Agent**: "I'll help you investigate this. Can you provide a few details?

1. What version of MetaDoc are you using?
2. What operating system?
3. Does it happen every time or intermittently?
4. Any error messages in the console?"

**User**: "v2.5.1 on Windows 11. Happens every time. Console says 'Cannot read property id of undefined'"

**Agent** (Internal Action):
```typescript
// Detect related issues
const matches = await issueTracker.detectRelatedIssues({
  keywords: ['tab', 'drag', 'crash', 'windows', 'id', 'undefined'],
  errorMessage: 'Cannot read property id of undefined',
  component: 'tab-management'
})

// Result: No high-confidence matches
```

**Agent**: "This appears to be a new issue. I'll create a bug report and start investigating."

```typescript
// Create issue
const issue = await issueTracker.create({
  title: '[BUG] Tab drag crashes when moving between windows',
  description: 'Crash occurs when dragging tabs between windows',
  reproSteps: [
    'Open MetaDoc v2.5.1 on Windows 11',
    'Open two windows',
    'Drag a tab from one window to another',
    'Crash occurs'
  ],
  expectedBehavior: 'Tab should move smoothly between windows',
  actualBehavior: 'Application crashes with error',
  environment: {
    version: '2.5.1',
    os: 'Windows 11',
    errorMessage: 'Cannot read property id of undefined'
  },
  agentConfidence: 'high'
})

// Result: Created issue #42
```

**Agent**: "Created issue #42 to track this bug. Let me start investigating the drag manager code."

```typescript
// Update heartbeat - start work
await heartbeat.updateIssue(42, {
  localStatus: 'in-progress',
  agentContext: 'k2p5',
  startedAt: new Date().toISOString(),
  currentTask: 'Investigating drag-manager.ts'
})

// Post initial comment
await gh.issueComment(42, `## Investigation Started

**Error**: Cannot read property 'id' of undefined
**Location**: Suspected in drag-manager.ts
**Approach**: Reviewing cross-window drag handling code`)
```

**[Time passes - Agent investigates]**

**Agent** (Internal Finding):
```
Found it! In drag-manager.ts:145, accessing tab.id before checking if tab exists.
Happens specifically with cross-window drag events where tab object isn't fully synced.
```

```typescript
// Update heartbeat with findings
await heartbeat.updateIssue(42, {
  progressPercent: 50,
  filesModified: ['src/renderer/src/utils/drag-manager.ts'],
  rootCauseIdentified: true,
  rootCause: 'Race condition: accessing tab.id before tab object initialized in cross-window drag'
})

// Post progress comment
await gh.issueComment(42, `## Investigation Update

**Root Cause Found**: Race condition in drag-manager.ts:145

The drag manager accesses \`tab.id\` before the tab object is fully initialized when receiving cross-window drag events.

**Next Steps**:
1. Add null check before accessing tab properties
2. Queue pending drags if tab not ready
3. Test cross-window scenarios`)
```

**Agent**: "I've identified the root cause - a race condition when handling cross-window drag events. The code tries to access the tab ID before the object is fully initialized. I'm implementing a fix now."

**[Agent implements fix]**

```typescript
// Code changes made:
// drag-manager.ts - added defensive check

// Update heartbeat
await heartbeat.updateIssue(42, {
  progressPercent: 90,
  filesModified: [
    'src/renderer/src/utils/drag-manager.ts',
    'src/renderer/src/utils/window-manager.ts'
  ],
  fixImplemented: true,
  testingInProgress: true
})
```

**[Tests pass, build succeeds]**

```typescript
// Prepare fix documentation
const fixExperience = {
  duration: '2h 30m',
  rootCause: 'Race condition: accessing tab.id before tab object initialized in cross-window drag events',
  solution: 'Added null check and initialization guard. If tab not found, queue for later processing.',
  filesChanged: [
    'src/renderer/src/utils/drag-manager.ts:145',
    'src/renderer/src/utils/window-manager.ts:89'
  ],
  codeChanges: `// Before (buggy)
const targetTab = this.tabs.find(t => t.id === data.tabId)
targetTab.windowId = newWindowId

// After (fixed)
const targetTab = this.tabs.find(t => t.id === data.tabId)
if (!targetTab) {
  console.warn('Tab not found, queuing for later')
  this.pendingDrags.set(data.tabId, data)
  return
}
targetTab.windowId = newWindowId`,
  testingNotes: `- Cross-window drag simulation: ✅
- Rapid tab switching stress test: ✅
- Single-window mode regression: ✅
- Memory leak check: ✅`,
  lessonsLearned: [
    'Always validate IPC data at process boundaries',
    'Add defensive checks - better to queue than crash',
    'Test multi-window scenarios thoroughly - many bugs only appear with multiple windows',
    'Cross-process messages can arrive out of order'
  ],
  relatedIssues: [37]  // Similar race condition in different component
}

// Post fix experience
await gh.issueComment(42, `## Fix Complete ✅

${formatFixExperience(fixExperience)}

Ready for review!`)

// Commit with reference
await git.commit({
  message: `fix: resolve tab drag race condition (#42)

Root cause: accessing tab.id before initialization in cross-window drag
Solution: add null check and initialization guard

- Add defensive check before accessing tab properties
- Queue pending drags if tab not ready
- Add tests for cross-window scenarios

Fixes #42`,
  files: fixExperience.filesChanged.map(f => f.split(':')[0])
})

// Close issue with summary
await issueTracker.close(42, {
  resolution: 'fixed',
  commitHash: 'abc123',
  summary: 'Fixed race condition by adding null check in drag-manager.ts',
  fixExperience
})
```

**Agent**: "Fixed! The issue was a race condition in the drag manager. I've added defensive checks and the fix is now in commit abc123. Issue #42 has been closed with detailed documentation of the root cause and solution."

```
Final State:
- Issue #42: CLOSED
- heartbeat.md: Updated with fix knowledge
- Fix documented for future reference
```

---

## Example 2: Detecting Related Work

### Scenario
Agent is working on a new feature that might relate to existing issues.

### Agent Internal Process

```typescript
// User asks Agent to work on something
const userRequest = "Improve the drag and drop performance"

// Agent analyzes context
const workContext = {
  keywords: ['drag', 'drop', 'performance', 'optimize'],
  files: [],  // Will be determined
  component: 'drag-system'
}

// Detect related issues before starting
const relatedIssues = await issueTracker.detectRelatedIssues(workContext)

// Results:
// [
//   { issue: 42, confidence: 0.85, reason: 'keyword-match', title: 'Tab drag crashes' },
//   { issue: 38, confidence: 0.60, reason: 'component-match', title: 'Slow drag on large docs' },
//   { issue: 15, confidence: 0.45, reason: 'file-overlap', title: 'Drag feedback lag' }
// ]
```

**Agent**: "I found some related issues that might be relevant:

1. **Issue #42** (85% match): Tab drag crashes when moving between windows - Currently being worked on
2. **Issue #38** (60% match): Slow drag performance on large documents - Open
3. **Issue #15** (45% match): Drag feedback lag on Windows - Open

Would you like me to:
- (a) Work on the new performance improvement as a separate issue
- (b) Address issue #38 (slow performance) instead
- (c) Check if any of these are related to what you have in mind?"

**User**: "Actually, let's fix #38 first since it's similar"

```typescript
// Agent switches to working on issue #38
await heartbeat.updateIssue(38, {
  localStatus: 'in-progress',
  agentContext: 'k2p5',
  startedAt: new Date().toISOString(),
  notes: 'User redirected from new feature request to this related issue'
})

// Link the work contexts
await heartbeat.linkIssues([42, 38], {
  reason: 'related-drag-issues',
  note: 'Both involve drag performance/stability'
})
```

---

## Example 3: Maintaining Fix Knowledge Base

### Scenario
Multiple related issues help build institutional knowledge.

### Knowledge Graph Building

```typescript
// After fixing multiple issues, patterns emerge

const fixKnowledge = heartbeat.getFixKnowledge()

// Pattern detected: Multiple race conditions
const raceConditionFixes = fixKnowledge.filter(f => 
  f.rootCause.includes('race condition')
)

// [
//   { issue: 42, component: 'drag-manager', solution: 'null check' },
//   { issue: 37, component: 'workspace', solution: 'mutex' },
//   { issue: 28, component: 'ipc-bridge', solution: 'queue' }
// ]

// Agent recognizes pattern
if (raceConditionFixes.length >= 3) {
  // Create meta-issue or documentation
  await gh.issueCreate({
    title: '[DOC] Race condition patterns in IPC handling',
    body: `We've fixed ${raceConditionFixes.length} race condition issues recently:
    
${raceConditionFixes.map(f => `- #${f.issue}: ${f.component}`).join('\n')}

Common patterns:
1. Cross-process communication timing
2. State initialization order
3. Event handling before setup complete

Recommended practices:
- Always validate IPC data at boundaries
- Use defensive programming (check before access)
- Consider queueing instead of failing`,
    labels: ['documentation', 'patterns']
  })
}
```

---

## Example 4: Handling Stale Issues

### Scenario
Periodic maintenance to keep issue tracker clean.

### Automated Cleanup Script

```typescript
// Run weekly via cron or scheduled task

async function cleanupStaleIssues() {
  // Find issues that haven't been updated in 30 days
  const staleIssues = await gh.issueList({
    state: 'open',
    search: `updated:<${getDateNDaysAgo(30)}`
  })
  
  for (const issue of staleIssues) {
    // Check if issue is assigned to an Agent
    const localState = heartbeat.getIssue(issue.number)
    
    if (localState?.localStatus === 'in-progress') {
      // Ping the Agent
      await gh.issueComment(issue.number, 
        `@${localState.agentContext} This issue hasn't been updated in 30 days. ` +
        `Still in progress or should we unassign?`
      )
    } else if (!issue.assignees.length) {
      // Unassigned and stale - add stale label
      await gh.issueEdit(issue.number, {
        addLabel: 'stale'
      })
      
      await gh.issueComment(issue.number,
        `This issue has been marked as stale due to inactivity. ` +
        `Will be closed in 7 days if no updates.`
      )
    }
  }
  
  // Find issues labeled stale for 7+ days
  const veryStaleIssues = await gh.issueList({
    state: 'open',
    label: 'stale',
    search: `updated:<${getDateNDaysAgo(7)}`
  })
  
  for (const issue of veryStaleIssues) {
    await gh.issueClose(issue.number, {
      comment: 'Closing due to inactivity. Please reopen if still relevant.'
    })
    
    // Archive in heartbeat
    await heartbeat.archiveIssue(issue.number, {
      reason: 'stale',
      closedAt: new Date().toISOString()
    })
  }
}
```

---

## Example 5: Multi-Agent Coordination

### Scenario
Two Agents working on related issues need to coordinate.

### Coordination Pattern

```typescript
// Agent A is working on issue #42
await heartbeat.updateIssue(42, {
  localStatus: 'in-progress',
  agentContext: 'agent-k2p5',
  notes: 'Refactoring drag-manager.ts',
  blockers: []
})

// Agent B wants to work on issue #43 that touches same files
const conflicts = await heartbeat.detectConflicts({
  issue: 43,
  files: ['drag-manager.ts', 'window-manager.ts'],
  agentContext: 'agent-gpt4'
})

// Returns: [
//   { issue: 42, agent: 'agent-k2p5', files: ['drag-manager.ts'] }
// ]

// Agent B notifies Agent A (via issue comment)
await gh.issueComment(42, `
@agent-k2p5 I'm planning to work on #43 which also modifies drag-manager.ts. 
Should we coordinate to avoid conflicts?

My changes: Adding touch event support
Your changes: ???
`)

// Agent A responds
await gh.issueComment(43, `
@agent-gpt4 Good catch! I'm refactoring the drag state machine. 

Suggested coordination:
1. I'll finish my refactor today (mostly internal changes)
2. You can start on touch events tomorrow
3. The interface should remain stable

Let's sync at EOD.
`)

// Both Agents update heartbeat with coordination notes
await heartbeat.addCoordinationNote([42, 43], {
  agents: ['agent-k2p5', 'agent-gpt4'],
  sharedFiles: ['drag-manager.ts'],
  plan: 'k2p5 finishes today, gpt4 starts tomorrow',
  status: 'coordinated'
})
```

---

## Example 6: Issue Templates in Action

### Creating Different Issue Types

```typescript
// Bug report from user
const bugReport = {
  type: 'bug',
  title: 'Crash when opening large files',
  description: 'Application crashes when opening files >100MB',
  reproSteps: ['Open MetaDoc', 'File > Open', 'Select large.mddoc', 'Crash'],
  environment: { version: '2.5.1', os: 'macOS 14' }
}

await gh.issueCreate({
  template: 'bug_report',
  title: `[BUG] ${bugReport.title}`,
  body: generateFromTemplate('bug_report', bugReport),
  labels: ['bug']
})

// Feature request
const featureRequest = {
  type: 'feature',
  title: 'Add vim keybindings',
  description: 'Would love vim navigation mode',
  useCase: 'Power users who prefer vim'
}

await gh.issueCreate({
  template: 'feature_request',
  title: `[FEAT] ${featureRequest.title}`,
  body: generateFromTemplate('feature_request', featureRequest),
  labels: ['enhancement']
})

// Documentation improvement
const docIssue = {
  type: 'documentation',
  title: 'API docs missing examples',
  page: '/docs/api/renderer',
  suggestion: 'Add code examples for common use cases'
}

await gh.issueCreate({
  template: 'documentation',
  title: `[DOC] ${docIssue.title}`,
  body: generateFromTemplate('documentation', docIssue),
  labels: ['documentation']
})
```

---

## Example 7: Integration with Build/CI

### CI Failure → Auto-Issue Creation

```yaml
# .github/workflows/ci-issue.yml
name: CI Failure Handler

on:
  workflow_run:
    workflows: ["Build and Test"]
    types: [completed]

jobs:
  create-issue:
    if: github.event.workflow_run.conclusion == 'failure'
    runs-on: ubuntu-latest
    steps:
      - name: Create CI failure issue
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh issue create \
            --title "CI Failure: ${{ github.event.workflow_run.name }}" \
            --body "Build failed on ${{ github.event.workflow_run.head_branch }}\n\nRun: ${{ github.event.workflow_run.html_url }}" \
            --label "ci-failure,needs-attention"
```

### Agent Handling CI Issues

```typescript
// Agent detects new CI failure issue
const ciIssues = await gh.issueList({
  label: 'ci-failure',
  state: 'open'
})

for (const issue of ciIssues) {
  // Check if already being investigated
  const localState = heartbeat.getIssue(issue.number)
  
  if (!localState || localState.localStatus !== 'in-progress') {
    // Extract build URL from issue body
    const buildUrl = extractBuildUrl(issue.body)
    
    // Start investigation
    await heartbeat.updateIssue(issue.number, {
      localStatus: 'in-progress',
      agentContext: 'k2p5',
      currentTask: 'Investigating CI failure',
      buildUrl
    })
    
    // Fetch build logs
    const logs = await fetchBuildLogs(buildUrl)
    
    // Analyze failure
    const analysis = await analyzeBuildFailure(logs)
    
    // Post findings
    await gh.issueComment(issue.number, `
## CI Failure Analysis

**Error**: ${analysis.error}
**Location**: ${analysis.file}:${analysis.line}
**Suggested Fix**: ${analysis.suggestion}
    `)
    
    if (analysis.canAutoFix) {
      // Implement fix
      await implementFix(analysis)
      
      // Re-run CI
      await triggerCIRebuild()
      
      await gh.issueComment(issue.number, 'Fix applied. Re-running CI...')
    }
  }
}
```

---

## Common Patterns Summary

### Pattern 1: The Full Cycle
```
User Report → Detect Existing → Create Issue → Work → Update → Fix → Document → Close
```

### Pattern 2: The Coordination
```
Start Work → Check Conflicts → Coordinate → Sync → Complete
```

### Pattern 3: The Knowledge Builder
```
Fix Issue → Document → Pattern Match → Create Meta-Doc → Link Issues
```

### Pattern 4: The Maintainer
```
Scan → Label Stale → Notify → Close Old → Archive
```

### Pattern 5: The Detective
```
Error Report → Analyze Logs → Find Root Cause → Link Related → Fix All
```

---

## Decision Tree for Agents

```
User reports problem
        │
        ▼
Search existing issues (keyword match)
        │
    ┌───┴───┐
    ▼       ▼
  Match    No Match
    │         │
    ▼         ▼
Suggest   Create new
existing?   issue
    │         │
   Yes        │
    │         ▼
    ▼    Update heartbeat
Work on      │
exisiting    ▼
    │     Start work
    ▼         │
Update    Post progress
progress      │
    │         ▼
    ▼     Tests pass?
 Fix         │
complete  ┌──┴──┐
    │     ▼     ▼
    ▼    Yes   No
 Document  │     │
    │     ▼     ▼
    ▼   Close  Continue
 Archive    │     │
    │     ▼     ▼
    ▼  Update  Debug
   Done  heartbeat  │
            │     ▼
            ▼   Update
         Finished   │
                  ▼
               Fix
```

---

## Quick Agent Prompts

### For Creating Issues
```
When a user reports a bug:
1. Ask clarifying questions (version, OS, repro steps)
2. Search existing issues for matches
3. If no match, create issue with bug template
4. Include: problem, repro steps, expected/actual, environment
5. Add appropriate labels (bug, critical, etc.)
6. Update heartbeat.md
7. Return issue number to user
```

### For Working on Issues
```
When starting work on an issue:
1. Update heartbeat: localStatus = 'in-progress'
2. Post comment: "Investigating..."
3. Work on fix
4. Update heartbeat with progress every 30min
5. Post findings as comments
6. Document root cause clearly
7. Reference related issues
```

### For Closing Issues
```
When fix is complete:
1. Verify tests pass
2. Commit with "fixes #N" message
3. Post fix experience: root cause, solution, lessons
4. Close issue with summary
5. Update heartbeat fix knowledge base
6. Check for related issues to update
```

### For Detecting Related Work
```
When user asks for work that might relate to existing issues:
1. Extract keywords from request
2. Search heartbeat active issues
3. Calculate similarity scores
4. If >80% match, suggest existing issue
5. If 50-80% match, mention as possibly related
6. Let user decide: use existing or create new
```

---

*These examples demonstrate the full lifecycle of issue management with heartbeat integration. Study them to understand the patterns and adapt them to your specific use cases.*
