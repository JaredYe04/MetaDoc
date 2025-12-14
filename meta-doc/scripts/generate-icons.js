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
 * 合成文档图标
 */
function composeDocIcon(baseDocContent, overlayContent, outputPath) {
  const baseMatch = baseDocContent.match(/<svg([^>]*)>/i);
  if (!baseMatch) {
    throw new Error('无法解析 base-doc.svg');
  }
  const baseAttrs = baseMatch[1];
  const baseContent = extractSvgContent(baseDocContent);
  const overlayContentInner = extractSvgContent(overlayContent);

  // base-doc 是 24x24，overlay 是 8x8
  // 放在右下角：x = 24 - 8 = 16, y = 24 - 8 = 16
  const overlayX = 16;
  const overlayY = 16;

  const composedSvg = `<svg${baseAttrs}>
  ${baseContent}
  <g transform="translate(${overlayX}, ${overlayY})">
    ${overlayContentInner}
  </g>
</svg>`;

  fs.writeFileSync(outputPath, composedSvg, 'utf-8');
  console.log(`✓ 已合成: ${path.basename(outputPath)}`);
}

/**
 * 确保文档图标已合成
 */
function ensureDocIconsComposed(versionDir) {
  const baseDocPath = path.join(versionDir, 'base-doc.svg');
  const mdPath = path.join(versionDir, 'md.svg');
  const texPath = path.join(versionDir, 'tex.svg');
  const mdDocPath = path.join(versionDir, 'md-doc.svg');
  const texDocPath = path.join(versionDir, 'tex-doc.svg');

  // 如果已经存在，跳过合成
  if (fs.existsSync(mdDocPath) && fs.existsSync(texDocPath)) {
    console.log('✓ 文档图标已存在，跳过合成');
    return;
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

  console.log('正在合成文档图标...');
  const baseDocContent = fs.readFileSync(baseDocPath, 'utf-8');
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  const texContent = fs.readFileSync(texPath, 'utf-8');

  composeDocIcon(baseDocContent, mdContent, mdDocPath);
  composeDocIcon(baseDocContent, texContent, texDocPath);
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

    // 生成 md-icon.ico（从 md-doc.svg）
    const mdDocPath = path.join(versionDir, 'md-doc.svg');
    if (!fs.existsSync(mdDocPath)) {
      throw new Error(`未找到 md-doc.svg 文件: ${mdDocPath}`);
    }
    const mdIconPath = path.join(buildDir, 'md-icon.ico');
    await convertSvgToIco(mdDocPath, mdIconPath);

    // 生成 tex-icon.ico（从 tex-doc.svg）
    const texDocPath = path.join(versionDir, 'tex-doc.svg');
    if (!fs.existsSync(texDocPath)) {
      throw new Error(`未找到 tex-doc.svg 文件: ${texDocPath}`);
    }
    const texIconPath = path.join(buildDir, 'tex-icon.ico');
    await convertSvgToIco(texDocPath, texIconPath);

    console.log('\n✓ 所有图标文件生成完成！');
  } catch (error) {
    console.error('\n✗ 生成图标失败:', error.message);
    process.exit(1);
  }
}

// 运行脚本
main();

