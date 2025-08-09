// ann_utils.js
const VECTOR_LEN = 768;
const BUCKET_BITS = 8; // 用于桶划分的维度数
const BUCKET_SIZE = 1 << BUCKET_BITS; // 256个桶

/**
 * 余弦相似度计算
 * @param {number[]} vecA 
 * @param {number[]} vecB 
 * @returns {number} similarity
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 构建倒排索引
 * @param {Array<{id:string, vector:number[]}>} vectorIndex 
 * @returns {Map<string, Array<{id:string, vector:number[]}>>} invertedIndex
 */
function buildInvertedIndex(vectorIndex) {
  // console.log('Building inverted index...');
  // console.log(vectorIndex)
  const invertedIndex = new Map();

  for (const item of vectorIndex) {
    // 归一化向量
    const norm = Math.sqrt(item.vector.reduce((sum, x) => sum + x * x, 0));
    const normalizedVec = item.vector.map(x => x / norm);

    // 用前 BUCKET_BITS 维量化为桶key
    let bucketKey = '';
    for (let i = 0; i < BUCKET_BITS; i++) {
      let v = normalizedVec[i];
      let q = Math.floor(((v + 1) / 2) * 255);
      bucketKey += String.fromCharCode(q);
    }

    if (!invertedIndex.has(bucketKey)) {
      invertedIndex.set(bucketKey, []);
    }
    invertedIndex.get(bucketKey).push(item);
  }

  return invertedIndex;
}

/**
 * 简单ANN搜索：先粗排桶筛选，再精排余弦相似度排序
 * @param {number[]} queryEmbedding 查询向量
 * @param {Array<{id:string, vector:number[]}>} vectorIndex 全量向量列表
 * @param {Map<string,string>|Object} docIdToText id到文本的映射
 * @param {number} topN 返回最相关的数量，默认30
 * @returns {Array<{id:string, cosSim:number, text:string}>}
 */
function annoySearch(queryEmbedding, vectorIndex, docIdToText, topN = 30) {
  // 构建倒排索引
  const invertedIndex = buildInvertedIndex(vectorIndex);

  // 归一化查询向量
  const norm = Math.sqrt(queryEmbedding.reduce((sum, x) => sum + x * x, 0));
  const normalizedQuery = queryEmbedding.map(x => x / norm);

  // 量化查询向量桶key
  let bucketKey = '';
  for (let i = 0; i < BUCKET_BITS; i++) {
    let v = normalizedQuery[i];
    let q = Math.floor(((v + 1) / 2) * 255);
    bucketKey += String.fromCharCode(q);
  }

  // 获取桶中候选项
  let candidates = invertedIndex.get(bucketKey) || [];

  // 如果候选太少，扩展为全量
  if (candidates.length < topN) {
    candidates = vectorIndex;
  }

  // 精排，计算余弦相似度并排序
  const results = candidates
    .map(({ id, vector }) => ({
      id,
      cosSim: cosineSimilarity(queryEmbedding, vector),
      text: docIdToText instanceof Map ? docIdToText.get(id) || '' : (docIdToText[id] || ''),
    }))
    .sort((a, b) => b.cosSim - a.cosSim)
    .slice(0, topN);

  return results;
}

export {
  cosineSimilarity,
  buildInvertedIndex,
  annoySearch,
};
