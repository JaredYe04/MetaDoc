# Demo Coverage Linting System

## Overview

Implementation plan for enforcing demo component coverage in userguide documents.

## Requirements

### Coverage Formula

- **Formula**: `ceil((H1_count + H2_count + H3_count) / 3)`
- **Minimum**: 2 demos per page
- **Example**: 5 H2s + 4 H3s → ceil(9/3) = 3 demos required

### Files to Create

1. **scripts/lint-demo-coverage.js** - Main linting script
2. **.demo-coverage.config.js** - Optional configuration file
3. **Update package.json** - Add lint:demos script

### Features Required

- Parse all .md files in `src/renderer/src/manuals/zh_CN/`
- Count H1, H2, H3 headings
- Count `<Demo` tags with mode="demo"
- Output formatted report with PASS/FAIL status
- Exit code 0 on success, 1 on failure
- Handle Chinese characters (UTF-8)
- Parse markdown frontmatter
- Support `<!-- demo-exempt -->` comments
- Support configuration overrides

## Implementation Notes

### Demo Component Patterns

Based on codebase analysis, demo components use:

- `<ComponentName mode="demo" />`
- `<ComponentName mode="demo" ...props />`
- `<Demo component="Name" mode="demo" />`

### File Structure

- 64 markdown files in manuals/zh_CN/
- 152 demo instances across 52 files
- Demo components embedded in markdown

### Regex Patterns

- Headings: `/^#{1,3}\s+/gm` (H1-H3)
- Demos: `/mode\s*=\s*["']demo["']/gi`

## Next Steps

1. Create linting script
2. Test against existing files
3. Add npm script
4. Create config file template
