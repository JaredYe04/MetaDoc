/**
 * 文本合并工具
 * 实现三路合并算法，自动合并不冲突的改动
 */

export interface MergeResult {
  success: boolean;
  mergedContent: string;
  hasConflict: boolean;
  conflictRanges?: Array<{
    start: number;
    end: number;
    baseText: string;
    currentText: string;
    externalText: string;
  }>;
}

/**
 * 简单的三路合并算法
 * 使用基于字符的简单策略：如果改动不重叠，自动合并；如果重叠，标记为冲突
 * @param baseContent 基础版本（已保存的内容）
 * @param currentContent 当前版本（编辑器中的内容，可能有未保存的改动）
 * @param externalContent 外部版本（外部文件的新内容）
 * @returns 合并结果
 */
export function mergeText(
  baseContent: string,
  currentContent: string,
  externalContent: string
): MergeResult {
  // 规范化内容（统一换行符）
  const normalize = (text: string) => text.replace(/\r\n/g, '\n');
  const base = normalize(baseContent);
  const current = normalize(currentContent);
  const external = normalize(externalContent);

  // 如果当前内容和外部内容相同，直接返回
  if (current === external) {
    return {
      success: true,
      mergedContent: current,
      hasConflict: false,
    };
  }

  // 如果外部内容和基础内容相同，说明外部没有改动，返回当前内容
  if (external === base) {
    return {
      success: true,
      mergedContent: current,
      hasConflict: false,
    };
  }

  // 如果当前内容和基础内容相同，说明当前没有改动，返回外部内容
  if (current === base) {
    return {
      success: true,
      mergedContent: external,
      hasConflict: false,
    };
  }

  // 使用基于行的简单合并策略
  const baseLines = base.split('\n');
  const currentLines = current.split('\n');
  const externalLines = external.split('\n');

  // 使用更简单的策略：逐行比较
  // 如果某一行在基础版本、当前版本和外部版本中都不相同，则认为是冲突
  // 否则，优先保留当前版本的改动（因为这是用户的未保存改动）
  
  const mergedLines: string[] = [];
  const maxLines = Math.max(baseLines.length, currentLines.length, externalLines.length);
  const conflicts: Array<{
    start: number;
    end: number;
    baseText: string;
    currentText: string;
    externalText: string;
  }> = [];
  
  let conflictStart: number | null = null;
  
  for (let i = 0; i < maxLines; i++) {
    const baseLine = i < baseLines.length ? baseLines[i] : '';
    const currentLine = i < currentLines.length ? currentLines[i] : '';
    const externalLine = i < externalLines.length ? externalLines[i] : '';
    
    // 如果当前行和外部行都与基础行不同，且它们也不同，则认为是冲突
    const currentChanged = currentLine !== baseLine;
    const externalChanged = externalLine !== baseLine;
    const bothChanged = currentChanged && externalChanged;
    const conflict = bothChanged && currentLine !== externalLine;
    
    if (conflict) {
      // 开始或继续冲突区域
      if (conflictStart === null) {
        conflictStart = i;
      }
    } else {
      // 冲突区域结束
      if (conflictStart !== null) {
        conflicts.push({
          start: conflictStart,
          end: i - 1,
          baseText: baseLines.slice(conflictStart, i).join('\n'),
          currentText: currentLines.slice(conflictStart, i).join('\n'),
          externalText: externalLines.slice(conflictStart, i).join('\n'),
        });
        conflictStart = null;
      }
      
      // 决定使用哪一行的内容
      if (currentChanged) {
        // 当前版本有改动，优先使用当前版本
        mergedLines.push(currentLine);
      } else if (externalChanged) {
        // 只有外部版本有改动，使用外部版本
        mergedLines.push(externalLine);
      } else {
        // 都没有改动，使用基础版本（或当前版本，它们应该相同）
        mergedLines.push(currentLine || baseLine);
      }
    }
  }
  
  // 处理末尾的冲突
  if (conflictStart !== null) {
    conflicts.push({
      start: conflictStart,
      end: maxLines - 1,
      baseText: baseLines.slice(conflictStart).join('\n'),
      currentText: currentLines.slice(conflictStart).join('\n'),
      externalText: externalLines.slice(conflictStart).join('\n'),
    });
  }
  
  if (conflicts.length > 0) {
    // 有冲突
    return {
      success: false,
      mergedContent: current, // 暂时返回当前内容
      hasConflict: true,
      conflictRanges: conflicts,
    };
  }
  
  // 没有冲突，返回合并结果
  return {
    success: true,
    mergedContent: mergedLines.join('\n'),
    hasConflict: false,
  };
}


