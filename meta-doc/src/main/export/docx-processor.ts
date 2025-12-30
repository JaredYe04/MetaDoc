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
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
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
   * @param progressCallback 进度回调函数 (current: number, total: number, message?: string) => void
   * @returns 是否修改了文档（用于决定是否需要重新生成）
   */
  process(context: DocxProcessingContext, options?: any, progressCallback?: (current: number, total: number, message?: string) => void): Promise<boolean>;
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
    const settingsXmlFile = zip.file('word/settings.xml');

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
    const settingsXml = settingsXmlFile
      ? await settingsXmlFile.async('string')
      : null;

    // 创建处理上下文
    const context: DocxProcessingContext = {
      zip,
      documentXml,
      documentRelsXml,
      contentTypesXml,
      settingsXml: settingsXml || undefined,
    };

    // 按顺序执行所有处理器
    let modified = false;
    const progressCallback = options?.progressCallback as ((current: number, total: number, message?: string) => void) | undefined;
    for (const processor of this.processors) {
      try {
        logger.debug(`执行处理器: ${processor.name}`);
        const processorModified = await processor.process(context, options, progressCallback);
        if (processorModified) {
          modified = true;
          logger.debug(`处理器 ${processor.name} 修改了文档`);
        }
      } catch (error) {
        logger.error(`处理器 ${processor.name} 执行失败:`, error);
        throw error;
      }
    }

    // 处理 settings.xml：添加自动更新字段设置
    let settingsModified = false;
    let finalSettingsXml = context.settingsXml;
    if (!finalSettingsXml) {
      // 如果 settings.xml 不存在，创建它
      finalSettingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:updateFields w:val="true"/>
</w:settings>`;
      settingsModified = true;
    } else if (!finalSettingsXml.includes('<w:updateFields')) {
      // 如果 settings.xml 存在但不包含 updateFields，添加它
      const settingsMatch = finalSettingsXml.match(/(<w:settings[^>]*>)([\s\S]*?)(<\/w:settings>)/);
      if (settingsMatch) {
        finalSettingsXml = settingsMatch[1] + settingsMatch[2] + '  <w:updateFields w:val="true"/>' + '\n' + settingsMatch[3];
        settingsModified = true;
      } else {
        // 如果没有找到 settings 标签，替换整个内容
        finalSettingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:updateFields w:val="true"/>
</w:settings>`;
        settingsModified = true;
      }
    }

    // 如果 settings.xml 需要添加到 Content_Types.xml
    let contentTypesNeedsUpdate = false;
    if (settingsModified && !context.contentTypesXml.includes('word/settings.xml')) {
      const typesMatch = context.contentTypesXml.match(/(<Types[^>]*>)([\s\S]*?)(<\/Types>)/);
      if (typesMatch) {
        context.contentTypesXml = typesMatch[1] + typesMatch[2] + 
          '  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' + '\n' + 
          typesMatch[3];
        contentTypesNeedsUpdate = true;
      }
    }

    // 如果文档被修改，更新 ZIP 中的文件
    if (modified) {
      zip.file('word/document.xml', context.documentXml);
      // 始终更新关系文件（可能被创建或修改）
      zip.file('word/_rels/document.xml.rels', context.documentRelsXml);
    }

    // 如果 Content_Types.xml 需要更新，更新它
    if (contentTypesNeedsUpdate || modified) {
      zip.file('[Content_Types].xml', context.contentTypesXml);
    }

    // 如果 settings.xml 被修改，更新它
    if (settingsModified) {
      zip.file('word/settings.xml', finalSettingsXml);
    }

    // 生成新的 DOCX 文件
    const updated = await zip.generateAsync({ type: 'nodebuffer' });
    return Buffer.from(updated);
  }
}

/**
 * Word 自动目录处理器
 * 在 document.xml 中插入 Word 自动目录字段
 */
export class WordTocProcessor implements DocxProcessor {
  name = 'WordTocProcessor';

  async process(
    context: DocxProcessingContext,
    options?: {
      generateToc?: boolean;
    }
  ): Promise<boolean> {
    if (!options?.generateToc) {
      return false;
    }

    const { documentXml } = context;
    let updatedXml = documentXml;
    let modified = false;

    // 查找目录占位符：在HTML阶段我们插入了 <div data-toc-placeholder="true"></div>
    // html-to-docx 会将其转换为空的段落或div，我们需要查找并替换
    // 由于html-to-docx转换后的格式可能不同，我们需要查找目录标题后的位置
    // 目录标题应该是 h1，转换为 <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>...</w:p>
    // 我们查找目录标题段落和后面的占位符位置
    
    // 策略：查找包含目录标题的段落（通过查找 "目录" 或 "Table of Contents" 等文本）
    // 然后在目录标题段落后面查找占位符，替换为Word自动目录字段
    
    // 先查找目录标题（h1标签转换后的段落）
    // html-to-docx 会将 h1 转换为带有 Heading1 样式的段落
    // 我们需要找到包含目录标题文本的段落，然后在其后插入目录字段
    
    // 由于占位符可能被转换为空段落，我们查找目录标题后的第一个或第二个段落
    // 更简单的方法：查找目录标题段落，然后在后面查找分页标记前的位置插入目录字段
    
    // 构建 Word 自动目录字段（使用正确的Word字段格式）
    // Word TOC字段格式：TOC \o "1-4" \h \z \u
    // \o "1-4" 表示包含标题1到标题4
    // \h 表示创建超链接
    // \z 表示在Web视图中隐藏制表符和前导符
    // \u 表示使用样式而不是大纲级别
    // 注意：在JavaScript字符串中，反斜杠需要转义，所以使用\\表示单个反斜杠
    // 字段代码的结构：每个fldChar和instrText应该在单独的w:r中
    const tocFieldXml = `
    <w:p>
      <w:r>
        <w:fldChar w:fldCharType="begin"/>
      </w:r>
      <w:r>
        <w:instrText xml:space="preserve">
          TOC \\o "1-4" \\h \\z \\u
        </w:instrText>
      </w:r>
      <w:r>
        <w:fldChar w:fldCharType="separate"/>
      </w:r>
      <w:r>
        <w:t>请右键更新目录</w:t>
      </w:r>
      <w:r>
        <w:fldChar w:fldCharType="end"/>
      </w:r>
    </w:p>
    
    <w:p>
      <w:r>
        <w:br w:type="page"/>
      </w:r>
    </w:p>
    `;

    // 查找目录标题段落（包含 "目录" 或可能的其他语言翻译）
    // 查找包含 Heading1 样式且包含目录相关文本的段落
    // 由于html-to-docx的转换，我们需要查找可能的文本内容
    // 目录标题应该是一个 h1，转换后是 <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>目录</w:t></w:r></w:p>
    
    // 使用更通用的方法：查找包含目录标题的段落（Heading1样式），然后查找其后的空段落或分页标记
    // 目录占位符的div在HTML中是 <div data-toc-placeholder="true"></div>，转换为Word后可能是一个空段落
    
    // 查找目录标题段落的正则（包含Heading1样式）
    const tocTitleRegex = /<w:p[^>]*>[\s\S]*?<w:pPr[^>]*>[\s\S]*?<w:pStyle[^>]*w:val="Heading1"[^>]*\/?>[\s\S]*?<\/w:pPr>[\s\S]*?<w:r[^>]*>[\s\S]*?<w:t[^>]*>[\s\S]{0,50}(?:目录|Table of Contents|目次)[\s\S]{0,50}<\/w:t>[\s\S]*?<\/w:r>[\s\S]*?<\/w:p>/i;
    const tocTitleMatch = updatedXml.match(tocTitleRegex);
    
    if (tocTitleMatch) {
      const tocTitleEnd = tocTitleMatch.index! + tocTitleMatch[0].length;
      const afterTitle = updatedXml.substring(tocTitleEnd);
      
      // 查找目录标题后的占位符（可能是空段落或包含data-toc-placeholder的元素）
      // 查找目录标题后的第一个段落，如果它是空的或包含占位符标记，就替换它
      // 如果没有空段落，就在目录标题后直接插入
      
      // 尝试查找空段落（只包含段落属性但没有内容）或只有空白字符的段落
      // 匹配模式：<w:p>...</w:p> 其中内容为空或只包含空白字符
      // 需要考虑两种格式：<w:p><w:pPr>...</w:pPr></w:p> 或 <w:p></w:p> 或 <w:p> 只有空白 </w:p>
      const emptyParaRegex = /<w:p[^>]*>(?:<w:pPr[^>]*>[\s\S]*?<\/w:pPr>)?[\s]*<\/w:p>/;
      const emptyParaMatch = afterTitle.match(emptyParaRegex);
      
      if (emptyParaMatch) {
        // 找到空段落，替换为目录字段
        const placeholderEnd = tocTitleEnd + emptyParaMatch.index! + emptyParaMatch[0].length;
        updatedXml = updatedXml.substring(0, tocTitleEnd) + tocFieldXml + updatedXml.substring(placeholderEnd);
        modified = true;
        logger.info('已找到目录占位符并替换为Word自动目录字段');
      } else {
        // 没有找到空段落，直接在目录标题后插入目录字段
        // 但需要跳过可能的分页标记段落
        const pageBreakRegex = /<w:p[^>]*>[\s\S]*?<w:pPr[^>]*>[\s\S]*?<w:pageBreakAfter[^>]*\/?>[\s\S]*?<\/w:pPr>[\s\S]*?<\/w:p>/;
        const pageBreakMatch = afterTitle.match(pageBreakRegex);
        if (pageBreakMatch) {
          // 找到分页段落，在其后插入目录字段
          const pageBreakEnd = tocTitleEnd + pageBreakMatch.index! + pageBreakMatch[0].length;
          updatedXml = updatedXml.substring(0, pageBreakEnd) + tocFieldXml + updatedXml.substring(pageBreakEnd);
        } else {
          updatedXml = updatedXml.substring(0, tocTitleEnd) + tocFieldXml + updatedXml.substring(tocTitleEnd);
        }
        modified = true;
        logger.info('已在目录标题后插入Word自动目录字段');
      }
    } else {
      logger.warn('未找到目录标题段落，无法插入目录字段');
      return false;
    }

    if (modified) {
      context.documentXml = updatedXml;
    }

    return modified;
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

/**
 * OMML 公式插入处理器
 * 在 document.xml 中查找占位符标记，并替换为正确的 WordprocessingML 结构
 * Word 需要的格式：
 * - 行内公式：<w:r><w:rPr>...</w:rPr><m:oMath>...</m:oMath></w:r>
 * - 块级公式：<w:p><m:oMathPara><m:oMath>...</m:oMath></m:oMathPara></w:p>
 */
export class OMMLInsertionProcessor implements DocxProcessor {
  name = 'OMMLInsertionProcessor';

  async process(context: DocxProcessingContext, options?: any, progressCallback?: (current: number, total: number, message?: string) => void): Promise<boolean> {
    const { documentXml } = context;

    // 从options中获取公式占位符数据
    const formulaPlaceholders = options?.formulaPlaceholders as Map<number, { latex: string; display: boolean }> | undefined;
    
    if (!formulaPlaceholders || formulaPlaceholders.size === 0) {
      logger.debug('未提供公式占位符数据');
      return false;
    }

    let modified = false;
    let updatedXml = documentXml;

    // 导入转换函数
    const { convertLatexToMathML } = await import('../utils/mathml-converter');
    const { mml2omml } = await import('mathml2omml');

    const totalFormulas = formulaPlaceholders.size;
    logger.info(`开始处理 ${totalFormulas} 个公式占位符`);
    
    // 验证占位符：检查哪些占位符实际存在于 XML 中
    const existingPlaceholders = new Set<number>();
    const missingPlaceholders = new Set<number>();
    
    for (const index of formulaPlaceholders.keys()) {
      const placeholderText = `MATH_PLACEHOLDER_${index}`;
      if (updatedXml.includes(placeholderText)) {
        existingPlaceholders.add(index);
      } else {
        missingPlaceholders.add(index);
      }
    }
    
    if (missingPlaceholders.size > 0) {
      logger.warn(`发现 ${missingPlaceholders.size} 个占位符在 XML 中不存在，这些占位符将被跳过`, {
        missingCount: missingPlaceholders.size,
        totalCount: totalFormulas,
        missingIndices: Array.from(missingPlaceholders).slice(0, 10), // 只显示前10个
      });
    }
    
    logger.info(`验证完成：${existingPlaceholders.size} 个占位符存在于 XML 中，${missingPlaceholders.size} 个不存在`);

    // 缓存：相同的公式代码只转换一次
    const conversionCache = new Map<string, { wrappedContent: string; ommlContent: string }>();
    
    // 公式转换结果映射：index -> wrappedContent
    const formulaResults = new Map<number, string>();
    
    // 收集所有需要转换的公式（去重）
    // 只处理实际存在于 XML 中的占位符
    const uniqueFormulas = new Map<string, Array<{ index: number; isBlockLevel: boolean }>>();
    const sortedIndices = Array.from(existingPlaceholders).sort((a, b) => b - a);
    
    for (const index of sortedIndices) {
      const placeholderData = formulaPlaceholders.get(index);
      if (!placeholderData) continue;
      
      const { latex: latexCode, display: isBlockLevel } = placeholderData;
      const cacheKey = `${latexCode}|${isBlockLevel}`;
      
      if (!uniqueFormulas.has(cacheKey)) {
        uniqueFormulas.set(cacheKey, []);
      }
      uniqueFormulas.get(cacheKey)!.push({ index, isBlockLevel });
    }

    const uniqueCount = uniqueFormulas.size;
    logger.info(`去重后需要转换 ${uniqueCount} 个唯一公式`);

    // 并行转换函数
    const convertFormula = async (latexCode: string, isBlockLevel: boolean): Promise<{ wrappedContent: string; ommlContent: string }> => {
      const cacheKey = `${latexCode}|${isBlockLevel}`;
      
      // 检查缓存
      if (conversionCache.has(cacheKey)) {
        return conversionCache.get(cacheKey)!;
      }

      // 将 LaTeX 转换为 MathML
      let mathml: string | null = null;
      try {
        mathml = await convertLatexToMathML(latexCode, isBlockLevel);
      } catch (error) {
        logger.error(`LaTeX 转 MathML 失败:`, error, { latex: latexCode.substring(0, 50) });
        throw error;
      }

      if (!mathml) {
        throw new Error(`LaTeX 转 MathML 返回空结果: ${latexCode.substring(0, 50)}`);
      }

      // 清理 MathML（移除 MathJax 特定的属性）
      let cleanedMathml = mathml
        .replace(/<!--[\s\S]*?-->/g, '') // 移除 HTML 注释
        .replace(/\s+class="[^"]*"/g, '') // 移除 class 属性
        .replace(/\s+scriptlevel="[^"]*"/g, '') // 移除 scriptlevel
        .replace(/\s+maxsize="[^"]*"/g, '') // 移除 maxsize
        .replace(/\s+minsize="[^"]*"/g, '') // 移除 minsize
        .replace(/>\s+</g, '><') // 移除标签间空白
        .replace(/\s{2,}/g, ' ') // 规范化空白
        .trim();

      // 将 MathML 转换为 OMML
      let omml: string;
      try {
        omml = mml2omml(cleanedMathml);
      } catch (error) {
        logger.error(`MathML 转 OMML 失败:`, error);
        throw error;
      }

      // mml2omml 通常只返回 <m:oMath>...</m:oMath> 结构
      let ommlContent = omml.trim();
      
      // 验证 OMML 是否符合 XML 规范
      try {
        const testParser = new DOMParser({
          errorHandler: {
            warning: () => {},
            error: (e) => { throw e; },
            fatalError: (e) => { throw e; },
          },
        });
        const testXml = `<root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${ommlContent}</root>`;
        const testDoc = testParser.parseFromString(testXml, 'text/xml');
        const parseError = testDoc.getElementsByTagName('parsererror');
        if (parseError.length > 0) {
          throw new Error(`OMML XML 解析失败: ${parseError[0].textContent}`);
        }
      } catch (validationError) {
        logger.error(`OMML 验证失败，跳过该公式:`, validationError, { latex: latexCode.substring(0, 50) });
        throw new Error(`OMML 不符合 XML 规范: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
      }
      
      // 增强 OMML：在多个层级添加字体设置
      // 为每个 <m:r> 的 <m:rPr> 添加 <w:rPr> 字体设置
      // 特别处理：数字使用正体，而不是斜体
      const enhanceOMMLWithFonts = (omml: string): string => {
        let enhanced = omml;
        
        // 字体设置模板（普通文本，可能是斜体）
        const fontRPr = `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
        
        // 数字字体设置模板（正体，不斜体）
        const numberRPr = `<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
        
        // 首先处理数字：识别包含纯数字的 <m:r>，设置为正体
        // 匹配 <m:r>...</m:r>，检查其中的 <m:t> 是否只包含数字
        enhanced = enhanced.replace(
          /<m:r([^>]*)>([\s\S]*?)<\/m:r>/g,
          (match, attrs, content) => {
            // 查找 <m:t> 标签中的文本内容
            const textMatch = content.match(/<m:t[^>]*>([\s\S]*?)<\/m:t>/);
            if (textMatch) {
              const textContent = textMatch[1].trim();
              // 检查是否只包含数字（包括小数点、负号、科学计数法等数学符号）
              // 匹配纯数字：0-9、小数点、负号、正号、科学计数法的 e/E、乘号、空格等
              // 但必须至少包含一个数字
              const isNumber = /^[\d\s.,\-+eE×·×÷]+$/.test(textContent) && /[\d]/.test(textContent);
              
              if (isNumber) {
                // 这是数字，需要设置为正体（不斜体）
                // 处理 <m:rPr>
                let processedContent = content;
                
                // 如果已有 <m:rPr>，修改它
                if (content.includes('<m:rPr')) {
                  processedContent = content.replace(
                    /<m:rPr([^>]*)>([\s\S]*?)<\/m:rPr>/g,
                    (rPrMatch: string, rPrAttrs: string, rPrContent: string) => {
                      // 确保有 <m:sty m:val="p"/>（正体）
                      let newRPrContent = rPrContent;
                      if (!newRPrContent.includes('<m:sty')) {
                        newRPrContent = `<m:sty m:val="p"/>${newRPrContent}`;
                      } else {
                        // 替换现有的 sty 为 p（正体）
                        newRPrContent = newRPrContent.replace(/<m:sty[^>]*m:val="[^"]*"/, '<m:sty m:val="p"');
                      }
                      
                      // 添加或更新 w:rPr（确保没有斜体标记 <w:i/>）
                      if (newRPrContent.includes('<w:rPr')) {
                        // 替换现有的 w:rPr，移除 <w:i/> 标记
                        newRPrContent = newRPrContent.replace(
                          /<w:rPr[^>]*>([\s\S]*?)<\/w:rPr>/,
                          (wMatch: string, wContent: string) => {
                            // 移除 <w:i/> 标记
                            const cleanedWContent = wContent.replace(/<w:i[^>]*\/?>/g, '');
                            return numberRPr.replace('</w:rPr>', `${cleanedWContent}</w:rPr>`);
                          }
                        );
                      } else {
                        newRPrContent = `${newRPrContent}${numberRPr}`;
                      }
                      
                      return `<m:rPr${rPrAttrs}>${newRPrContent}</m:rPr>`;
                    }
                  );
                  
                  // 处理自闭合的 <m:rPr/>
                  processedContent = processedContent.replace(
                    /<m:rPr([^>]*)\/>/g,
                    (rPrMatch: string, rPrAttrs: string) => {
                      return `<m:rPr${rPrAttrs}><m:sty m:val="p"/>${numberRPr}</m:rPr>`;
                    }
                  );
                } else {
                  // 如果没有 <m:rPr>，添加一个
                  processedContent = `<m:rPr><m:sty m:val="p"/>${numberRPr}</m:rPr>${content}`;
                }
                
                return `<m:r${attrs}>${processedContent}</m:r>`;
              }
            }
            // 不是数字，返回原样
            return match;
          }
        );
        
        // 然后为所有其他 <m:r> 的 <m:rPr> 添加 <w:rPr> 字体设置（非数字）
        // 1. 为每个 <m:r> 的 <m:rPr> 添加 <w:rPr> 字体设置
        // 匹配 <m:rPr>...</m:rPr>
        enhanced = enhanced.replace(
          /<m:rPr([^>]*)>([\s\S]*?)<\/m:rPr>/g,
          (match, attrs, content) => {
            // 检查是否已有 w:rPr
            if (match.includes('<w:rPr')) {
              // 如果已有，检查是否是数字（通过检查是否有 <m:sty m:val="p"/>）
              if (content.includes('<m:sty m:val="p"')) {
                // 这是数字，保持正体设置（不添加斜体）
                return match;
              } else {
                // 普通文本，确保字体设置正确（替换现有的）
                return match.replace(
                  /<w:rPr[^>]*>[\s\S]*?<\/w:rPr>/,
                  fontRPr
                );
              }
            }
            // 在 m:rPr 内容末尾添加 w:rPr
            // 检查是否是数字（通过检查是否有 <m:sty m:val="p"/>）
            if (content.includes('<m:sty m:val="p"')) {
              // 这是数字，使用数字字体设置（不斜体）
              return `<m:rPr${attrs}>${content}${numberRPr}</m:rPr>`;
            } else {
              // 普通文本
              return `<m:rPr${attrs}>${content}${fontRPr}</m:rPr>`;
            }
          }
        );
        
        // 2. 处理自闭合的 <m:rPr/>
        enhanced = enhanced.replace(
          /<m:rPr([^>]*)\/>/g,
          (match, attrs) => {
            return `<m:rPr${attrs}>${fontRPr}</m:rPr>`;
          }
        );
        
        // 3. 为没有 <m:rPr> 的 <m:r> 添加 <m:rPr>
        // 匹配 <m:r> 后直接跟非 <m:rPr> 的内容
        // 需要先找到完整的 <m:r>...</m:r> 标签，然后检查内容
        enhanced = enhanced.replace(
          /<m:r([^>]*)>((?!<m:rPr)[\s\S]*?)<\/m:r>/g,
          (match, attrs, content) => {
            // 检查这个 <m:r> 是否包含数字
            const textMatch = content.match(/<m:t[^>]*>([\s\S]*?)<\/m:t>/);
            if (textMatch) {
              const textContent = textMatch[1].trim();
              const isNumber = /^[\d\s.,\-+eE×·×÷]+$/.test(textContent) && /[\d]/.test(textContent);
              if (isNumber) {
                return `<m:r${attrs}><m:rPr><m:sty m:val="p"/>${numberRPr}</m:rPr>${content}</m:r>`;
              }
            }
            return `<m:r${attrs}><m:rPr>${fontRPr}</m:rPr>${content}</m:r>`;
          }
        );
        
        return enhanced;
      };
      
      // 包装为 WordprocessingML 结构
      let wrappedContent: string;
      
      if (isBlockLevel) {
        // 块级公式：<w:p><m:oMathPara><m:oMathParaPr>...</m:oMathParaPr><m:oMath>...</m:oMath></m:oMathPara></w:p>
        // 提取 m:oMath 的内部内容
        const oMathMatch = ommlContent.match(/<m:oMath[^>]*>([\s\S]*?)<\/m:oMath>/);
        if (oMathMatch) {
          let innerOMML = oMathMatch[1];
          // 增强 OMML：添加字体设置（只增强内部内容）
          innerOMML = enhanceOMMLWithFonts(innerOMML);
          
          wrappedContent = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath><m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>${innerOMML}</m:oMath></m:oMathPara></w:p>`;
        } else {
          // 如果没有匹配到，直接增强整个内容
          const enhanced = enhanceOMMLWithFonts(ommlContent);
          wrappedContent = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath><m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>${enhanced}</m:oMath></m:oMathPara></w:p>`;
        }
      } else {
        // 行内公式：<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/></w:rPr><m:oMath>...</m:oMath></w:r>
        // 注意：行内公式使用 <m:oMath> 而不是 <w:oMath>，这是 OOXML 规范要求
        // 提取 m:oMath 的内部内容
        const oMathMatch = ommlContent.match(/<m:oMath[^>]*>([\s\S]*?)<\/m:oMath>/);
        if (oMathMatch) {
          let innerOMML = oMathMatch[1];
          // 增强 OMML：添加字体设置
          innerOMML = enhanceOMMLWithFonts(innerOMML);
          wrappedContent = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><m:oMath><m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>${innerOMML}</m:oMath></w:r>`;
        } else {
          // 如果没有匹配到，直接增强整个内容
          const enhanced = enhanceOMMLWithFonts(ommlContent);
          wrappedContent = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><m:oMath><m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>${enhanced}</m:oMath></w:r>`;
        }
      }

      const result = { wrappedContent, ommlContent };
      conversionCache.set(cacheKey, result);
      return result;
    };

    // 并发池：最大10个并发
    const MAX_CONCURRENT = 10;
    let completedCount = 0;
    let failedCount = 0;
    const conversionTasks: Array<Promise<void>> = [];
    
    // 处理每个唯一公式
    for (const [cacheKey, indices] of uniqueFormulas.entries()) {
      const [latexCode, isBlockLevelStr] = cacheKey.split('|');
      const isBlockLevel = isBlockLevelStr === 'true';
      
      // 创建转换任务
      const task = convertFormula(latexCode, isBlockLevel)
        .then((result) => {
          // 为所有使用相同公式的占位符设置结果
          for (const { index } of indices) {
            formulaResults.set(index, result.wrappedContent);
          }
          completedCount++;
          if (progressCallback) {
            // 报告转换进度（转换阶段占50%）
            const conversionProgress = Math.floor((completedCount / uniqueCount) * 50);
            progressCallback(conversionProgress, 100, `正在转换公式 (${completedCount}/${uniqueCount})`);
          }
        })
        .catch((error) => {
          failedCount++;
          logger.error(`公式转换失败: ${latexCode.substring(0, 50)}...`, error);
          // 即使失败也更新进度
          if (progressCallback) {
            const totalProcessed = completedCount + failedCount;
            const conversionProgress = Math.floor((totalProcessed / uniqueCount) * 50);
            progressCallback(conversionProgress, 100, `正在转换公式 (${totalProcessed}/${uniqueCount})`);
          }
        });
      
      conversionTasks.push(task);
    }
    
    // 使用并发池控制：每次最多处理 MAX_CONCURRENT 个任务
    // 将任务分批处理
    const batches: Array<Promise<void>[]> = [];
    for (let i = 0; i < conversionTasks.length; i += MAX_CONCURRENT) {
      batches.push(conversionTasks.slice(i, i + MAX_CONCURRENT));
    }
    
    // 按批次执行，每批最多 MAX_CONCURRENT 个并发
    for (const batch of batches) {
      await Promise.all(batch);
    }
    
    logger.info(`公式转换完成: 成功 ${completedCount}, 失败 ${failedCount}, 总计 ${uniqueCount}`);

    // 一次性解析 XML 文档（避免重复解析）
    const parser = new DOMParser({
      errorHandler: {
        warning: (w) => logger.warn('XML 解析警告:', w),
        error: (e) => logger.error('XML 解析错误:', e),
        fatalError: (e) => logger.error('XML 解析致命错误:', e),
      },
    });
    
    let xmlDoc = parser.parseFromString(updatedXml, 'text/xml');
    
    // 检查解析错误
    const parseError = xmlDoc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
      logger.error(`XML 解析失败: ${parseError[0].textContent}`);
      return modified;
    }
    
    // 一次性获取所有文本节点（避免重复遍历）
    const allTextNodes = this.findAllTextNodes(xmlDoc);
    logger.debug(`找到 ${allTextNodes.length} 个文本节点`);
    
    // 并行查找所有占位符的位置（只读操作，可以并行）
    interface PlaceholderLocation {
      index: number;
      placeholderText: string;
      textNode: Text;
      targetParent: Element;
      wrappedContent: string;
      isBlockLevel: boolean;
    }
    
    const findPlaceholderLocation = async (index: number): Promise<PlaceholderLocation | null> => {
      const placeholderData = formulaPlaceholders.get(index);
      if (!placeholderData) return null;
      
      const { display: isBlockLevel } = placeholderData;
      const placeholderText = `MATH_PLACEHOLDER_${index}`;
      
      // 从缓存中获取转换结果
      const wrappedContent = formulaResults.get(index);
      if (!wrappedContent) {
        logger.warn(`占位符 ${index} 没有转换结果，跳过`);
        return null;
      }
      
      // 检查占位符在 XML 中的存在情况（考虑可能被转义或分割）
      // 占位符格式：MATH_PLACEHOLDER_123
      // 可能的情况：
      // 1. 完整存在：MATH_PLACEHOLDER_123
      // 2. 被转义：MATH_PLACEHOLDER_123（下划线可能被处理）
      // 3. 被分割：MATH_PLACEHOLDER_ 和 123 在不同节点
      const placeholderParts = placeholderText.split('_');
      const hasPlaceholderInXml = updatedXml.includes(placeholderText) || 
                                   updatedXml.includes(placeholderText.replace(/_/g, '&#95;')) ||
                                   (placeholderParts.length > 0 && updatedXml.includes(placeholderParts[0]));
      
      if (!hasPlaceholderInXml) {
        logger.debug(`占位符 ${placeholderText} 在 XML 中不存在，可能已被处理或格式不同`);
        return null;
      }
      
      // 在已获取的文本节点中查找（支持占位符被分割到多个节点的情况）
      let placeholderTextNode: Text | null = null;
      
      // 首先尝试精确匹配
      for (const textNode of allTextNodes) {
        const nodeValue = textNode.nodeValue;
        if (nodeValue && (nodeValue.trim() === placeholderText || nodeValue === placeholderText)) {
          placeholderTextNode = textNode as Text;
          break;
        }
      }
      
      // 如果精确匹配失败，尝试包含匹配（占位符可能被分割）
      if (!placeholderTextNode) {
        for (const textNode of allTextNodes) {
          const nodeValue = textNode.nodeValue;
          if (nodeValue && nodeValue.includes(placeholderText)) {
            placeholderTextNode = textNode as Text;
            break;
          }
        }
      }
      
      // 如果还是找不到，尝试查找包含占位符的父元素（占位符可能被分割到多个文本节点）
      if (!placeholderTextNode) {
        // 查找包含占位符关键部分的元素
        const searchKey = `MATH_PLACEHOLDER_${index}`;
        const allElements = xmlDoc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
          const element = allElements[i];
          const textContent = element.textContent || '';
          // 检查是否包含占位符的关键部分
          if (textContent.includes('MATH_PLACEHOLDER') && textContent.includes(index.toString())) {
            // 查找该元素下的所有文本节点
            const childTextNodes = this.findAllTextNodes(element);
            for (const textNode of childTextNodes) {
              const nodeValue = textNode.nodeValue || '';
              // 检查文本节点是否包含占位符的任何部分
              if (nodeValue.includes('MATH_PLACEHOLDER') || nodeValue.includes(index.toString())) {
                // 检查父元素的完整文本内容是否包含完整占位符
                if (textContent.includes(searchKey)) {
                  placeholderTextNode = textNode as Text;
                  break;
                }
              }
            }
            if (placeholderTextNode) break;
          }
        }
      }
      
      // 最后尝试：通过元素的完整文本内容查找
      if (!placeholderTextNode) {
        const searchKey = `MATH_PLACEHOLDER_${index}`;
        const allElements = xmlDoc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
          const element = allElements[i];
          const textContent = element.textContent || '';
          if (textContent.includes(searchKey)) {
            // 找到包含占位符的元素，使用第一个文本节点
            const childTextNodes = this.findAllTextNodes(element);
            if (childTextNodes.length > 0) {
              placeholderTextNode = childTextNodes[0];
              break;
            }
          }
        }
      }
      
      if (!placeholderTextNode) {
        logger.warn(`未找到包含占位符 ${placeholderText} 的文本节点，但 XML 中可能存在该文本`);
        return null;
      }
      
      // 找到包含占位符的父元素（w:r 或 w:p）
      let targetParent: Element | null = null;
      let fallbackParent: Element | null = null;
      let current: Node | null = placeholderTextNode;
      
      while (current && current.nodeType !== 9) {
        if (current.nodeType === 1) {
          const element = current as Element;
          const tagName = element.tagName;
          const localName = (element as any).localName || tagName.split(':').pop() || tagName;
          const isParagraph = localName === 'p' || tagName === 'w:p' || tagName === 'p';
          const isRun = localName === 'r' || tagName === 'w:r' || tagName === 'r';
          
          if (isBlockLevel && isParagraph) {
            targetParent = element;
            break;
          } else if (!isBlockLevel && isRun) {
            targetParent = element;
            break;
          } else if (!isBlockLevel && isParagraph && !fallbackParent) {
            fallbackParent = element;
          }
        }
        current = current.parentNode;
      }
      
      // 对于行内公式，如果没找到 w:r，使用 w:p 作为备用
      if (!targetParent && !isBlockLevel && fallbackParent) {
        targetParent = fallbackParent;
      }
      
      if (!targetParent) {
        logger.warn(`未找到占位符 ${index} 的目标父节点`);
        return null;
      }
      
      // 对于行内公式，如果 targetParent 是 w:p，需要找到包含占位符的 w:r
      let actualTargetParent: Element = targetParent;
      if (!isBlockLevel) {
        const tagName = targetParent.tagName;
        const localName = (targetParent as any).localName || tagName.split(':').pop() || tagName;
        const isParagraph = localName === 'p' || tagName === 'w:p' || tagName === 'p';
        
        if (isParagraph) {
          const runs = targetParent.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'r');
          for (let i = 0; i < runs.length; i++) {
            const run = runs[i];
            const textNodes = this.findAllTextNodes(run);
            for (const textNode of textNodes) {
              if (textNode.nodeValue && textNode.nodeValue.includes(placeholderText)) {
                actualTargetParent = run;
                break;
              }
            }
            if (actualTargetParent !== targetParent) break;
          }
          
          if (actualTargetParent === targetParent) {
            // 如果找不到 w:r，尝试查找 w:t
            const texts = targetParent.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't');
            for (let i = 0; i < texts.length; i++) {
              const text = texts[i];
              const textNodes = this.findAllTextNodes(text);
              for (const textNode of textNodes) {
                if (textNode.nodeValue && textNode.nodeValue.includes(placeholderText)) {
                  const parentRun = textNode.parentNode;
                  if (parentRun && parentRun.nodeType === 1) {
                    const runLocalName = ((parentRun as Element) as any).localName || (parentRun as Element).tagName.split(':').pop();
                    if (runLocalName === 'r') {
                      actualTargetParent = parentRun as Element;
                      break;
                    }
                  }
                }
              }
              if (actualTargetParent !== targetParent) break;
            }
          }
        }
      }
      
      return {
        index,
        placeholderText,
        textNode: placeholderTextNode,
        targetParent: actualTargetParent,
        wrappedContent,
        isBlockLevel,
      };
    };
    
    // 并行查找所有占位符位置（只查找存在于 XML 中的占位符）
    const locationTasks = sortedIndices.map(index => findPlaceholderLocation(index));
    const locations = (await Promise.all(locationTasks)).filter((loc): loc is PlaceholderLocation => loc !== null);
    
    const foundCount = locations.length;
    const expectedCount = existingPlaceholders.size;
    
    if (foundCount < expectedCount) {
      logger.warn(`占位符查找不完整：期望找到 ${expectedCount} 个，实际找到 ${foundCount} 个`);
    }
    
    logger.info(`找到 ${foundCount} 个占位符位置（期望 ${expectedCount} 个），开始替换`);
    
    // 按索引从大到小排序，避免索引偏移问题
    locations.sort((a, b) => b.index - a.index);
    
    // 解析所有新内容（可以并行）
    const newContentParser = new DOMParser({
      errorHandler: {
        warning: (w) => logger.warn('OMML 解析警告:', w),
        error: (e) => logger.error('OMML 解析错误:', e),
        fatalError: (e) => logger.error('OMML 解析致命错误:', e),
      },
    });
    
    const parseNewContent = (wrappedContent: string): Node | null => {
      const wrappedForParsing = `<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${wrappedContent}</root>`;
      const newContentDoc = newContentParser.parseFromString(wrappedForParsing, 'text/xml');
      
      const newParseError = newContentDoc.getElementsByTagName('parsererror');
      if (newParseError.length > 0) {
        logger.error(`新 OMML 内容解析失败: ${newParseError[0].textContent}`);
        return null;
      }
      
      const rootElement = newContentDoc.documentElement;
      if (!rootElement || !rootElement.firstChild) {
        return null;
      }
      
      return xmlDoc.importNode(rootElement.firstChild, true);
    };
    
    // 并行解析所有新内容
    const parseTasks = locations.map(loc => Promise.resolve(parseNewContent(loc.wrappedContent)));
    const newNodes = await Promise.all(parseTasks);
    
    // 按顺序替换（避免索引偏移）
    let replacementCount = 0;
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i];
      const newNode = newNodes[i];
      
      if (!newNode) {
        logger.warn(`无法解析占位符 ${location.index} 的新内容`);
        continue;
      }
      
      const parentOfTarget = location.targetParent.parentNode;
      if (parentOfTarget) {
        try {
          parentOfTarget.replaceChild(newNode, location.targetParent);
          modified = true;
          replacementCount++;
          logger.debug(`已替换占位符 ${location.index} (${location.isBlockLevel ? '块级' : '行内'})`);
          
          // 报告替换进度
          if (progressCallback) {
            const replacementProgress = 50 + Math.floor((replacementCount / totalFormulas) * 50);
            progressCallback(replacementProgress, 100, `正在替换公式 (${replacementCount}/${totalFormulas})`);
          }
        } catch (replaceError) {
          logger.error(`替换占位符 ${location.index} 的节点时发生错误:`, replaceError);
        }
      }
    }
    
    // 最后序列化一次 XML
    if (modified) {
      const serializer = new XMLSerializer();
      updatedXml = serializer.serializeToString(xmlDoc);
    }

    if (modified) {
      context.documentXml = updatedXml;
      logger.info(`已处理 ${formulaPlaceholders.size} 个公式占位符`);
    }

    return modified;
  }

  /**
   * 查找文档中的所有文本节点
   * 使用迭代而非递归，避免栈溢出
   */
  private findAllTextNodes(node: Node | null): Text[] {
    const textNodes: Text[] = [];
    
    if (!node) {
      return textNodes;
    }
    
    // 使用栈进行迭代遍历，避免递归导致的栈溢出
    const stack: Node[] = [node];
    
    while (stack.length > 0) {
      const currentNode = stack.pop()!;
      
      if (currentNode.nodeType === 3) { // TEXT_NODE
        textNodes.push(currentNode as Text);
      } else {
        // 将子节点添加到栈中（从后往前添加，保持遍历顺序）
        const childNodes = currentNode.childNodes;
        if (childNodes && childNodes.length > 0) {
          // 从后往前添加，这样从栈中取出时是正序
          for (let i = childNodes.length - 1; i >= 0; i--) {
            stack.push(childNodes[i]);
          }
        }
      }
    }
    
    return textNodes;
  }
}

/**
 * Document XML 修复处理器
 * 修复对齐、分页等问题
 * 注意：语言设置在html-to-docx的documentOptions中已经配置
 */
export class DocumentXmlFixProcessor implements DocxProcessor {
  name = 'DocumentXmlFixProcessor';

  async process(context: DocxProcessingContext): Promise<boolean> {
    const { documentXml } = context;
    let modified = false;
    let updatedXml = documentXml;

    // 1. 修复所有段落的对齐方式：将所有段落的对齐方式改为左对齐（left）
    // 但保留明确居中的段落（如公式、封面标题等）
    // 策略：将分散对齐、两端对齐和右对齐改为左对齐，保留居中对齐
    
    // 先移除所有分散对齐、两端对齐和右对齐，改为左对齐（但保留center）
    const justifyRegex = /<w:jc\s+w:val="(both|distribute|right|justify)"[^>]*\/?>/g;
    if (justifyRegex.test(updatedXml)) {
      updatedXml = updatedXml.replace(justifyRegex, '<w:jc w:val="left"/>');
      modified = true;
      logger.debug('已修复分散对齐、两端对齐和右对齐为左对齐');
    }
    
    // 此外，确保所有没有对齐设置的段落都添加左对齐
    // 查找所有段落，如果段落属性中没有对齐设置（且不是center），添加左对齐
    const paragraphRegex = /<w:p([^>]*)>/g;
    let paragraphMatch;
    const paragraphsToFix: Array<{ start: number; end: number; hasAlign: boolean }> = [];
    
    while ((paragraphMatch = paragraphRegex.exec(updatedXml)) !== null) {
      const paraStart = paragraphMatch.index;
      const paraTag = paragraphMatch[0];
      
      // 查找这个段落对应的段落属性
      const afterPara = updatedXml.substring(paraStart + paraTag.length);
      const pPrMatch = afterPara.match(/<w:pPr[^>]*>([\s\S]*?)<\/w:pPr>/);
      
      if (pPrMatch) {
        // 有段落属性，检查是否有对齐设置
        const pPrContent = pPrMatch[1];
        const hasJc = /<w:jc[^>]*w:val="center"[^>]*\/?>/.test(pPrContent);
        const hasAlign = /<w:jc/.test(pPrContent);
        
        paragraphsToFix.push({
          start: paraStart + paraTag.length,
          end: paraStart + paraTag.length + pPrMatch.index! + pPrMatch[0].length,
          hasAlign: hasAlign && !hasJc  // 如果有对齐但不是center，已经在上面处理了
        });
      }
    }
    
    // 对于没有对齐设置的段落，从后往前添加左对齐（避免索引偏移）
    for (let i = paragraphsToFix.length - 1; i >= 0; i--) {
      const para = paragraphsToFix[i];
      if (!para.hasAlign) {
        // 查找段落属性位置
        const pPrMatch = updatedXml.substring(para.start).match(/<w:pPr([^>]*)>([\s\S]*?)<\/w:pPr>/);
        if (pPrMatch) {
          const pPrStart = para.start + pPrMatch.index!;
          const pPrEnd = pPrStart + pPrMatch[0].length;
          const pPrAttrs = pPrMatch[1];
          const pPrContent = pPrMatch[2];
          
          // 在段落属性内容开头添加左对齐
          const newPPrContent = `<w:jc w:val="left"/>${pPrContent}`;
          updatedXml = updatedXml.substring(0, pPrStart) + 
                      `<w:pPr${pPrAttrs}>${newPPrContent}</w:pPr>` +
                      updatedXml.substring(pPrEnd);
          modified = true;
        }
      }
    }

    // 2. 修复目录结尾的换页符
    // 查找目录标题段落，在其后的最后一个目录项段落后添加换页符
    const tocTitleRegex = /<w:p[^>]*>[\s\S]*?目录[\s\S]*?<\/w:p>/i;
    const tocTitleMatch = updatedXml.match(tocTitleRegex);
    if (tocTitleMatch) {
      const tocTitleEnd = tocTitleMatch.index! + tocTitleMatch[0].length;
      const afterTocTitle = updatedXml.substring(tocTitleEnd);
      
      // 查找目录项段落（不包含标题样式，不包含公式）
      // 查找直到遇到下一个标题或正文开始
      const tocItemsEndRegex = /<\/w:p>\s*(?=<w:p[^>]*>[\s\S]*?(?:<w:pStyle[^>]*w:val="Heading|目录结束标记))/;
      const tocItemsEndMatch = afterTocTitle.match(tocItemsEndRegex);
      
      if (tocItemsEndMatch) {
        const tocItemsEndPos = tocTitleEnd + tocItemsEndMatch.index! + tocItemsEndMatch[0].length;
        // 检查是否已经有换页符
        const checkContent = updatedXml.substring(Math.max(0, tocItemsEndPos - 100), Math.min(updatedXml.length, tocItemsEndPos + 500));
        if (!checkContent.includes('<w:pageBreakAfter') && !checkContent.includes('<w:pageBreakBefore')) {
          // 插入一个带换页符的空段落
          const pageBreakPara = '<w:p><w:pPr><w:pageBreakAfter/></w:pPr></w:p>';
          updatedXml = updatedXml.substring(0, tocItemsEndPos) + pageBreakPara + updatedXml.substring(tocItemsEndPos);
          modified = true;
          logger.debug('已在目录结尾添加换页符');
        }
      } else {
        // 如果找不到明确的结束位置，在目录标题后查找最后一个段落
        // 简单策略：在目录标题后的第10个段落后添加换页符（假设目录项不超过10个）
        const paragraphsAfterToc = afterTocTitle.match(/<\/w:p>/g);
        if (paragraphsAfterToc && paragraphsAfterToc.length > 0) {
          // 找到最后一个段落的结束位置
          let lastParaEndPos = tocTitleEnd;
          for (let i = 0; i < paragraphsAfterToc.length; i++) {
            lastParaEndPos = updatedXml.indexOf('</w:p>', lastParaEndPos) + 6;
          }
          
          const checkContent = updatedXml.substring(Math.max(0, lastParaEndPos - 100), Math.min(updatedXml.length, lastParaEndPos + 500));
          if (!checkContent.includes('<w:pageBreakAfter') && !checkContent.includes('<w:pageBreakBefore')) {
            const pageBreakPara = '<w:p><w:pPr><w:pageBreakAfter/></w:pPr></w:p>';
            updatedXml = updatedXml.substring(0, lastParaEndPos) + pageBreakPara + updatedXml.substring(lastParaEndPos);
            modified = true;
            logger.debug('已在目录结尾添加换页符（备用策略）');
          }
        }
      }
    }

    // 3. 修复代码框样式（如果需要的话）
    // html-to-docx 应该能处理基本的CSS样式，但如果需要可以在document.xml中进一步处理
    // 暂时跳过，因为CSS样式应该已经通过html-to-docx处理了

    if (modified) {
      context.documentXml = updatedXml;
      logger.info('已修复 document.xml 中的对齐和分页问题');
    }

    return modified;
  }
}
