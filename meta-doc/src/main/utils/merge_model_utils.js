import fs from "fs";
import path from "path";
import { getResourcesPath } from "./resources_path_utils";

//resources的路径和models相同
const RESOURCES_PATH = getResourcesPath();
const MODELS_JSON = path.join(RESOURCES_PATH, "models.json");

/**
 * 合并模型分卷
 * @param {string} modelFileName 模型名，例如 "nomic-embed-text-v1.5.Q5_K_M.gguf"
 * @returns {Promise<string>} 返回完整模型路径
 */
export async function mergeModel(modelFileName) {
  const modelsData = JSON.parse(fs.readFileSync(MODELS_JSON, "utf-8"));
  //console.log(modelsData)
  const exists = modelsData.some(model => model === modelFileName);
  if (!exists) throw new Error(`模型 ${modelFileName} 在 models.json 中未找到`);

  const mergedPath = path.join(RESOURCES_PATH, modelFileName);

  // 1. 如果完整模型存在，尝试删除分卷并返回
  if (fs.existsSync(mergedPath)) {
    //console.log(`完整模型已存在: ${mergedPath}`);
    const partFiles = fs.readdirSync(RESOURCES_PATH).filter(f => f.startsWith(modelFileName + ".part"));
    for (const pf of partFiles) fs.unlinkSync(path.join(RESOURCES_PATH, pf));
    return mergedPath;
  }

  // 2. 分卷合并
  const partFiles = fs.readdirSync(RESOURCES_PATH)
    .filter(f => f.startsWith(modelFileName + ".part"))
    .sort(); // 保证顺序

  if (partFiles.length === 0) throw new Error(`模型 ${modelFileName} 的分卷文件不存在`);

  //console.log(`🔗 合并 ${partFiles.length} 个分卷为完整模型...`);

  const writeStream = fs.createWriteStream(mergedPath, { flags: "w" });

  for (const part of partFiles) {
    const partPath = path.join(RESOURCES_PATH, part);
    const data = fs.readFileSync(partPath);
    writeStream.write(data);
    fs.unlinkSync(partPath); // 合并后删除分卷
  }

  writeStream.close();
  //console.log(`✅ 模型合并完成: ${mergedPath}`);
  return mergedPath;
}
