# GitHub CLI Command Reference

> Quick reference for common gh-cli commands used in issue management  
> **Scope**: MetaDoc Repository Issue Management

---

## Authentication

### Login
```bash
# Interactive login (browser flow)
gh auth login

# With specific host (Enterprise)
gh auth login --hostname enterprise.internal

# With token from file
gh auth login --with-token < token.txt

# Check current status
gh auth status

# Switch accounts
gh auth switch

# Refresh scopes
gh auth refresh -s project -s read:org

# Logout
gh auth logout
```

### Environment Variables
```bash
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"           # Primary auth token
export GITHUB_TOKEN="${GH_TOKEN}"                     # Alternative name
export GH_ENTERPRISE_TOKEN="ghp_xxxxxxxx"            # Enterprise auth
export GH_HOST="github.com"                          # Default hostname
export GH_REPO="owner/repo"                          # Default repository
export GH_PROMPT_DISABLED=1                          # Non-interactive mode
export GH_FORCE_TTY=1                                # Force color output
export GH_NO_UPDATE_NOTIFIER=1                       # Disable update checks
export GH_DEBUG=api                                  # Verbose HTTP logging
```

---

## Issue Commands

### List Issues
```bash
# Basic list
gh issue list

# With filters
gh issue list --state open
gh issue list --state closed
gh issue list --state all
gh issue list --label "bug"
gh issue list --label "bug,help wanted"
gh issue list --assignee "@me"
gh issue list --assignee "username"
gh issue list --author "username"
gh issue list --milestone "v1.0"
gh issue list --search "crash"

# Limit results
gh issue list --limit 50

# Output formats
gh issue list --json number,title,state,labels
gh issue list --json number,title --jq '.[].title'
```

### Create Issue
```bash
# Interactive
gh issue create

# With flags
gh issue create --title "Bug title" --body "Description"
gh issue create --title "Bug" --body-file description.md
gh issue create --template "Bug Report"

# With metadata
gh issue create \
  --title "Feature request" \
  --body "Details..." \
  --label "enhancement" \
  --label "help wanted" \
  --assignee "@me" \
  --milestone "v2.0" \
  --project "Roadmap"

# Self-assign and add to project
gh issue create --title "Task" --assignee "@me" --project "Team Board"
```

### View Issue
```bash
# Basic view
gh issue view 123

# With comments
gh issue view 123 --comments

# Web browser
gh issue view 123 --web

# JSON output
gh issue view 123 --json number,title,body,state,labels,assignees
```

### Edit Issue
```bash
# Edit title/body
gh issue edit 123 --title "New title"
gh issue edit 123 --body "Updated description"
gh issue edit 123 --body-file new-description.md

# Add/remove labels
gh issue edit 123 --add-label "bug"
gh issue edit 123 --remove-label "feature"
gh issue edit 123 --add-label "critical" --remove-label "low-priority"

# Change assignees
gh issue edit 123 --add-assignee "username"
gh issue edit 123 --remove-assignee "username"
gh issue edit 123 --add-assignee "@me"

# Milestone
gh issue edit 123 --milestone "v1.0"

# Clear fields
gh issue edit 123 --milestone ""  # Remove milestone
```

### Comment on Issue
```bash
# Add comment
gh issue comment 123 --body "Looking into this"

# From file
gh issue comment 123 --body-file comment.md

# Interactive editor
gh issue comment 123 --editor

# Edit last comment
gh issue comment 123 --edit-last --body "Updated comment"
```

### Close/Reopen Issue
```bash
# Close
gh issue close 123

# Close with comment
gh issue close 123 --comment "Fixed in #456"

# Reopen
gh issue reopen 123

# Reopen with comment
gh issue reopen 123 --comment "Reopening - issue persists"
```

### Lock/Unlock Issue
```bash
# Lock with reason
gh issue lock 123 --reason "too heated"
gh issue lock 123 --reason "resolved"
gh issue lock 123 --reason "off-topic"
gh issue lock 123 --reason "spam"

# Unlock
gh issue unlock 123
```

### Pin/Unpin Issue
```bash
gh issue pin 123
gh issue unpin 123
```

### Transfer Issue
```bash
gh issue transfer 123 owner/other-repo
```

### Delete Issue
```bash
# ⚠️ Permanent deletion - use with caution
gh issue delete 123 --yes
```

---

## Repository Commands

### Repository Info
```bash
# View current repo
gh repo view

# View specific repo
gh repo view owner/repo

# View in browser
gh repo view --web

# List repos
gh repo list --limit 100
gh repo list --visibility public
gh repo list --visibility private
gh repo list --source  # Exclude forks
```

### Set Default Repository
```bash
gh repo set-default
gh repo set-default owner/repo
gh repo set-default --view  # View current default
```

---

## Status & Notifications

### Status
```bash
# View your GitHub status
gh status

# Filter by org
gh status --org cli

# Exclude repos
gh status -e cli/cli
```

### Notifications (via API)
```bash
# List notifications
gh api notifications

# List unread
gh api notifications?all=false

# Mark as read
gh api -X PUT notifications/threads/{thread_id}

# Mark repo as read
gh api -X PUT notifications/threads?last_read_at=2026-01-01T00:00:00Z
```

---

## API Commands

### REST API
```bash
# GET request
gh api repos/{owner}/{repo}/releases
gh api repos/{owner}/{repo}/issues?state=open&labels=bug

# POST request
gh api repos/{owner}/{repo}/issues/123/comments -f body="Comment text"

# PATCH request
gh api -X PATCH repos/{owner}/{repo}/issues/123 -f title="New title"

# DELETE request
gh api -X DELETE repos/{owner}/{repo}/issues/comments/456

# With preview headers
gh api repos/{owner}/{repo}/projects --preview inertia

# Paginated results
gh api --paginate repos/{owner}/{repo}/issues

# Raw output
gh api repos/{owner}/{repo}/issues/123 --jq '.'
gh api repos/{owner}/{repo}/issues --jq '.[] | select(.state == "open") | .title'
```

### GraphQL API
```bash
# Simple query
gh api graphql -f query='
  query {
    viewer {
      login
      name
    }
  }
'

# Query with variables
gh api graphql -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      issues(first: 10) {
        nodes { title number state }
      }
    }
  }
' -F owner='meta-doc' -F name='meta-doc'

# Paginated query
gh api graphql --paginate -f query='
  query($endCursor: String) {
    viewer {
      repositories(first: 100, after: $endCursor) {
        nodes { nameWithOwner }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
'

# Mutation
gh api graphql -f query='
  mutation($id: ID!) {
    closeIssue(input: {issueId: $id}) {
      issue { number state }
    }
  }
' -F id='issue-id-from-github'
```

---

## Project Commands (Beta)

### Project Management
```bash
# List projects
gh project list --owner owner
gh project list --user username

# View project
gh project view 1 --owner owner
gh project view 1 --owner owner --web

# Create project
gh project create --owner owner --title "Project Name"
gh project create --owner owner --title "Project" --description "Description"

# Edit project
gh project edit 1 --owner owner --title "New Title"
gh project edit 1 --owner owner --description "New Description"

# Delete project
gh project delete 1 --owner owner
```

### Project Items
```bash
# Add item to project
gh project item-add 1 --owner owner --url https://github.com/owner/repo/issues/123

# List items
gh project item-list 1 --owner owner
gh project item-list 1 --owner owner --format json

# Archive item
gh project item-archive 1 --owner owner --item-id ITEM_ID

# Delete item
gh project item-delete 1 --owner owner --item-id ITEM_ID

# Edit item fields
gh project item-edit \
  --id ITEM_ID \
  --field-id FIELD_ID \
  --text "Updated value"

gh project item-edit \
  --id ITEM_ID \
  --field-id STATUS_FIELD_ID \
  --single-select-option-id OPTION_ID
```

### Project Fields
```bash
# Create field
gh project field-create 1 --owner owner \
  --name "Priority" \
  --data-type "SINGLE_SELECT" \
  --single-select-options "High,Medium,Low"

# Delete field
gh project field-delete FIELD_ID --project-id PROJECT_ID
```

---

## Configuration

### Config Commands
```bash
# List all config
gh config list

# Get specific value
gh config get editor
gh config get git_protocol
gh config get prompt

# Set values
gh config set editor vim
gh config set editor "code --wait"
gh config set git_protocol ssh
gh config set git_protocol https
gh config set prompt enabled
gh config set prompt disabled
```

### Available Config Options
| Key | Values | Description |
|-----|--------|-------------|
| `editor` | vim, nano, "code --wait" | Preferred text editor |
| `git_protocol` | https, ssh | Git clone protocol |
| `prompt` | enabled, disabled | Interactive prompts |
| `pager` | less, more, cat | Output pager |

---

## Alias Commands

### Manage Aliases
```bash
# List aliases
gh alias list

# Create alias
gh alias set iv 'issue view'
gh alias set il 'issue list'
gh alias set co 'pr checkout'
gh alias set myissues 'issue list --assignee @me'
gh alias set bug 'issue create --label bug'

# Create complex alias
gh alias set close-with-comment '!gh issue close "$1" --comment "$2"'

# Delete alias
gh alias delete iv

# Import aliases
gh alias import aliases.txt

# Export aliases
gh alias list > aliases.txt
```

### Useful Aliases
```bash
# Quick issue operations
gh alias set iv 'issue view'
gh alias set il 'issue list'
gh alias set ic 'issue create'
gh alias set ie 'issue edit'

# My work
gh alias set myissues 'issue list --assignee @me --state open'
gh alias set myprs 'pr list --assignee @me --state open'

# Bug management
gh alias set bug 'issue create --label bug'
gh alias set bugs 'issue list --label bug --state open'

# Quick views
gh alias set web 'browse'
gh alias set s 'status'
gh alias set repos 'repo list --limit 100'
```

---

## JSON Processing with jq

### Common Patterns
```bash
# Extract issue numbers
gh issue list --json number | jq -r '.[].number'

# Extract titles
gh issue list --json title | jq -r '.[].title'

# Filter by state
gh issue list --json number,state | jq -r '.[] | select(.state == "OPEN") | .number'

# Complex filter
gh issue list --json number,title,labels | \
  jq -r '.[] | select(.labels[].name == "bug") | "\(.number): \(.title)"'

# Create array from results
gh issue list --json number | jq -r '[.[].number] | join(",")'

# Count issues
gh issue list --json number | jq 'length'

# Get specific field from view
gh issue view 123 --json title,body | jq -r '.title'
```

---

## Batch Operations

### Close Multiple Issues
```bash
# Close all issues with label "stale"
gh issue list --label "stale" --json number | \
  jq -r '.[].number' | \
  xargs -I {} gh issue close {} --comment "Closing stale issue"

# Close issues older than date
gh issue list --state open --search "updated:<2026-01-01" --json number | \
  jq -r '.[].number' | \
  xargs -I {} gh issue close {} --comment "Auto-closing old issue"
```

### Bulk Label Operations
```bash
# Add label to multiple issues
gh issue list --search "crash" --json number | \
  jq -r '.[].number' | \
  xargs -I {} gh issue edit {} --add-label "critical"

# Remove label from all issues
gh issue list --label "stale" --json number | \
  jq -r '.[].number' | \
  xargs -I {} gh issue edit {} --remove-label "stale"
```

### Bulk Assignment
```bash
# Assign unassigned bugs to team lead
gh issue list --label "bug" --search "no:assignee" --json number | \
  jq -r '.[].number' | \
  xargs -I {} gh issue edit {} --add-assignee "team-lead"
```

---

## Scripting Patterns

### Robust Script Template
```bash
#!/bin/bash
set -euo pipefail

# Configuration
export GH_PROMPT_DISABLED=1
export GH_REPO="meta-doc/meta-doc"
REPO="${GH_REPO}"

# Error handling
trap 'echo "Error on line $LINENO"' ERR

# Functions
close_stale_issues() {
  local stale_label="${1:-stale}"
  
  gh issue list --repo "$REPO" --label "$stale_label" --json number | \
    jq -r '.[].number' | \
    while read -r issue; do
      echo "Closing issue #$issue"
      gh issue close "$issue" --repo "$REPO" --comment "Auto-closing stale issue"
    done
}

# Main
main() {
  echo "Starting issue cleanup..."
  close_stale_issues "stale"
  echo "Done!"
}

main "$@"
```

### Polling for New Issues
```bash
#!/bin/bash
# poll-new-issues.sh

LAST_CHECK=$(date -u +%Y-%m-%dT%H:%M:%SZ)
REPO="owner/repo"

while true; do
  echo "Checking for new issues since $LAST_CHECK..."
  
  NEW_ISSUES=$(gh api repos/${REPO}/issues \
    -f since="$LAST_CHECK" \
    --jq '.[] | select(.created_at >= "'$LAST_CHECK'") | .number')
  
  if [ -n "$NEW_ISSUES" ]; then
    echo "New issues detected: $NEW_ISSUES"
    # Trigger your workflow here
    # e.g., notify, auto-triage, etc.
  else
    echo "No new issues"
  fi
  
  LAST_CHECK=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  sleep 300  # 5 minutes
 done
```

---

## Environment-Specific Patterns

### GitHub Actions
```yaml
- name: Create issue
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    gh issue create \
      --title "Build failure: ${{ github.run_id }}" \
      --body "Build failed on ${{ github.ref }}" \
      --label "ci-failure"
```

### Local Development
```bash
# Use default repo
gh repo set-default meta-doc/meta-doc

# Quick sync
sync_issues() {
  gh issue list --state open --json number,title,updatedAt > .gh-state/issues.json
  echo "Synced $(jq length .gh-state/issues.json) issues"
}
```

---

## Error Handling

### Common Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Authentication error |
| 4 | Not found |

### Checking Command Success
```bash
if gh issue view 123 >/dev/null 2>&1; then
  echo "Issue exists"
else
  echo "Issue not found"
fi

# Or with explicit check
if ! gh issue view 123 >/dev/null 2>&1; then
  echo "Creating issue..."
  gh issue create --title "New issue"
fi
```

---

## Quick Cheat Sheet

| Task | Command |
|------|---------|
| List my open issues | `gh issue list --assignee @me` |
| View issue details | `gh issue view 123` |
| Create bug issue | `gh issue create --label bug` |
| Comment on issue | `gh issue comment 123 --body "text"` |
| Close issue | `gh issue close 123` |
| Reopen issue | `gh issue reopen 123` |
| Add label | `gh issue edit 123 --add-label bug` |
| Assign to me | `gh issue edit 123 --add-assignee @me` |
| Check rate limit | `gh api rate_limit` |
| View status | `gh status` |

---

**Tip**: Use `gh help` or `gh <cmd> --help` for detailed help on any command.
