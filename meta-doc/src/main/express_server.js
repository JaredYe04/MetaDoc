
import { addFileToKnowledgeBase, clearKnowledgeBase, initAnnoy, removeFromIndex, renameKnowledgeFile, vectorInfo } from './utils/rag_utils.js';

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
export let imageUploadDir = "";
export let knowledgeUploadDir = "";
export let knowledgeItems = [];

const expressApp = express();
export const runExpressServer = () => {

  const projectRoot = path.resolve(path.resolve(__dirname, '../'), '../');  // 根据 out/main 路径上一级即为根目录
  const dir = path.join(projectRoot, 'node_modules/vditor')
  // 将 node_modules/vditor 作为静态资源暴露
  expressApp.use(cors());
  expressApp.use('/vditor', express.static(dir));
  expressApp.get('/vditor/*', (req, res) => {
    console.log('Request for Vditor file:', req.path); // 输出请求的文件路径
  });
  imageApi();
  knowledgeApi();
  const bodyParser = require('body-parser');
  expressApp.use(bodyParser.json()); // 解析 JSON 格式的请求体
  expressApp.use(bodyParser.urlencoded({ extended: true })); // 解析 URL 编码的请求体


  // expressApp.use('/images', express.static(path.join(__dirname, 'images')));
  const server = http.createServer(expressApp);
  // 在本地运行 HTTP 服务器
  server.listen(3000, () => {
    console.log('Local CDN server running at http://localhost:3000');
    //console.log(dir)
  });
  //但是如果已经运行了，就每隔10秒重试一次
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error('Port 3000 is already in use. Retrying...');
      setTimeout(() => {
        server.close();
        server.listen(3000);
      }, 10000); // 每隔10秒重试一次，如果连接成功就不会触发error事件
    }
  })

}

const imageApi = () => {
  /////////////////////////////////////上传图片API/////////////////////////////////////
  // 设置上传目录
  // 获取系统图片目录路径
  // 如果目录不存在，则创建
  imageUploadDir = path.join(os.homedir(), 'Pictures', 'meta-doc-imgs');
  if (!fs.existsSync(imageUploadDir)) {
    fs.mkdirSync(imageUploadDir, { recursive: true }); // 递归创建目录
  }

  // 配置 multer 存储
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, imageUploadDir); // 图片保存到系统图片目录下的 meta-doc-imgs 文件夹
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now(); // 时间戳命名
      cb(null, `${timestamp}_${file.originalname}`);
    },
  });

  const upload = multer({ storage });
  // 配置静态文件服务
  expressApp.use('/images', express.static(imageUploadDir));
  // 创建上传接口
  expressApp.post('/api/image/upload', upload.array('file[]'), (req, res) => {
    //console.log(req)
    const errFiles = [];
    const succMap = {};

    // 处理上传的文件
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const filePath = path.join(imageUploadDir, file.filename);
        succMap[file.filename] = filePath; // 文件路径映射
      });

      // 如果没有任何上传成功的文件，返回错误
      if (Object.keys(succMap).length === 0) {
        errFiles.push('没有上传任何文件');
      }
    } else {
      errFiles.push('上传失败');
    }

    // 返回 Vditor 需要的格式
    res.json({
      msg: '',
      code: 0,
      data: {
        errFiles: errFiles, // 失败的文件
        succMap: succMap, // 成功的文件路径映射
      },
    });
  }).on('error', (err) => {
    console.error('Error uploading image:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  });
  expressApp.post('/api/image/url-upload', (req, res) => {

    const { url } = req.body; // 从请求体中获取 URL
    if (!url) {
      return res.status(400).json({ error: 'No URL provided' });
    }
    //下载到本地，与/upload接口一致，然后返回本地的图片链接
    // 尝试从 URL 获取扩展名
    let ext = path.extname(new URL(url).pathname);
    // 如果 URL 里没有扩展名，从 Content-Type 推断
    if (!ext) {
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('image/jpeg')) ext = '.jpg';
      else if (contentType.includes('image/png')) ext = '.png';
      else if (contentType.includes('image/gif')) ext = '.gif';
      else if (contentType.includes('image/webp')) ext = '.webp';
      else ext = ''; // 实在推断不出来就空
    }
    const fileName = `${Date.now()}${ext}`;
    const filePath = path.join(imageUploadDir, fileName); // 保存路径
    const fileStream = fs.createWriteStream(filePath);
    const https = require('https');
    const http = require('http');
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => {
            // 返回成功的图片链接，此处为文件的绝对路径
            res.json({
              msg: '',
              code: 0,
              data: {
                originalURL: url,
                url: `${filePath}`, // 返回本地文件的绝对路径
              },
            });
          });
        });
      } else {
        res.status(500).json({ error: 'Failed to download image' });
      }
    }).on('error', (err) => {
      console.error('Error downloading image:', err);
      res.status(500).json({ error: 'Failed to download image' });
    });
  })

}

const knowledgeApi = async () => {
  await initAnnoy(); // 初始化 Annoy 实例
  let timestamp = Date.now();//在正常情况下，不需要用timestamp，如果检查到有重复文件，就需要用这个时间戳来重命名文件
  knowledgeUploadDir = path.join(os.homedir(), 'Documents', 'meta-doc-kb');
  fs.mkdirSync(knowledgeUploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, knowledgeUploadDir),
    filename: (req, file, cb) => {
      
      const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');//utf8格式的原始文件名
      //检查重复文件
      const existingFiles = fs.readdirSync(knowledgeUploadDir);
      const hasDuplicate = existingFiles.some(f => f === `${utf8Name}`);
      let fileName = '';
      if (hasDuplicate) {
        timestamp = Date.now();
        fileName = `${timestamp}_${utf8Name}`;
      }
      else{
        timestamp = -1;
        fileName = `${utf8Name}`;
      }
      cb(null, `${fileName}`);
    },
  });
  const upload = multer({ storage });



  function humanSize(bytes) {
    if (!bytes && bytes !== 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let u = 0, n = bytes;
    while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
    return `${n.toFixed(1)} ${units[u]}`;
  }

  function scanFiles() {
    //console.log('Scanning knowledge base directory:', knowledgeUploadDir);
    const files = fs.readdirSync(knowledgeUploadDir)
      .filter(f => fs.statSync(path.join(knowledgeUploadDir, f)).isFile());
    knowledgeItems = files.map(f => {
      const fullPath = path.join(knowledgeUploadDir, f);
      const stats = fs.statSync(fullPath);
      const name = path.basename(f);
      //console.log(`Found knowledge file: ${name}`);
      const info = vectorInfo[name] || { chunks: 0, vector_dim: 0, vector_count: 0 };
      return {
        id: f,
        name,
        enabled: true,
        info: {
          path: fullPath,
          size: stats.size,
          sizeText: humanSize(stats.size),
          chunks: info.chunks,
          vector_dim: info.vector_dim,
          vector_count: info.vector_count
        }
      };
    });
  }
  scanFiles();

  expressApp.get('/api/knowledge/list', (req, res) => {
    res.json({ items: knowledgeItems });
  });

  expressApp.post('/api/knowledge/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.json({ success: false, message: '没有上传任何文件' });
    }
    const utf8Name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const fileName = timestamp===-1 ? `${utf8Name}` : `${timestamp}_${utf8Name}`;
    const fullPath = path.join(knowledgeUploadDir, fileName);

    //console.log('Received file:', fullPath);
    try {
      const {
        chunks,
        vector_dim,
        vector_count
      } = await addFileToKnowledgeBase(fullPath);
      knowledgeItems.push({
        id: fileName,
        name: fileName,
        enabled: true,
        info: {
          path: fullPath,
          size: req.file.size,
          sizeText: humanSize(req.file.size),
          chunks,
          vector_dim,
          vector_count
        }
      });
      res.json({ success: true, message: '上传并添加到知识库成功' });
    } catch (err) {
      console.error('addFileToKnowledgeBase error:', err);
      res.json({ success: false, message: '上传成功，但添加知识库失败: ' + err.message });
    }
  });

  expressApp.post('/api/knowledge/rename', async (req, res) => {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.json({ success: false, message: '参数缺失' });
    }
    const result = await renameKnowledgeFile(oldName, newName);
    //更新知识项映射
    knowledgeItems = knowledgeItems.map(item => {
      if (item.id === oldName) {
        item.id = newName;
      }
      if (item.name === oldName) {
        item.name = newName;
      }
      if (item.path && item.path.includes(oldName)) {
        item.path = item.path.replace(oldName, newName);
      }
      return item;
    });
    res.json(result);
  });
  // 删除 API
  expressApp.delete('/api/knowledge/:id', async (req, res) => {
    const fileBaseName = req.params.id; // 例如 "ICPC算法竞赛指南.md"
    const index = knowledgeItems.findIndex(i => i.id === fileBaseName);

    if (index === -1) {
      return res.json({ success: false, message: '文件不存在' });
    }

    const filePath = path.join(knowledgeUploadDir, fileBaseName);
    try {
      fs.unlinkSync(filePath);
      knowledgeItems.splice(index, 1);
      //console.log(`已删除文件: ${fileBaseName}`);
      // 删除对应文件的所有向量 & 文本
      removeFromIndex(fileBaseName);

      res.json({ success: true });
    } catch (err) {
      //console.error('删除文件失败', err);
      res.json({ success: false, message: '删除失败: ' + err.message });
    }
  });

  expressApp.get('/api/knowledge/:id/preview', (req, res) => {
    const id = req.params.id;
    const filePath = path.join(knowledgeUploadDir, id);
    if (!fs.existsSync(filePath)) {
      return res.json({ preview: '', truncated: false });
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const limit = 8000;
      const truncated = content.length > limit;
      res.json({ preview: truncated ? content.slice(0, limit) : content, truncated });
    } catch (err) {
      console.error('预览失败', err);
      res.json({ preview: '', truncated: false });
    }
  });

  expressApp.get('/api/knowledge/:id/info', (req, res) => {
    const id = req.params.id;
    const item = knowledgeItems.find(i => i.id === id);
    if (!item) return res.json({ success: false, message: '找不到文件信息' });
    res.json({ success: true, ...item.info, path: item.info.path });
  });

  expressApp.post('/api/knowledge/:id/toggle', express.json(), (req, res) => {
    const id = req.params.id;
    const item = knowledgeItems.find(i => i.id === id);
    if (!item) return res.json({ success: false, message: '找不到文件' });
    item.enabled = !!req.body.enabled;
    res.json({ success: true, enabled: item.enabled });
  });

  expressApp.post('/api/knowledge/:id/rebuild', async (req, res) => {
    const id = req.params.id;
    const item = knowledgeItems.find(i => i.id === id);
    if (!item) return res.json({ success: false, message: '找不到文件' });

    try {
      await clearKnowledgeBase();
      for (const kitem of knowledgeItems.filter(i => i.enabled)) {
        await addFileToKnowledgeBase(kitem.info.path);
      }
      res.json({ success: true, message: '重建知识库成功' });
    } catch (err) {
      console.error('重建知识库失败', err);
      res.json({ success: false, message: '重建失败: ' + err.message });
    }
  });

  expressApp.get('/api/knowledge/:id/download', (req, res) => {
    const id = req.params.id;
    const item = knowledgeItems.find(i => i.id === id);
    if (!item) {
      return res.status(404).send('文件不存在');
    }
    res.download(item.info.path, item.name);
  });
};