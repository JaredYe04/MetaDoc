/**
 * 类型声明文件：word-extractor
 * 用于从 .doc 和 .docx 文件中提取文本
 */

declare module 'word-extractor' {
  /**
   * Word文档提取器
   */
  class WordExtractor {
    /**
     * 从文件路径或Buffer中提取Word文档内容
     * @param filePathOrBuffer 文件路径或Buffer
     * @returns Promise<Document> 文档对象
     */
    extract(filePathOrBuffer: string | Buffer): Promise<Document>;
  }

  /**
   * Word文档对象
   */
  interface Document {
    /**
     * 获取文档正文内容
     * @returns 正文文本
     */
    getBody(): string;

    /**
     * 获取脚注内容
     * @returns 脚注文本
     */
    getFootnotes(): string;

    /**
     * 获取尾注内容
     * @returns 尾注文本
     */
    getEndnotes(): string;

    /**
     * 获取页眉页脚内容
     * @param options 选项
     * @returns 页眉页脚文本
     */
    getHeaders(options?: { includeFooters?: boolean }): string;

    /**
     * 获取页脚内容
     * @returns 页脚文本
     */
    getFooters(): string;

    /**
     * 获取注释内容
     * @returns 注释文本
     */
    getAnnotations(): string;

    /**
     * 获取文本框内容
     * @param options 选项
     * @returns 文本框文本
     */
    getTextboxes(options?: { includeHeadersAndFooters?: boolean; includeBody?: boolean }): string;
  }

  export = WordExtractor;
}

