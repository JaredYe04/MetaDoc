// file: latexCompiler.js
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getResourcesPath } from './resources_path_utils';



/**
 * 编译 LaTeX 文件生成 PDF
 * @param {string} texFilePath - 原始 LaTeX 文件路径（用于确定输出 PDF 名称）
 * @param {string} tex - 要编译的 LaTeX 文本内容
 * @param {string} outputDir - 输出目录，可为空，默认同 tex 文件目录
 * @param {BrowserWindow} mainWindow - Electron 主窗口，用于发送 console 输出
 * @param {string} [customPdfFileName] - 可选 PDF 文件名，如果提供则使用
 * @returns {Promise<{status: 'success'|'failed', pdfPath?: string, exitCode?: number}>}
 */
export async function compileLatexToPDF(
  texFilePath,
  tex,
  outputDir,
  mainWindow,
  customPdfFileName
) {
  return new Promise((resolve) => {
    try {
      // 如果 tex 内容为空，直接返回失败
      if (!tex || tex.trim() === '') {
        return resolve({ status: 'failed', exitCode: -1 });
      }

      // 1️⃣ 生成输出目录（默认与原文件同目录）
      if (!outputDir) {
        outputDir = path.dirname(texFilePath);
      }
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 2️⃣ 创建临时 tex 文件
      const tempTexPath = path.join(outputDir, `__temp_compile_${Date.now()}.tex`);
      fs.writeFileSync(tempTexPath, tex, 'utf-8');

      // 3️⃣ 确定输出 PDF 名称（仍然根据 texFilePath）
      const pdfFileName = customPdfFileName
        ? customPdfFileName
        : path.basename(texFilePath, path.extname(texFilePath)) + '.pdf';
      const pdfPath = path.join(outputDir, pdfFileName);

      // 4️⃣ 执行编译命令
      const tectonicPath = path.join(getResourcesPath(), 'tectonic.exe');
      const cmd = `"${tectonicPath}" "${tempTexPath}" --outdir="${outputDir}"`;

      const child = exec(cmd);

      // 输出 stdout
      child.stdout.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('console-out', data.toString());
      });

      // 输出 stderr
      child.stderr.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('console-err', data.toString());
      });

      // 5️⃣ 编译完成后处理结果
      child.on('close', (code) => {
        try {
          // 删除临时文件（不论成功失败）
          if (fs.existsSync(tempTexPath)) fs.unlinkSync(tempTexPath);
          // 临时 PDF 名称
          const tempPdfPath = path.join(outputDir, path.basename(tempTexPath, '.tex') + '.pdf');

          // 如果生成了临时 PDF，则重命名为目标 PDF
          if (fs.existsSync(tempPdfPath)) {
            fs.renameSync(tempPdfPath, pdfPath);
          }

        } catch (err) {
          console.warn('删除临时文件失败：', err);
        }

        if (code === 0 && fs.existsSync(pdfPath)) {
          resolve({ status: 'success', pdfPath });
        } else {
          resolve({ status: 'failed', exitCode: code });
        }
      });
    } catch (err) {
      // 异常捕获：删除临时文件
      if (fs.existsSync(tempTexPath)) fs.unlinkSync(tempTexPath);
      resolve({ status: 'failed', exitCode: -1 });
    }
  });
}
