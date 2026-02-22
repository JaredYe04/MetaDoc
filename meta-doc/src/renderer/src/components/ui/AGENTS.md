# shadcn-vue Components

## OVERVIEW

93 shadcn-vue UI components installed via `npx shadcn-vue@latest add`. Based on reka-ui primitives with Tailwind CSS styling. Used alongside Element Plus in a hybrid UI approach.

## STRUCTURE

```
components/ui/
├── alert/              # Alert/notification component
├── avatar/             # User avatar with fallback
├── badge/              # Status badges
├── button/             # Primary action button
├── card/               # Content containers
├── checkbox/           # Form checkbox
├── collapsible/        # Expandable content
├── descriptions/       # Key-value descriptions
├── dialog/             # Modal dialogs
├── dropdown-menu/      # Context menus
├── form/               # Form field wrapper
├── input/              # Text input
├── label/              # Form labels
├── loading-overlay/    # Full-screen loading
├── navigation-menu/    # Navigation component
├── number-field/       # Numeric input with +/-
├── progress/           # Progress bars
├── radio-group/        # Radio button groups
├── scroll-area/        # Custom scrollbar
├── select/             # Dropdown select
├── separator/          # Visual dividers
├── slider/             # Range slider
├── switch/             # Toggle switch
├── table/              # Data tables
├── tabs/               # Tab navigation
├── textarea/           # Multi-line text input
├── toggle-group/       # Button toggle groups
├── tooltip/            # Hover tooltips
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
- Avoid duplicating shadcn functionality with Element Plus equivalents in new code
- Custom components (UIMenu, etc.) alongside shadcn are for project-specific patterns

## NOTES

- Components are auto-installed with proper TypeScript types
- Tailwind config extends shadcn's color system (`bg-primary`, `text-muted-foreground`, etc.)
- Each component directory contains `index.ts` for clean barrel exports
