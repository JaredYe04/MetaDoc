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
import { 
  getFormulaConversionConfig, 
  shouldLogVerbose
} from '../utils/formula-conversion-config';

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
    // 目录标题现在是一个普通的加粗居中段落，不是 Heading1 样式
    // 转换后的格式：<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>目录</w:t></w:r></w:p>
    
    // 使用更通用的方法：查找包含目录标题的段落（居中、加粗、大字号），然后查找其后的空段落或分页标记
    // 目录占位符的div在HTML中是 <div data-toc-placeholder="true"></div>，转换为Word后可能是一个空段落
    
    // 查找目录标题段落的正则（居中、加粗、包含目录文本，但不包含 Heading 样式）
    // 改进：使用更精确的匹配，确保只匹配单个段落，不跨越多个段落
    // 匹配模式：<w:p>...</w:p> 其中包含居中、加粗和目录文本
    const tocTitleRegex = /<w:p[^>]*>[\s\S]*?<w:pPr[^>]*>[\s\S]*?<w:jc[^>]*w:val="center"[^>]*\/?>[\s\S]*?<\/w:pPr>[\s\S]*?<w:r[^>]*>[\s\S]*?<w:rPr[^>]*>[\s\S]*?<w:b[^>]*\/?>[\s\S]*?<\/w:rPr>[\s\S]*?<w:t[^>]*>[\s\S]{0,50}(?:目录|Table of Contents|目次|Contents)[\s\S]{0,50}<\/w:t>[\s\S]*?<\/w:r>[\s\S]*?<\/w:p>/i;
    const tocTitleMatch = updatedXml.match(tocTitleRegex);
    
    if (tocTitleMatch) {
      // 确保匹配的是完整的段落（以</w:p>结尾）
      const matchedText = tocTitleMatch[0];
      if (!matchedText.trim().endsWith('</w:p>')) {
        logger.warn('目录标题段落匹配不完整，可能匹配到了多个段落');
      }
      
      // 找到目录标题段落的结束位置（</w:p>标签的结束位置）
      // 这是插入目录字段的正确位置
      const tocTitleEnd = tocTitleMatch.index! + tocTitleMatch[0].length;
      
      // 验证：确保tocTitleEnd确实是</w:p>的结束位置
      const beforeInsert = updatedXml.substring(Math.max(0, tocTitleEnd - 10), tocTitleEnd);
      if (!beforeInsert.includes('</w:p>')) {
        logger.warn('目录标题结束位置验证失败，可能匹配位置不正确');
      }
      
      const afterTitle = updatedXml.substring(tocTitleEnd);
      
      // 策略：总是在目录标题后插入新段落（包含目录字段和分页符），而不是替换现有段落
      // 这样可以避免误删第一个标题段落
      // 如果存在占位符空段落，先删除它，然后插入新段落
      
      // 尝试查找占位符空段落（只包含段落属性但没有内容）
      // 匹配模式：<w:p>...</w:p> 其中内容为空或只包含空白字符
      // 需要确保只匹配真正的空段落，不能匹配包含文本内容的段落
      const emptyParaRegex = /<w:p[^>]*>(?:<w:pPr[^>]*>[\s\S]*?<\/w:pPr>)?[\s]*<\/w:p>/;
      const emptyParaMatch = afterTitle.match(emptyParaRegex);
      
      // 验证匹配到的段落确实是空的（不包含任何文本运行或文本节点）
      let isValidEmptyPara = false;
      let placeholderStart = -1;
      let placeholderEnd = -1;
      
      if (emptyParaMatch) {
        const matchedPara = emptyParaMatch[0];
        // 检查段落中是否包含文本运行（w:r）或文本节点（w:t）
        // 如果包含，说明不是空段落，可能是第一个标题被误匹配了
        const hasTextRun = /<w:r[^>]*>/.test(matchedPara);
        const hasText = /<w:t[^>]*>/.test(matchedPara);
        const hasHeadingStyle = /<w:pStyle[^>]*w:val="Heading/.test(matchedPara);
        // 如果包含文本运行、文本或标题样式，说明不是空段落
        isValidEmptyPara = !hasTextRun && !hasText && !hasHeadingStyle;
        
        if (isValidEmptyPara) {
          placeholderStart = tocTitleEnd + emptyParaMatch.index!;
          placeholderEnd = placeholderStart + emptyParaMatch[0].length;
        }
      }
      
      // 策略：总是在目录标题后（tocTitleEnd）插入新段落（包含目录字段和分页符）
      // 如果存在占位符空段落且在目录标题之后，先删除它，然后再插入目录字段
      
      // 如果找到了占位符空段落，且它在目录标题之后，先删除它
      if (isValidEmptyPara && placeholderStart >= 0 && placeholderEnd >= 0 && placeholderStart > tocTitleEnd) {
        // 占位符在目录标题之后，先删除它
        updatedXml = updatedXml.substring(0, placeholderStart) + updatedXml.substring(placeholderEnd);
        // 由于删除了占位符，tocTitleEnd 的位置不变（因为占位符在目录标题之后）
        logger.info('已删除目录占位符空段落');
      }
      
      // 在目录标题后插入目录字段（总是在目录标题后，确保在第一个标题之前）
      updatedXml = updatedXml.substring(0, tocTitleEnd) + tocFieldXml + updatedXml.substring(tocTitleEnd);
      modified = true;
      logger.info('已在目录标题后插入Word自动目录字段');
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
  private escapeXml(text: string | null | undefined): string {
    if (text === null || text === undefined) {
      return '';
    }
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

/**
 * OMML 公式插入处理器
 * 在 document.xml 中查找文本占位符，并替换为正确的 WordprocessingML 结构
 * Word 需要的格式：
 * - 行内公式：<w:r><w:rPr>...</w:rPr><m:oMath>...</m:oMath></w:r>
 * - 块级公式：<w:p><m:oMathPara><m:oMath>...</m:oMath></m:oMathPara></w:p>
 * 
 * 占位符格式（文本）：
 * - 块级公式：[MATH_PLACEHOLDER_0]
 * - 行内公式：[MATH_PLACEHOLDER_0_INLINE]
 */
export class OMMLInsertionProcessor implements DocxProcessor {
  name = 'OMMLInsertionProcessor';
  
  // 最大并发转换数
  private static readonly MAX_CONCURRENT = 10;

  /**
   * 转义 XML 特殊字符
   */
  private escapeXml(text: string | null | undefined): string {
    if (text === null || text === undefined) {
      return '';
    }
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async process(context: DocxProcessingContext, options?: any, progressCallback?: (current: number, total: number, message?: string) => void): Promise<boolean> {
    const { documentXml } = context;

    // 从options中获取公式占位符数据
    const formulaPlaceholders = options?.formulaPlaceholders as Map<number, { latex: string; display: boolean }> | undefined;
    
    if (!formulaPlaceholders || formulaPlaceholders.size === 0) {
      logger.debug('未提供公式占位符数据');
      return false;
    }

    const totalFormulas = formulaPlaceholders.size;
    logger.info(`开始处理 ${totalFormulas} 个公式占位符`);

    // 验证占位符存在性
    const { existingPlaceholders, missingPlaceholders } = this.validatePlaceholders(documentXml, formulaPlaceholders);
    
    if (existingPlaceholders.size === 0) {
      logger.warn('没有找到任何占位符，跳过公式处理');
      return false;
    }

    // 去重公式
    const { uniqueFormulas, sortedIndices } = this.deduplicateFormulas(existingPlaceholders, formulaPlaceholders);
    const uniqueCount = uniqueFormulas.size;
    logger.info(`去重后需要转换 ${uniqueCount} 个唯一公式`);

    // 转换公式
    const { formulaResults, failedIndices } = await this.convertFormulas(
      uniqueFormulas,
      progressCallback,
      uniqueCount,
      totalFormulas
    );

    // 如果所有公式都转换失败，使用后备方案
    if (formulaResults.size === 0 && failedIndices.size > 0) {
      logger.warn('所有公式转换失败，使用后备方案（显示 LaTeX 代码）');
      return this.applyFallbackSolution(context, documentXml, formulaPlaceholders, existingPlaceholders);
    }

    // 查找并替换占位符
    return await this.findAndReplacePlaceholders(
      context,
      documentXml,
      formulaPlaceholders,
      formulaResults,
      sortedIndices,
      existingPlaceholders,
      totalFormulas,
      progressCallback
    );
  }

  /**
   * 验证占位符在 XML 中的存在性
   */
  private validatePlaceholders(
    documentXml: string,
    formulaPlaceholders: Map<number, { latex: string; display: boolean }>
  ): { existingPlaceholders: Set<number>; missingPlaceholders: Set<number> } {
    const existingPlaceholders = new Set<number>();
    const missingPlaceholders = new Set<number>();
    
    // 先检查 XML 中是否有任何占位符文本（用于调试）
    const allPlaceholderMatches = documentXml.match(/MATH_PLACEHOLDER_\d+/g);
    if (allPlaceholderMatches) {
      logger.debug(`在 XML 中找到 ${allPlaceholderMatches.length} 个占位符文本片段`);
      // 显示前几个匹配
      const uniqueMatches = [...new Set(allPlaceholderMatches)].slice(0, 10);
      logger.debug(`占位符示例: ${uniqueMatches.join(', ')}`);
    } else {
      logger.warn('在 XML 中未找到任何占位符文本，可能占位符格式不正确或被转换掉了');
      // 尝试查找其他可能的格式
      const underscoreMatches = documentXml.match(/&#95;&#95;MATH_PLACEHOLDER_\d+&#95;&#95;/g);
      if (underscoreMatches) {
        logger.debug(`找到转义形式的占位符: ${underscoreMatches.length} 个`);
      }
    }
    
    for (const index of formulaPlaceholders.keys()) {
      // 文本占位符格式：[MATH_PLACEHOLDER_0] 或 [MATH_PLACEHOLDER_0_INLINE]
      const blockPlaceholder = `[MATH_PLACEHOLDER_${index}]`;
      const inlinePlaceholder = `[MATH_PLACEHOLDER_${index}_INLINE]`;
      
      // 检查占位符是否存在（可能被转义或分割）
      // 尝试多种可能的格式
      const patterns = [
        blockPlaceholder,
        inlinePlaceholder,
        blockPlaceholder.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;'),  // 方括号被转义
        inlinePlaceholder.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;'),
        `MATH_PLACEHOLDER_${index}`,  // 只有核心部分（可能被分割）
        `MATH_PLACEHOLDER_${index}_INLINE`,  // 行内占位符的核心部分
      ];
      
      let found = false;
      for (const pattern of patterns) {
        if (documentXml.includes(pattern)) {
          existingPlaceholders.add(index);
          found = true;
          break;
        }
      }
      
      if (!found) {
        missingPlaceholders.add(index);
      }
    }
    
    if (missingPlaceholders.size > 0) {
      logger.warn(`发现 ${missingPlaceholders.size} 个占位符在 XML 中不存在，这些占位符将被跳过`, {
        missingCount: missingPlaceholders.size,
        totalCount: formulaPlaceholders.size,
        missingIndices: Array.from(missingPlaceholders).slice(0, 10),
      });
      
      // 调试：检查前几个缺失的占位符，看看 XML 中实际有什么
      if (missingPlaceholders.size > 0) {
        for(const missing of missingPlaceholders) {
          const placeholderData = formulaPlaceholders.get(missing);
          if (placeholderData) {
            logger.debug(`示例缺失占位符 ${missing}: LaTeX="${placeholderData.latex}", display=${placeholderData.display}`);
            // 查找 XML 中是否有类似的文本
            const searchKey = `MATH_PLACEHOLDER_${missing}`;
            const foundInXml = documentXml.includes(searchKey);
            logger.debug(`占位符 ${missing} 的核心部分 "${searchKey}" 在 XML 中${foundInXml ? '存在' : '不存在'}`);
          }
        }
      }
    }
    
    logger.info(`验证完成：${existingPlaceholders.size} 个占位符存在于 XML 中，${missingPlaceholders.size} 个不存在`);
    
    return { existingPlaceholders, missingPlaceholders };
  }

  /**
   * 去重公式（相同 LaTeX 代码只转换一次）
   */
  private deduplicateFormulas(
    existingPlaceholders: Set<number>,
    formulaPlaceholders: Map<number, { latex: string; display: boolean }>
  ): {
    uniqueFormulas: Map<string, Array<{ index: number; isBlockLevel: boolean }>>;
    sortedIndices: number[];
  } {
    const uniqueFormulas = new Map<string, Array<{ index: number; isBlockLevel: boolean }>>();
    const sortedIndices = Array.from(existingPlaceholders).sort((a, b) => b - a);
    
    const verbose = shouldLogVerbose();
    
    for (const index of sortedIndices) {
      const placeholderData = formulaPlaceholders.get(index);
      if (!placeholderData) continue;
      
      const { latex: latexCode, display: isBlockLevel } = placeholderData;
      if (verbose) {
        logger.debug(`[去重公式] 索引: ${index}, LaTeX长度: ${latexCode.length}, 块级: ${isBlockLevel}`);
        logger.debug(`[去重公式] 索引: ${index}, LaTeX内容: ${JSON.stringify(latexCode)}`);
      }
      
      const cacheKey = `${latexCode}|${isBlockLevel}`;
      
      if (!uniqueFormulas.has(cacheKey)) {
        uniqueFormulas.set(cacheKey, []);
      }
      uniqueFormulas.get(cacheKey)!.push({ index, isBlockLevel });
    }
    
    return { uniqueFormulas, sortedIndices };
  }

  /**
   * 预处理 LaTeX 代码，转义可能在 XML 文本节点中引起问题的特殊字符
   * 注意：LaTeX 代码在 Markdown 阶段已经进行过转义，这里主要是为了兼容性
   * 只转义会影响 XML 解析的字符（< 和 >），不转义其他字符
   */
  private preprocessLatexForXml(latex: string): string {
    let processed = latex;
    
    // 注意：LaTeX 代码在 Markdown 阶段已经通过 escapeLatexForMarkdown 转义过了
    // 这里主要是为了兼容性，但要注意不要重复转义
    
    // 检查是否已经转义过（如果已经有 \lt 或 \gt，说明已经转义过）
    const alreadyEscaped = processed.includes('\\lt') || processed.includes('\\gt');
    
    if (!alreadyEscaped) {
      // 只转义会影响 XML 解析的字符：< 和 >
      // 不再转义 & 符号，因为：
      // 1. 在数学公式中，& 通常用于对齐（如 \begin{aligned} 环境）
      // 2. 过度转义会导致公式无法被正确解析
      // 3. MathJax 和 MathML 转换器应该能正确处理 & 符号
      
      // 转义小于号 < 为 LaTeX 命令 \lt（注意：不要加空格，MathJax 可能无法正确解析）
      // 改进：更精确的匹配，避免匹配到 LaTeX 命令中的 <（如 \langle）
      processed = processed.replace(/(?<!\\)<(?![a-zA-Z\\])/g, '\\lt');
      
      // 转义大于号 > 为 LaTeX 命令 \gt（注意：不要加空格）
      // 改进：更精确的匹配，避免匹配到 LaTeX 命令中的 >（如 \rangle）
      processed = processed.replace(/(?<!\\)>(?![a-zA-Z\\])/g, '\\gt');
    }
    
    return processed;
  }

  /**
   * 转换公式（LaTeX → OMML → WordprocessingML）
   * 使用 latex-to-omml 包进行转换
   */
  private async convertFormula(
    latexCode: string,
    isBlockLevel: boolean,
    conversionCache: Map<string, { wrappedContent: string; ommlContent: string; tag: string | null }>
  ): Promise<{ wrappedContent: string; ommlContent: string; tag: string | null }> {
    const cacheKey = `${latexCode}|${isBlockLevel}`;
    const verbose = shouldLogVerbose();
    
    if (verbose) {
      logger.debug(`[转换公式] 开始转换, 块级: ${isBlockLevel}, LaTeX长度: ${latexCode.length}`);
      logger.debug(`[转换公式] LaTeX内容: ${JSON.stringify(latexCode)}`);
    }
    
    // 检查缓存
    if (conversionCache.has(cacheKey)) {
      if (verbose) {
        logger.debug(`[转换公式] 使用缓存结果`);
      }
      return conversionCache.get(cacheKey)!;
    }

    // 提取标签信息（latex-to-omml 会自动移除 \tag，但我们需要提取标签用于后续显示）
    const { extractTagFromLatex } = await import('../utils/latex-tag-extractor');
    const { tag, processedLatex: latexWithoutTag } = extractTagFromLatex(latexCode);
    if (tag && verbose) {
      logger.debug(`[转换公式] 提取到标签: ${tag}`);
    }

    // 预处理 LaTeX 代码，转义特殊字符（使用已移除标签的版本）
    const preprocessedLatex = this.preprocessLatexForXml(latexWithoutTag);
    if (verbose) {
      logger.debug(`[转换公式] 预处理后长度: ${preprocessedLatex.length}`);
      logger.debug(`[转换公式] 预处理后内容: ${JSON.stringify(preprocessedLatex)}`);
    }

    // 使用 latex-to-omml 包进行转换（LaTeX → MathML → OMML）
    let ommlContent: string;
    try {
      if (verbose) {
        logger.debug(`[转换公式] 开始调用 latexToOMML`);
      }
      const { latexToOMML } = await import('latex-to-omml');
      ommlContent = await latexToOMML(preprocessedLatex, { displayMode: isBlockLevel });
      
      if (verbose) {
        logger.debug(`[转换公式] OMML 生成成功, 长度: ${ommlContent.length}`);
      }
    } catch (error) {
      logger.error(`[转换公式] LaTeX 转 OMML 失败:`, error);
      logger.error(`LaTeX 转 OMML 失败:`, error, { latex: latexCode.substring(0, 50) });
      throw error;
    }

    if (!ommlContent) {
      throw new Error(`LaTeX 转 OMML 返回空结果: ${latexCode.substring(0, 50)}`);
    }

    // 清理 OMML 中的未转义字符（在文本节点中）
    ommlContent = this.cleanOMMLTextNodes(ommlContent.trim());
    
    if (verbose) {
      logger.debug(`[转换公式] 清理后的 OMML 长度: ${ommlContent.length}`);
    }
    
    // 验证 OMML
    this.validateOMML(ommlContent, latexCode);
    
    // 增强 OMML（字体设置）
    const enhancedOMML = this.enhanceOMMLWithFonts(ommlContent);
    
    // 包装为 WordprocessingML 结构（包含标签）
    const wrappedContent = this.wrapOMMLAsWordprocessingML(enhancedOMML, isBlockLevel, tag);

    const result = { wrappedContent, ommlContent: enhancedOMML, tag };
    conversionCache.set(cacheKey, result);
    return result;
  }

  /**
   * 清理 OMML 文本节点中的未转义字符
   * 在 <m:t> 标签中的文本内容，需要转义 XML 特殊字符
   * 
   * 注意：由于 OMML 可能包含未转义的字符导致无法解析，我们使用正则表达式方法
   * 直接处理文本内容，而不依赖 XML 解析
   * 
   * 改进：更精确地处理嵌套标签和特殊字符，避免破坏公式结构
   */
  private cleanOMMLTextNodes(omml: string): string {
    // 使用正则表达式匹配 <m:t> 标签及其内容
    // 注意：使用非贪婪匹配，处理可能包含其他标签的情况
    return omml.replace(/<m:t([^>]*)>([\s\S]*?)<\/m:t>/g, (match, attrs, textContent) => {
      // 检查文本内容中是否包含未转义的 XML 特殊字符
      // 如果 textContent 中包含其他标签（如嵌套的 <m:r>），我们需要更小心
      
      // 检查是否包含有效的 XML 标签（以字母或冒号开头，如 <m:r> 或 <tag>）
      // 如果包含有效的 XML 标签，说明是嵌套结构，应该已经是正确的 XML 格式
      // 但仍然需要检查文本部分是否有未转义的 & 字符
      const hasValidXmlTag = /<[a-zA-Z:][\w:]*(\s[^>]*)?>/.test(textContent);
      
      if (hasValidXmlTag) {
        // 包含有效的嵌套标签，这种情况下的 < > 应该是标签的一部分，不应该转义
        // 但我们仍然需要转义文本中的特殊字符（如 &），而不是标签中的
        // 对于这种情况，假设 OMML 转换器已经正确处理，只转义未转义的 & 字符
        // 注意：不要转义已经是实体引用的字符（如 &amp;、&lt; 等）
        let processed = textContent.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
        return `<m:t${attrs}>${processed}</m:t>`;
      }
      
      // 纯文本内容或包含无效的 < > 字符，需要转义所有 XML 特殊字符
      // 顺序很重要：先转义 &，再转义 < 和 >
      // 注意：不要转义已经是实体引用的字符
      // 简化：先检查是否包含已转义的实体，如果包含，说明可能已经处理过，只转义未转义的 &
      const hasEntities = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/.test(textContent);
      
      // 先处理 LaTeX 特殊字符转换
      // \_ 在 LaTeX 中表示下划线，应该转换为普通下划线 _
      let processed = textContent.replace(/\\_/g, '_');
      
      let escaped = processed;
      if (!hasEntities) {
        // 没有实体引用，需要转义所有特殊字符
        escaped = escaped
          .replace(/&/g, '&amp;')  // 转义 &
          .replace(/</g, '&lt;')    // 转义 <
          .replace(/>/g, '&gt;')    // 转义 >
          .replace(/"/g, '&quot;')  // 转义 "
          .replace(/'/g, '&apos;'); // 转义 '
      } else {
        // 有实体引用，只转义未转义的 &
        escaped = escaped.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
      }
      
      return `<m:t${attrs}>${escaped}</m:t>`;
    });
  }

  /**
   * 验证 OMML 是否符合 XML 规范
   */
  private validateOMML(ommlContent: string, latexCode: string): void {
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
      logger.error(`OMML 验证失败:`, validationError, { latex: latexCode });
      throw new Error(`OMML 不符合 XML 规范: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
    }
  }
  /**
   * 增强 OMML：在多个层级添加字体设置
   * 特别处理：数字使用正体，而不是斜体
   */
  private enhanceOMMLWithFonts(omml: string): string {
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
  }

  /**
   * 包装 OMML 为 WordprocessingML 结构
   * @param enhancedOMML 增强后的 OMML 内容
   * @param isBlockLevel 是否为块级公式
   * @param tag 公式标签（如 "(1)"），如果提供，将在公式右侧显示
   */
  private wrapOMMLAsWordprocessingML(enhancedOMML: string, isBlockLevel: boolean, tag: string | null = null): string {
    // 提取 m:oMath 的内部内容
    const oMathMatch = enhancedOMML.match(/<m:oMath[^>]*>([\s\S]*?)<\/m:oMath>/);
    const innerOMML = oMathMatch ? oMathMatch[1] : enhancedOMML;
    
    if (isBlockLevel) {
      // 块级公式
      const formulaContent = `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr><m:oMath><m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>${innerOMML}</m:oMath></m:oMathPara>`;
      
      // 如果有标签，在公式后添加右对齐的标签文本
      if (tag) {
        const escapedTag = this.escapeXml(tag);
        // 使用制表符实现右对齐：公式居中，标签右对齐
        // 在段落属性中设置制表位，然后在公式后添加制表符和标签
        // 制表位位置设置为 9000 twips（约 15.9 cm，足够宽以容纳公式和标签）
        const tagRun = `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tab/></w:r><w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapedTag}</w:t></w:r>`;
        
        // 设置段落属性：居中对齐，并添加右对齐制表位
        // 注意：公式本身居中，标签通过制表符右对齐
        return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:jc w:val="center"/><w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs></w:pPr>${formulaContent}${tagRun}</w:p>`;
      } else {
        return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:jc w:val="center"/></w:pPr>${formulaContent}</w:p>`;
      }
    } else {
      // 行内公式（不支持标签，因为行内公式通常不需要标签）
      return `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><m:oMath><m:oMathPr><m:mathFont m:val="Times New Roman"/></m:oMathPr>${innerOMML}</m:oMath></w:r>`;
    }
  }

  /**
   * 批量转换公式
   */
  private async convertFormulas(
    uniqueFormulas: Map<string, Array<{ index: number; isBlockLevel: boolean }>>,
    progressCallback: ((current: number, total: number, message?: string) => void) | undefined,
    uniqueCount: number,
    totalFormulas: number
  ): Promise<{ formulaResults: Map<number, string>; failedIndices: Set<number> }> {
    const conversionCache = new Map<string, { wrappedContent: string; ommlContent: string; tag: string | null }>();
    const formulaResults = new Map<number, string>();
    const failedIndices = new Set<number>();
    
    let completedCount = 0;
    let failedCount = 0;
    const conversionTasks: Array<Promise<void>> = [];
    
    // 处理每个唯一公式
    for (const [cacheKey, indices] of uniqueFormulas.entries()) {
      // 注意：cacheKey 格式是 "latexCode|isBlockLevel"
      // 但是 LaTeX 代码中可能包含 | 字符，所以不能直接用 split('|')
      // 应该从最后一个 | 分割
      const lastPipeIndex = cacheKey.lastIndexOf('|');
      if (lastPipeIndex === -1) {
        logger.error(`[转换公式] 无效的 cacheKey 格式: ${cacheKey}`);
        continue;
      }
      
      const latexCode = cacheKey.substring(0, lastPipeIndex);
      const isBlockLevelStr = cacheKey.substring(lastPipeIndex + 1);
      const isBlockLevel = isBlockLevelStr === 'true';
      
      logger.debug(`[转换公式] cacheKey长度: ${cacheKey.length}, LaTeX长度: ${latexCode.length}, 块级: ${isBlockLevel}`);
      logger.debug(`[转换公式] cacheKey: ${JSON.stringify(cacheKey)}`);
      logger.debug(`[转换公式] 提取的LaTeX: ${JSON.stringify(latexCode)}`);
      
      // 创建转换任务
      const task = this.convertFormula(latexCode, isBlockLevel, conversionCache)
        .then((result) => {
          // 为所有使用相同公式的占位符设置结果
          for (const { index } of indices) {
            formulaResults.set(index, result.wrappedContent);
          }
          completedCount++;
          if (progressCallback) {
            const conversionProgress = Math.floor((completedCount / uniqueCount) * 50);
            progressCallback(conversionProgress, 100, `正在转换公式 (${completedCount}/${uniqueCount})`);
          }
        })
        .catch((error) => {
          failedCount++;
          // 记录失败的索引
          for (const { index } of indices) {
            failedIndices.add(index);
          }
          logger.error(`公式转换失败: ${latexCode}`, error);
          if (progressCallback) {
            const totalProcessed = completedCount + failedCount;
            const conversionProgress = Math.floor((totalProcessed / uniqueCount) * 50);
            progressCallback(conversionProgress, 100, `正在转换公式 (${totalProcessed}/${uniqueCount})`);
          }
        });
      
      conversionTasks.push(task);
    }
    
    // 使用并发池控制
    const batches: Array<Promise<void>[]> = [];
    for (let i = 0; i < conversionTasks.length; i += OMMLInsertionProcessor.MAX_CONCURRENT) {
      batches.push(conversionTasks.slice(i, i + OMMLInsertionProcessor.MAX_CONCURRENT));
    }
    
    // 按批次执行
    for (const batch of batches) {
      await Promise.all(batch);
    }
    
    logger.info(`公式转换完成: 成功 ${completedCount}, 失败 ${failedCount}, 总计 ${uniqueCount}`);
    
    return { formulaResults, failedIndices };
  }

  /**
   * 应用后备方案：转换失败时显示 LaTeX 代码原文
   */
  private applyFallbackSolution(
    context: DocxProcessingContext,
    documentXml: string,
    formulaPlaceholders: Map<number, { latex: string; display: boolean }>,
    existingPlaceholders: Set<number>
  ): boolean {
    let updatedXml = documentXml;
    let modified = false;

    // 解析 XML 文档
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
      return false;
    }

    // 为每个失败的公式创建后备内容（显示 LaTeX 代码）
    for (const index of existingPlaceholders) {
      const placeholderData = formulaPlaceholders.get(index);
      if (!placeholderData) continue;

      const { latex, display: isBlockLevel } = placeholderData;
      
      // 文本占位符
      const blockPlaceholder = `[MATH_PLACEHOLDER_${index}]`;
      const inlinePlaceholder = `[MATH_PLACEHOLDER_${index}_INLINE]`;
      const placeholder = isBlockLevel ? blockPlaceholder : inlinePlaceholder;

      // 转义 LaTeX 代码用于 XML
      const escapedLatex = this.escapeXml(latex);
      
      // 创建后备内容（显示 LaTeX 代码）
      const fallbackContent = isBlockLevel
        ? `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${escapedLatex}</w:t></w:r></w:p>`
        : `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${escapedLatex}</w:t></w:r>`;

      // 查找包含占位符的文本节点
      const textNodes = this.findAllTextNodes(xmlDoc);
      for (const textNode of textNodes) {
        const nodeValue = textNode.nodeValue || '';
        // 尝试多种可能的格式（方括号可能被转义）
        const escapedPlaceholder = placeholder.replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
        const corePlaceholder = placeholder.replace(/[\[\]]/g, '');  // 移除方括号，只保留核心部分
        if (nodeValue.includes(placeholder) || 
            nodeValue.includes(escapedPlaceholder) ||
            nodeValue.includes(corePlaceholder)) {
          // 找到包含占位符的父元素（w:r 或 w:p）
          let parentElement: Element | null = null;
          let current: Node | null = textNode;
          
          while (current && current.nodeType !== 9) {
            if (current.nodeType === 1) {
              const element = current as Element;
              const tagName = element.tagName;
              const localName = (element as any).localName || tagName.split(':').pop() || tagName;
              const isParagraph = localName === 'p' || tagName === 'w:p' || tagName === 'p';
              const isRun = localName === 'r' || tagName === 'w:r' || tagName === 'r';
              
              if (isBlockLevel && isParagraph) {
                parentElement = element;
                break;
              } else if (!isBlockLevel && isRun) {
                parentElement = element;
                break;
              } else if (!isBlockLevel && isParagraph) {
                parentElement = element;
                break;
              }
            }
            current = current.parentNode;
          }
          
          if (parentElement) {
            // 解析后备内容
            const fallbackParser = new DOMParser({
              errorHandler: {
                warning: () => {},
                error: () => {},
                fatalError: () => {},
              },
            });
            const fallbackDoc = fallbackParser.parseFromString(
              `<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${fallbackContent}</root>`,
              'text/xml'
            );
            const fallbackNode = fallbackDoc.documentElement?.firstChild;
            if (fallbackNode) {
              const importedNode = xmlDoc.importNode(fallbackNode, true);
              // 替换整个父节点（w:r 或 w:p）
              const grandParent = parentElement.parentNode;
              if (grandParent) {
                grandParent.replaceChild(importedNode, parentElement);
                modified = true;
                logger.info(`已为占位符 ${index} 应用后备方案（显示 LaTeX 代码）`);
                break;
              }
            }
          }
        }
      }
    }

    // 序列化 XML
    if (modified) {
      const serializer = new XMLSerializer();
      updatedXml = serializer.serializeToString(xmlDoc);
      context.documentXml = updatedXml;
    }

    return modified;
  }

  /**
   * 查找并替换占位符
   */
  private async findAndReplacePlaceholders(
    context: DocxProcessingContext,
    documentXml: string,
    formulaPlaceholders: Map<number, { latex: string; display: boolean }>,
    formulaResults: Map<number, string>,
    sortedIndices: number[],
    existingPlaceholders: Set<number>,
    totalFormulas: number,
    progressCallback: ((current: number, total: number, message?: string) => void) | undefined
  ): Promise<boolean> {
    let updatedXml = documentXml;
    let modified = false;

    // 解析 XML 文档
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
      return false;
    }

    // 查找所有文本节点中的占位符
    interface PlaceholderLocation {
      textNode: Text;
      index: number;
      isBlockLevel: boolean;
      parentElement: Element;
    }

    const placeholderLocations: PlaceholderLocation[] = [];
    const textNodes = this.findAllTextNodes(xmlDoc);

    // 查找包含占位符的文本节点
    for (const textNode of textNodes) {
      const nodeValue = textNode.nodeValue || '';
      
      // 匹配文本占位符：[MATH_PLACEHOLDER_0] 或 [MATH_PLACEHOLDER_0_INLINE]
      const blockMatch = nodeValue.match(/\[MATH_PLACEHOLDER_(\d+)\]/);
      const inlineMatch = nodeValue.match(/\[MATH_PLACEHOLDER_(\d+)_INLINE\]/);
      
      // 如果直接匹配失败，尝试查找可能被分割的占位符（方括号可能被转义或分割）
      let blockMatchAlt: RegExpMatchArray | null = null;
      let inlineMatchAlt: RegExpMatchArray | null = null;
      if (!blockMatch && !inlineMatch) {
        // 尝试查找核心部分（可能方括号被转义或分割到不同节点）
        blockMatchAlt = nodeValue.match(/MATH_PLACEHOLDER_(\d+)(?!_INLINE)/);
        inlineMatchAlt = nodeValue.match(/MATH_PLACEHOLDER_(\d+)_INLINE/);
      }
      
      let matchIndex: number | null = null;
      let isBlockLevel = false;
      
      if (blockMatch) {
        matchIndex = parseInt(blockMatch[1], 10);
        isBlockLevel = true;
      } else if (inlineMatch) {
        matchIndex = parseInt(inlineMatch[1], 10);
        isBlockLevel = false;
      } else if (blockMatchAlt) {
        // 使用备用匹配（可能方括号被转义或分割）
        matchIndex = parseInt(blockMatchAlt[1], 10);
        isBlockLevel = true;
      } else if (inlineMatchAlt) {
        matchIndex = parseInt(inlineMatchAlt[1], 10);
        isBlockLevel = false;
      }
      
      if (matchIndex !== null && existingPlaceholders.has(matchIndex)) {
        // 找到包含占位符的父元素（w:r 或 w:p）
        let parentElement: Element | null = null;
        let current: Node | null = textNode;
        
        while (current && current.nodeType !== 9) {
          if (current.nodeType === 1) {
            const element = current as Element;
            const tagName = element.tagName;
            const localName = (element as any).localName || tagName.split(':').pop() || tagName;
            const isParagraph = localName === 'p' || tagName === 'w:p' || tagName === 'p';
            const isRun = localName === 'r' || tagName === 'w:r' || tagName === 'r';
            
            if (isBlockLevel && isParagraph) {
              parentElement = element;
              break;
            } else if (!isBlockLevel && isRun) {
              parentElement = element;
              break;
            } else if (!isBlockLevel && isParagraph) {
              parentElement = element;
              break;
            }
          }
          current = current.parentNode;
        }
        
        if (parentElement) {
          placeholderLocations.push({
            textNode,
            index: matchIndex,
            isBlockLevel,
            parentElement,
          });
        }
      }
    }

    logger.info(`找到 ${placeholderLocations.length} 个文本占位符，开始替换`);

    // 按索引从大到小排序，避免索引偏移问题
    placeholderLocations.sort((a, b) => b.index - a.index);

    // 解析新内容的辅助函数
    const parseNewContent = (wrappedContent: string): Node | null => {
      const newContentParser = new DOMParser({
        errorHandler: {
          warning: (w) => logger.warn('OMML 解析警告:', w),
          error: (e) => logger.error('OMML 解析错误:', e),
          fatalError: (e) => logger.error('OMML 解析致命错误:', e),
        },
      });
      
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

    // 替换占位符
    let replacementCount = 0;
    const verbose = shouldLogVerbose();
    
    for (const { textNode, index, isBlockLevel, parentElement } of placeholderLocations) {
      if (verbose) {
        logger.debug(`[替换占位符] 索引: ${index}, 块级: ${isBlockLevel}`);
      }
      
      // 从 Map 中获取 LaTeX 代码
      const placeholderData = formulaPlaceholders.get(index);
      if (placeholderData) {
        if (verbose) {
          logger.debug(`[替换占位符] 索引: ${index}, LaTeX长度: ${placeholderData.latex.length}`);
          logger.debug(`[替换占位符] 索引: ${index}, LaTeX内容: ${JSON.stringify(placeholderData.latex)}`);
        }
      } else {
        logger.warn(`[替换占位符] 索引: ${index}, 未找到占位符数据`);
      }
      
      const wrappedContent = formulaResults.get(index);
      
      if (!wrappedContent) {
        logger.warn(`占位符 ${index} 没有转换结果，使用后备方案`);
        // 使用后备方案
        if (placeholderData) {
          const escapedLatex = this.escapeXml(placeholderData.latex);
          const fallbackContent = isBlockLevel
            ? `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${escapedLatex}</w:t></w:r></w:p>`
            : `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${escapedLatex}</w:t></w:r>`;
          
          const fallbackNode = parseNewContent(fallbackContent);
          if (fallbackNode) {
            const grandParent = parentElement.parentNode;
            if (grandParent) {
              grandParent.replaceChild(fallbackNode, parentElement);
              modified = true;
              replacementCount++;
            }
          }
        }
        continue;
      }

      const newNode = parseNewContent(wrappedContent);
      if (!newNode) {
        logger.warn(`无法解析占位符 ${index} 的新内容`);
        continue;
      }

      try {
        const grandParent = parentElement.parentNode;
        if (grandParent) {
          grandParent.replaceChild(newNode, parentElement);
          modified = true;
          replacementCount++;
          
          if (progressCallback) {
            const replacementProgress = 50 + Math.floor((replacementCount / totalFormulas) * 50);
            progressCallback(replacementProgress, 100, `正在替换公式 (${replacementCount}/${totalFormulas})`);
          }
        }
      } catch (replaceError) {
        logger.error(`替换占位符 ${index} 的节点时发生错误:`, replaceError);
      }
    }

    // 序列化 XML
    if (modified) {
      const serializer = new XMLSerializer();
      updatedXml = serializer.serializeToString(xmlDoc);
      context.documentXml = updatedXml;
      logger.info(`已处理 ${replacementCount} 个公式占位符`);
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
 * 图片编号处理器
 * 为文档中的图片自动添加编号标签（如图 1、图 2）
 */
export class ImageNumberingProcessor implements DocxProcessor {
  name = 'ImageNumberingProcessor';

  async process(
    context: DocxProcessingContext,
    options?: {
      autoNumberImages?: boolean;
      imageLabelFontSize?: number;
      imageLabelFontFamily?: string;
      imageLabelPrefix?: string;
      imageLabelDefaultName?: string;
      locale?: string;
    }
  ): Promise<boolean> {
    if (!options?.autoNumberImages) {
      return false;
    }

    const { documentXml } = context;
    let updatedXml = documentXml;
    let modified = false;

    // 获取配置
    const fontSize = options.imageLabelFontSize || 10.5; // pt
    // 默认字体：中文用黑体（SimHei），英文用 Arial Bold 或类似的粗体字体
    const fontFamily = options.imageLabelFontFamily || (options.locale === 'en_US' ? 'Arial' : 'SimHei');
    const prefix = options.imageLabelPrefix || (options.locale === 'en_US' ? 'Graph' : '图');
    const defaultName = options.imageLabelDefaultName || (options.locale === 'en_US' ? 'Image' : '图片');

    // 查找所有图片段落
    // 图片在 DOCX 中通常包含在 <w:drawing> 或 <w:pict> 标签中
    // 我们需要找到包含图片的段落，并在其后添加编号标签段落
    
    // 匹配包含图片的段落：<w:p>...</w:p> 其中包含 <w:drawing> 或 <w:pict>
    // 使用非贪婪匹配，确保只匹配单个段落
    const imageParagraphRegex = /<w:p[^>]*>([\s\S]*?<w:drawing[\s\S]*?<\/w:drawing>[\s\S]*?|[\s\S]*?<w:pict[\s\S]*?<\/w:pict>[\s\S]*?)<\/w:p>/g;
    
    const imageParagraphs: Array<{ match: string; index: number; endIndex: number }> = [];
    let match: RegExpExecArray | null;
    
    // 收集所有图片段落的位置（从后往前处理，避免索引偏移）
    while ((match = imageParagraphRegex.exec(documentXml)) !== null) {
      imageParagraphs.push({
        match: match[0],
        index: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    if (imageParagraphs.length === 0) {
      logger.debug('未找到图片段落，跳过图片编号处理');
      return false;
    }

    logger.info(`找到 ${imageParagraphs.length} 个图片段落，开始添加编号标签`);

    // 从后往前处理，避免索引偏移
    for (let i = imageParagraphs.length - 1; i >= 0; i--) {
      const imagePara = imageParagraphs[i];
      const imageParaEnd = imagePara.endIndex;

      // 尝试从图片的 alt 文本中提取图片名称
      // 在 HTML 转 DOCX 过程中，alt 文本可能被转换为不同的格式
      // 我们尝试从图片段落中查找可能的文本内容，或者从紧跟在图片段落后的段落中查找
      let imageName = defaultName;
      
      // 方法1：尝试从图片段落中查找文本内容（可能是 alt 文本）
      // 查找段落中的 <w:t> 标签
      const textMatch = imagePara.match.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
      if (textMatch && textMatch[1] && textMatch[1].trim()) {
        const altText = textMatch[1].trim();
        // 如果文本不是纯数字或特殊字符，使用它作为图片名称
        if (altText && !/^[\d\s\-_]+$/.test(altText)) {
          imageName = altText;
        }
      }
      
      // 方法2：如果方法1没有找到，尝试从紧跟在图片段落后的段落中查找
      // 这可能是我们在 HTML 阶段添加的隐藏文本节点
      if (imageName === defaultName && i < imageParagraphs.length - 1) {
        // 查找图片段落和下一个图片段落之间的内容
        const nextImagePara = imageParagraphs[i + 1];
        const betweenContent = updatedXml.substring(imageParaEnd, nextImagePara.index);
        
        // 查找包含 data-image-alt-text 的文本节点
        const altTextMatch = betweenContent.match(/<w:t[^>]*data-image-alt-text[^>]*>([^<]*)<\/w:t>/i);
        if (altTextMatch && altTextMatch[1] && altTextMatch[1].trim()) {
          const altText = altTextMatch[1].trim();
          if (altText && !/^[\d\s\-_]+$/.test(altText)) {
            imageName = altText;
          }
        } else {
          // 如果没有找到 data 属性，尝试查找紧跟在图片段落后的第一个文本节点
          const nextTextMatch = betweenContent.match(/<w:t[^>]*>([^<]+)<\/w:t>/);
          if (nextTextMatch && nextTextMatch[1] && nextTextMatch[1].trim()) {
            const altText = nextTextMatch[1].trim();
            if (altText && !/^[\d\s\-_]+$/.test(altText) && altText.length < 100) {
              imageName = altText;
            }
          }
        }
      } else if (imageName === defaultName && i === imageParagraphs.length - 1) {
        // 如果是最后一个图片，查找图片段落后的内容
        const afterContent = updatedXml.substring(imageParaEnd, Math.min(updatedXml.length, imageParaEnd + 500));
        
        // 查找包含 data-image-alt-text 的文本节点
        const altTextMatch = afterContent.match(/<w:t[^>]*data-image-alt-text[^>]*>([^<]*)<\/w:t>/i);
        if (altTextMatch && altTextMatch[1] && altTextMatch[1].trim()) {
          const altText = altTextMatch[1].trim();
          if (altText && !/^[\d\s\-_]+$/.test(altText)) {
            imageName = altText;
          }
        } else {
          // 如果没有找到 data 属性，尝试查找紧跟在图片段落后的第一个文本节点
          const nextTextMatch = afterContent.match(/<w:t[^>]*>([^<]+)<\/w:t>/);
          if (nextTextMatch && nextTextMatch[1] && nextTextMatch[1].trim()) {
            const altText = nextTextMatch[1].trim();
            if (altText && !/^[\d\s\-_]+$/.test(altText) && altText.length < 100) {
              imageName = altText;
            }
          }
        }
      }

      // 构建图片编号标签段落
      // 格式：居中对齐、加粗、指定字号
      // 包含 SEQ 域用于自动编号
      // SEQ Figure \* ARABIC 表示使用阿拉伯数字的图片序列
      // 注意：SEQ 域会自动递增，不需要手动计算编号
      const labelParagraph = `
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="120" w:before="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="${Math.round(fontSize * 2)}"/>
          <w:szCs w:val="${Math.round(fontSize * 2)}"/>
          <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/>
        </w:rPr>
        <w:t xml:space="preserve">${prefix} </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="${Math.round(fontSize * 2)}"/>
          <w:szCs w:val="${Math.round(fontSize * 2)}"/>
          <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/>
        </w:rPr>
        <w:fldChar w:fldCharType="begin"/>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="${Math.round(fontSize * 2)}"/>
          <w:szCs w:val="${Math.round(fontSize * 2)}"/>
          <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/>
        </w:rPr>
        <w:instrText xml:space="preserve"> SEQ Figure \\* ARABIC </w:instrText>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="${Math.round(fontSize * 2)}"/>
          <w:szCs w:val="${Math.round(fontSize * 2)}"/>
          <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/>
        </w:rPr>
        <w:fldChar w:fldCharType="separate"/>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="${Math.round(fontSize * 2)}"/>
          <w:szCs w:val="${Math.round(fontSize * 2)}"/>
          <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/>
        </w:rPr>
        <w:t>1</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="${Math.round(fontSize * 2)}"/>
          <w:szCs w:val="${Math.round(fontSize * 2)}"/>
          <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/>
        </w:rPr>
        <w:fldChar w:fldCharType="end"/>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="${Math.round(fontSize * 2)}"/>
          <w:szCs w:val="${Math.round(fontSize * 2)}"/>
          <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:eastAsia="${fontFamily}" w:cs="${fontFamily}"/>
        </w:rPr>
        <w:t xml:space="preserve"> ${imageName}</w:t>
      </w:r>
    </w:p>
    `;

      // 在图片段落后插入编号标签段落
      updatedXml = updatedXml.substring(0, imagePara.endIndex) + 
                   labelParagraph + 
                   updatedXml.substring(imagePara.endIndex);
      modified = true;
    }

    if (modified) {
      context.documentXml = updatedXml;
      logger.info(`已为 ${imageParagraphs.length} 个图片添加编号标签`);
    }

    return modified;
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
        // 检查是否已经有换页符（检查多种格式：pageBreakAfter、pageBreakBefore、br type="page"）
        const checkContent = updatedXml.substring(Math.max(0, tocItemsEndPos - 100), Math.min(updatedXml.length, tocItemsEndPos + 500));
        const hasPageBreak = checkContent.includes('<w:pageBreakAfter') || 
                             checkContent.includes('<w:pageBreakBefore') ||
                             checkContent.includes('<w:br w:type="page"') ||
                             checkContent.includes('<w:br w:type=\'page\'');
        if (!hasPageBreak) {
          // 插入一个带换页符的空段落
          const pageBreakPara = '<w:p><w:pPr><w:pageBreakAfter/></w:pPr></w:p>';
          updatedXml = updatedXml.substring(0, tocItemsEndPos) + pageBreakPara + updatedXml.substring(tocItemsEndPos);
          modified = true;
          logger.debug('已在目录结尾添加换页符');
        } else {
          logger.debug('目录后已存在分页符，跳过添加');
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
          const hasPageBreak = checkContent.includes('<w:pageBreakAfter') || 
                               checkContent.includes('<w:pageBreakBefore') ||
                               checkContent.includes('<w:br w:type="page"') ||
                               checkContent.includes('<w:br w:type=\'page\'');
          if (!hasPageBreak) {
            const pageBreakPara = '<w:p><w:pPr><w:pageBreakAfter/></w:pPr></w:p>';
            updatedXml = updatedXml.substring(0, lastParaEndPos) + pageBreakPara + updatedXml.substring(lastParaEndPos);
            modified = true;
            logger.debug('已在目录结尾添加换页符（备用策略）');
          } else {
            logger.debug('目录后已存在分页符，跳过添加（备用策略）');
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
