import { normalizeNewlines } from './normalize'

/** 行尾去空格 */
function trimEndLines(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
}

export function postProcess(text: string): string {
  let t = normalizeNewlines(text)
  t = trimEndLines(t)
  return t
}
