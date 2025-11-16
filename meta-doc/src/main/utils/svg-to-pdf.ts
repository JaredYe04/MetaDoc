/**
 * SVG 转 PDF 工具
 * 使用 pdf-lib 将 SVG 转换为 PDF
 */

import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { createMainLogger } from '../logger';
// 仅保留 resvg-js 渲染链路，不再引入 BrowserWindow 或 sharp 回退

const logger = createMainLogger('SvgToPdf');

/**
 * 将 SVG 文件转换为 PDF 文件
 * @param svgPath - SVG 文件路径
 * @returns PDF 文件路径
 */
export async function convertSvgToPdf(svgPath: string): Promise<string> {
  try {
    // 检查 SVG 文件是否存在
    if (!fs.existsSync(svgPath)) {
      throw new Error(`SVG 文件不存在: ${svgPath}`);
    }

    // 读取 SVG 内容
    let svgContent = fs.readFileSync(svgPath, 'utf-8');
    
    // 生成 PDF 文件路径（在同一目录下，扩展名改为 .pdf）
    const pdfPath = svgPath.replace(/\.svg$/i, '.pdf');
    
    // 如果 PDF 已存在，直接返回
    if (fs.existsSync(pdfPath)) {
      logger.debug(`PDF 文件已存在，跳过转换: ${pdfPath}`);
      return pdfPath;
    }

    // 仅使用 @resvg/resvg-js 将 SVG 渲染为 PNG，再嵌入 PDF
    // 同时尽可能加载系统字体，必要时附加常见字体文件，避免 Mermaid 字体缺失
    // 创建新的 PDF 文档
    const pdfDoc = await PDFDocument.create();

    // 动态导入 resvg
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resvg } = require('@resvg/resvg-js');

    // 收集可能存在的系统字体文件（Windows 常见字体，存在才加入）
    const candidateFontFiles = [
      'C:/Windows/Fonts/arial.ttf',
      'C:/Windows/Fonts/arialuni.ttf',
      'C:/Windows/Fonts/msyh.ttc',        // 微软雅黑
      'C:/Windows/Fonts/simhei.ttf',      // 黑体
      'C:/Windows/Fonts/simsun.ttc',      // 宋体
      'C:/Windows/Fonts/segoeui.ttf',     // Segoe UI
      'C:/Windows/Fonts/calibri.ttf',
      'C:/Windows/Fonts/trebuc.ttf',      // Trebuchet MS
      'C:/Windows/Fonts/tahoma.ttf',
      'C:/Windows/Fonts/verdana.ttf',
    ].filter(p => {
      try { return fs.existsSync(p); } catch { return false; }
    });

    // 推断尺寸
    const widthHeight = (() => {
      const viewBoxMatch = svgContent.match(/viewBox="\s*[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)\s+([\d.\-]+)\s*"/i);
      const widthMatch = svgContent.match(/width="([\d.\-]+)"/i);
      const heightMatch = svgContent.match(/height="([\d.\-]+)"/i);
      const width = widthMatch ? parseFloat(widthMatch[1]) : (viewBoxMatch ? parseFloat(viewBoxMatch[1]) : 1920);
      const height = heightMatch ? parseFloat(heightMatch[1]) : (viewBoxMatch ? parseFloat(viewBoxMatch[2]) : 1080);
      return { width: Math.max(1, width), height: Math.max(1, height) };
    })();

    // 针对 Mermaid 等使用 foreignObject 的 SVG 进行规范化，避免 resvg 丢字
    svgContent = normalizeSvgForResvg(svgContent);

    const resvg = new Resvg(svgContent, {
      fitTo: {
        mode: 'width',
        value: Math.max(1400, Math.round(widthHeight.width)), // 略提高默认宽度，改善小字清晰度
      },
      font: {
        loadSystemFonts: true,
        fontFiles: candidateFontFiles, // 显式注入常见系统字体
        // 设置常用族的默认映射，覆盖 Mermaid 里常见的无衬线用法
        sansSerifFamily: 'Arial',
        serifFamily: 'Times New Roman',
        monospaceFamily: 'Consolas',
        cursiveFamily: 'Arial',
        fantasyFamily: 'Arial',
        defaultFontFamily: 'Arial',
      },
      logLevel: 'off',
    });

    const pngData = resvg.render();
    const renderedPngBuffer = Buffer.from(pngData.asPng());

    const pngImage = await pdfDoc.embedPng(renderedPngBuffer);
    const page = pdfDoc.addPage([pngImage.width, pngImage.height]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height,
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);
    logger.debug(`SVG 已转换为 PDF（resvg-only）: ${pdfPath}`);
    return pdfPath;
  } catch (error) {
    logger.error('SVG 转 PDF 失败:', error);
    throw error;
  }
}

/**
 * 规范化 SVG，以兼容 resvg-js（主要解决 foreignObject 文本丢失、百分比尺寸、字体回退等问题）
 */
function normalizeSvgForResvg(input: string): string {
  let svg = input;

  // 1) 确保 <svg> 上存在明确的 width/height 数值，若为百分比则从 viewBox 推断
  try {
    const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/\s+/).map(parseFloat);
      if (parts.length >= 4) {
        const vbWidth = Math.max(1, parts[2] || 1920);
        const vbHeight = Math.max(1, parts[3] || 1080);
        // 替换 width="100%" 或缺失的情况为具体像素
        if (/width="\s*\d+%/.test(svg) || !/width="/i.test(svg)) {
          svg = svg.replace(/width="[^"]*"/i, '').replace('<svg', `<svg width="${vbWidth}"`);
        }
        if (/height="\s*\d+%/.test(svg) || !/height="/i.test(svg)) {
          svg = svg.replace(/height="[^"]*"/i, '').replace('<svg', `<svg height="${vbHeight}"`);
        }
      }
    }
  } catch {}

  // 2) 在根级 style/属性上增强字体回退（避免缺字）
  if (!/--mermaid-font-family/i.test(svg)) {
    // 注入一个通用的字体族回退
    svg = svg.replace(
      /<svg([^>]*?)>/i,
      (_m, attrs) =>
        `<svg${attrs}><style>svg, text, tspan { font-family: Arial, "Microsoft YaHei", SimSun, "Segoe UI", Verdana, sans-serif; }</style>`
    );
  }

  // 3) 将 foreignObject 的 label 文本替换为 <text>，保留父级 transform
  //    简化策略：提取 foreignObject 中的文本（span.nodeLabel 等），替换为水平居中的 text 元素
  //    注意：此为启发式替换，已足以覆盖 Mermaid 的标签用例
  svg = svg.replace(
    /<foreignObject\b([^>]*)>([\s\S]*?)<\/foreignObject>/gi,
    (full, attrStr, inner) => {
      const textMatch =
        inner.match(/<span[^>]*class="[^"]*\bnodeLabel\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
        inner.match(/<span[^>]*>([\s\S]*?)<\/span>/i) ||
        inner.match(/<div[^>]*>([\s\S]*?)<\/div>/i) ||
        inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (!textMatch) {
        // 保留空盒子，避免位移干扰
        return '<g />';
      }
      // 去除可能的 HTML 实体与多余空白
      const raw = textMatch[1]
        .replace(/<\/?[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();

      // 读取 foreignObject 的 width/height，以其中心作为文字对齐位置
      const wMatch = attrStr.match(/\bwidth="([\d.]+)"/i);
      const hMatch = attrStr.match(/\bheight="([\d.]+)"/i);
      const w = wMatch ? parseFloat(wMatch[1]) : 0;
      const h = hMatch ? parseFloat(hMatch[1]) : 0;

      const x = w > 0 ? w / 2 : 0;
      const y = h > 0 ? h / 2 : 12;

      // 保持居中对齐
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${escapeXml(raw)}</text>`;
    }
  );

  return svg;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

