/**
 * 合成文档图标脚本：将 base-doc.svg 与 md.svg/tex.svg 合成
 * 生成 md-doc.svg 和 tex-doc.svg
 */

const fs = require('fs');
const path = require('path');

// 路径配置
const logov3Dir = path.resolve(__dirname, '../../logos/logov3');
const assetsIconsDir = path.resolve(__dirname, '../src/renderer/src/assets/icons');
const baseDocPath = path.join(logov3Dir, 'base-doc.svg');
const mdPath = path.join(logov3Dir, 'md.svg');
const texPath = path.join(logov3Dir, 'tex.svg');

/**
 * 读取 SVG 文件内容
 */
function readSvgFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 提取 SVG 内容（去除外层 svg 标签）
 */
function extractSvgContent(svgContent) {
  // 提取 <svg> 标签内的内容
  const match = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  if (!match) {
    throw new Error('无效的 SVG 格式');
  }
  return match[1].trim();
}

/**
 * 将 SVG 转换为黑色或白色版本（直接颜色取反，不改变 mask）
 * @param {string} svgContent - SVG 内容
 * @param {boolean} isBlack - true 为黑色版本，false 为白色版本
 * @returns {string} 转换后的 SVG 内容
 */
function convertToColorVersion(svgContent, isBlack) {
  if (!isBlack) {
    // 白色版本，直接返回原内容
    return svgContent;
  }
  
  // 黑色版本：将所有的 fill="#fff" 改为 fill="#000"，保持 mask 不变
  let converted = svgContent;
  
  // 替换绘制部分的所有 fill="#fff" 为 fill="#000"
  converted = converted.replace(/fill="#fff"/g, 'fill="#000"');
  
  // 如果有多余的空格，也处理一下
  converted = converted.replace(/fill="#fff\s*"/g, 'fill="#000"');
  
  return converted;
}

/**
 * 合成文档图标（使用作差方式，重叠部分透明）
 * @param {string} baseDocContent - base-doc.svg 的内容
 * @param {string} overlayContent - md.svg 或 tex.svg 的内容
 * @param {string} outputBasePath - 输出文件基础路径（不含 -white/-black 后缀）
 */
function composeDocIcon(baseDocContent, overlayContent, outputBasePath) {
  // 提取 base-doc 的 SVG 属性
  const baseMatch = baseDocContent.match(/<svg([^>]*)>/i);
  if (!baseMatch) {
    throw new Error('无法解析 base-doc.svg');
  }
  const baseAttrs = baseMatch[1];

  // 提取 base-doc 的内容
  const baseContent = extractSvgContent(baseDocContent);

  // 提取 overlay 的内容
  const overlayContentInner = extractSvgContent(overlayContent);

  // base-doc 是 24x24，overlay 是 8x8
  // 缩小到 0.55：8 * 0.55 = 4.8
  // 放在顶部 25% 位置：x = (24 - 4.8) / 2 = 9.6（居中），y = 24 * 0.25 = 6（顶部 25%）
  const overlayScale = 0.55;
  const overlaySize = 8 * overlayScale; // 4.8
  const overlayX = (24 - overlaySize) / 2; // 9.6，居中
  const overlayY = 24 * 0.25; // 6，顶部 25% 位置

  // 创建 mask ID（使用时间戳确保唯一性）
  const baseMaskId = `base-mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const overlayMaskId = `overlay-mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 处理 overlay 内容，提取路径用于 mask
  // 将 overlay 的路径转换为 mask 格式（黑色表示挖空）
  const overlayForMask = overlayContentInner.replace(/fill="[^"]*"/g, 'fill="black"');

  // 提取 base-doc 在 overlay 位置的形状（用于 overlay 的 mask）
  // base-doc 在 overlay 位置（右下角 16,16 到 24,24）可能有白色内容
  // 我们需要创建一个 clip-path 来提取 base-doc 在这个区域的形状
  // 然后将其转换为 mask 格式用于 overlay
  
  // 创建合成的 SVG，使用 mask 实现作差效果
  // 策略：
  // 1. base-doc 在 overlay 的白色区域挖空（使用 overlay 的形状）
  // 2. overlay 在 base-doc 的白色区域也挖空（使用 base-doc 在 overlay 位置的形状）
  // 这样只有当两个都是白色时才会挖空，实现真正的作差效果
  
  // 为了提取 base-doc 在 overlay 位置的形状，我们使用 clip-path
  // 然后创建一个 mask，让 overlay 在这个区域挖空
  const composedSvg = `<svg${baseAttrs}>
  <defs>
    <!-- base-doc 的 mask：在 overlay 的白色区域挖空 -->
    <mask id="${baseMaskId}">
      <!-- 白色区域表示显示，黑色区域表示隐藏（挖空） -->
      <rect width="24" height="24" fill="white"/>
      <g transform="translate(${overlayX}, ${overlayY}) scale(${overlayScale})">
        ${overlayForMask}
      </g>
    </mask>
    <!-- overlay 的 mask：在 base-doc 的白色区域挖空 -->
    <!-- 我们需要提取 base-doc 在 overlay 位置的形状 -->
    <clipPath id="base-clip-${baseMaskId}">
      <rect x="${overlayX}" y="${overlayY}" width="${overlaySize}" height="${overlaySize}"/>
    </clipPath>
    <mask id="${overlayMaskId}">
      <!-- 白色区域表示显示，黑色区域表示隐藏（挖空） -->
      <!-- overlay 的 mask 使用原始 8x8 尺寸，因为 overlay 本身是在 8x8 的 viewBox 中 -->
      <rect width="8" height="8" fill="white"/>
      <!-- 在 overlay 位置绘制 base-doc，然后转换为 mask -->
      <!-- base-doc 是 24x24，需要转换到 overlay 的 8x8 坐标系 -->
      <!-- 转换：将 base-doc 从 24x24 坐标系映射到 8x8 坐标系 -->
      <!-- scale = 8 / overlaySize，然后平移 base-doc 到 overlay 位置 -->
      <g transform="scale(${8 / overlaySize}) translate(-${overlayX}, -${overlayY})" clip-path="url(#base-clip-${baseMaskId})">
        <!-- 将 base-doc 的内容转换为 mask 格式 -->
        ${baseContent.replace(/fill="[^"]*"/g, 'fill="black"').replace(/fill="none"/g, 'fill="white"')}
      </g>
    </mask>
  </defs>
  <!-- 绘制 base-doc，应用 mask 在 overlay 的白色区域挖空 -->
  <g mask="url(#${baseMaskId})">
    ${baseContent}
  </g>
  <!-- 绘制 overlay，应用 mask 在 base-doc 的白色区域挖空，缩小 30% -->
  <g transform="translate(${overlayX}, ${overlayY}) scale(${overlayScale})" mask="url(#${overlayMaskId})">
    ${overlayContentInner}
  </g>
</svg>`;

  // 生成白色版本
  const whiteSvg = convertToColorVersion(composedSvg, false);
  const whitePath = outputBasePath.replace('.svg', '-white.svg');
  fs.writeFileSync(whitePath, whiteSvg, 'utf-8');
  console.log(`✓ 已生成: ${path.basename(whitePath)}`);

  // 生成黑色版本
  const blackSvg = convertToColorVersion(composedSvg, true);
  const blackPath = outputBasePath.replace('.svg', '-black.svg');
  fs.writeFileSync(blackPath, blackSvg, 'utf-8');
  console.log(`✓ 已生成: ${path.basename(blackPath)}`);
}

/**
 * 主函数
 */
function main() {
  try {
    console.log('开始合成文档图标...\n');

    // 检查文件是否存在
    if (!fs.existsSync(baseDocPath)) {
      throw new Error(`base-doc.svg 不存在: ${baseDocPath}`);
    }
    if (!fs.existsSync(mdPath)) {
      throw new Error(`md.svg 不存在: ${mdPath}`);
    }
    if (!fs.existsSync(texPath)) {
      throw new Error(`tex.svg 不存在: ${texPath}`);
    }

    // 确保输出目录存在
    if (!fs.existsSync(assetsIconsDir)) {
      fs.mkdirSync(assetsIconsDir, { recursive: true });
      console.log(`✓ 创建输出目录: ${assetsIconsDir}`);
    }

    // 读取文件
    const baseDocContent = readSvgFile(baseDocPath);
    const mdContent = readSvgFile(mdPath);
    const texContent = readSvgFile(texPath);

    // 生成 base-doc.svg 的黑白版本
    const baseDocWhitePath = path.join(assetsIconsDir, 'base-doc-white.svg');
    const baseDocWhiteSvg = convertToColorVersion(baseDocContent, false);
    fs.writeFileSync(baseDocWhitePath, baseDocWhiteSvg, 'utf-8');
    console.log(`✓ 已生成: ${path.basename(baseDocWhitePath)}`);

    const baseDocBlackPath = path.join(assetsIconsDir, 'base-doc-black.svg');
    const baseDocBlackSvg = convertToColorVersion(baseDocContent, true);
    fs.writeFileSync(baseDocBlackPath, baseDocBlackSvg, 'utf-8');
    console.log(`✓ 已生成: ${path.basename(baseDocBlackPath)}`);

    // 合成 md-doc.svg（生成黑白两个版本）
    const mdDocBasePath = path.join(assetsIconsDir, 'md-doc.svg');
    composeDocIcon(baseDocContent, mdContent, mdDocBasePath);

    // 合成 tex-doc.svg（生成黑白两个版本）
    const texDocBasePath = path.join(assetsIconsDir, 'tex-doc.svg');
    composeDocIcon(baseDocContent, texContent, texDocBasePath);

    console.log('\n✓ 所有文档图标合成完成！');
  } catch (error) {
    console.error('\n✗ 合成文档图标失败:', error.message);
    process.exit(1);
  }
}

// 运行脚本
main();

