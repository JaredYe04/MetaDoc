import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import mammoth from 'mammoth';  // docx 转文本的利器
export async function tryConvertFileToText(filePath) {
  try {
    //尝试把各种文件格式转换为文本
    const ext = path.extname(filePath).toLowerCase();
    let text = '';
    switch (ext) {
      case '.txt':
        text = await fs.promises.readFile(filePath, 'utf-8');
        break;
      case '.md':
        text = await fs.promises.readFile(filePath, 'utf-8');
        break;
      case '.pdf':
        text = await pdfToText(filePath);
        break;
      case '.docx':
        text = await docxToText(filePath);
        break;
      default:
        throw new Error('Unsupported file type');
    }
    return text;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
}


const pdfToText = async (filePath) => {
  const dataBuffer = await fs.promises.readFile(filePath);
  try {
    const data = await pdfParse(dataBuffer);
    // data.text 就是pdf的纯文本
    return data.text;
  } catch (err) {
    console.error('Error parsing PDF:', err);
    return '';
  }
};

const docxToText = async (filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    // mammoth 提取纯文本，忽略样式，表格等复杂元素
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    console.error('Error parsing DOCX:', err);
    return '';
  }
};