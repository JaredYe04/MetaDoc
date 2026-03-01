#!/usr/bin/env python3
import subprocess
import json
import time
from pathlib import Path
import urllib.request

API_KEY = "sk-glgsrhyqmsvneuvpaqvhdicocyymjhndihkzlbahkaawaxbd"

def get_missing_keys(limit=10):
    result = subprocess.run(
        ["python", "scripts/get_missing_keys.py", "--lang", "fr_FR", "--limit", str(limit)],
        cwd="/home/ezra/Documents/MetaDoc/meta-doc",
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return [], 0
    
    data = json.loads(result.stdout)
    return data.get("keys", []), data.get("total_missing", 0)

def translate_batch(texts_dict, lang="French"):
    base_url = "https://api.siliconflow.cn/v1/chat/completions"
    
    items_text = "\n\n".join([f"[{k}]\n{v[:500]}" for k, v in texts_dict.items()])
    
    prompt = f"""Translate the following Chinese texts to {lang}. 
Keep markdown formatting, code blocks, and technical terms intact.
Return translations in the same format with the same keys.

{items_text}

Return format (exactly):
[key1]
translation1

[key2]
translation2"""
    
    data = {
        "model": "Qwen/Qwen2.5-7B-Instruct",
        "messages": [
            {"role": "system", "content": "You are a professional translator. Translate accurately while preserving formatting."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 8192
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    
    try:
        req = urllib.request.Request(
            base_url,
            data=json.dumps(data).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        
        with urllib.request.urlopen(req, timeout=180) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result['choices'][0]['message']['content'].strip()
    except Exception as e:
        print(f"  Translation error: {e}")
        return None

def parse_batch_translation(content):
    translations = {}
    current_key = None
    current_text = []
    
    for line in content.split('\n'):
        line_stripped = line.strip()
        if not line_stripped:
            continue
        
        if line_stripped.startswith('[') and ']' in line_stripped:
            if current_key and current_text:
                translations[current_key] = '\n'.join(current_text).strip()
            current_key = line_stripped[1:line_stripped.find(']')]
            current_text = []
        elif current_key:
            current_text.append(line)
    
    if current_key and current_text:
        translations[current_key] = '\n'.join(current_text).strip()
    
    return translations

def update_key(key, value):
    result = subprocess.run(
        [
            "python", "scripts/update_language_key.py",
            "--lang", "fr_FR",
            "--key", key,
            "--value", value
        ],
        cwd="/home/ezra/Documents/MetaDoc/meta-doc",
        capture_output=True,
        text=True
    )
    return result.returncode == 0

def main():
    total_processed = 0
    batch_num = 0
    
    print("=" * 60)
    print("Translate French Missing Keys - Batch Mode")
    print("=" * 60)
    
    while True:
        batch_num += 1
        print(f"\n--- Batch {batch_num} ---")
        
        keys, total_missing = get_missing_keys(limit=3)
        
        if not keys:
            print("No more missing keys!")
            break
        
        print(f"Found {len(keys)} missing keys (total remaining: {total_missing})")
        
        texts_dict = {item["key"]: item["chinese"] for item in keys}
        
        print("  Translating...")
        translation_result = translate_batch(texts_dict)
        
        if not translation_result:
            print("  Batch translation failed, trying single translation...")
            for item in keys:
                key = item["key"]
                chinese = item["chinese"]
                print(f"  Key: {key}")
                
                single_dict = {key: chinese}
                single_result = translate_batch(single_dict)
                if single_result:
                    translations = parse_batch_translation(single_result)
                    if key in translations:
                        if update_key(key, translations[key]):
                            print(f"     Updated")
                            total_processed += 1
                        else:
                            print(f"     Failed to update")
                time.sleep(1)
        else:
            translations = parse_batch_translation(translation_result)
            
            processed = 0
            for item in keys:
                key = item["key"]
                if key in translations:
                    print(f"  Key: {key}")
                    if update_key(key, translations[key]):
                        print(f"     Updated")
                        processed += 1
                    else:
                        print(f"     Failed to update")
                else:
                    print(f"  Key: {key} - Translation not found")
            
            total_processed += processed
            print(f"\nBatch {batch_num} complete: {processed}/{len(keys)} processed")
        
        print(f"Total processed: {total_processed} keys")
        time.sleep(2)
    
    print("\n" + "=" * 60)
    print("Task Complete!")
    print(f"Total processed: {total_processed} keys")
    print("=" * 60)

if __name__ == "__main__":
    main()
