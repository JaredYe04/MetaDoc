const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 将 Markdown 文件中的 ECharts 代码块转换为图片文件
 * @param {string} markdownPath - Markdown 文件路径
 * @param {string} imagesDir - 图片输出目录（相对于 Markdown 文件的相对路径）
 * @returns {Promise<string>} - 转换后的 Markdown 内容
 */
async function convertEChartsToImages(markdownPath, imagesDir = 'images') {
  const echarts = require('echarts');
  const { Resvg } = require('@resvg/resvg-js');
  
  // 读取 Markdown 文件
  const markdownContent = fs.readFileSync(markdownPath, 'utf-8');
  const markdownDir = path.dirname(markdownPath);
  const imagesPath = path.join(markdownDir, imagesDir);
  
  // 确保图片目录存在
  if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
  }
  
  // 匹配 ```echarts 代码块的正则表达式
  const echartsBlockRegex = /```echarts\n([\s\S]*?)```/g;
  
  let convertedContent = markdownContent;
  let match;
  let chartIndex = 0;
  
  // 规范化 SVG，注入中文字体支持
  function normalizeSvgForResvg(input) {
    let svg = input;
    
    // 检查是否已有中文字体配置
    const hasChineseFont = /Microsoft YaHei|SimSun|SimHei|Noto|WenQuanYi|Noto Sans CJK/i.test(svg);
    
    // 如果没有中文字体配置，注入字体样式
    if (!hasChineseFont) {
      // 先尝试在现有的 style 标签中添加字体
      if (/<style[^>]*>/i.test(svg)) {
        svg = svg.replace(
          /(<style[^>]*>)([\s\S]*?)(<\/style>)/i,
          (match, openTag, content, closeTag) => {
            if (!/font-family/i.test(content)) {
              return `${openTag}${content}\nsvg, text, tspan { font-family: Arial, "Microsoft YaHei", "SimSun", "SimHei", "Noto Sans CJK SC", "WenQuanYi Micro Hei", "WenQuanYi Zen Hei", "Segoe UI", Verdana, sans-serif; }${closeTag}`;
            }
            return match;
          }
        );
      } else {
        // 如果没有 style 标签，在 svg 标签后添加
        svg = svg.replace(
          /(<svg[^>]*>)/i,
          `$1<style>svg, text, tspan { font-family: Arial, "Microsoft YaHei", "SimSun", "SimHei", "Noto Sans CJK SC", "WenQuanYi Micro Hei", "WenQuanYi Zen Hei", "Segoe UI", Verdana, sans-serif; }</style>`
        );
      }
    }
    
    return svg;
  }
  
  // 递归恢复函数（将字符串形式的函数转换回函数对象）
  function restoreFunctions(obj) {
    if (obj === null || typeof obj !== 'object') {
      if (typeof obj === 'string' && obj.trim().startsWith('function')) {
        try {
          return new Function('return ' + obj)();
        } catch {
          return obj;
        }
      }
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(restoreFunctions);
    }
    
    const restored = {};
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim().startsWith('function')) {
        try {
          restored[key] = new Function('return ' + value)();
        } catch {
          restored[key] = restoreFunctions(value);
        }
      } else {
        restored[key] = restoreFunctions(value);
      }
    }
    return restored;
  }
  
  // 处理每个 ECharts 代码块
  while ((match = echartsBlockRegex.exec(markdownContent)) !== null) {
    chartIndex++;
    const fullMatch = match[0];
    const optionJson = match[1].trim();
    
    try {
      console.log(`处理第 ${chartIndex} 个 ECharts 图表...`);
      
      // 解析 ECharts option
      let option;
      try {
        option = JSON.parse(optionJson);
        option = restoreFunctions(option);
      } catch (e) {
        try {
          option = new Function('return ' + optionJson)();
        } catch (evalError) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.warn(`⚠️  图表 ${chartIndex} 解析失败，跳过: ${errorMessage}`);
          continue;
        }
      }
      
      // 从 option 中提取尺寸（如果有）
      // 注意：ECharts option 中的 width/height 可能不在顶层，需要从配置中获取
      let width = 800;
      let height = 600;
      
      // 尝试从 option 中获取尺寸
      if (option.width) width = option.width;
      if (option.height) height = option.height;
      
      // 如果 option 中有 grid 配置，可以从中推断尺寸
      if (option.grid && Array.isArray(option.grid) && option.grid.length > 0) {
        const grid = option.grid[0];
        if (grid.width) width = grid.width;
        if (grid.height) height = grid.height;
      }
      
      // 使用 ECharts SSR 渲染为 SVG
      const chart = echarts.init(null, null, {
        renderer: 'svg',
        ssr: true,
        width: width,
        height: height,
      });
      
      chart.setOption(option);
      let svgStr = chart.renderToSVGString();
      chart.dispose();
      
      // 规范化 SVG，注入中文字体支持
      svgStr = normalizeSvgForResvg(svgStr);
      
      // 收集系统字体文件（跨平台支持）
      const candidateFontFiles = [];
      
      // Windows 字体路径
      if (process.platform === 'win32') {
        const windowsFonts = [
          'C:/Windows/Fonts/arial.ttf',
          'C:/Windows/Fonts/arialuni.ttf',
          'C:/Windows/Fonts/msyh.ttc',        // 微软雅黑
          'C:/Windows/Fonts/simhei.ttf',      // 黑体
          'C:/Windows/Fonts/simsun.ttc',       // 宋体
          'C:/Windows/Fonts/segoeui.ttf',     // Segoe UI
          'C:/Windows/Fonts/calibri.ttf',
          'C:/Windows/Fonts/trebuc.ttf',
          'C:/Windows/Fonts/tahoma.ttf',
          'C:/Windows/Fonts/verdana.ttf',
        ];
        candidateFontFiles.push(...windowsFonts.filter(f => fs.existsSync(f)));
      } else {
        // Linux/Unix 字体路径（Ubuntu 等）
        const linuxFonts = [
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
          '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
          '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
          '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
          '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf',
          '/System/Library/Fonts/Helvetica.ttc', // macOS
          '/System/Library/Fonts/PingFang.ttc',  // macOS 中文字体
        ];
        candidateFontFiles.push(...linuxFonts.filter(f => fs.existsSync(f)));
      }
      
      // 将 SVG 转换为 PNG
      // 使用 resvg 渲染，设置合适的背景、尺寸和字体
      const resvgOptions = {
        background: 'white',
        // 不强制缩放，保持原始尺寸
      };
      
      // 如果找到字体文件，配置字体
      if (candidateFontFiles.length > 0) {
        resvgOptions.font = {
          loadSystemFonts: true,
          fontFiles: candidateFontFiles,
          defaultFontFamily: 'Arial',
        };
      }
      
      const resvg = new Resvg(svgStr, resvgOptions);
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();
      
      // 生成文件名（基于内容哈希）
      const hash = crypto.createHash('sha256').update(optionJson).digest('hex').slice(0, 12);
      const imageFileName = `chart-${chartIndex}-${hash}.png`;
      const imagePath = path.join(imagesPath, imageFileName);
      
      // 保存 PNG 文件
      fs.writeFileSync(imagePath, pngBuffer);
      console.log(`✅ 图表 ${chartIndex} 已保存: ${imageFileName} (${(pngBuffer.length / 1024).toFixed(2)} KB)`);
      
      // 计算相对路径（用于 Markdown 中的图片引用）
      // 使用正斜杠，确保在 GitHub 上正确显示
      const relativeImagePath = path.relative(markdownDir, imagePath).replace(/\\/g, '/');
      
      // 替换代码块为图片引用
      const imageMarkdown = `![ECharts 图表 ${chartIndex}](${relativeImagePath})`;
      convertedContent = convertedContent.replace(fullMatch, imageMarkdown);
      
    } catch (error) {
      console.error(`❌ 处理图表 ${chartIndex} 时出错:`, error.message);
      // 如果转换失败，保留原始代码块
      continue;
    }
  }
  
  return convertedContent;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('用法: node convert-echarts-to-images.js <markdown-file> [images-dir]');
    console.error('示例: node convert-echarts-to-images.js code-audit-report.md images');
    console.error('注意: 图片将保存到指定目录，并在 Markdown 中使用相对路径引用');
    process.exit(1);
  }
  
  const markdownPath = path.resolve(args[0]);
  const imagesDir = args[1] || 'images';
  
  if (!fs.existsSync(markdownPath)) {
    console.error(`❌ 错误: 文件不存在: ${markdownPath}`);
    process.exit(1);
  }
  
  console.log(`📄 处理文件: ${markdownPath}`);
  console.log(`📁 图片输出目录: ${path.join(path.dirname(markdownPath), imagesDir)}`);
  
  try {
    const convertedContent = await convertEChartsToImages(markdownPath, imagesDir);
    
    // 保存转换后的内容（覆盖原文件）
    fs.writeFileSync(markdownPath, convertedContent, 'utf-8');
    console.log(`✅ 转换完成！已更新文件: ${markdownPath}`);
  } catch (error) {
    console.error('❌ 转换失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 发生错误:', error);
    process.exit(1);
  });
}

module.exports = { convertEChartsToImages };

