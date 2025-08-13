import os
import json

PATCH_SIZE = 99 * 1024 * 1024  # 99MB
BASE_PATH='D:\\MetaDoc\\MetaDoc\\meta-doc\\resources\\'
MODELS_JSON = BASE_PATH+"models.json"

def split_file(file_path, part_size=PATCH_SIZE):
    """将文件按 part_size 大小拆分"""
    file_size = os.path.getsize(file_path)
    part_num = 1
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(part_size)
            if not chunk:
                break
            part_filename = f"{file_path}.part{part_num:02d}"
            with open(part_filename, "wb") as pf:
                pf.write(chunk)
            print(f"✅ 生成分卷: {part_filename}")
            part_num += 1
    #删除原文件
    os.remove(file_path)
    print(f"🎯 {file_path} 拆分完成，共 {part_num - 1} 个分卷。")

def main():
    if not os.path.exists(MODELS_JSON):
        print(f"❌ {MODELS_JSON} 不存在")
        return
    
    with open(MODELS_JSON, "r", encoding="utf-8") as f:
        models = json.load(f)

    for model in models:
        file_path = BASE_PATH+model
        if not file_path or not os.path.exists(file_path):
            print(f"⚠️ 模型文件不存在: {file_path}")
            continue
        
        # 检查是否已有分卷
        has_parts = any(
            fname.startswith(os.path.basename(file_path)) and ".part" in fname
            for fname in os.listdir(os.path.dirname(file_path) or ".")
        )
        if has_parts:
            print(f"⏩ 已存在分卷，跳过: {file_path}")
            continue
        
        split_file(file_path)

if __name__ == "__main__":
    main()
