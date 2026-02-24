# Outline Components

## OVERVIEW

Document outline tree components for hierarchical document navigation. Includes post-merge migration notes from Element Plus to shadcn-vue transition.

## STRUCTURE

```
outline/
├── Outline.vue                     # Main outline tree container
├── OutlineNode.vue                 # Individual outline node
├── DetailedOutlineNode.vue         # Rich outline node display
├── OutlineAiToolbar.vue            # AI-powered outline tools
├── OutlineNodeActionButton.vue     # Node action buttons
├── outline-composables.ts          # Outline-specific composables
└── AGENTS.md                       # This file
```

## POST-MERGE STATUS (2026-02-23)

**Merge:** `origin/main` → `shadcn-exp` completed at commit `bfb8425`

**Current State:**

- 3 hybrid files using both Element Plus and shadcn-vue
- 52 files still using pure Element Plus
- 4 files using pure shadcn-vue

## WHERE TO LOOK

| Task           | File                          | Notes                               |
| -------------- | ----------------------------- | ----------------------------------- |
| Main outline   | `Outline.vue`                 | Hybrid Element Plus + shadcn-vue    |
| Node display   | `DetailedOutlineNode.vue`     | Has el-tooltip to migrate           |
| AI tools       | `OutlineAiToolbar.vue`        | Pure Element Plus → needs migration |
| Action buttons | `OutlineNodeActionButton.vue` | Pure Element Plus → needs migration |

## MIGRATION PRIORITIES

### Critical (Day 1)

- Remove unused `onBeforeMount` import from `Outline.vue`
- Remove unused `ArrowDown as ArrowDownIcon` import from `Outline.vue`
- Remove unbound `triggerButtonRef` from `AutoResizeTextarea.vue`

### High (Week 1)

- Migrate `OutlineAiToolbar.vue` to shadcn-vue
- Migrate `OutlineNodeActionButton.vue` to shadcn-vue
- Standardize tooltip in `DetailedOutlineNode.vue`

### Medium (Week 2)

- Resolve hybrid pattern in `AutoResizeTextarea.vue`
- Standardize import patterns across outline files

## MIGRATION MAPPING

| Element Plus               | shadcn-vue                                                          |
| -------------------------- | ------------------------------------------------------------------- |
| `el-button type="primary"` | `Button variant="default"`                                          |
| `el-button type="default"` | `Button variant="outline"`                                          |
| `el-button size="small"`   | `Button size="sm"`                                                  |
| `el-tooltip`               | `TooltipProvider` + `Tooltip` + `TooltipTrigger` + `TooltipContent` |
| `el-icon`                  | Direct Lucide icon import                                           |

## IMPORT ORDER CONVENTION

```typescript
// 1. Vue imports
import { ref, computed, onMounted } from 'vue'

// 2. Third-party
import { useI18n } from 'vue-i18n'

// 3. shadcn-vue
import { Button } from '@renderer/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'

// 4. Icons (lucide-vue-next)
import { Plus, Pencil, Trash2 } from 'lucide-vue-next'

// 5. Local utils
import { themeState } from '../../utils/themes'

// 6. Types
import type { DocumentOutlineNode } from '../../types/outline'
```

## ANTI-PATTERNS

- Hybrid UI patterns (Element Plus + shadcn-vue in same component)
- Inconsistent import ordering
- Direct Element Plus colors instead of CSS variables
- Hardcoded colors instead of Tailwind classes

## RELATED

- Theme bridge: `utils/shadcn-theme-bridge.js`
- Element Plus migration report: `docs/ELEMENT_UI_MIGRATION_REPORT.md`
- shadcn-vue registry: `components/ui/AGENTS.md`
