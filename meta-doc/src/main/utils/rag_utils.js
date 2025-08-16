// rag_utils.js
import fs from 'fs';
import path from 'path';
import { knowledgeUploadDir } from '../express_server';

// ==== 配置 ====
const VECTOR_LEN = 768; // 嵌入维度
const VECTOR_DATABASE_PATH = getVectorDatabasePath(); // 向量数据库路径
export const INDEX_PATH = path.join(VECTOR_DATABASE_PATH, './vector_index.json'); // 存向量
export const DOCS_PATH = path.join(VECTOR_DATABASE_PATH, './vector_docs.json');   // 存文本
export const VECTOR_INFO_PATH = path.join(VECTOR_DATABASE_PATH, './vector_info.json'); // 存文档元信息

// 内存索引
export let vectorIndex = []; // [{id, vector}]
export let docIdToText = new Map();
export let vectorInfo = {};// { [fileBaseName]: { chunks, vector_dim, vector_count } }
// ==== Step 0: 初始化索引 ====

// ==== Step 0: 初始化索引 ====
export async function initAnnoy() {
  if (fs.existsSync(INDEX_PATH) && fs.existsSync(DOCS_PATH)) {
    //console.log('Loading vector index from disk...');
    vectorIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    const docsJson = JSON.parse(fs.readFileSync(DOCS_PATH, 'utf-8'));
    docIdToText = new Map(Object.entries(docsJson));
    //console.log(`Loaded ${docIdToText.size} documents into memory.`);
  } else {
    //console.log('No existing vector index found. Starting fresh.');
  }

  // 加载 vectorInfo
  if (fs.existsSync(VECTOR_INFO_PATH)) {
    vectorInfo = JSON.parse(fs.readFileSync(VECTOR_INFO_PATH, 'utf-8'));
    //console.log(`Loaded vector info for ${Object.keys(vectorInfo).length} documents.`);
  } else {
    vectorInfo = {};
  }
}
export function saveIndex() {
  if (fs.existsSync(INDEX_PATH)) fs.unlinkSync(INDEX_PATH);
  fs.writeFileSync(INDEX_PATH, JSON.stringify(vectorIndex));
}
export function saveDocs() {
  if (fs.existsSync(DOCS_PATH)) fs.unlinkSync(DOCS_PATH);
  fs.writeFileSync(DOCS_PATH, JSON.stringify(Object.fromEntries(docIdToText)));
}
export function saveVectorInfo() {
  if (fs.existsSync(VECTOR_INFO_PATH)) fs.unlinkSync(VECTOR_INFO_PATH);
  fs.writeFileSync(VECTOR_INFO_PATH, JSON.stringify(vectorInfo, null, 2), 'utf-8');
}
// 保存索引
function save() {
  saveIndex();
  saveDocs();
  saveVectorInfo();
}


// 删除指定文档 ID 对应的向量和文本
export function removeFromIndex(fileBaseName) {
  // 删除向量索引中所有匹配该文件的 chunk
  vectorIndex = vectorIndex.filter(vec => !vec.id.startsWith(fileBaseName + '_'));

  // 删除 docIdToText 中所有匹配该文件的 chunk
  for (const key of [...docIdToText.keys()]) {
    if (key.startsWith(fileBaseName + '_')) {
      docIdToText.delete(key);
    }
  }

  // 删除元信息
  if (vectorInfo[fileBaseName]) {
    delete vectorInfo[fileBaseName];
  }

  // 保存更新后的索引
  save();

  console.log(`文档 ${fileBaseName} 及其所有片段已从向量索引中删除，元信息也已清理`);
}


// ==== Step 1: 文本分段 ====

import natural from "natural";


// 高精度文本分段（按语义切分 + overlap）
// 特点：
// 1. 优先按中文/英文的自然句子边界切
// 2. 支持 chunk overlap，减少信息断裂
// 3. 合并过短的片段，提高语义完整度
export function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text || typeof text !== 'string') return [];
  // 1. 标准化空白符
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .join(''); // 按句子分割
  const tokenizer = new natural.SentenceTokenizer();
  let sentences = tokenizer.tokenize(text);
  const chunks = [];
  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    if (isMeaningless(sentences[i])) continue;//除去无意义句子
    const sentence = sentences[i];
    // Overlap: 保留上一段的尾部
    const overlapText = currentChunk.slice(-overlap);
    if ((currentChunk + sentence).length <= chunkSize) {
      currentChunk += sentence;
    } else {
      if(currentChunk.trim().length<=chunkSize){
        chunks.push(currentChunk.trim());
      }
      else{
        // 如果当前 chunk 超过了 chunkSize，则进行切分
        const splitChunks = splitLongChunk(currentChunk, chunkSize);
        chunks.push(...splitChunks);
      }
      currentChunk = overlapText + sentence;
    }
  }
  if (currentChunk.trim() && currentChunk.trim().length <= chunkSize) {
    chunks.push(currentChunk.trim());
  }
  // 3. 合并过短 chunk
  const minLen = Math.floor(chunkSize * 0.4);
  let mergedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    if (
      mergedChunks.length > 0 &&
      chunks[i].length < minLen &&
      (mergedChunks[mergedChunks.length - 1].length + chunks[i].length) <= chunkSize
    ) {
      mergedChunks[mergedChunks.length - 1] += + chunks[i];
    } else {
      mergedChunks.push(chunks[i]);
    }
  }
  //去除所有空的chunk
  mergedChunks = mergedChunks.filter(chunk => chunk.trim().length > 0);
  return mergedChunks;
}
function splitLongChunk(chunk, chunkSize) {
  const splitChunks = [];
  for (let i = 0; i < chunk.length; i += chunkSize) {
    splitChunks.push(chunk.slice(i, i + chunkSize));
  }
  return splitChunks;
}
/**
 * 检测是否为无意义字符串
 * 规则：
 * 1. 纯字母数字且长度 >= 20（疑似Base64/Hash）
 * 2. 非字母数字字符比例 > 0.6
 * 3. 数字比例 > 0.8
 * 4. 长度 < 5 且无中文（太短无信息）
 */
function isMeaningless(str) {
  if (!str) return true;
  const clean = str.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]{20,}$/.test(clean)) return true; // Base64 / 长hash
  const nonAlphaNumRatio = (clean.match(/[^A-Za-z0-9\u4e00-\u9fa5]/g)?.length || 0) / clean.length;
  if (nonAlphaNumRatio > 0.6) return true;
  const digitRatio = (clean.match(/\d/g)?.length || 0) / clean.length;
  if (digitRatio > 0.8) return true;
  if (clean.length < 5 && !/[\u4e00-\u9fa5]/.test(clean)) return true;
  return false;
}

// ==== Step 2: 嵌入模型 ====
let embeddingContext = null;
export async function initEmbedder(modelFileName = "bce-embedding-base_v1-Q8_0.gguf") {
  const { getLlama } = await import("node-llama-cpp");

  // 1. 合并分卷到临时文件
  console.log(`🔄 正在合并模型 ${modelFileName} ...`);
  const mergedPath = await mergeModel(modelFileName);

  // 2. 加载 LLaMA
  console.log(`📂 从 ${mergedPath} 加载模型 ...`);
  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath: mergedPath
  });

  // 3. 创建嵌入上下文
  embeddingContext = await model.createEmbeddingContext();
  console.log("✅ Embedding context initialized");
}

export async function embedText(text) {
  if (!embeddingContext) {
    await initEmbedder();
    //throw new Error('Embedding context not initialized. Please call initEmbedder() first.');
  }
  const embedding = await embeddingContext.getEmbeddingFor(text);
  return embedding.vector;
}

// ==== Step 3: 添加文件到知识库 ====
export async function addFileToKnowledgeBase(filePath) {
  initAnnoy();

  const text = await tryConvertFileToText(filePath);
  const chunks = await chunkText(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    //console.log(chunk.length)
    const vector = await embedText(chunk);

    if (vector.length !== VECTOR_LEN) {
      // console.log(chunk)
      // console.log(chunk.length)
      // console.log(chunks)
      console.warn(`Embedding dimension mismatch: expected ${VECTOR_LEN}, got ${vector.length}`);
    }
    else{
      const id = `${path.basename(filePath)}_${i}`;
      vectorIndex.push({ id, vector });
      docIdToText.set(id, chunk);
    }


  }

  // 更新元信息
  const fileBaseName = path.basename(filePath);
  vectorInfo[fileBaseName] = {
    chunks: chunks.length,
    vector_dim: VECTOR_LEN,
    vector_count: vectorIndex.filter(v => v.id.startsWith(fileBaseName + '_')).length
  };

  save();

  return {
    chunks: chunks.length,
    vector_dim: VECTOR_LEN,
    vector_count: vectorIndex.length
  };
}
/**
 * 重命名知识库文件，同时更新索引和文本映射中的相关内容
 * @param {string} oldName - 旧文件名
 * @param {string} newName - 新文件名
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function renameKnowledgeFile(oldName, newName) {
  const oldFilePath = path.join(knowledgeUploadDir, oldName);
  const newFilePath = path.join(knowledgeUploadDir, newName);

  if (!fs.existsSync(oldFilePath)) {
    return { success: false, message: '原文件不存在' };
  }
  if (fs.existsSync(newFilePath)) {
    return { success: false, message: '新文件名已存在' };
  }

  try {
    // 重命名文件
    fs.renameSync(oldFilePath, newFilePath);

    // 更新 docIdToText 键名
    const newDocIdToText = new Map();
    for (const [docId, text] of docIdToText.entries()) {
      if (docId.startsWith(oldName + '_')) {
        const suffix = docId.substring(oldName.length);
        newDocIdToText.set(newName + suffix, text);
      } else {
        newDocIdToText.set(docId, text);
      }
    }
    docIdToText.clear();
    for (const [k, v] of newDocIdToText.entries()) {
      docIdToText.set(k, v);
    }

    // 更新 vectorIndex 中的 id 和 docId 字段
    vectorIndex = vectorIndex.map(vec => {
      if (vec.id.startsWith(oldName + '_')) {
        const suffix = vec.id.substring(oldName.length);
        return {
          ...vec,
          id: newName + suffix,
          docId: newName,
        };
      }
      return vec;
    });

    // 更新 vectorInfo key
    if (vectorInfo[oldName]) {
      vectorInfo[newName] = vectorInfo[oldName];
      delete vectorInfo[oldName];
    }

    save();

    console.log(`重命名成功: ${oldName} -> ${newName}`);
    return { success: true };
  } catch (err) {
    console.error('重命名失败', err);
    return { success: false, message: '重命名失败: ' + err.message };
  }
}
// ==== Step 4: 查询知识库 ====
import crypto from 'crypto';
import { annoySearch, cosineSimilarity } from './ann_utils';
import { tryConvertFileToText } from './convert_utils';
import { mergeModel } from './merge_model_utils';
import { getVectorDatabasePath } from './resources_path_utils';

const cacheDir = path.join(VECTOR_DATABASE_PATH, 'embedding_cache');
const cacheFile = path.join(cacheDir, 'cache.json');

// 内存缓存
let embedCache = {};

// 初始化缓存
function loadCache() {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  if (fs.existsSync(cacheFile)) {
    try {
      embedCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch (err) {
      console.error('❌ 读取 embedding 缓存失败:', err);
      embedCache = {};
    }
  }
}

// 保存缓存到文件
function saveCache() {
  fs.writeFileSync(cacheFile, JSON.stringify(embedCache), 'utf8');
}

// 生成哈希键（避免长字符串直接当 key）
function hashKey(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}
export async function embedTextCached(text) {
  loadCache(); // 确保缓存已加载

  const key = hashKey(text);
  if (embedCache[key]) {
    return embedCache[key]; // 命中缓存
  }

  // 生成向量（这里调用你现有的 embedText）
  const vector = await embedText(text);

  // 存入缓存
  embedCache[key] = vector;
  saveCache();

  return vector;
}

function keywordScore(query, text) {
  const keywords = query.toLowerCase().split(/\s+/);
  let score = 0;
  for (const word of keywords) {
    if (text.toLowerCase().includes(word)) score += 1;
  }
  return score / keywords.length;
}
function hybridScore(cosSim, keywordSim, wVec = 0.7, wKey = 0.3) {
  return cosSim * wVec + keywordSim * wKey;
}
function rerankResults(queryEmbedding, candidates) {
  return candidates
    .map(r => ({
      ...r,
      rerankScore: cosineSimilarity(queryEmbedding, embedTextCached(r.text)) // 需要同步 embedding
    }))
    .sort((a, b) => b.rerankScore - a.rerankScore);
}
export async function queryKnowledgeBase(question, k = 3) {
  await initAnnoy(); // 确保 Annoy 已加载
  const queryEmbedding = await embedText(question);

  const filteredVectorIndex = vectorIndex.filter(vec => {
    // 找到最后一个下划线的位置
    const lastUnderscoreIndex = vec.id.lastIndexOf('_');
    const baseName = lastUnderscoreIndex !== -1
      ? vec.id.slice(0, lastUnderscoreIndex)
      : vec.id; // 如果没有下划线，就直接用整个
    return vectorInfo[baseName]?.enabled !== false;
  });
  // Step 1: Annoy 召回 topN
  let candidates = annoySearch(queryEmbedding, filteredVectorIndex, docIdToText, 10);

  // Step 2: Hybrid Score（向量 + 关键词）
  candidates.forEach(r => {
    r.keywordSim = keywordScore(question, r.text);
    r.hybridScore = hybridScore(r.cosSim, r.keywordSim);
  });

  // 先按 hybridScore 排序，截断到更小集合
  candidates = candidates.sort((a, b) => b.hybridScore - a.hybridScore).slice(0, 10);

  // Step 3: Rerank（高精度重排）
  candidates = rerankResults(queryEmbedding, candidates);

  // 取前 k 个返回文本
  return candidates.slice(0, k).map(r => r.text);
}

// ==== Step 5: 清空知识库 ====
export async function clearKnowledgeBase() {
  vectorIndex = [];
  docIdToText.clear();
  save();

}
