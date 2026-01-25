/**
 * 生成图标脚本：从最新的 logo 版本生成 icon.ico 及相关图标文件
 * 1. 找到最新的 logo 版本（logov1, logov2, logov3...）
 * 2. 合成 md-doc.svg 和 tex-doc.svg（如果不存在）
 * 3. 将 logo.svg 转换为 icon.ico（包含多个尺寸）
 * 4. 将 md-doc.svg 和 tex-doc.svg 转换为对应的 ico 文件
 */

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const Jimp = require('jimp');

// 路径配置
const logosDir = path.resolve(__dirname, '../../logos');
const buildDir = path.resolve(__dirname, '../build');
const assetsIconsDir = path.resolve(__dirname, '../src/renderer/src/assets/icons');

// ICO 文件需要的尺寸（Windows 标准尺寸）
const icoSizes = [16, 32, 48, 64, 128, 256];

// ICNS 文件需要的尺寸（macOS 标准尺寸）
const icnsSizes = [16, 32, 64, 128, 256, 512, 1024];

/**
 * 将 SVG 转换为 PNG Buffer（使用 @resvg/resvg-js + Jimp）
 * 使用高分辨率渲染 + 高质量缩放算法，确保边缘清晰
 */
async function svgToPngBuffer(svgPath, width, height) {
  const svgContent = fs.readFileSync(svgPath, 'utf-8');
  
  // 提高渲染分辨率：使用更高的倍数（至少4倍），然后高质量缩放
  // 这样可以获得更清晰的边缘，避免锯齿，接近 sharp 的质量
  // 对于小尺寸（16-64），使用更高倍数；对于大尺寸（128-256），使用4倍
  const baseScale = Math.max(width, height) <= 64 ? 6 : 4;
  const renderSize = Math.max(width, height) * baseScale;
  
  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: 'width',
      value: renderSize
    },
    background: 'transparent'
  });
  
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  
  // 使用 Jimp 高质量缩放算法
  // RESIZE_HERMITE: 最高质量的缩放算法，提供最清晰的边缘
  const image = await Jimp.read(pngBuffer);
  const resized = image.resize(width, height, Jimp.RESIZE_HERMITE);
  
  // 验证尺寸
  if (resized.bitmap.width !== width || resized.bitmap.height !== height) {
    throw new Error(`尺寸调整失败: 期望 ${width}x${height}，实际 ${resized.bitmap.width}x${resized.bitmap.height}`);
  }
  
  // 使用最高质量 PNG 输出
  return await resized.quality(100).getBufferAsync(Jimp.MIME_PNG);
}

/**
 * 将 SVG 转换为 PNG 文件（使用 @resvg/resvg-js + Jimp）
 */
async function svgToPngFile(svgPath, outputPath, width, height) {
  const pngBuffer = await svgToPngBuffer(svgPath, width, height);
  fs.writeFileSync(outputPath, pngBuffer);
  
  // 验证输出文件尺寸
  const image = await Jimp.read(outputPath);
  if (image.bitmap.width !== width || image.bitmap.height !== height) {
    throw new Error(`输出文件尺寸不正确: 期望 ${width}x${height}，实际 ${image.bitmap.width}x${image.bitmap.height}`);
  }
}

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
 * 将 SVG 转换为 ICNS 文件（macOS 图标格式）
 * 使用 macOS 的 iconutil 命令或 png2icons 库
 */
async function convertSvgToIcns(svgPath, outputPath) {
  try {
    const { execSync } = require('child_process');
    const os = require('os');
    const tmpDir = path.join(os.tmpdir(), `icon-${Date.now()}`);
    
    // 创建临时目录
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    console.log('正在生成多个尺寸的 PNG...');
    // 生成多个尺寸的 PNG 文件
    const pngFiles = [];
    for (const size of icnsSizes) {
      const pngPath = path.join(tmpDir, `icon_${size}x${size}.png`);
      await svgToPngFile(svgPath, pngPath, size, size);
      pngFiles.push(pngPath);
    }
    
    // 尝试使用 macOS 的 iconutil 命令（如果可用）
    if (process.platform === 'darwin') {
      try {
        const iconsetPath = outputPath.replace('.icns', '.iconset');
        if (fs.existsSync(iconsetPath)) {
          fs.rmSync(iconsetPath, { recursive: true, force: true });
        }
        fs.mkdirSync(iconsetPath, { recursive: true });
        
        // 复制 PNG 文件到 iconset 目录，使用 macOS 命名规范
        const iconMapping = {
          16: ['icon_16x16.png', 'icon_16x16@2x.png'],
          32: ['icon_32x32.png', 'icon_32x32@2x.png'],
          64: ['icon_64x64.png'],
          128: ['icon_128x128.png', 'icon_128x128@2x.png'],
          256: ['icon_256x256.png', 'icon_256x256@2x.png'],
          512: ['icon_512x512.png', 'icon_512x512@2x.png'],
          1024: ['icon_1024x1024@2x.png']
        };
        
        for (const [size, names] of Object.entries(iconMapping)) {
          const sizeNum = parseInt(size);
          for (let i = 0; i < names.length; i++) {
            const srcPath = path.join(tmpDir, `icon_${sizeNum}x${sizeNum}.png`);
            const destPath = path.join(iconsetPath, names[i]);
            if (fs.existsSync(srcPath)) {
              fs.copyFileSync(srcPath, destPath);
            }
          }
        }
        
        // 使用 iconutil 转换为 icns
        execSync(`iconutil -c icns "${iconsetPath}" -o "${outputPath}"`, { stdio: 'inherit' });
        
        // 清理临时文件
        fs.rmSync(iconsetPath, { recursive: true, force: true });
        fs.rmSync(tmpDir, { recursive: true, force: true });
        
        console.log(`✓ 已生成 ICNS 文件: ${path.basename(outputPath)}`);
        return;
      } catch (error) {
        console.warn(`⚠️  iconutil 失败，尝试使用 png2icons: ${error.message}`);
      }
    }
    
    // 备用方法：使用 png2icons 库
    let png2icons;
    try {
      png2icons = require('png2icons');
    } catch (e) {
      console.warn('⚠️  png2icons 未安装，跳过 ICNS 生成');
      console.warn('   在 macOS 上，ICNS 文件可以通过 iconutil 命令生成');
      console.warn('   或者安装 png2icons: npm install --save-dev png2icons');
      // 清理临时文件
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }
    
    // 读取最大的 PNG 文件（1024x1024）用于生成 ICNS
    const largestPng = path.join(tmpDir, 'icon_1024x1024.png');
    if (fs.existsSync(largestPng)) {
      const pngBuffer = fs.readFileSync(largestPng);
      const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BILINEAR, 0);
      fs.writeFileSync(outputPath, icnsBuffer);
      console.log(`✓ 已生成 ICNS 文件: ${path.basename(outputPath)}`);
    }
    
    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`✗ 转换 ICNS 失败:`, error.message);
    throw error;
  }
}

/**
 * 将 SVG 转换为 ICO 文件
 * 使用 @resvg/resvg-js 生成多个尺寸的 PNG，然后使用 to-ico 库组合为 ICO 格式
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
        const buffer = await svgToPngBuffer(svgPath, size, size);
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

    // 生成 base-doc.svg 的黑白版本（如果不存在）
    const baseDocPath = path.join(versionDir, 'base-doc.svg');
    if (fs.existsSync(baseDocPath)) {
      const baseDocWhitePath = path.join(assetsIconsDir, 'base-doc-white.svg');
      const baseDocBlackPath = path.join(assetsIconsDir, 'base-doc-black.svg');
      
      if (!fs.existsSync(baseDocWhitePath) || !fs.existsSync(baseDocBlackPath)) {
        console.log('正在生成 base-doc 黑白版本...');
        const baseDocContent = fs.readFileSync(baseDocPath, 'utf-8');
        
        // 确保输出目录存在
        if (!fs.existsSync(assetsIconsDir)) {
          fs.mkdirSync(assetsIconsDir, { recursive: true });
          console.log(`✓ 创建输出目录: ${assetsIconsDir}`);
        }
        
        // 生成白色版本
        const baseDocWhiteSvg = convertToColorVersion(baseDocContent, false);
        fs.writeFileSync(baseDocWhitePath, baseDocWhiteSvg, 'utf-8');
        console.log(`✓ 已生成: ${path.basename(baseDocWhitePath)}`);

        // 生成黑色版本
        const baseDocBlackSvg = convertToColorVersion(baseDocContent, true);
        fs.writeFileSync(baseDocBlackPath, baseDocBlackSvg, 'utf-8');
        console.log(`✓ 已生成: ${path.basename(baseDocBlackPath)}`);
      } else {
        console.log('✓ base-doc 黑白版本已存在，跳过生成');
      }
    }

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

    // 生成 macOS 图标（ICNS 格式）
    console.log('\n正在生成 macOS 图标（ICNS 格式）...');
    const iconIcnsPath = path.join(buildDir, 'icon.icns');
    if (!fs.existsSync(iconIcnsPath)) {
      await convertSvgToIcns(logoPath, iconIcnsPath);
    } else {
      console.log(`✓ ${path.basename(iconIcnsPath)} 已存在，跳过生成`);
    }

    // 生成 macOS 文件关联图标
    console.log('\n正在生成 macOS 文件关联图标...');
    const mdIconIcnsPath = path.join(buildDir, 'md-icon.icns');
    if (!fs.existsSync(mdIconIcnsPath)) {
      await convertSvgToIcns(mdDocWhitePath, mdIconIcnsPath);
    } else {
      console.log(`✓ ${path.basename(mdIconIcnsPath)} 已存在，跳过生成`);
    }
    
    const texIconIcnsPath = path.join(buildDir, 'tex-icon.icns');
    if (!fs.existsSync(texIconIcnsPath)) {
      await convertSvgToIcns(texDocWhitePath, texIconIcnsPath);
    } else {
      console.log(`✓ ${path.basename(texIconIcnsPath)} 已存在，跳过生成`);
    }

    // 生成 Linux 图标（PNG 格式，512x512）
    console.log('\n正在生成 Linux 图标（PNG 格式）...');
    const iconPngPath = path.join(buildDir, 'icon.png');
    if (!fs.existsSync(iconPngPath)) {
      await svgToPngFile(logoPath, iconPngPath, 512, 512);
      console.log(`✓ 已生成: ${path.basename(iconPngPath)}`);
    } else {
      console.log(`✓ ${path.basename(iconPngPath)} 已存在，跳过生成`);
    }

    // 生成 Linux 文件关联图标（PNG 格式）
    console.log('\n正在生成 Linux 文件关联图标（PNG 格式）...');
    const mdIconPngPath = path.join(buildDir, 'md-icon.png');
    if (!fs.existsSync(mdIconPngPath)) {
      await svgToPngFile(mdDocWhitePath, mdIconPngPath, 512, 512);
      console.log(`✓ 已生成: ${path.basename(mdIconPngPath)}`);
    } else {
      console.log(`✓ ${path.basename(mdIconPngPath)} 已存在，跳过生成`);
    }
    
    const texIconPngPath = path.join(buildDir, 'tex-icon.png');
    if (!fs.existsSync(texIconPngPath)) {
      await svgToPngFile(texDocWhitePath, texIconPngPath, 512, 512);
      console.log(`✓ 已生成: ${path.basename(texIconPngPath)}`);
    } else {
      console.log(`✓ ${path.basename(texIconPngPath)} 已存在，跳过生成`);
    }

    console.log('\n✓ 所有图标文件生成完成！');
  } catch (error) {
    console.error('\n✗ 生成图标失败:', error.message);
    process.exit(1);
  }
}

// 运行脚本
main();

