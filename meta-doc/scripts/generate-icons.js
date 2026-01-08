/**
 * 生成图标脚本：从最新的 logo 版本生成 icon.ico 及相关图标文件
 * 1. 找到最新的 logo 版本（logov1, logov2, logov3...）
 * 2. 合成 md-doc.svg 和 tex-doc.svg（如果不存在）
 * 3. 将 logo.svg 转换为 icon.ico（包含多个尺寸）
 * 4. 将 md-doc.svg 和 tex-doc.svg 转换为对应的 ico 文件
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 路径配置
const logosDir = path.resolve(__dirname, '../../logos');
const buildDir = path.resolve(__dirname, '../build');
const assetsIconsDir = path.resolve(__dirname, '../src/renderer/src/assets/icons');

// ICO 文件需要的尺寸（Windows 标准尺寸）
const icoSizes = [16, 32, 48, 64, 128, 256];

/**
 * 获取最新的 logo 版本目录
 */
function getLatestLogoVersion() {
  if (!fs.existsSync(logosDir)) {
    throw new Error(`Logos 目录不存在: ${logosDir}`);
  }

  const entries = fs.readdirSync(logosDir, { withFileTypes: true });
  const logoVersions = entries
    .filter(entry => entry.isDirectory() && entry.name.match(/^logov\d+$/))
    .map(entry => entry.name)
    .sort((a, b) => {
      // 提取版本号进行比较
      const versionA = parseInt(a.replace('logov', ''));
      const versionB = parseInt(b.replace('logov', ''));
      return versionB - versionA; // 降序排列，最新的在前
    });

  if (logoVersions.length === 0) {
    throw new Error('未找到任何 logo 版本目录（logov1, logov2, ...）');
  }

  const latestVersion = logoVersions[0];
  console.log(`✓ 找到最新 logo 版本: ${latestVersion}`);
  return latestVersion;
}

/**
 * 提取 SVG 内容（去除外层 svg 标签）
 */
function extractSvgContent(svgContent) {
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
 * 合成文档图标（使用 compose-doc-icons.js 的逻辑，生成黑白两个版本）
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

  // 创建合成的 SVG，使用 mask 实现作差效果
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
    <clipPath id="base-clip-${baseMaskId}">
      <rect x="${overlayX}" y="${overlayY}" width="${overlaySize}" height="${overlaySize}"/>
    </clipPath>
    <mask id="${overlayMaskId}">
      <!-- 白色区域表示显示，黑色区域表示隐藏（挖空） -->
      <rect width="8" height="8" fill="white"/>
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
 * 确保文档图标已合成（生成黑白两个版本）
 */
function ensureDocIconsComposed(versionDir) {
  const baseDocPath = path.join(versionDir, 'base-doc.svg');
  const mdPath = path.join(versionDir, 'md.svg');
  const texPath = path.join(versionDir, 'tex.svg');
  
  // 检查输出的黑白版本文件
  const mdDocWhitePath = path.join(assetsIconsDir, 'md-doc-white.svg');
  const mdDocBlackPath = path.join(assetsIconsDir, 'md-doc-black.svg');
  const texDocWhitePath = path.join(assetsIconsDir, 'tex-doc-white.svg');
  const texDocBlackPath = path.join(assetsIconsDir, 'tex-doc-black.svg');

  // 如果所有版本都已存在，跳过合成
  if (fs.existsSync(mdDocWhitePath) && fs.existsSync(mdDocBlackPath) &&
      fs.existsSync(texDocWhitePath) && fs.existsSync(texDocBlackPath)) {
    console.log('✓ 文档图标已存在，跳过合成');
    return;
  }

  // 确保输出目录存在
  if (!fs.existsSync(assetsIconsDir)) {
    fs.mkdirSync(assetsIconsDir, { recursive: true });
    console.log(`✓ 创建输出目录: ${assetsIconsDir}`);
  }

  // 检查必需文件
  if (!fs.existsSync(baseDocPath)) {
    throw new Error(`base-doc.svg 不存在: ${baseDocPath}`);
  }
  if (!fs.existsSync(mdPath)) {
    throw new Error(`md.svg 不存在: ${mdPath}`);
  }
  if (!fs.existsSync(texPath)) {
    throw new Error(`tex.svg 不存在: ${texPath}`);
  }

  console.log('正在合成文档图标（生成黑白两个版本）...');
  const baseDocContent = fs.readFileSync(baseDocPath, 'utf-8');
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  const texContent = fs.readFileSync(texPath, 'utf-8');

  // 合成 md-doc.svg（生成黑白两个版本）
  const mdDocBasePath = path.join(assetsIconsDir, 'md-doc.svg');
  composeDocIcon(baseDocContent, mdContent, mdDocBasePath);

  // 合成 tex-doc.svg（生成黑白两个版本）
  const texDocBasePath = path.join(assetsIconsDir, 'tex-doc.svg');
  composeDocIcon(baseDocContent, texContent, texDocBasePath);
}

/**
 * 将 SVG 转换为 ICO 文件
 * 由于 sharp 不直接支持 ICO 输出，我们需要生成多个尺寸的 PNG，然后使用 to-ico 库
 */
async function convertSvgToIco(svgPath, outputPath) {
  try {
    // 检查是否安装了 to-ico
    let toIco;
    try {
      toIco = require('to-ico');
    } catch (e) {
      console.error('\n错误: 需要安装 to-ico 库');
      console.error('请运行: npm install --save-dev to-ico');
      console.error('或者: cd meta-doc && npm install --save-dev to-ico\n');
      throw new Error('缺少依赖: to-ico');
    }

    console.log('正在生成多个尺寸的 PNG...');
    // 生成多个尺寸的 PNG 缓冲区
    const pngBuffers = await Promise.all(
      icoSizes.map(async (size) => {
        const buffer = await sharp(svgPath)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          })
          .png()
          .toBuffer();
        return { size, buffer };
      })
    );

    console.log('正在组合为 ICO 格式...');
    // 转换为 ICO 格式
    const icoBuffer = await toIco(
      pngBuffers.map(item => item.buffer),
      {
        sizes: icoSizes
      }
    );

    // 写入文件
    fs.writeFileSync(outputPath, icoBuffer);
    console.log(`✓ 已生成 ICO 文件: ${path.basename(outputPath)} (包含尺寸: ${icoSizes.join(', ')}px)`);
  } catch (error) {
    console.error(`✗ 转换 ICO 失败:`, error.message);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('开始生成图标文件...\n');

    // 确保 build 目录存在
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
      console.log(`✓ 创建 build 目录: ${buildDir}`);
    }

    // 获取最新的 logo 版本
    const latestVersion = getLatestLogoVersion();
    const versionDir = path.join(logosDir, latestVersion);

    // 确保文档图标已合成
    ensureDocIconsComposed(versionDir);

    // 生成 icon.ico（从 logo.svg）
    const logoPath = path.join(versionDir, 'logo.svg');
    if (!fs.existsSync(logoPath)) {
      throw new Error(`未找到 logo.svg 文件: ${logoPath}`);
    }
    const iconIcoPath = path.join(buildDir, 'icon.ico');
    await convertSvgToIco(logoPath, iconIcoPath);

    // 生成 md-icon.ico（从 md-doc-white.svg，使用白色版本）
    const mdDocWhitePath = path.join(assetsIconsDir, 'md-doc-white.svg');
    if (!fs.existsSync(mdDocWhitePath)) {
      throw new Error(`未找到 md-doc-white.svg 文件: ${mdDocWhitePath}`);
    }
    const mdIconPath = path.join(buildDir, 'md-icon.ico');
    await convertSvgToIco(mdDocWhitePath, mdIconPath);

    // 生成 tex-icon.ico（从 tex-doc-white.svg，使用白色版本）
    const texDocWhitePath = path.join(assetsIconsDir, 'tex-doc-white.svg');
    if (!fs.existsSync(texDocWhitePath)) {
      throw new Error(`未找到 tex-doc-white.svg 文件: ${texDocWhitePath}`);
    }
    const texIconPath = path.join(buildDir, 'tex-icon.ico');
    await convertSvgToIco(texDocWhitePath, texIconPath);

    console.log('\n✓ 所有图标文件生成完成！');
  } catch (error) {
    console.error('\n✗ 生成图标失败:', error.message);
    process.exit(1);
  }
}

// 运行脚本
main();

