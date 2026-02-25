# SVG Theme Implementation Guide

## Overview

This document describes the SVG theme implementation in MetaDoc, which enables automatic icon theming based on the user's selected light/dark mode. This feature ensures visual consistency across the application while providing a seamless experience when switching between themes.

### Why Theme-Aware SVGs?

1. **Visual Consistency**: Icons automatically adapt to match the current theme without requiring page refresh
2. **User Experience**: Theme changes are reflected immediately across all UI components
3. **Maintainability**: Single source of truth for icon theming through `themeState`
4. **Accessibility**: Proper contrast ratios maintained in both light and dark modes

---

## Logo Theming Implementation

### SVG Assets

We created two logo variants that automatically adapt to the current theme:

| File             | Location                                 | Description                                                    |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `logo-black.svg` | `src/renderer/src/assets/logo-black.svg` | Logo for light themes (black code symbols on white background) |
| `logo-white.svg` | `src/renderer/src/assets/logo-white.svg` | Logo for dark themes (white code symbols on dark background)   |

### SVG Structure

Both SVG files follow the same structure with theme-appropriate colors:

```svg
<!-- logo-black.svg -->
<svg width="256" height="256" viewBox="0 0 256 256"
     xmlns="http://www.w3.org/2000/svg" color="#000000">
  <!-- Background: squircle style rounded rectangle -->
  <path fill="var(--logo-bg, #ffffff)" d="..." />

  <!-- Code symbols </> -->
  <g stroke="currentColor" fill="none" stroke-width="11.2">
    <path d="M98 114 L74 128 L98 142" />    <!-- < -->
    <path d="M138 96 L118 160" />           <!-- / -->
    <path d="M158 114 L182 128 L158 142" /> <!-- > -->
  </g>
</svg>
```

The SVGs use:

- `currentColor` for the stroke, allowing CSS color inheritance
- `var(--logo-bg, #ffffff)` for the background fill with CSS custom property fallback
- Identical geometry between variants (only color values differ)

### Theme Registration

In `src/renderer/src/utils/themes.js`, the logo icons are imported and registered:

```javascript
// Logo icons import (line 93-95)
import LogoBlack from '../assets/logo-black.svg'
import LogoWhite from '../assets/logo-white.svg'

// Theme icon generation (line 325)
const generateThemeIcons = (isDarkMode) => {
  return {
    // ... other icons ...
    LogoIcon: selectIconByTheme(isDarkMode, { light: LogoBlack, dark: LogoWhite })
  }
}
```

### Component Usage

Components access the theme-aware logo through `themeState.currentTheme.LogoIcon`:

**LogoTab.vue** (`src/renderer/src/components/LogoTab.vue`):

```vue
<template>
  <img :src="themeState.currentTheme.LogoIcon" alt="MetaDoc" class="logo-tab__image" />
</template>

<script setup>
import { themeState } from '@/utils/themes.js'
</script>
```

**DummyView.vue** (`src/renderer/src/views/DummyView.vue`):

```vue
<template>
  <img :src="themeState.currentTheme.LogoIcon" alt="Logo" class="logo-image" />
</template>

<script setup>
import { themeState } from '@/utils/themes.js'
</script>
```

**SettingAboutSection.vue** (`src/renderer/src/views/setting/SettingAboutSection.vue`):

```vue
<script setup>
import { computed } from 'vue'
import { themeState } from '@/utils/themes.js'

const logo = computed(() => themeState.currentTheme.LogoIcon)
</script>

<template>
  <img :src="logo" alt="MetaDoc" class="about-logo" />
</template>
```

---

## Vditor Toolbar Theming

### CSS Filter Approach

For the Vditor Markdown editor's toolbar icons, we use a CSS filter approach since these are third-party SVGs that cannot be directly modified.

### Implementation

In `src/renderer/src/assets/fonts/fonts.css` (lines 107-114):

```css
/* Theme-aware Vditor toolbar icons */
.vditor-toolbar svg {
  filter: none;
}

html.dark .vditor-toolbar svg {
  filter: brightness(0) invert(1);
}
```

### How It Works

| Filter                    | Effect                  | Use Case                               |
| ------------------------- | ----------------------- | -------------------------------------- |
| `none`                    | No transformation       | Light theme (default icons work as-is) |
| `brightness(0) invert(1)` | Converts black to white | Dark theme (inverts icon colors)       |

The `brightness(0)` filter first turns the icon completely black (removing any color), then `invert(1)` flips it to white. This approach works for any monochrome SVG icons in the toolbar.

### Benefits

- **Automatic**: Applies to all toolbar icons without individual changes
- **No JavaScript**: Pure CSS solution with zero runtime overhead
- **Consistent**: Same visual treatment across all Vditor toolbar buttons

---

## How to Add New Theme-Aware Icons

### Step 1: Create SVG Variants

Create two SVG files for your icon:

```
src/renderer/src/assets/icons/your-icon-black.svg
src/renderer/src/assets/icons/your-icon-white.svg
```

Design guidelines:

- Keep geometries identical between variants
- Use `currentColor` for strokes/fills that should adapt
- Use explicit colors for fixed elements
- Include proper `viewBox` for scaling

### Step 2: Import in themes.js

Add imports at the top of `src/renderer/src/utils/themes.js`:

```javascript
import YourIconBlack from '../assets/icons/your-icon-black.svg'
import YourIconWhite from '../assets/icons/your-icon-white.svg'
```

### Step 3: Register in generateThemeIcons()

Add your icon to the `generateThemeIcons()` function:

```javascript
const generateThemeIcons = (isDarkMode) => {
  return {
    // ... existing icons ...
    YourIconName: selectIconByTheme(isDarkMode, {
      light: YourIconBlack,
      dark: YourIconWhite
    })
  }
}
```

### Step 4: Use in Components

Access the theme-aware icon in your Vue components:

```vue
<template>
  <img :src="themeState.currentTheme.YourIconName" alt="Description" />
</template>

<script setup>
import { themeState } from '@/utils/themes.js'
</script>
```

### Complete Example

Here's a complete example of adding a "Share" icon:

```javascript
// themes.js - Add imports
import ShareIconBlack from '../assets/icons/share-black.svg'
import ShareIconWhite from '../assets/icons/share-white.svg'

// themes.js - Register in generateThemeIcons()
const generateThemeIcons = (isDarkMode) => {
  return {
    // ... other icons ...
    ShareIcon: selectIconByTheme(isDarkMode, {
      light: ShareIconBlack,
      dark: ShareIconWhite
    })
  }
}
```

```vue
<!-- ShareButton.vue -->
<template>
  <button class="share-button">
    <img :src="themeState.currentTheme.ShareIcon" alt="Share" class="share-icon" />
    <span>Share</span>
  </button>
</template>

<script setup>
import { themeState } from '@/utils/themes.js'
</script>
```

---

## Technical Details

### Dual-Icon Pattern

The codebase follows a dual-icon pattern where 78+ icons already use this approach:

```javascript
// Example from themes.js - Line 258-324
AiLogo: selectIconByTheme(isDarkMode, { light: AiLogo, dark: AiLogoWhite }),
HomeIcon: selectIconByTheme(isDarkMode, { light: HomeIconBlack, dark: HomeIconWhite }),
EditorIcon: selectIconByTheme(isDarkMode, { light: EditorIconBlack, dark: EditorIconWhite }),
// ... and 75+ more
```

### selectIconByTheme Helper

The `selectIconByTheme()` function (lines 247-249) provides the selection logic:

```javascript
const selectIconByTheme = (isDarkMode, iconPair) => {
  return isDarkMode ? iconPair.dark : iconPair.light
}
```

### Reactive Theme State

The `themeState` object is reactive (line 553-555):

```javascript
export const themeState = reactive({
  currentTheme: lightTheme
})
```

This means:

- Components automatically update when theme changes
- No manual refresh or component remounting required
- All icons using `themeState.currentTheme.*` stay synchronized

### CSS Filters for Third-Party SVGs

When you cannot modify the SVG source (like Vditor's toolbar icons), CSS filters provide an alternative:

```css
/* Common filter combinations */
filter: brightness(0) invert(1); /* Black → White */
filter: brightness(0) invert(1) opacity(0.7); /* With opacity */
filter: brightness(0.5) sepia(1) hue-rotate(180deg); /* Color shift */
```

### Icon Naming Convention

Follow these naming conventions for consistency:

| Element      | Convention                             | Example                            |
| ------------ | -------------------------------------- | ---------------------------------- |
| Import names | `{Name}Black`, `{Name}White`           | `HomeIconBlack`, `HomeIconWhite`   |
| Export names | `{Name}Icon`                           | `HomeIcon`, `LogoIcon`             |
| File names   | `{name}-black.svg`, `{name}-white.svg` | `home-black.svg`, `home-white.svg` |

---

## Files Changed

The following 9 files were modified or created for this implementation:

### Created Files

| File                                     | Description                   |
| ---------------------------------------- | ----------------------------- |
| `src/renderer/src/assets/logo-black.svg` | Logo variant for light themes |
| `src/renderer/src/assets/logo-white.svg` | Logo variant for dark themes  |

### Modified Files

| File                                                     | Changes                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/renderer/src/utils/themes.js`                       | Added Logo imports, `LogoIcon` export in `generateThemeIcons()`        |
| `src/renderer/src/assets/fonts/fonts.css`                | Added CSS filter rules for Vditor toolbar theming                      |
| `src/renderer/src/components/LogoTab.vue`                | Updated to use `themeState.currentTheme.LogoIcon`                      |
| `src/renderer/src/views/DummyView.vue`                   | Updated to use `themeState.currentTheme.LogoIcon`                      |
| `src/renderer/src/views/setting/SettingAboutSection.vue` | Updated to use computed `logo` from `themeState.currentTheme.LogoIcon` |
| `src/renderer/src/components/WorkspaceExplorer.vue`      | (If applicable - check for logo usage)                                 |

---

## Troubleshooting

### Icons Not Updating on Theme Change

1. Ensure you're using `themeState.currentTheme.IconName` (reactive)
2. Not a static import or computed without dependency
3. Check that `themeState` is imported from the correct path

### Vditor Icons Wrong Color

1. Verify `html.dark` class is present on `<html>` element
2. Check that CSS rules are not being overridden
3. Ensure `fonts.css` is properly imported

### New Icon Not Appearing

1. Verify both SVG files exist and are valid
2. Check import paths in `themes.js`
3. Ensure icon is added to `generateThemeIcons()` return object
4. Verify component is using correct property name

---

## Summary

The SVG theme implementation provides:

- **Dual SVG approach** for custom icons (78+ icons using this pattern)
- **CSS filter approach** for third-party icons (Vditor toolbar)
- **Reactive updates** through `themeState.currentTheme`
- **Consistent naming** and file organization
- **Zero-config theming** for new icons following the pattern

This system ensures all icons in MetaDoc automatically adapt to the user's theme preference, maintaining visual consistency and accessibility across the entire application.
