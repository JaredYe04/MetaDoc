# shadcn-vue Components

## OVERVIEW

93 shadcn-vue UI components installed via `npx shadcn-vue@latest add`. Based on reka-ui primitives with Tailwind CSS styling. Used alongside Element Plus in a hybrid UI approach.

## STRUCTURE

```
components/ui/
├── alert/              # Alert/notification component (shadcn)
├── avatar/             # User avatar with fallback (shadcn)
├── badge/              # Status badges (shadcn)
├── button/             # Primary action button (shadcn)
├── card/               # Content containers (shadcn)
├── checkbox/           # Form checkbox (shadcn)
├── collapsible/        # Expandable content (shadcn)
├── color-picker/       # Color picker - uses @vuelor/picker (NOT shadcn)
├── descriptions/       # Key-value descriptions (shadcn)
├── dialog/             # Modal dialogs (shadcn)
├── dropdown-menu/      # Context menus (shadcn)
├── form/               # Form field wrapper (shadcn)
├── input/              # Text input (shadcn)
├── label/              # Form labels (shadcn)
├── loading-overlay/    # Full-screen loading (shadcn)
├── navigation-menu/    # Navigation component (shadcn)
├── number-field/       # Numeric input with +/- (shadcn)
├── popover/            # Popover (shadcn)
├── progress/           # Progress bars (shadcn)
├── radio-group/        # Radio button groups (shadcn)
├── scroll-area/        # Custom scrollbar (shadcn)
├── select/             # Dropdown select (shadcn)
├── separator/          # Visual dividers (shadcn)
├── slider/             # Range slider (modified for Element Plus compat)
├── switch/             # Toggle switch (shadcn)
├── table/              # Data tables (shadcn)
├── tabs/               # Tab navigation (shadcn)
├── textarea/           # Multi-line text input (shadcn)
├── toggle-group/       # Button toggle groups (shadcn)
├── tooltip/            # Hover tooltips (shadcn)
├── UIMenu.vue          # Custom menu component
├── UIMenuItem.vue      # Custom menu item
├── UISubMenu.vue       # Custom submenu
└── UISubMenuItem.vue   # Custom submenu item
```

## WHERE TO LOOK

| Task                  | Location                                                  | Notes                                     |
| --------------------- | --------------------------------------------------------- | ----------------------------------------- |
| Install new component | Run `npx shadcn-vue@latest add <name>`                    | Installs to `components/ui/<name>/`       |
| Use component         | `import { Button } from '@renderer/components/ui/button'` | Named exports from each component dir     |
| Customize styling     | Component `.vue` files use Tailwind                       | Modify `cn()` calls with Tailwind classes |
| Form integration      | `form/` directory                                         | FormField, FormControl, FormLabel, etc.   |
| Dialog system         | `dialog/` directory                                       | Dialog, DialogContent, DialogHeader, etc. |

## CONVENTIONS

- **Installation**: Always use `npx shadcn-vue@latest add <component>` not manual creation
- **Imports**: Import from `@renderer/components/ui/<component>` not direct file paths
- **Styling**: Components use Tailwind via `cn()` helper from `@renderer/lib/utils`
- **Primitives**: Built on reka-ui (Radix Vue) for accessibility and behavior
- **Composition**: Most components support `as-child` prop for flexible composition
- **Element Plus coexistence**: Can mix shadcn and Element Plus in same view; use shadcn for new UI

## ANTI-PATTERNS

- Do NOT manually create shadcn components — always use the CLI installer
- Do NOT modify core reka-ui behavior in component files — use wrapper components instead
- **NEVER use Element Plus in new code** — shadcn-vue is the ONLY choice for new UI
- Custom components (UIMenu, etc.) alongside shadcn are for project-specific patterns

## DEVELOPMENT POLICY (CRITICAL)

### shadcn-vue ONLY for New Development

**Status**: Element Plus → shadcn-vue migration is **ongoing**.

| Development Type          | UI Framework        | Action                                            |
| ------------------------- | ------------------- | ------------------------------------------------- |
| New features              | **shadcn-vue ONLY** | Install with CLI, use `lucide-vue-next` for icons |
| Bug fixes with UI changes | **shadcn-vue ONLY** | Replace Element Plus components during fix        |
| Refactoring existing UI   | **shadcn-vue**      | Gradually replace Element Plus                    |
| Maintenance on legacy     | Element Plus        | Keep as-is unless fixing bugs                     |

### Installation Checklist

Before using a component:

1. Check if it exists in `components/ui/`
2. If missing, run `npx shadcn-vue@latest add <component>`
3. Import from `@renderer/components/ui/<component>`
4. Use `lucide-vue-next` for icons (NOT `@element-plus/icons-vue`)

### Migration Pattern

```vue
<!-- Before (Element Plus) -->
<el-button type="primary" size="small" :icon="Plus">Add</el-button>

<!-- After (shadcn-vue) -->
<Button size="sm">
  <Plus :size="16" />
  Add
</Button>
```

## CUSTOM COMPONENTS

### color-picker/ (External - @vuelor/picker)

Uses `@vuelor/picker` - **NOT from shadcn-vue**.

- **Package**: `npm i @vuelor/picker`
- **Based on reka-ui**: Uses `useForwardPropsEmits` from reka-ui
- **Styling**: Vanilla CSS with shadcn theme variable overrides
- **API**: Compatible with standard v-model pattern

### slider/ (Modified)

Enhanced with Element Plus compatible props: `range`, `showInput`, `showStops`, `showTooltip`, `formatTooltip`, etc.

## NOTES

- Each component directory contains `index.ts` for clean barrel exports
- Tailwind config extends shadcn's color system
- Custom components alongside shadcn are for project-specific patterns
