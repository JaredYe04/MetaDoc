/**
 * 词云文字配色（按词哈希稳定取色）
 */

export const WORDCLOUD_COLOR_PALETTE = [
  '#e64e51',
  '#f49c14',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#5ab1ef',
  '#ffb980',
  '#d87a80'
]

export function hashWordForPalette(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function colorForWord(text: string): string {
  const i = hashWordForPalette(text) % WORDCLOUD_COLOR_PALETTE.length
  return WORDCLOUD_COLOR_PALETTE[i]!
}
