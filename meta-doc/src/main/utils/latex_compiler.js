// file: latexCompiler.js
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getResourcesPath } from './resources_path_utils';


/**
 * 编译 LaTeX 文件生成 PDF
 * @param {string} texFilePath - LaTeX 文件路径
 * @param {string} outputDir - 输出目录，可为空，默认同 tex 文件目录
 * @param {BrowserWindow} mainWindow - Electron 主窗口，用于发送 console 输出
 * @returns {Promise<{status: 'success'|'failed', pdfPath?: string, exitCode?: number}>}
 */
export async function compileLatexToPDF(texFilePath, outputDir = '', mainWindow) {
  return new Promise((resolve) => {
    if (!fs.existsSync(texFilePath)) {
      return resolve({
        status: 'failed',
        exitCode: -1,
      });
    }

    // 如果 outputDir 为空，则默认使用 tex 文件同目录
    if (!outputDir) {
      outputDir = path.dirname(texFilePath);
    }

    // 确保 outputDir 存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const tectonicPath = path.join(getResourcesPath(), 'tectonic.exe');
    const cmd = `"${tectonicPath}" "${texFilePath}" --outdir="${outputDir}"`;

    const child = exec(cmd);

    // 输出 stdout
    child.stdout.on('data', (data) => {
      if (mainWindow) mainWindow.webContents.send('console-out', data.toString());
    });

    // 输出 stderr
    child.stderr.on('data', (data) => {
      if (mainWindow) mainWindow.webContents.send('console-err', data.toString());
    });

    child.on('close', (code) => {
      if (code === 0) {
        const pdfFileName = path.basename(texFilePath, path.extname(texFilePath)) + '.pdf';
        const pdfPath = path.join(outputDir, pdfFileName);
        if (fs.existsSync(pdfPath)) {
          resolve({
            status: 'success',
            pdfPath,
          });
        } else {
          resolve({
            status: 'failed',
            exitCode: code,
          });
        }
      } else {
        resolve({
          status: 'failed',
          exitCode: code,
        });
      }
    });
  });
}
