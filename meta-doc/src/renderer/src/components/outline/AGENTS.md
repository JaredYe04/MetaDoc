# Post-Merge Fix Plan: shadcn-exp → origin/main

**Date:** 2026-02-23  
**Merge Status:** ✅ VERIFIED SUCCESSFUL  
**Merge Commit:** `bfb8425`  
**Document Version:** 1.0  

---

## Executive Summary

This document details all post-merge issues requiring immediate attention following the successful integration of `origin/main` into the `shadcn-exp` branch.

**Total Issues Identified:** 11 issues across 6 files  
**Estimated Total Effort:** 12-16 hours  
**Status:** Documentation created, awaiting implementation

---

## Context

### Merge Overview
- **Source Branch:** origin/main (Element Plus UI)
- **Target Branch:** shadcn-exp (shadcn-vue UI)
- **Conflicts Resolved:** 3 files
  - AutoResizeTextarea.vue
  - DetailedOutlineNode.vue
  - Outline.vue
- **New Files Added:** 2 files
  - OutlineAiToolbar.vue
  - OutlineNodeActionButton.vue

### Hybrid UI State
The merge resulted in an intentional hybrid UI architecture:
- **3 hybrid files** using both Element Plus and shadcn-vue
- **52 files** still using pure Element Plus
- **4 files** using pure shadcn-vue

---

## Priority Classification

| Priority | Definition | Fix Timeline | Count |
|----------|------------|--------------|-------|
| **Critical** | Breaking functionality, console errors, or type safety issues | Immediate (Day 1) | 3 |
| **High** | Component inconsistencies causing UI drift or UX degradation | Week 1 | 3 |
| **Medium** | Hybrid patterns reducing maintainability | Week 2 | 3 |
| **Low** | Cleanup and optimization | Backlog | 2 |

---

## Critical Priority Issues

### CRIT-001: Unused Import - onBeforeMount

**File:** `meta-doc/src/renderer/src/views/Outline.vue`  
**Line:** 585

**Current Code:**
```typescript
import {
  ref,
  reactive,
  watch,
  computed,
  onMounted,
  onBeforeMount,  // ← UNUSED
  onUnmounted,
  nextTick,
  provide,
  type Ref,
  type ComponentPublicInstance
} from 'vue'
```

**Fix:** Remove `onBeforeMount` from imports  
**Verification:** `lsp_diagnostics` shows no "unused import" warning  
**Effort:** 5 minutes

---

### CRIT-002: Unused Import - ArrowDownIcon Alias

**File:** `meta-doc/src/renderer/src/views/Outline.vue`  
**Line:** 630

**Current Code:**
```typescript
import {
  Plus,
  Pencil,
  Trash2,
  Minus,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown as ArrowDownIcon,  // ← UNUSED (ArrowDown used directly)
  Loader2
} from 'lucide-vue-next'
```

**Fix:** Remove `ArrowDown as ArrowDownIcon` from imports  
**Verification:** `lsp_diagnostics` shows no "unused import" warning  
**Effort:** 5 minutes

---

### CRIT-003: Unbound Ref - triggerButtonRef

**File:** `meta-doc/src/renderer/src/components/base/AutoResizeTextarea.vue`  
**Line:** 93

**Current Code:**
```typescript
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const triggerButtonRef = ref<HTMLElement | null>(null)  // ← UNBOUND
const showPresetDropdown = ref(false)
```

**Analysis:** The ref is declared but never bound to any template element via `:ref="triggerButtonRef"`.

**Fix:** Remove the unused ref declaration  
**Verification:** `lsp_diagnostics` shows no "declared but never read" warning  
**Effort:** 5 minutes

---

## High Priority Issues

### HIGH-001: Migrate OutlineAiToolbar.vue to shadcn-vue

**File:** `meta-doc/src/renderer/src/components/outline/OutlineAiToolbar.vue`  
**Pattern:** Pure Element Plus → shadcn-vue

**Migration Mapping:**

| From (Element Plus) | To (shadcn-vue) |
|---------------------|-----------------|
| `el-button type="primary"` | `Button variant="default"` |
| `el-button type="default"` | `Button variant="outline"` |
| `el-button size="small"` | `Button size="sm"` |
| `el-tooltip content="..."` | `TooltipProvider` + `Tooltip` + `TooltipTrigger` + `TooltipContent` |
| `el-icon` | Direct Lucide icon import |

**Add Imports:**
```typescript
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { LucideIcon } from 'lucide-vue-next'  // Replace specific icons
```

**Remove Imports:**
```typescript
// Remove:
import { ElButton, ElTooltip, ElIcon } from 'element-plus'
import { /* icons */ } from '@element-plus/icons-vue'
```

**Template Changes:**
```vue
<!-- Before -->
<el-tooltip :content="tooltipText">
  <el-button type="primary" size="small">
    <el-icon><Icon /></el-icon>
  </el-button>
</el-tooltip>

<!-- After -->
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="default" size="sm">
        <Icon class="w-4 h-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{{ tooltipText }}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Verification:**
- [ ] Component renders without errors
- [ ] All buttons clickable
- [ ] Tooltips display on hover
- [ ] Icons display correctly
- [ ] ESLint passes

**Effort:** 2-3 hours  
**Dependencies:** None

---

### HIGH-002: Migrate OutlineNodeActionButton.vue to shadcn-vue

**File:** `meta-doc/src/renderer/src/components/outline/OutlineNodeActionButton.vue`  
**Pattern:** Pure Element Plus → shadcn-vue

**Migration Mapping:**

| From (Element Plus) | To (shadcn-vue) |
|---------------------|-----------------|
| `el-button type="text"` | `Button variant="ghost"` |
| `el-icon` with `More` | `MoreHorizontal` from lucide-vue-next |
| `el-tooltip` | `Tooltip` |

**Change Imports:**
```typescript
// Remove:
import { More } from '@element-plus/icons-vue'
import { ElButton, ElTooltip, ElIcon } from 'element-plus'

// Add:
import { MoreHorizontal } from 'lucide-vue-next'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
```

**Template Changes:**
```vue
<!-- Before -->
<el-tooltip :content="$t('outline.moreActions')">
  <el-button type="text" :class="['aero-btn', 'node-action-btn']">
    <el-icon><More /></el-icon>
  </el-button>
</el-tooltip>

<!-- After -->
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="ghost" :class="['aero-btn', 'node-action-btn']">
        <MoreHorizontal class="w-4 h-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{{ $t('outline.moreActions') }}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**Verification:**
- [ ] Button renders correctly
- [ ] Tooltip displays on hover
- [ ] Icon displays correctly
- [ ] Click handlers work

**Effort:** 1.5-2 hours  
**Dependencies:** None

---

### HIGH-003: Standardize DetailedOutlineNode.vue Tooltip

**File:** `meta-doc/src/renderer/src/components/outline/DetailedOutlineNode.vue`  
**Lines:** 14-25

**Current Code:**
```vue
<el-tooltip :content="$t('outline.collapse')" placement="top">
  <button class="detailed-node__collapse-btn" @click="emit('collapse')">
    <el-icon><ArrowUp /></el-icon>
  </button>
</el-tooltip>
```

**Expected Fix:**
```vue
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <button class="detailed-node__collapse-btn" @click="emit('collapse')">
        <ArrowUp class="w-4 h-4" />
      </button>
    </TooltipTrigger>
    <TooltipContent side="top">
      <p>{{ $t('outline.collapse') }}</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

```typescript
// Change imports:
// Remove: import { ArrowUp } from '@element-plus/icons-vue'
// Add: import { ArrowUp } from 'lucide-vue-next'
// Add: import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
```

**Effort:** 45 minutes

---

## Medium Priority Issues

### MED-001: Resolve Hybrid Pattern in AutoResizeTextarea.vue

**File:** `meta-doc/src/renderer/src/components/base/AutoResizeTextarea.vue`  
**Pattern:** Hybrid (shadcn ScrollArea + Element Plus popover/button)

**Migration Table:**

| Element Plus | shadcn-vue |
|--------------|------------|
| `el-popover` | `Popover` + `PopoverTrigger` + `PopoverContent` |
| `v-model:visible` | `v-model:open` |
| `placement="bottom-end"` | `side="bottom" align="end"` |
| `el-button type="text"` | `Button variant="ghost"` |
| `el-icon` | Direct Lucide icon (`ChevronDown`) |
| `el-scrollbar` | `ScrollArea` (already using) |

**Add Imports:**
```typescript
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@renderer/components/ui/popover'
import { ChevronDown } from 'lucide-vue-next'
```

**Remove Imports:**
```typescript
// Remove:
import { ElButton, ElIcon, ElPopover, ElScrollbar } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
```

**Template Changes:**
```vue
<!-- Before -->
<el-popover v-model:visible="showPresetDropdown" placement="bottom-end" :width="300" trigger="manual">
  <template #reference>
    <el-button type="text" size="small" @click.stop="togglePresetDropdown">
      <el-icon><ArrowDown /></el-icon>
    </el-button>
  </template>
  <el-scrollbar class="preset-list-scrollbar" max-height="280px">
    <!-- content -->
  </el-scrollbar>
</el-popover>

<!-- After -->
<Popover v-model:open="showPresetDropdown">
  <PopoverTrigger as-child>
    <Button variant="ghost" size="sm" @click.stop="togglePresetDropdown">
      <ChevronDown class="w-4 h-4" />
    </Button>
  </PopoverTrigger>
  <PopoverContent side="bottom" align="end" class="w-[300px] p-0">
    <ScrollArea class="h-[280px]">
      <!-- content -->
    </ScrollArea>
  </PopoverContent>
</Popover>
```

**Effort:** 3-4 hours  
**Dependencies:** HIGH-001, HIGH-002

---

### MED-002: Standardize Import Patterns

**Standard Import Order Convention:**
```typescript
// 1. Vue imports
import { ref, computed, inject, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

// 2. Third-party library imports
import { VNodeRef } from 'vue'

// 3. shadcn-vue component imports
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'

// 4. Icon imports (lucide-vue-next only)
import { 
  Plus, Pencil, Trash2, Minus, 
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
  MoreHorizontal, ChevronDown, Check, X,
  Loader2, RefreshCw 
} from 'lucide-vue-next'

// 5. Local utility imports
import { themeState, colorWithOpacity } from '../../utils/themes'
import { eventBus } from '../../utils/event-bus'
import { logger } from '../../../../main/utils/logger'

// 6. Type imports
import type { DocumentOutlineNode } from '../../types/outline'
```

**Files to Update:**
- [ ] OutlineAiToolbar.vue
- [ ] OutlineNodeActionButton.vue
- [ ] DetailedOutlineNode.vue
- [ ] AutoResizeTextarea.vue

**Effort:** 1 hour

---

### MED-003: Document Theme Bridge Architecture

**Files to Document:**
- `meta-doc/src/renderer/src/utils/shadcn-theme-bridge.js`
- `meta-doc/src/renderer/src/assets/element-plus-theme-override.css`

**Documentation Content:**
1. Purpose of theme bridge
2. How CSS variables are synchronized
3. Override rules and their rationale
4. Migration guidelines for new components

**Effort:** 30 minutes

---

## Low Priority Issues

### LOW-001: Audit Remaining Element Plus Usage

**Task:** Search for remaining Element Plus components in outline-related files

**Commands:**
```bash
grep -n "el-" meta-doc/src/renderer/src/views/Outline.vue
grep -n "El" meta-doc/src/renderer/src/components/outline/*.vue
grep -n "from 'element-plus'" meta-doc/src/renderer/src/views/Outline.vue
grep -n "from 'element-plus'" meta-doc/src/renderer/src/components/outline/*.vue
```

**Expected Output:** Catalog of remaining Element Plus usage for future migration waves

**Effort:** 1-2 hours

---

### LOW-002: Verify CSS Variable Consistency

**Checklist:**
- [ ] All buttons use `--primary`, `--primary-foreground`
- [ ] All tooltips use `--popover`, `--popover-foreground`
- [ ] Border colors use `--border`
- [ ] Background colors use `--background`, `--background-2nd`
- [ ] Text colors use `--foreground`, `--muted-foreground`
- [ ] Focus rings use Tailwind `ring-2 ring-primary`

**Verification Method:**
1. Open Outline view in app
2. Inspect each component with browser dev tools
3. Verify CSS variables match design system

**Effort:** 1 hour

---

## Execution Order

### Phase 1: Critical Fixes (Day 1) - 30 minutes
1. ✅ **CRIT-001**: Remove unused onBeforeMount (Outline.vue:585)
2. ✅ **CRIT-002**: Remove unused ArrowDownIcon (Outline.vue:630)
3. ✅ **CRIT-003**: Remove unbound triggerButtonRef (AutoResizeTextarea.vue:93)

### Phase 2: High Priority (Week 1) - 5-6 hours
1. ✅ **HIGH-001**: Migrate OutlineAiToolbar.vue
2. ✅ **HIGH-002**: Migrate OutlineNodeActionButton.vue
3. ✅ **HIGH-003**: Migrate DetailedOutlineNode.vue tooltip

### Phase 3: Medium Priority (Week 2) - 4-5 hours
1. ✅ **MED-001**: Migrate AutoResizeTextarea.vue
2. ✅ **MED-002**: Standardize import patterns
3. ✅ **MED-003**: Document theme bridge

### Phase 4: Low Priority (Backlog)
1. **LOW-001**: Audit remaining Element Plus
2. **LOW-002**: Verify CSS variables

---

## Success Criteria

### Code Quality
- ✅ ESLint passes with zero warnings
- ✅ TypeScript compilation: Zero errors
- ✅ `lsp_diagnostics` clean on all modified files

### Functionality
- ✅ Build: Successful (`npm run build` or equivalent)
- ✅ Runtime: No console errors
- ✅ All outline features work (expand, collapse, generate, edit)

### UI Consistency
- ✅ Visual parity with original Element Plus implementation
- ✅ All buttons use consistent shadcn-vue styling
- ✅ All tooltips display correctly
- ✅ Icons display at correct size (w-4 h-4 default)

### Maintainability
- ✅ All outline components use consistent shadcn-vue patterns
- ✅ No hybrid UI patterns remaining in outline module
- ✅ Import patterns standardized across files

---

## Related Documentation

- [Element Plus Migration Guide](../docs/ELEMENT_UI_MIGRATION_REPORT.md)
- [shadcn-vue Component Registry](./ui/AGENTS.md)
- [Theme System Documentation](../utils/shadcn-theme-bridge.js)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-23 | 1.0 | Initial document creation post-merge |

---

**Document Owner:** Sisyphus (AI Agent)  
**Last Updated:** 2026-02-23  
**Status:** Ready for implementation
