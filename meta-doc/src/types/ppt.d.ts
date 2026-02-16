/**
 * 类型声明文件：ppt
 * 用于解析 .ppt 文件
 */

declare module 'ppt' {
  /**
   * PPT文件解析器
   */
  interface PPT {
    /**
     * 从文件路径读取PPT文件
     * @param filename 文件路径
     * @param opts 选项
     * @returns 解析后的演示文稿对象
     */
    readFile(filename: string, opts?: any): Presentation

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
