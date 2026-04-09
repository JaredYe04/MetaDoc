<template>
  <ConsoleOutput
    :console-key="consoleKey"
    :history="mockHistory"
    :show-ai-analysis="showAiAnalysis"
    :mode="mode"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ConsoleOutput from './ConsoleOutput.vue'

const props = withDefaults(
  defineProps<{
    mode?: 'normal' | 'demo'
    consoleKey?: string
    showAiAnalysis?: boolean
  }>(),
  {
    mode: 'normal',
    consoleKey: 'latex-demo',
    showAiAnalysis: true
  }
)

// Mock LaTeX compilation log for demo mode
const mockHistory = computed(() => {
  if (props.mode !== 'demo') {
    return []
  }

  return [
    { content: 'This is XeTeX, Version 3.141592653-2.6-0.999995 (TeX Live 2024)', type: 'out' },
    { content: 'entering extended mode', type: 'out' },
    { content: ' (./document.tex', type: 'out' },
    { content: 'LaTeX2e <2023-11-01> patch level 1', type: 'out' },
    { content: 'L3 programming layer <2024-02-20>', type: 'out' },
    { content: '(./article.cls', type: 'out' },
    {
      content: 'Document Class: article 2023/05/17 v1.4n Standard LaTeX document class',
      type: 'out'
    },
    { content: ')', type: 'out' },
    { content: '(./xeCJK.sty', type: 'out' },
    {
      content: 'Package: xeCJK 2024/01/01 v3.9.1 Typesetting CJK scripts with XeLaTeX',
      type: 'out'
    },
    { content: ')', type: 'out' },
    { content: '(./fontspec.sty', type: 'out' },
    {
      content: 'Package: fontspec 2024/02/01 v2.9a Font selection for XeLaTeX and LuaLaTeX',
      type: 'out'
    },
    { content: ')', type: 'out' },
    { content: ' (./geometry.sty', type: 'out' },
    { content: 'Package: geometry 2020/01/02 v5.9 Page Geometry', type: 'out' },
    { content: ')', type: 'out' },
    { content: '(./amsmath.sty', type: 'out' },
    { content: 'Package: amsmath 2023/05/13 v2.17q AMS math features', type: 'out' },
    { content: ')', type: 'out' },
    { content: ' (./graphicx.sty', type: 'out' },
    { content: 'Package: graphicx 2021/09/16 v1.2d Enhanced LaTeX Graphics', type: 'out' },
    { content: ')', type: 'out' },
    { content: 'No file document.aux.', type: 'warn' },
    { content: '[1]', type: 'out' },
    { content: '[2]', type: 'out' },
    { content: '[3]', type: 'out' },
    { content: ' (./document.aux)', type: 'out' },
    { content: ' *File List*', type: 'out' },
    { content: ' article.cls    2023/05/17 v1.4n Standard LaTeX document class', type: 'out' },
    { content: '  size12.clo    2023/05/17 v1.4n Standard LaTeX file (size option)', type: 'out' },
    {
      content: '  xeCJK.sty    2024/01/01 v3.9.1 Typesetting CJK scripts with XeLaTeX',
      type: 'out'
    },
    {
      content: 'fontspec.sty    2024/02/01 v2.9a Font selection for XeLaTeX and LuaLaTeX',
      type: 'out'
    },
    { content: 'geometry.sty    2020/01/02 v5.9 Page Geometry', type: 'out' },
    { content: ' amsmath.sty    2023/05/13 v2.17q AMS math features', type: 'out' },
    { content: 'graphicx.sty    2021/09/16 v1.2d Enhanced LaTeX Graphics', type: 'out' },
    { content: ' ***********', type: 'out' },
    { content: 'Output written on document.pdf (3 pages).', type: 'success' },
    { content: 'Transcript written on document.log.', type: 'out' },
    { content: '', type: 'out' },
    { content: '[SUCCESS] Compilation completed in 2.3 seconds', type: 'success' }
  ]
})
</script>
