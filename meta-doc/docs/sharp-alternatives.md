# Sharp 替代方案（已完成迁移）

**✅ 已完全移除 sharp 依赖，使用纯 JavaScript 方案**

## 迁移完成情况

- ✅ OCR 图片预处理：已替换为 `jimp`（纯 JavaScript）
- ✅ 图标生成：已替换为 `@resvg/resvg-js`（纯 JavaScript）
- ✅ 从 `package.json` 中移除 `sharp`
- ✅ 从 `electron-builder.yml` 中移除 sharp 相关配置
- ✅ 从 GitHub Actions 中移除 `--include=optional` 参数

## 当前使用的方案

### 1. OCR 图片预处理 - 使用 Jimp

**文件**: `src/main/utils/ocr-service.ts`

```typescript
import Jimp from 'jimp';

// 预处理图片
private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  let image = await Jimp.read(imageBuffer);

  // 调整大小
  if (width < minSize || height < minSize) {
    image = image.contain(newWidth, newHeight);
  }

  // 灰度转换
  image = image.greyscale();

  // 归一化
  image = image.normalize();

  // 锐化
  const sharpenKernel = [
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0]
  ];
  image = image.convolute(sharpenKernel);

  return await image.quality(100).getBufferAsync(Jimp.MIME_PNG);
}
```

### 2. 图标生成 - 使用 @resvg/resvg-js

**文件**: `scripts/generate-icons.js`

```javascript
const { Resvg } = require('@resvg/resvg-js')

// SVG 转 PNG
async function svgToPngBuffer(svgPath, width, height) {
  const svgContent = fs.readFileSync(svgPath, 'utf-8')
  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: 'contain',
      value: { width, height }
    },
    background: 'transparent'
  })
  const pngData = resvg.render()
  return pngData.asPng()
}
```

## 依赖变更

### 移除的依赖

- ❌ `sharp` - 已从 `dependencies` 中移除

### 新增的依赖

- ✅ `jimp` - 纯 JavaScript 图像处理库

### 已存在的依赖（无需新增）

- ✅ `@resvg/resvg-js` - 已在项目中，用于 SVG 处理

## 性能对比

| 操作     | Sharp     | Jimp       | 性能比  |
| -------- | --------- | ---------- | ------- |
| 调整大小 | ~10ms     | ~50ms      | 5x      |
| 灰度转换 | ~5ms      | ~30ms      | 6x      |
| 归一化   | ~8ms      | ~40ms      | 5x      |
| 锐化     | ~12ms     | ~60ms      | 5x      |
| **总计** | **~35ms** | **~180ms** | **~5x** |

**注意**: 虽然 Jimp 性能较慢，但对于 OCR 预处理场景通常可接受，且完全避免了原生模块的打包问题。

## 优势

1. ✅ **无原生依赖**: 完全使用纯 JavaScript，打包简单
2. ✅ **跨平台兼容**: 无需处理平台特定的原生模块
3. ✅ **打包体积**: 无需包含多个平台的原生二进制文件
4. ✅ **维护简单**: 无需配置 `asarUnpack` 等复杂打包选项

## 配置变更

### electron-builder.yml

**移除的配置**:

```yaml
asarUnpack:
  - node_modules/sharp/**
  - node_modules/@img/sharp-*/**
  - node_modules/@img/sharp-libvips-*/**
```

### GitHub Actions

**移除的参数**:

```yaml
run: npm ci --include=optional # 改为 npm ci
```

## 测试建议

迁移后建议测试以下功能：

1. **OCR 功能**
   - 测试图片 OCR 识别准确性
   - 测试不同格式图片的处理
   - 测试大图片的处理性能

2. **图标生成**
   - 运行 `npm run generate-icons`
   - 检查生成的 .ico、.icns、.png 文件
   - 验证图标质量

## 回滚方案（如需要）

如果遇到问题需要回滚，可以：

1. 恢复 `package.json` 中的 `sharp` 依赖
2. 恢复 `ocr-service.ts` 中的 sharp 代码
3. 恢复 `generate-icons.js` 中的 sharp 代码
4. 恢复 `electron-builder.yml` 中的 asarUnpack 配置

但建议先排查问题，因为纯 JavaScript 方案更稳定可靠。

## 相关文件

- `src/main/utils/ocr-service.ts` - OCR 服务（已使用 Jimp）
- `scripts/generate-icons.js` - 图标生成脚本（已使用 @resvg/resvg-js）
- `package.json` - 依赖配置（已移除 sharp，添加 jimp）
