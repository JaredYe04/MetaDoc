// rag_utils.js
import fs from 'fs';
import path from 'path';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import {  knowledgeUploadDir } from '../express_server';

// ==== 配置 ====
const VECTOR_LEN = 768; // 嵌入维度
const INDEX_PATH = path.resolve('./data/vector_index.json'); // 存向量
const DOCS_PATH = path.resolve('./data/vector_docs.json');   // 存文本
const VECTOR_INFO_PATH = path.resolve('./data/vector_info.json'); // 新增：存文档元信息

// 内存索引
let vectorIndex = []; // [{id, vector}]
let docIdToText = new Map();
export let vectorInfo = {};// { [fileBaseName]: { chunks, vector_dim, vector_count } }
// ==== Step 0: 初始化索引 ====

// ==== Step 0: 初始化索引 ====
export function initAnnoy() {
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


// 保存索引
function saveIndex() {
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  // 先删除旧文件
  if (fs.existsSync(INDEX_PATH)) fs.unlinkSync(INDEX_PATH);
  if (fs.existsSync(DOCS_PATH)) fs.unlinkSync(DOCS_PATH);
  if (fs.existsSync(VECTOR_INFO_PATH)) fs.unlinkSync(VECTOR_INFO_PATH);

  // 写入新文件
  fs.writeFileSync(INDEX_PATH, JSON.stringify(vectorIndex));
  fs.writeFileSync(DOCS_PATH, JSON.stringify(Object.fromEntries(docIdToText)));
  fs.writeFileSync(VECTOR_INFO_PATH, JSON.stringify(vectorInfo, null, 2));

  console.log('Vector index and info saved.');
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
  saveIndex();

  console.log(`文档 ${fileBaseName} 及其所有片段已从向量索引中删除，元信息也已清理`);
}


// ==== Step 1: 文本分段 ====
export async function chunkText(text, chunkSize = 500, overlap = 50) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: overlap,
  });
  return await splitter.splitText(text);
}

// ==== Step 2: 嵌入模型 ====
let embeddingContext = null;

export async function initEmbedder(modelFilePath = './models/nomic-embed-text-v1.5.Q8_0.gguf') {
  const { getLlama } = await import('node-llama-cpp');
  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath: "D:\\MetaDoc\\MetaDoc\\meta-doc\\src\\main\\models\\nomic-embed-text-v1.5.Q8_0.gguf"
  });
  embeddingContext = await model.createEmbeddingContext();
  console.log('Embedding context initialized');
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

  const text = fs.readFileSync(filePath, 'utf-8');
  const chunks = await chunkText(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const vector = await embedText(chunk);

    if (vector.length !== VECTOR_LEN) {
      throw new Error(`Embedding dimension mismatch: expected ${VECTOR_LEN}, got ${vector.length}`);
    }

    const id = `${path.basename(filePath)}_${i}`;
    vectorIndex.push({ id, vector });
    docIdToText.set(id, chunk);
  }

  // 更新元信息
  const fileBaseName = path.basename(filePath);
  vectorInfo[fileBaseName] = {
    chunks: chunks.length,
    vector_dim: VECTOR_LEN,
    vector_count: vectorIndex.filter(v => v.id.startsWith(fileBaseName + '_')).length
  };

  saveIndex();

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

    saveIndex();

    console.log(`重命名成功: ${oldName} -> ${newName}`);
    return { success: true };
  } catch (err) {
    console.error('重命名失败', err);
    return { success: false, message: '重命名失败: ' + err.message };
  }
}
// ==== Step 4: 查询知识库 ====
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function queryKnowledgeBase(question, k = 3) {
  initAnnoy();
  const questionEmbedding = await embedText(question);

  return vectorIndex
    .map(({ id, vector }) => ({
      id,
      score: cosineSimilarity(questionEmbedding, vector)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(r => docIdToText.get(r.id))
    .filter(Boolean);
}

// ==== Step 5: RAG 查询 ====
export async function ragQuery(question, llmCallFunc) {
  const contextDocs = await queryKnowledgeBase(question);
  const context = contextDocs.join('\n');

  const prompt = `
你是一个知识问答助手，请根据以下已知信息回答问题。
已知信息：
${context}

问题：${question}

回答：
  `;

  return await llmCallFunc(prompt);
}

// ==== Step 6: 清空知识库 ====
export async function clearKnowledgeBase() {
  vectorIndex = [];
  docIdToText.clear();
  saveIndex();
  console.log('知识库已清空');
}
