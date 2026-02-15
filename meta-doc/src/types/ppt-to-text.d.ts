/**
 * 类型声明文件：ppt-to-text
 * 用于从 .ppt 文件中提取文本
 */

declare module 'ppt-to-text' {
  /**
   * PPT文件解析器
   */
  interface PPT {
    /**
     * 统一的文本提取API（推荐使用）
     * 从文件路径或Buffer读取PPT文件并提取文本
     * @param input 文件路径（string）或Buffer
     * @param options 选项
     * @returns 如果提供了outputPath，返回文件路径；否则返回文本字符串
     */
    extractText(
      input: string | Buffer,
      options?: {
        outputPath?: string
        separator?: string
        encoding?: string
        readOpts?: any
      }
    ): string

    /**
     * 从文件路径读取PPT文件
     * @param filename 文件路径
     * @param opts 选项
     * @returns 解析后的演示文稿对象
     */
    readFile(filename: string, opts?: any): Presentation

    /**
     * 从Buffer读取PPT文件
     * @param buffer Buffer对象
     * @param opts 选项
     * @returns 解析后的演示文稿对象
     */
    readBuffer(buffer: Buffer, opts?: any): Presentation

    /**
     * 解析PPT CFB对象
     * @param cfb CFB对象
     * @param opts 选项
     * @returns 解析后的演示文稿对象
     */
    parse_pptcfb(cfb: any, opts?: any): Presentation

    /**
     * 工具函数
     */
    utils: {
      /**
       * 将演示文稿转换为文本数组
       * @param pres 演示文稿对象
       * @returns 文本数组
       */
      to_text(pres: Presentation): string[]

      /**
       * 将演示文稿转换为文本字符串
       * @param pres 演示文稿对象
       * @param separator 分隔符，默认为 '\n'
       * @returns 文本字符串
       */
      toTextString(pres: Presentation, separator?: string): string

      /**
       * 将文本写入文件
       * @param text 文本内容
       * @param outputPath 输出文件路径
       * @param encoding 文件编码，默认为 'utf8'
       * @returns 文件路径
       */
      writeTextFile(text: string, outputPath: string, encoding?: string): string
    }
  }

  /**
   * 演示文稿对象
   */
  interface Presentation {
    /**
     * 文档数组
     */
    docs?: Document[]

    /**
     * 幻灯片数组
     */
    slides?: Slide[]

    /**
     * 其他可能的属性
     */
    [key: string]: any
  }

  /**
   * 文档对象
   */
  interface Document {
    /**
     * 幻灯片列表
     */
    slideList?: Slide[]

    /**
     * 其他可能的属性
     */
    [key: string]: any
  }

  /**
   * 幻灯片对象
   */
  interface Slide {
    /**
     * 文本内容
     */
    text?: string

    /**
     * 绘图组形状
     */
    drawing?: {
      groupShape?: Array<{
        clientTextbox?: {
          t?: string
        }
      }>
    }

    /**
     * 其他可能的属性
     */
    [key: string]: any
  }

  const PPT: PPT
  export = PPT
}
