/**
 * DOCX 文件处理器
 * 提供可扩展的架构，支持对 DOCX 文件进行各种操作
 * 如：页眉页脚、公式处理等
 * 
 * 使用示例：
 * ```typescript
 * // 创建自定义处理器
 * class FormulaProcessor implements DocxProcessor {
 *   name = 'FormulaProcessor';
 *   
 *   async process(context: DocxProcessingContext, options?: any): Promise<boolean> {
 *     // 处理公式逻辑
 *     // 修改 context.documentXml 等
 *     return true; // 返回是否修改了文档
 *   }
 * }
 * 
 */

import JSZip from 'jszip';
import { createMainLogger } from '../logger';

const logger = createMainLogger('DocxProcessor');

/**
 * DOCX 处理上下文
 */
export interface DocxProcessingContext {
  zip: JSZip;
  documentXml: string;
  documentRelsXml: string;
  contentTypesXml: string;
  afchunkMht?: string; // html-docx-js 存储内容的 HTML 文件
  [key: string]: any; // 允许扩展上下文
}

/**
 * DOCX 处理器接口
 * 每个功能模块可以实现此接口来扩展 DOCX 处理能力
 */
export interface DocxProcessor {
  /**
   * 处理器名称（用于日志和调试）
   */
  name: string;

  /**
   * 处理 DOCX 文件
   * @param context 处理上下文
   * @param options 处理器特定选项
   * @returns 是否修改了文档（用于决定是否需要重新生成）
   */
  process(context: DocxProcessingContext, options?: any): Promise<boolean>;
}

/**
 * DOCX 处理管理器
 * 管理多个处理器，按顺序执行
 */
export class DocxProcessingManager {
  private processors: DocxProcessor[] = [];

  /**
   * 注册处理器
   * @param processor 处理器实例
   */
  register(processor: DocxProcessor): void {
    this.processors.push(processor);
    logger.debug(`已注册 DOCX 处理器: ${processor.name}`);
  }

  /**
   * 处理 DOCX 文件
   * @param buffer DOCX 文件缓冲区
   * @param options 处理选项（传递给各个处理器）
   * @returns 处理后的 DOCX 文件缓冲区
   */
  async process(buffer: Buffer, options: Record<string, any> = {}): Promise<Buffer> {
    const zip = await JSZip.loadAsync(buffer);

    // 读取必要的 XML 文件
    const documentXmlFile = zip.file('word/document.xml');
    const documentRelsFile = zip.file('word/_rels/document.xml.rels');
    const contentTypesFile = zip.file('[Content_Types].xml');

    if (!documentXmlFile) {
      throw new Error('DOCX 文件缺少 word/document.xml');
    }

    const documentXml = await documentXmlFile.async('string');
    const documentRelsXml = documentRelsFile
      ? await documentRelsFile.async('string')
      : '';
    const contentTypesXml = contentTypesFile
      ? await contentTypesFile.async('string')
      : '';
    
    // 读取 afchunk.mht 文件（html-docx-js 使用此文件存储 HTML 内容）
    const afchunkMhtFile = zip.file('word/afchunk.mht');
    const afchunkMht = afchunkMhtFile
      ? await afchunkMhtFile.async('string')
      : undefined;

    // 创建处理上下文
    const context: DocxProcessingContext = {
      zip,
      documentXml,
      documentRelsXml,
      contentTypesXml,
      afchunkMht,
    };

    // 按顺序执行所有处理器
    let modified = false;
    for (const processor of this.processors) {
      try {
        logger.debug(`执行处理器: ${processor.name}`);
        const processorModified = await processor.process(context, options);
        if (processorModified) {
          modified = true;
          logger.debug(`处理器 ${processor.name} 修改了文档`);
        }
      } catch (error) {
        logger.error(`处理器 ${processor.name} 执行失败:`, error);
        throw error;
      }
    }

    // 如果文档被修改，更新 ZIP 中的文件
    if (modified) {
      zip.file('word/document.xml', context.documentXml);
      // 始终更新关系文件（可能被创建或修改）
      zip.file('word/_rels/document.xml.rels', context.documentRelsXml);
      if (contentTypesFile) {
        zip.file('[Content_Types].xml', context.contentTypesXml);
      }
      // 如果 afchunk.mht 被修改，更新它
      if (context.afchunkMht !== undefined) {
        zip.file('word/afchunk.mht', context.afchunkMht);
      }
    }

    // 生成新的 DOCX 文件
    const updated = await zip.generateAsync({ type: 'nodebuffer' });
    return Buffer.from(updated);
  }
}

/**
 * 目录处理器
 * 注意：目录现在在 HTML 阶段通过嵌入 OOXML 来处理
 * 这个处理器保留作为备用，但通常不会被调用
 */
export class TocProcessor implements DocxProcessor {
  name = 'TocProcessor';

  async process(
    context: DocxProcessingContext,
    options?: {
      generateToc?: boolean;
    }
  ): Promise<boolean> {
    // 目录现在在 HTML 阶段通过嵌入 OOXML 处理，这里不再需要处理
    // 保留这个处理器以避免破坏现有代码结构
    return false;
  }

  // 保留这些方法以避免破坏代码结构，但实际上不会被调用
  private processAfchunkMht(context: DocxProcessingContext): boolean {
    const { afchunkMht, documentXml } = context;
    if (!afchunkMht) return false;

    let modified = false;
    let updatedMht = afchunkMht;
    let updatedDocXml = documentXml;

    // 查找并移除目录占位符
    // 查找包含"目录将自动生成"的内容
    const tocPlaceholderRegex = /<div[^>]*>[\s\S]*?目录将自动生成[\s\S]*?<\/div>/i;
    if (tocPlaceholderRegex.test(updatedMht)) {
      updatedMht = updatedMht.replace(tocPlaceholderRegex, '');
      modified = true;
      logger.debug('已从 afchunk.mht 中移除目录占位符');
    }

    // 查找 <p>标签中的占位符
    const tocPlaceholderRegex2 = /<p[^>]*>[\s\S]*?目录将自动生成[\s\S]*?<\/p>/i;
    if (tocPlaceholderRegex2.test(updatedMht)) {
      updatedMht = updatedMht.replace(tocPlaceholderRegex2, '');
      modified = true;
      logger.debug('已从 afchunk.mht 中移除目录占位符（p标签）');
    }

    // 在 document.xml 中插入 TOC 字段
    // html-docx-js 使用 altChunk 来嵌入 HTML 内容
    // 我们需要在 altChunk 之前插入 TOC 字段
    const tocFieldXml = this.createTocFieldXml();
    
    // 查找 w:altChunk 元素
    const altChunkRegex = /<w:altChunk[^>]*>/i;
    if (altChunkRegex.test(updatedDocXml)) {
      // 在 altChunk 之前插入 TOC
      updatedDocXml = updatedDocXml.replace(
        altChunkRegex,
        `${tocFieldXml}\n    $&`
      );
      modified = true;
      logger.debug('已在 document.xml 的 altChunk 前插入 TOC 字段');
    } else {
      // 如果没有找到 altChunk，尝试在 w:body 开始后插入
      const bodyStartRegex = /(<w:body[^>]*>)/i;
      if (bodyStartRegex.test(updatedDocXml)) {
        updatedDocXml = updatedDocXml.replace(
          bodyStartRegex,
          `$1\n    ${tocFieldXml}`
        );
        modified = true;
        logger.debug('已在 document.xml 的 body 开始处插入 TOC 字段');
      }
    }

    if (modified) {
      context.afchunkMht = updatedMht;
      context.documentXml = updatedDocXml;
    }

    return modified;
  }

  private processDocumentXml(context: DocxProcessingContext): boolean {
    const { documentXml } = context;

    // 查找目录占位符并替换为TOC字段
    const tocPlaceholderRegex = /<w:p[^>]*>[\s\S]*?目录将自动生成[\s\S]*?<\/w:p>/i;
    const tocFieldXml = this.createTocFieldXml();

    if (tocPlaceholderRegex.test(documentXml)) {
      context.documentXml = documentXml.replace(tocPlaceholderRegex, tocFieldXml);
      logger.debug('已在 document.xml 中插入自动目录字段');
      return true;
    }

    // 如果没有找到占位符，尝试在第一个标题前插入
    const firstHeadingRegex = /(<w:p[^>]*>[\s\S]*?<w:pStyle[^>]*w:val="Heading1"[\s\S]*?<\/w:p>)/i;
    if (firstHeadingRegex.test(documentXml)) {
      context.documentXml = documentXml.replace(
        firstHeadingRegex,
        `${tocFieldXml}\n$1`
      );
      logger.debug('已在 document.xml 第一个标题前插入自动目录字段');
      return true;
    }

    return false;
  }

  /**
   * 创建 TOC 的 HTML 表示
   * 注意：html-docx-js 可能不直接支持 Word TOC 字段
   * 我们使用一个特殊的标记，后续需要手动处理
   * 或者使用 HTML 注释，然后在后续处理中替换
   */
  private createTocHtml(): string {
    // 由于 html-docx-js 的限制，我们插入一个特殊的 HTML 结构
    // 这个结构会被识别为目录占位符
    // 注意：真正的 TOC 字段需要通过在 document.xml 中插入 Word 字段来实现
    // 但由于内容在 afchunk.mht 中，我们需要特殊处理
    // 
    // 方案：插入一个带有特殊 class 的 div，然后在 document.xml 中找到对应位置并插入 TOC 字段
    return `<div class="metadoc-toc-placeholder" style="page-break-before: always;">
  <h1 class="Heading1" style="text-align: center; margin-bottom: 24pt;">目录</h1>
  <p style="text-align: center; color: #999;">[目录将自动生成 - 请在 Word 中按 F9 更新]</p>
</div>`;
  }

  /**
   * 创建TOC字段XML（用于 document.xml）
   */
  private createTocFieldXml(): string {
    return `<w:p>
  <w:pPr>
    <w:pStyle w:val="Heading1"/>
    <w:jc w:val="center"/>
    <w:pageBreakBefore/>
  </w:pPr>
  <w:r>
    <w:t>目录</w:t>
  </w:r>
</w:p>
<w:p>
  <w:pPr>
    <w:pStyle w:val="TOC1"/>
  </w:pPr>
  <w:r>
    <w:fldChar w:fldCharType="begin"/>
  </w:r>
  <w:r>
    <w:instrText xml:space="preserve"> TOC \\o "1-4" \\h \\z \\u </w:instrText>
  </w:r>
  <w:r>
    <w:fldChar w:fldCharType="separate"/>
  </w:r>
  <w:r>
    <w:t>目录将自动生成</w:t>
  </w:r>
  <w:r>
    <w:fldChar w:fldCharType="end"/>
  </w:r>
</w:p>`;
  }
}

/**
 * 字体和样式修复处理器
 * 注意：字体问题现在在 HTML 生成阶段处理，这里保留作为备用
 */
export class FontStyleProcessor implements DocxProcessor {
  name = 'FontStyleProcessor';

  async process(
    context: DocxProcessingContext,
    options?: {
      styleMapping?: {
        normal?: { fontFamily: string; fontSize: number; lineHeight: number };
      };
    }
  ): Promise<boolean> {
    // 字体问题现在在 HTML 生成阶段处理，这里不再需要处理
    // 保留这个处理器以避免破坏现有代码结构
    return false;
  }
}

/**
 * 页眉页脚处理器
 */
export class HeaderFooterProcessor implements DocxProcessor {
  name = 'HeaderFooterProcessor';

  async process(
    context: DocxProcessingContext,
    options?: {
      showHeader?: boolean;
      showPageNumbers?: boolean;
      title?: string;
    }
  ): Promise<boolean> {
    if (!options?.showHeader && !options?.showPageNumbers) {
      return false; // 不需要处理
    }

    const { zip, documentXml, documentRelsXml } = context;

    // 确保关系文件存在
    let relsXml = documentRelsXml;
    if (!relsXml) {
      // 如果关系文件不存在，创建一个新的
      relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
      context.documentRelsXml = relsXml;
    }

    // 生成关系 ID
    const headerRelId = options.showHeader ? 'rId' + this.getNextRelId(relsXml) : null;
    const footerRelId = options.showPageNumbers 
      ? 'rId' + this.getNextRelId(relsXml, headerRelId ? [headerRelId] : []) 
      : null;

    // 创建页眉 XML
    if (options.showHeader) {
      const headerXml = this.createHeaderXml(options.title || '');
      zip.file('word/header1.xml', headerXml);
      logger.debug('已创建页眉文件: word/header1.xml');
    }

    // 创建页脚 XML
    if (options.showPageNumbers) {
      const footerXml = this.createFooterXml();
      zip.file('word/footer1.xml', footerXml);
      logger.debug('已创建页脚文件: word/footer1.xml');
    }

    // 更新关系文件
    const updatedRels = this.updateDocumentRels(
      relsXml,
      headerRelId,
      footerRelId
    );
    context.documentRelsXml = updatedRels;

    // 更新主文档 XML，添加节属性
    const updatedDoc = this.updateDocumentXml(
      documentXml,
      options.showHeader ? headerRelId : null,
      options.showPageNumbers ? footerRelId : null
    );
    context.documentXml = updatedDoc;

    // 更新 Content Types
    const updatedContentTypes = this.updateContentTypes(context.contentTypesXml);
    context.contentTypesXml = updatedContentTypes;

    return true;
  }

  /**
   * 创建页眉 XML
   */
  private createHeaderXml(title: string): string {
    const escapedTitle = this.escapeXml(title);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Header"/>
      <w:jc w:val="both"/>
    </w:pPr>
    <w:r>
      <w:t>${escapedTitle}</w:t>
    </w:r>
    <w:r>
      <w:tab/>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="begin"/>
    </w:r>
    <w:r>
      <w:instrText xml:space="preserve"> PAGE </w:instrText>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="separate"/>
    </w:r>
    <w:r>
      <w:t>1</w:t>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
    <w:r>
      <w:t xml:space="preserve"> / </w:t>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="begin"/>
    </w:r>
    <w:r>
      <w:instrText xml:space="preserve"> NUMPAGES </w:instrText>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="separate"/>
    </w:r>
    <w:r>
      <w:t>1</w:t>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
  </w:p>
</w:hdr>`;
  }

  /**
   * 创建页脚 XML
   */
  private createFooterXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:pStyle w:val="Footer"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:fldChar w:fldCharType="begin"/>
    </w:r>
    <w:r>
      <w:instrText xml:space="preserve"> PAGE </w:instrText>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="separate"/>
    </w:r>
    <w:r>
      <w:t>1</w:t>
    </w:r>
    <w:r>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
  </w:p>
</w:ftr>`;
  }

  /**
   * 更新文档关系文件
   */
  private updateDocumentRels(
    relsXml: string,
    headerRelId: string | null,
    footerRelId: string | null
  ): string {
    if (!relsXml) {
      // 创建新的关系文件
      let newRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;

      if (headerRelId) {
        newRels += `
  <Relationship Id="${headerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`;
      }
      if (footerRelId) {
        newRels += `
  <Relationship Id="${footerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`;
      }

      newRels += `
</Relationships>`;
      return newRels;
    }

    // 解析现有关系文件并添加新关系
    const relationshipsMatch = relsXml.match(
      /<Relationships[^>]*>([\s\S]*?)<\/Relationships>/
    );
    if (!relationshipsMatch) {
      throw new Error('无法解析文档关系文件');
    }

    const existingRels = relationshipsMatch[1];
    let newRels = existingRels;

    if (headerRelId && !relsXml.includes('header1.xml')) {
      newRels += `
  <Relationship Id="${headerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>`;
    }
    if (footerRelId && !relsXml.includes('footer1.xml')) {
      newRels += `
  <Relationship Id="${footerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>`;
    }

    return relsXml.replace(
      /(<Relationships[^>]*>)([\s\S]*?)(<\/Relationships>)/,
      `$1${newRels}$3`
    );
  }

  /**
   * 更新主文档 XML，添加节属性
   */
  private updateDocumentXml(
    docXml: string,
    headerRelId: string | null,
    footerRelId: string | null
  ): string {
    // 查找第一个 sectPr（节属性）
    const sectPrMatch = docXml.match(
      /<w:sectPr([^>]*)>([\s\S]*?)<\/w:sectPr>/
    );

    let sectPr: string;
    let needsInsert = false;

    if (!sectPrMatch) {
      // 如果没有节属性，需要创建一个
      needsInsert = true;
      sectPr = '<w:sectPr>';
      if (headerRelId) {
        sectPr += `
    <w:headerReference w:type="default" r:id="${headerRelId}"/>`;
      }
      if (footerRelId) {
        sectPr += `
    <w:footerReference w:type="default" r:id="${footerRelId}"/>`;
      }
      // 添加默认的页边距等属性
      sectPr += `
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    <w:cols w:space="708"/>
    <w:docGrid w:linePitch="360"/>
  </w:sectPr>`;
    } else {
      // 更新现有节属性
      const existingSectPr = sectPrMatch[0];
      sectPr = existingSectPr;

      // 检查是否已有页眉页脚引用
      const hasHeader = existingSectPr.includes('headerReference');
      const hasFooter = existingSectPr.includes('footerReference');

      if ((headerRelId && !hasHeader) || (footerRelId && !hasFooter)) {
        // 需要添加页眉页脚引用
        let insertBefore = '';
        if (headerRelId && !hasHeader) {
          insertBefore += `
    <w:headerReference w:type="default" r:id="${headerRelId}"/>`;
        }
        if (footerRelId && !hasFooter) {
          insertBefore += `
    <w:footerReference w:type="default" r:id="${footerRelId}"/>`;
        }
        
        // 在 </w:sectPr> 前插入
        sectPr = sectPr.replace(/(<\/w:sectPr>)/, `${insertBefore}\n$1`);
      }
    }

    if (needsInsert) {
      // 在文档末尾添加节属性
      const bodyEndMatch = docXml.match(/<\/w:body>/);
      if (!bodyEndMatch) {
        throw new Error('无法找到文档主体结束标签');
      }
      return docXml.replace('</w:body>', `    ${sectPr}\n</w:body>`);
    } else {
      // 替换现有节属性
      return docXml.replace(sectPrMatch![0], sectPr);
    }
  }

  /**
   * 更新 Content Types
   */
  private updateContentTypes(contentTypesXml: string): string {
    if (!contentTypesXml) {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;
    }

    // 检查是否已包含页眉页脚类型
    let updated = contentTypesXml;

    if (!contentTypesXml.includes('header1.xml')) {
      const typesMatch = updated.match(/(<Types[^>]*>)([\s\S]*?)(<\/Types>)/);
      if (typesMatch) {
        updated = updated.replace(
          /(<\/Types>)/,
          `  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>\n$1`
        );
      }
    }

    if (!contentTypesXml.includes('footer1.xml')) {
      updated = updated.replace(
        /(<\/Types>)/,
        `  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>\n$1`
      );
    }

    return updated;
  }

  /**
   * 获取下一个可用的关系 ID
   */
  private getNextRelId(relsXml: string, excludeIds: string[] = []): number {
    if (!relsXml) {
      return 1;
    }

    const idMatches = relsXml.matchAll(/Id="rId(\d+)"/g);
    const usedIds = new Set<number>();
    for (const match of idMatches) {
      usedIds.add(parseInt(match[1], 10));
    }

    // 排除指定的 ID
    for (const excludeId of excludeIds) {
      const match = excludeId.match(/rId(\d+)/);
      if (match) {
        usedIds.add(parseInt(match[1], 10));
      }
    }

    // 找到第一个未使用的 ID
    let nextId = 1;
    while (usedIds.has(nextId)) {
      nextId++;
    }
    return nextId;
  }

  /**
   * 转义 XML 特殊字符
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

