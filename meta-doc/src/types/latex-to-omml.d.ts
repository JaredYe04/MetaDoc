/**
 * TypeScript 类型声明文件 for latex-to-omml
 */

declare module 'latex-to-omml' {
  export interface LatexToOMMLOptions {
    /**
     * 是否为块级公式（display mode）
     * @default false
     */
    displayMode?: boolean;
  }

  /**
   * 将 LaTeX 代码转换为 OMML 字符串
   * 
   * @param latex LaTeX 数学公式代码
   * @param options 转换选项
   * @returns OMML XML 字符串
   * @throws 如果 LaTeX 代码为空或转换失败
   */
  export function latexToOMML(
    latex: string,
    options?: LatexToOMMLOptions
  ): Promise<string>;
}

