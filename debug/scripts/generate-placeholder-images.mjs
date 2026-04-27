/**
 * 使用 sharp 生成测试用占位图（合法 PNG）
 * 运行：在 debug 目录下 npm install && npm run generate-images
 * 或从仓库根目录：cd debug && npm install && npm run generate-images
 */
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const debugDir = path.resolve(__dirname, '..')
const imagesDir = path.join(debugDir, 'images')

const sharp = (await import('sharp')).default

const colors = [
  { name: 'red', r: 255, g: 80, b: 80 },
  { name: 'green', r: 80, g: 200, b: 80 },
  { name: 'blue', r: 80, g: 80, b: 255 },
  { name: 'yellow', r: 255, g: 220, b: 80 },
  { name: 'purple', r: 180, g: 80, b: 255 }
]

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true })
}

for (const { name, r, g, b } of colors) {
  const outPath = path.join(imagesDir, `${name}.png`)
  await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r, g, b }
    }
  })
    .png()
    .toFile(outPath)
  console.log('Written:', outPath)
}

console.log('Done. Placeholder images in', imagesDir)
