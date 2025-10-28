/**
 * Express 服务器 - TypeScript 重构版本
 * 提供本地CDN服务和知识库API
 */

// @ts-ignore
import express, { Request, Response, Application } from 'express';
import { Server } from 'http';
// @ts-ignore  
import cors from 'cors';
// @ts-ignore
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { 
  tryConvertFileToText, 
  addFileToKnowledgeBase, 
  clearKnowledgeBase, 
  initVectorDatabase, 
  removeFromIndex, 
  renameKnowledgeFile, 
  saveDocs, 
  saveVectorInfo, 
  vectorInfo 
} from './utils';
import type { 
  FilePath, 
  FileUploadResult, 
  OperationResult,
  KnowledgeItem 
} from '../types/utils';

// ============ 接口定义 ============

interface KnowledgeUploadRequest extends Request {
  file?: any; // Multer File type
}

interface KnowledgeRenameRequest extends Request {
  body: {
    oldName: string;
    newName: string;
  };
}

interface KnowledgeToggleRequest extends Request {
  params: {
    id: string;
  };
  body: {
    enabled: boolean;
  };
}

interface ImageUploadRequest extends Request {
  files?: any[]; // Multer Files array
}

interface UrlUploadRequest extends Request {
  body: {
    url: string;
  };
}

// ============ 全局变量 ============

export let imageUploadDir: FilePath = '';
export let knowledgeUploadDir: FilePath = '';
export let knowledgeItems: KnowledgeItem[] = [];

const expressApp: Application = express();

// ============ 主要功能 ============

/**
 * 启动Express服务器
 */
export const runExpressServer = (): void => {
  const projectRoot = path.resolve(path.resolve(__dirname, '../'), '../');
  
  setupStaticFiles(projectRoot);
  setupAPIs();
  setupBodyParser();
  startServer();
};

/**
 * 设置静态文件服务
 */
function setupStaticFiles(projectRoot: string): void {
  const vditorDir = path.join(projectRoot, 'node_modules/vditor');
  const monacoDir = path.join(projectRoot, 'node_modules/monaco-editor/esm/vs');

  expressApp.use(cors());
  
  // Vditor 静态资源
  expressApp.use('/vditor', express.static(vditorDir));
  expressApp.get('/vditor/*', (req: Request, res: Response) => {
    console.log('Request for Vditor file:', req.path);
  });
  
  // Monaco Editor 静态资源
  expressApp.use('/monaco', express.static(monacoDir));
  expressApp.get('/monaco/*', (req: Request, res: Response) => {
    console.log('Request for Monaco file:', req.path);
  });
}

/**
 * 设置API路由
 */
function setupAPIs(): void {
  setupImageAPI();
  setupKnowledgeAPI();
}

/**
 * 设置请求体解析器
 */
function setupBodyParser(): void {
  const bodyParser = require('body-parser');
  expressApp.use(bodyParser.json());
  expressApp.use(bodyParser.urlencoded({ extended: true }));
}

/**
 * 启动HTTP服务器
 */
function startServer(): void {
  const server: Server = require('http').createServer(expressApp);
  
  server.listen(3000, () => {
    console.log('Local CDN server running at http://localhost:3000');
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error('Port 3000 is already in use. Retrying...');
      setTimeout(() => {
        server.close();
        server.listen(3000);
      }, 10000);
    }
  });
}

// ============ 图片API ============

/**
 * 设置图片上传API
 */
function setupImageAPI(): void {
  setupImageUploadDir();
  
  const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
      cb(null, imageUploadDir);
    },
    filename: (req: any, file: any, cb: any) => {
      const timestamp = Date.now();
      cb(null, `${timestamp}_${file.originalname}`);
    },
  });

  const upload = multer({ storage });
  
  // 静态文件服务
  expressApp.use('/images', express.static(imageUploadDir));
  
  // 文件上传接口
  expressApp.post('/api/image/upload', upload.array('file[]'), handleImageUpload);
  
  // URL上传接口
  expressApp.post('/api/image/url-upload', handleUrlUpload);
}

/**
 * 设置图片上传目录
 */
function setupImageUploadDir(): void {
  imageUploadDir = path.join(os.homedir(), 'Pictures', 'meta-doc-imgs');
  if (!fs.existsSync(imageUploadDir)) {
    fs.mkdirSync(imageUploadDir, { recursive: true });
  }
}

/**
 * 处理图片文件上传
 */
function handleImageUpload(req: ImageUploadRequest, res: Response): void {
  const errFiles: string[] = [];
  const succMap: Record<string, string> = {};

  if (req.files && req.files.length > 0) {
    req.files.forEach((file) => {
      const filePath = path.join(imageUploadDir, file.filename);
      succMap[file.filename] = filePath;
    });

    if (Object.keys(succMap).length === 0) {
      errFiles.push('没有上传任何文件');
    }
  } else {
    errFiles.push('上传失败');
  }

  res.json({
    msg: '',
    code: 0,
    data: {
      errFiles,
      succMap,
    },
  });
}

/**
 * 处理URL上传
 */
function handleUrlUpload(req: UrlUploadRequest, res: Response): void {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'No URL provided' });
  }

  let ext = path.extname(new URL(url).pathname);
  
  if (!ext) {
    // 从Content-Type推断扩展名的逻辑保持不变
    ext = '';
  }

  const fileName = `${Date.now()}${ext}`;
  const filePath = path.join(imageUploadDir, fileName);
  const fileStream = fs.createWriteStream(filePath);
  
  const https = require('https');
  const http = require('http');
  const protocol = url.startsWith('https') ? https : http;

  protocol.get(url, (response: any) => {
    if (response.statusCode === 200) {
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => {
          res.json({
            msg: '',
            code: 0,
            data: {
              originalURL: url,
              url: filePath,
            },
          });
        });
      });
    } else {
      res.status(500).json({ error: 'Failed to download image' });
    }
  }).on('error', (err: Error) => {
    console.error('Error downloading image:', err);
    res.status(500).json({ error: 'Failed to download image' });
  });
}

// ============ 知识库API ============

/**
 * 设置知识库API
 */
async function setupKnowledgeAPI(): Promise<void> {
  await initVectorDatabase();
  
  setupKnowledgeUploadDir();
  
  const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => cb(null, knowledgeUploadDir),
    filename: handleKnowledgeFilename,
  });
  
  const upload = multer({ storage });
  
  refreshKnowledgeItems();
  
  // API 路由
  expressApp.get('/api/knowledge/list', handleKnowledgeList);
  expressApp.post('/api/knowledge/upload', upload.single('file'), handleKnowledgeUpload);
  expressApp.post('/api/knowledge/rename', handleKnowledgeRename);
  expressApp.delete('/api/knowledge/:id', handleKnowledgeDelete);
  expressApp.post('/api/knowledge/clear', handleKnowledgeClear);
  expressApp.get('/api/knowledge/:id/preview', handleKnowledgePreview);
  expressApp.get('/api/knowledge/:id/info', handleKnowledgeInfo);
  expressApp.post('/api/knowledge/:id/toggle', handleKnowledgeToggle);
  expressApp.post('/api/knowledge/:id/rebuild', handleKnowledgeRebuild);
  expressApp.get('/api/knowledge/:id/download', handleKnowledgeDownload);
}

/**
 * 设置知识库上传目录
 */
function setupKnowledgeUploadDir(): void {
  knowledgeUploadDir = path.join(os.homedir(), 'Documents', 'meta-doc-kb');
  fs.mkdirSync(knowledgeUploadDir, { recursive: true });
}

/**
 * 处理知识库文件命名
 */
function handleKnowledgeFilename(req: any, file: any, cb: any): void {
  const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const existingFiles = fs.readdirSync(knowledgeUploadDir);
  const hasDuplicate = existingFiles.some(f => f === utf8Name);
  
  const fileName = hasDuplicate 
    ? `${Date.now()}_${utf8Name}`
    : utf8Name;
    
  cb(null, fileName);
}

/**
 * 格式化文件大小
 */
function humanSize(bytes: number): string {
  if (!bytes && bytes !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let u = 0, n = bytes;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n.toFixed(1)} ${units[u]}`;
}

/**
 * 刷新知识库项目列表
 */
function refreshKnowledgeItems(): void {
  const files = fs.readdirSync(knowledgeUploadDir)
    .filter(f => fs.statSync(path.join(knowledgeUploadDir, f)).isFile());
    
  knowledgeItems = files.map(f => {
    const fullPath = path.join(knowledgeUploadDir, f);
    const stats = fs.statSync(fullPath);
    const name = path.basename(f);
    const info = vectorInfo[name] || { chunks: 0, vector_dim: 0, vector_count: 0 };
    
    return {
      id: f,
      name,
      info: {
        path: fullPath,
        size: stats.size,
        sizeText: humanSize(stats.size),
        enabled: info.enabled,
        chunks: info.chunks,
        vector_dim: info.vector_dim,
        vector_count: info.vector_count
      }
    };
  });
}

// ============ 知识库API处理器 ============

function handleKnowledgeList(req: Request, res: Response): void {
  res.json({ items: knowledgeItems });
}

async function handleKnowledgeUpload(req: KnowledgeUploadRequest, res: Response): Promise<void> {
  if (!req.file) {
    return res.json({ success: false, message: '没有上传任何文件' });
  }

  const fileName = req.file.filename;
  const fullPath = path.join(knowledgeUploadDir, fileName);

  try {
    const result: FileUploadResult = await addFileToKnowledgeBase(fullPath);
    
    if (result.success) {
      knowledgeItems.push({
        id: fileName,
        name: fileName,
        info: {
          path: fullPath,
          enabled: true,
          size: req.file.size,
          sizeText: humanSize(req.file.size),
          chunks: result.chunks || 0,
          vector_dim: result.vector_dim || 0,
          vector_count: result.vector_count || 0
        }
      });
    }
    
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    console.error('addFileToKnowledgeBase error:', err);
    res.json({ success: false, message: (err as Error).message });
  }
}

async function handleKnowledgeRename(req: KnowledgeRenameRequest, res: Response): Promise<void> {
  const { oldName, newName } = req.body;
  
  if (!oldName || !newName) {
    return res.json({ success: false, message: '参数缺失' });
  }

  const result: OperationResult = await renameKnowledgeFile(oldName, newName);
  
  if (result.success) {
    // 更新知识项映射
    knowledgeItems = knowledgeItems.map(item => {
      if (item.id === oldName) {
        item.id = newName;
        item.name = newName;
        
        if (item.info.path.includes(oldName)) {
          item.info.path = item.info.path.replace(oldName, newName);
        }
      }
      return item;
    });
  }
  
  res.json(result);
}

async function handleKnowledgeDelete(req: Request, res: Response): Promise<void> {
  const fileBaseName = req.params.id;
  const index = knowledgeItems.findIndex(i => i.id === fileBaseName);

  if (index === -1) {
    return res.json({ success: false, message: '文件不存在' });
  }

  const filePath = path.join(knowledgeUploadDir, fileBaseName);
  
  try {
    fs.unlinkSync(filePath);
    knowledgeItems.splice(index, 1);
    removeFromIndex(fileBaseName);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: '删除失败: ' + (err as Error).message });
  }
}

async function handleKnowledgeClear(req: Request, res: Response): Promise<void> {
  try {
    await clearKnowledgeBase();
    knowledgeItems = [];
    res.json({ success: true });
  } catch (err) {
    console.error('清空知识库失败', err);
    res.json({ success: false, message: (err as Error).message });
  }
}

async function handleKnowledgePreview(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const filePath = path.join(knowledgeUploadDir, id);
  
  if (!fs.existsSync(filePath)) {
    return res.json({ preview: '', truncated: false });
  }

  try {
    const content = await tryConvertFileToText(filePath);
    const limit = 8000;
    const truncated = content ? content.length > limit : false;
    
    res.json({ 
      preview: truncated && content ? content.slice(0, limit) : (content || ''), 
      truncated 
    });
  } catch (err) {
    console.error('预览失败', err);
    res.json({ preview: '', truncated: false });
  }
}

function handleKnowledgeInfo(req: Request, res: Response): void {
  const id = req.params.id;
  const item = knowledgeItems.find(i => i.id === id);
  
  if (!item) {
    return res.json({ success: false, message: '找不到文件信息' });
  }
  
  res.json({
    success: true,
    ...item.info,
  });
}

function handleKnowledgeToggle(req: KnowledgeToggleRequest, res: Response): void {
  const id = req.params.id;

  if (!vectorInfo[id]) {
    return res.json({ success: false, message: '找不到文件' });
  }
  
  vectorInfo[id].enabled = !!req.body.enabled;
  saveDocs();
  saveVectorInfo();
  refreshKnowledgeItems();
  
  res.json({ success: true, enabled: vectorInfo[id].enabled });
}

async function handleKnowledgeRebuild(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const item = knowledgeItems.find(i => i.id === id);
  
  if (!item) {
    return res.json({ success: false, message: '找不到文件' });
  }

  try {
    await clearKnowledgeBase();
    
    const enabledItems = knowledgeItems.filter(i => i.info.enabled);
    for (const kitem of enabledItems) {
      await addFileToKnowledgeBase(kitem.info.path);
    }
    
    res.json({ success: true, message: '重建知识库成功' });
  } catch (err) {
    console.error('重建知识库失败', err);
    res.json({ success: false, message: '重建失败: ' + (err as Error).message });
  }
}

function handleKnowledgeDownload(req: Request, res: Response): void {
  const id = req.params.id;
  const item = knowledgeItems.find(i => i.id === id);
  
  if (!item) {
    return res.status(404).send('文件不存在');
  }
  
  res.download(item.info.path, item.name);
}
