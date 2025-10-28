/**
 * LaTeX 编译服务 - TypeScript 重构版本
 * 将 LaTeX 代码编译为 PDF 文档
 */

import { exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import pathService from './path-service';
import type { 
  FilePath, 
  LaTeXCompileResult, 
  LaTeXCompileConfig, 
  LaTeXService 
} from '../../types/utils';
import type { BrowserWindow } from 'electron';

/**
 * LaTeX 编译服务实现类
 */
class LaTeXServiceImpl implements LaTeXService {
  private readonly tectonicPath: FilePath;

  constructor() {
    this.tectonicPath = pathService.getTectonicPath();
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

    return new Promise((resolve) => {
      try {
        // 验证输入
        if (!tex || tex.trim() === '') {
          return resolve({ status: 'failed', exitCode: -1 });
        }

        // 设置输出目录
        const actualOutputDir = outputDir || path.dirname(texFilePath);
        this.ensureDirectoryExists(actualOutputDir);

        // 创建临时 tex 文件
        const tempTexPath = this.createTempTexFile(actualOutputDir, tex);

        // 确定输出 PDF 路径
        const pdfFileName = customPdfFileName || 
          path.basename(texFilePath, path.extname(texFilePath)) + '.pdf';
        const pdfPath = path.join(actualOutputDir, pdfFileName);

        // 执行编译
        this.executeCompilation(
          tempTexPath,
          actualOutputDir,
          pdfPath,
          mainWindow,
          resolve
        );

      } catch (error) {
        console.error('LaTeX compilation setup error:', error);
        resolve({ status: 'failed', exitCode: -1 });
      }
    });
  }

  /**
   * 确保目录存在
   */
  private ensureDirectoryExists(dirPath: FilePath): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 创建临时 tex 文件
   */
  private createTempTexFile(outputDir: FilePath, tex: string): FilePath {
    const tempTexPath = path.join(outputDir, `__temp_compile_${Date.now()}.tex`);
    fs.writeFileSync(tempTexPath, tex, 'utf-8');
    return tempTexPath;
  }

  /**
   * 执行编译命令
   */
  private executeCompilation(
    tempTexPath: FilePath,
    outputDir: FilePath,
    finalPdfPath: FilePath,
    mainWindow: BrowserWindow | undefined,
    resolve: (result: LaTeXCompileResult) => void
  ): void {
    const cmd = `"${this.tectonicPath}" "${tempTexPath}" --outdir="${outputDir}"`;
    const child: ChildProcess = exec(cmd);

    // 处理标准输出
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        if (mainWindow) {
          mainWindow.webContents.send('console-out', data.toString());
        }
      });
    }

    // 处理错误输出
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        if (mainWindow) {
          mainWindow.webContents.send('console-err', data.toString());
        }
      });
    }

    // 处理编译完成
    child.on('close', (code: number | null) => {
      this.handleCompilationComplete(
        code,
        tempTexPath,
        outputDir,
        finalPdfPath,
        resolve
      );
    });

    // 处理进程错误
    child.on('error', (error) => {
      console.error('LaTeX compilation process error:', error);
      this.cleanupTempFile(tempTexPath);
      resolve({ status: 'failed', exitCode: -1 });
    });
  }

  /**
   * 处理编译完成事件
   */
  private handleCompilationComplete(
    exitCode: number | null,
    tempTexPath: FilePath,
    outputDir: FilePath,
    finalPdfPath: FilePath,
    resolve: (result: LaTeXCompileResult) => void
  ): void {
    try {
      // 清理临时文件
      this.cleanupTempFile(tempTexPath);

      // 处理临时 PDF 文件
      const tempPdfPath = this.getTempPdfPath(tempTexPath, outputDir);
      
      if (fs.existsSync(tempPdfPath)) {
        // 重命名为最终 PDF 文件
        fs.renameSync(tempPdfPath, finalPdfPath);
      }

      // 检查编译结果
      if (exitCode === 0 && fs.existsSync(finalPdfPath)) {
        resolve({ status: 'success', pdfPath: finalPdfPath });
      } else {
        resolve({ status: 'failed', exitCode: exitCode || -1 });
      }

    } catch (error) {
      console.warn('Error during compilation cleanup:', error);
      resolve({ status: 'failed', exitCode: exitCode || -1 });
    }
  }

  /**
   * 获取临时 PDF 文件路径
   */
  private getTempPdfPath(tempTexPath: FilePath, outputDir: FilePath): FilePath {
    const tempBaseName = path.basename(tempTexPath, '.tex');
    return path.join(outputDir, tempBaseName + '.pdf');
  }

  /**
   * 清理临时文件
   */
  private cleanupTempFile(tempTexPath: FilePath): void {
    try {
      if (fs.existsSync(tempTexPath)) {
        fs.unlinkSync(tempTexPath);
      }
    } catch (error) {
      console.warn('Failed to cleanup temp file:', tempTexPath, error);
    }
  }

  /**
   * 检查 tectonic 是否可用
   */
  isTectonicAvailable(): boolean {
    return fs.existsSync(this.tectonicPath);
  }

  /**
   * 获取 tectonic 版本信息
   */
  async getTectonicVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.isTectonicAvailable()) {
        resolve(null);
        return;
      }

      const child = exec(`"${this.tectonicPath}" --version`);
      let output = '';

      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });
      }

      child.on('close', () => {
        resolve(output.trim() || null);
      });

      child.on('error', () => {
        resolve(null);
      });
    });
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
