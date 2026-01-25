/**
 * LaTeX 编译服务 - TypeScript 重构版本
 * 将 LaTeX 代码编译为 PDF 文档
 * 使用 node-latex-compiler 库进行跨平台编译
 */

import path from 'path';
import fs from 'fs';
import { compile, isAvailable, getVersion } from 'node-latex-compiler';
import type { 
  FilePath, 
  LaTeXCompileResult, 
  LaTeXCompileConfig, 
  LaTeXService 
} from '../../types/utils';
import type { BrowserWindow } from 'electron';
import { createMainLogger } from '../logger';

const logger = createMainLogger("latex-service");

/**
 * LaTeX 编译服务实现类
 */
class LaTeXServiceImpl implements LaTeXService {
  constructor() {
    // 不再需要 tectonicPath，由 node-latex-compiler 自动管理
  }

  /**
   * 清理文件路径，移除 file:// 前缀并规范化路径
   */
  private normalizeFilePath(filePath: FilePath): string {
    if (!filePath) return '';
    
    // 移除 file:/// 前缀（如果存在）
    let normalized = filePath.replace(/^file:\/\/\//, '');
    
    // 规范化路径（处理 .. 和 . 等）
    normalized = path.normalize(normalized);
    
    return normalized;
  }

  /**
   * 编译 LaTeX 文件生成 PDF
   * @param config 编译配置
   * @returns 编译结果
   */
  async compileLatexToPDF(config: LaTeXCompileConfig): Promise<LaTeXCompileResult> {
    const {
      texFilePath,
      tex,
      outputDir,
      mainWindow,
      customPdfFileName
    } = config;

    try {
      // 验证输入
      if (!tex || tex.trim() === '') {
        return { status: 'failed', exitCode: -1 };
      }

      // 规范化 texFilePath（移除 file:// 前缀）
      const normalizedTexPath = texFilePath ? this.normalizeFilePath(texFilePath) : null;

      // 设置输出目录
      // 如果 outputDir 是空字符串或未定义，使用 texFilePath 的目录
      let actualOutputDir: string;
      if (outputDir && outputDir.trim() !== '') {
        actualOutputDir = this.normalizeFilePath(outputDir);
      } else if (normalizedTexPath) {
        actualOutputDir = path.dirname(normalizedTexPath);
      } else {
        actualOutputDir = process.cwd();
      }

      // 确保输出目录存在且是目录
      this.ensureDirectoryExists(actualOutputDir);

      // 确定输出 PDF 路径
      const pdfFileName = customPdfFileName || 
        (normalizedTexPath ? path.basename(normalizedTexPath, path.extname(normalizedTexPath)) + '.pdf' : 'output.pdf');
      const outputFile = path.join(actualOutputDir, pdfFileName);

      // 准备输出流处理器
      const stdoutBuffer: string[] = [];
      const stderrBuffer: string[] = [];

      // 调用 node-latex-compiler 进行编译
      const result = await compile({
        tex: tex,
        outputDir: actualOutputDir,
        outputFile: outputFile,
        onStdout: (data: string) => {
          stdoutBuffer.push(data);
          if (mainWindow) {
            mainWindow.webContents.send('console-out', {
              key: 'latex',
              content: data,
              type: 'out'
            });
          }
        },
        onStderr: (data: string) => {
          stderrBuffer.push(data);
          if (mainWindow) {
            mainWindow.webContents.send('console-err', {
              key: 'latex',
              content: data,
              type: 'err'
            });
          }
        }
      });

      // 转换结果格式以匹配我们的接口
      if (result.status === 'success' && result.pdfPath) {
        // node-latex-compiler 可能生成的文件名与预期不同，需要重命名
        if (result.pdfPath !== outputFile && fs.existsSync(result.pdfPath)) {
          // 如果生成的 PDF 文件名不同，重命名
          if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile); // 删除旧文件
          }
          fs.renameSync(result.pdfPath, outputFile);
        }
        return {
          status: 'success',
          pdfPath: outputFile
        };
      } else {
        return {
          status: 'failed',
          exitCode: result.exitCode || -1
        };
      }

    } catch (error) {
      logger.error('LaTeX compilation error:', error);
      if (mainWindow) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        mainWindow.webContents.send('console-err', {
          key: 'latex',
          content: errorMessage,
          type: 'err'
        });
      }
      return { status: 'failed', exitCode: -1 };
    }
  }

  /**
   * 确保目录存在
   * 如果路径已存在但不是目录，会抛出错误
   */
  private ensureDirectoryExists(dirPath: FilePath): void {
    if (!dirPath || dirPath.trim() === '') {
      throw new Error('Directory path is empty');
    }

    // 规范化路径
    const normalizedPath = path.normalize(dirPath);

    // 检查路径是否存在
    if (fs.existsSync(normalizedPath)) {
      // 如果存在，检查是否是目录
      const stats = fs.statSync(normalizedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path exists but is not a directory: ${normalizedPath}`);
      }
    } else {
      // 如果不存在，创建目录
      try {
        fs.mkdirSync(normalizedPath, { recursive: true });
        logger.debug(`Created directory: ${normalizedPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to create directory: ${normalizedPath}`, error);
        throw new Error(`Failed to create directory: ${normalizedPath}. ${errorMessage}`);
      }
    }
  }

  /**
   * 检查 Tectonic 是否可用
   * 使用 node-latex-compiler 的 isAvailable 方法
   */
  isTectonicAvailable(): boolean {
    return isAvailable();
  }

  /**
   * 获取 Tectonic 版本信息
   * 使用 node-latex-compiler 的 getVersion 方法
   */
  async getTectonicVersion(): Promise<string | null> {
    try {
      return await getVersion();
    } catch (error) {
      logger.warn('Failed to get Tectonic version:', error);
      return null;
    }
  }

  /**
   * 验证 LaTeX 代码语法（基础检查）
   */
  validateLatexSyntax(tex: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 基础语法检查
    if (!tex.includes('\\documentclass')) {
      issues.push('Missing \\documentclass declaration');
    }

    if (!tex.includes('\\begin{document}')) {
      issues.push('Missing \\begin{document}');
    }

    if (!tex.includes('\\end{document}')) {
      issues.push('Missing \\end{document}');
    }

    // 检查括号匹配
    const openBraces = (tex.match(/\{/g) || []).length;
    const closeBraces = (tex.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push('Mismatched braces');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// 创建单例实例
const latexService = new LaTeXServiceImpl();

// 导出单例实例和类型
export default latexService;
export { LaTeXServiceImpl };

// 向后兼容的导出（保持原有API）
export const compileLatexToPDF = (
  texFilePath: FilePath,
  tex: string,
  outputDir?: FilePath,
  mainWindow?: BrowserWindow,
  customPdfFileName?: string
): Promise<LaTeXCompileResult> => {
  return latexService.compileLatexToPDF({
    texFilePath,
    tex,
    outputDir,
    mainWindow,
    customPdfFileName
  });
};
