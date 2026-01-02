const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 代码文件扩展名映射
const CODE_EXTENSIONS = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.vue': 'Vue',
  '.css': 'CSS',
  '.less': 'Less',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.html': 'HTML',
  '.json': 'JSON',
  '.md': 'Markdown',
  '.py': 'Python',
  '.sql': 'SQL',
  '.md': 'Markdown',
  '.txt': 'Text',
  '.xml': 'XML',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.json': 'JSON',
  '.html': 'HTML',
  '.css': 'CSS',
  '.less': 'Less',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.php': 'PHP',
  '.java': 'Java',
  '.c': 'C',
  '.cpp': 'C++',
  '.h': 'C',
  '.hpp': 'C++',
  '.py': 'Python',
  '.sql': 'SQL',
  '.m': 'Objective-C',
  '.mm': 'Objective-C++',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.java': 'Java',
  '.c': 'C',
  '.cpp': 'C++',
  '.h': 'C',
  '.hpp': 'C++',
};

// 需要排除的目录
const EXCLUDE_DIRS = ['node_modules', 'dist', 'out', 'build', '.git', '.vscode', '.idea'];

// 需要排除的文件
const EXCLUDE_FILES = ['.DS_Store', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];

/**
 * 检查路径是否应该被排除
 */
function shouldExclude(filePath) {
  const parts = filePath.split(path.sep);
  return parts.some(part => EXCLUDE_DIRS.includes(part) || EXCLUDE_FILES.includes(part));
}

/**
 * 获取文件的语言类型
 */
function getLanguageType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CODE_EXTENSIONS[ext] || 'Other';
}

/**
 * 判断是否为代码文件（用于统计代码行数）
 */
function isCodeFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx', '.vue'].includes(ext);
}

/**
 * 计算圈复杂度（简化版本）
 * 统计控制流语句：if/else、switch、for/while、try/catch、三元运算符
 * 注意：逻辑运算符（||、&&）在条件表达式中会增加复杂度，但这里简化处理
 */
function calculateCyclomaticComplexity(content, language) {
  let complexity = 1; // 基础复杂度为1
  
  // 对于 Vue 文件，只分析 <script> 部分
  let codeContent = content;
  if (language === 'Vue') {
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      codeContent = scriptMatch[1];
    } else {
      // 如果没有 script 标签，返回基础复杂度
      return 1;
    }
  }
  
  // 移除字符串和注释，避免误判
  const cleanContent = codeContent
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
    .replace(/\/\/.*$/gm, '') // 移除单行注释
    .replace(/"[^"]*"/g, '""') // 移除双引号字符串
    .replace(/'[^']*'/g, "''") // 移除单引号字符串
    .replace(/`[^`]*`/g, '``') // 移除模板字符串
    .replace(/\/\*[\s\S]*?\*\//g, ''); // 再次移除多行注释（可能嵌套）
  
  // 统计各种控制流语句（决策点）
  const patterns = [
    { pattern: /\bif\s*\(/g, weight: 1 },           // if 语句
    { pattern: /\belse\s+if\s*\(/g, weight: 1 },    // else if 语句
    { pattern: /\bswitch\s*\(/g, weight: 1 },        // switch 语句
    { pattern: /\bcase\s+/g, weight: 1 },             // case 语句（每个case增加1）
    { pattern: /\bdefault\s*:/g, weight: 1 },        // default 语句
    { pattern: /\bfor\s*\(/g, weight: 1 },          // for 循环
    { pattern: /\bwhile\s*\(/g, weight: 1 },         // while 循环
    { pattern: /\bdo\s*\{/g, weight: 1 },            // do-while 循环
    { pattern: /\bcatch\s*\(/g, weight: 1 },         // catch 语句
    { pattern: /\?\s*[^:]*\s*:/g, weight: 1 }       // 三元运算符
  ];
  
  // 统计逻辑运算符（在条件表达式中，每个逻辑运算符增加1）
  // 这里简化处理：统计所有逻辑运算符，但只计算在括号内的（可能是条件）
  const logicalOps = (cleanContent.match(/\|\||\&\&/g) || []).length;
  // 简化：逻辑运算符的权重降低，因为不是所有都是决策点
  complexity += Math.floor(logicalOps * 0.5);
  
  patterns.forEach(({ pattern, weight }) => {
    const matches = cleanContent.match(pattern);
    if (matches) {
      complexity += matches.length * weight;
    }
  });
  
  return Math.max(1, complexity); // 至少为1
}

/**
 * 统计文件信息
 */
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const codeLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
    }).length;
    const emptyLines = totalLines - codeLines;
    
    const language = getLanguageType(filePath);
    const isCode = isCodeFile(filePath);
    
    let complexity = 0;
    if (isCode) {
      complexity = calculateCyclomaticComplexity(content, language);
    }
    
    return {
      path: filePath,
      language,
      totalLines,
      codeLines,
      emptyLines,
      complexity,
      isCode
    };
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * 递归遍历目录
 */
function walkDirectory(dir, baseDir = '') {
  const results = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir || dir, fullPath);
      
      if (shouldExclude(fullPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        results.push(...walkDirectory(fullPath, baseDir || dir));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS[ext] || ext === '.html' || ext === '.json' || ext === '.md') {
          results.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return results;
}

/**
 * 分类文件到不同的进程
 */
function categorizeFile(filePath, srcDir) {
  const relativePath = path.relative(srcDir, filePath);
  const parts = relativePath.split(path.sep);
  
  if (parts[0] === 'main') {
    return 'main';
  } else if (parts[0] === 'renderer') {
    return 'renderer';
  } else if (parts[0] === 'preload') {
    return 'preload';
  } else if (parts[0] === 'common') {
    return 'common';
  } else if (parts[0] === 'types') {
    return 'types';
  }
  return 'other';
}

/**
 * 生成 ECharts 饼图配置（用于占比展示）
 */
function generatePieChart(title, data) {
  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle'
    },
    series: [{
      name: title,
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}: {d}%'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: data
    }]
  };
}

/**
 * 生成 ECharts 条形图配置
 */
function generateBarChart(title, xAxisData, seriesData, yAxisName = '数值') {
  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLabel: {
        rotate: xAxisData.length > 10 ? 45 : 0,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: yAxisName
    },
    series: [{
      name: yAxisName,
      type: 'bar',
      data: seriesData,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#83bff6' },
            { offset: 0.5, color: '#188df0' },
            { offset: 1, color: '#188df0' }
          ]
        }
      },
      emphasis: {
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#2378f7' },
              { offset: 0.7, color: '#2378f7' },
              { offset: 1, color: '#83bff6' }
            ]
          }
        }
      }
    }]
  };
}

/**
 * 生成 ECharts 雷达图配置
 */
function generateRadarChart(title, indicator, seriesData) {
  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {},
    radar: {
      indicator: indicator,
      radius: '65%',
      splitNumber: 4,
      axisName: {
        color: '#666',
        fontSize: 12
      },
      splitArea: {
        areaStyle: {
          color: ['rgba(250,250,250,0.3)', 'rgba(200,200,200,0.3)']
        }
      }
    },
    series: [{
      name: title,
      type: 'radar',
      data: seriesData,
      areaStyle: {
        opacity: 0.3
      }
    }]
  };
}

/**
 * 生成 ECharts 折线图配置
 */
function generateLineChart(title, xAxisData, seriesData, seriesName = '数值') {
  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData
    },
    yAxis: {
      type: 'value'
    },
    series: [{
      name: seriesName,
      type: 'line',
      smooth: true,
      data: seriesData,
      areaStyle: {
        opacity: 0.3
      },
      lineStyle: {
        width: 3
      }
    }]
  };
}

/**
 * 生成 ECharts 堆叠条形图配置
 */
function generateStackedBarChart(title, xAxisData, seriesData) {
  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: seriesData.map(s => s.name),
      top: '10%'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'value'
    },
    yAxis: {
      type: 'category',
      data: xAxisData
    },
    series: seriesData.map(s => ({
      ...s,
      type: 'bar',
      stack: 'total'
    }))
  };
}

/**
 * 检查是否为 Git 仓库
 */
function isGitRepository(dir) {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取近半年的 Git 提交信息
 */
function getRecentCommits(months = 6) {
  try {
    const repoDir = path.join(__dirname, '..');
    if (!isGitRepository(repoDir)) {
      console.log('⚠️  警告: 当前目录不是 Git 仓库，跳过 Git 提交分析');
      return null;
    }

    // 计算半年前的日期
    const now = new Date();
    const halfYearAgo = new Date(now);
    halfYearAgo.setMonth(now.getMonth() - months);
    const sinceDate = halfYearAgo.toISOString().split('T')[0]; // YYYY-MM-DD 格式

    // 获取近半年的提交列表
    const logOutput = execSync(
      `git log --since="${sinceDate}" --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso`,
      { cwd: repoDir, encoding: 'utf-8' }
    ).trim();

    if (!logOutput) {
      return null;
    }

    const commits = [];
    const lines = logOutput.split('\n');

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 5) continue;

      const hash = parts[0];
      const author = parts[1];
      const email = parts[2];
      const date = parts[3];
      const message = parts.slice(4).join('|'); // 消息可能包含 |

      // 获取提交统计信息
      let stats = { filesChanged: 0, insertions: 0, deletions: 0 };
      try {
        const statOutput = execSync(
          `git show --stat --format="" ${hash}`,
          { cwd: repoDir, encoding: 'utf-8' }
        );

        // 解析统计信息，例如: "10 files changed, 234 insertions(+), 45 deletions(-)"
        const statMatch = statOutput.match(/(\d+)\s+files? changed/);
        if (statMatch) {
          stats.filesChanged = parseInt(statMatch[1], 10);
        }

        const insertMatch = statOutput.match(/(\d+)\s+insertions?/);
        if (insertMatch) {
          stats.insertions = parseInt(insertMatch[1], 10);
        }

        const deleteMatch = statOutput.match(/(\d+)\s+deletions?/);
        if (deleteMatch) {
          stats.deletions = parseInt(deleteMatch[1], 10);
        }
      } catch (error) {
        console.warn(`无法获取提交 ${hash} 的统计信息:`, error.message);
      }

      commits.push({
        hash: hash.substring(0, 7), // 短 hash
        fullHash: hash,
        author,
        email,
        date: new Date(date),
        message,
        ...stats
      });
    }

    return commits;
  } catch (error) {
    console.warn('⚠️  警告: 无法获取 Git 提交信息:', error.message);
    return null;
  }
}

/**
 * 使用 Git 统计当前 src/ 目录下的代码行数
 * 确保与 Git 改动量统计口径一致
 */
function getGitSrcLinesCount(repoDir) {
  try {
    // 使用 git ls-files 获取所有 src/ 目录下的文件
    // 注意：git ls-files 返回的路径是相对于仓库根目录的，可能是 src/... 或 meta-doc/src/...
    const filesOutput = execSync(
      `git ls-files src/`,
      { cwd: repoDir, encoding: 'utf-8' }
    ).trim();

    if (!filesOutput) {
      // 如果 src/ 下没有文件，尝试 meta-doc/src/
      const filesOutput2 = execSync(
        `git ls-files meta-doc/src/`,
        { cwd: repoDir, encoding: 'utf-8' }
      ).trim();
      
      if (!filesOutput2) {
        console.log(`      ⚠️  未找到 src/ 目录下的文件`);
        return 0;
      }
      
      const files = filesOutput2.split('\n').filter(f => f.trim());
      return processGitFiles(files, repoDir);
    }

    const files = filesOutput.split('\n').filter(f => f.trim());
    // 检查第一个文件的路径格式，判断是否需要添加 meta-doc/ 前缀
    const firstFile = files[0];
    let needsPrefix = false;
    
    try {
      execSync(`git show HEAD:${firstFile}`, { cwd: repoDir, encoding: 'utf-8', stdio: 'ignore' });
    } catch (err) {
      // 如果失败，说明需要添加 meta-doc/ 前缀
      needsPrefix = true;
    }
    
    // 如果需要前缀，为所有文件添加
    const processedFiles = needsPrefix 
      ? files.map(f => f.startsWith('meta-doc/') ? f : `meta-doc/${f}`)
      : files;
    
    return processGitFiles(processedFiles, repoDir);
  } catch (error) {
    console.warn(`   ⚠️  无法使用 Git 统计代码行数: ${error.message}`);
    return null;
  }
}

/**
 * 处理 Git 文件列表，统计代码行数
 */
function processGitFiles(files, repoDir) {
  console.log(`      找到 ${files.length} 个文件需要统计`);
  
  let totalLines = 0;
  let processed = 0;
  let failed = 0;

  // 对每个文件，使用 git show HEAD:文件路径 获取内容并统计行数
  for (const file of files) {
    try {
      const content = execSync(
        `git show HEAD:${file}`,
        { cwd: repoDir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );
      
      const lines = content.split('\n').length;
      totalLines += lines;
      processed++;
      
      // 每处理100个文件输出一次进度
      if (processed % 100 === 0) {
        console.log(`      已处理 ${processed}/${files.length} 个文件...`);
      }
    } catch (error) {
      // 如果文件不存在或无法读取，跳过
      failed++;
      if (failed <= 5) {
        console.log(`      ⚠️  无法读取文件 ${file}: ${error.message.substring(0, 50)}`);
      }
      continue;
    }
  }

  console.log(`      完成，共处理 ${processed} 个文件，失败 ${failed} 个`);
  return totalLines;
}

/**
 * 获取所有提交的改动量统计（一次性获取，提高性能）
 */
function getAllCommitsStats(repoDir) {
  console.log(`   🔍 一次性获取所有提交的改动量统计...`);
  
  // 获取所有提交的 hash 和日期
  const logOutput = execSync(
    `git log --pretty=format:"%H|%ad" --date=iso`,
    { cwd: repoDir, encoding: 'utf-8' }
  ).trim();

  if (!logOutput) {
    return [];
  }

  const commits = [];
  const lines = logOutput.split('\n');
  
  console.log(`      找到 ${lines.length} 次提交，开始统计改动量...`);
  
  let processed = 0;
  let samplePaths = [];
  
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 2) continue;
    
    const hash = parts[0].trim();
    const dateStr = parts[1].trim();
    const commitDate = new Date(dateStr);
    
    let insertions = 0;
    let deletions = 0;
    
    try {
      // 优先使用 git show --numstat
      const showOutput = execSync(
        `git show --numstat --format="" ${hash}`,
        { cwd: repoDir, encoding: 'utf-8' }
      ).trim();

      if (showOutput) {
        const outputLines = showOutput.split('\n');
        for (const outputLine of outputLines) {
          const parts = outputLine.trim().split(/\s+/);
          if (parts.length >= 2) {
            const filePath = parts.slice(2).join(' ');
            const normalizedPath = filePath.replace(/\\/g, '/');
            
            // 收集前几个示例路径用于调试
            if (samplePaths.length < 3 && filePath) {
              samplePaths.push(filePath);
            }
            
            // 匹配包含 /src/ 的路径
            if (filePath && normalizedPath.includes('/src/')) {
              insertions += parseInt(parts[0], 10) || 0;
              deletions += parseInt(parts[1], 10) || 0;
            }
          }
        }
      }
    } catch (error) {
      // 如果 git show 失败，尝试使用 git diff
      try {
        const diffOutput = execSync(
          `git diff --numstat ${hash}^..${hash}`,
          { cwd: repoDir, encoding: 'utf-8' }
        ).trim();

        if (diffOutput) {
          const outputLines = diffOutput.split('\n');
          for (const outputLine of outputLines) {
            const parts = outputLine.trim().split(/\s+/);
            if (parts.length >= 2) {
              const filePath = parts.slice(2).join(' ');
              const normalizedPath = filePath.replace(/\\/g, '/');
              
              if (filePath && normalizedPath.includes('/src/')) {
                insertions += parseInt(parts[0], 10) || 0;
                deletions += parseInt(parts[1], 10) || 0;
              }
            }
          }
        }
      } catch (err) {
        // 忽略无法获取统计的提交
        continue;
      }
    }
    
    commits.push({
      hash,
      date: commitDate,
      insertions,
      deletions,
      totalChanges: insertions + deletions,
      netChanges: insertions - deletions
    });
    
    processed++;
    if (processed % 50 === 0) {
      console.log(`      已处理 ${processed}/${lines.length} 次提交...`);
    }
  }
  
  if (samplePaths.length > 0) {
    console.log(`      示例文件路径: ${samplePaths.join(', ')}`);
  }
  
  console.log(`      完成，共处理 ${processed} 次提交`);
  return commits;
}

/**
 * 获取不同时间段的提交改动量统计
 * 优化：只执行一次"所有时间"统计，然后按日期分配到各时间段
 */
function getTimePeriodCommitStats(totalLines) {
  try {
    const repoDir = path.join(__dirname, '..');
    if (!isGitRepository(repoDir)) {
      console.log('   ⚠️  当前目录不是 Git 仓库');
      return null;
    }
    
    console.log(`   📁 Git 仓库目录: ${repoDir}`);
    
    // 使用 Git 统计当前 src/ 目录下的代码行数，确保统计口径一致
    console.log(`   📊 使用 Git 统计当前 src/ 目录下的代码行数...`);
    const gitSrcLines = getGitSrcLinesCount(repoDir);
    
    // 如果 Git 统计失败，使用文件系统统计的结果
    const actualTotalLines = gitSrcLines !== null ? gitSrcLines : totalLines;
    
    if (gitSrcLines !== null) {
      console.log(`   📊 Git 统计的代码行数: ${gitSrcLines.toLocaleString()}`);
      console.log(`   📊 文件系统统计的代码行数: ${totalLines.toLocaleString()}`);
      if (gitSrcLines !== totalLines) {
        console.log(`   ⚠️  注意: Git 统计和文件系统统计存在差异，使用 Git 统计结果`);
      }
    } else {
      console.log(`   📊 项目总代码行数: ${totalLines.toLocaleString()} (使用文件系统统计)`);
    }

    // 一次性获取所有提交的改动量统计
    const allCommits = getAllCommitsStats(repoDir);
    
    if (allCommits.length === 0) {
      console.log('   ⚠️  未找到任何提交');
      return null;
    }

    const now = new Date();
    const periods = [
      { name: '近一周', days: 7 },
      { name: '近一月', days: 30 },
      { name: '近一季', days: 90 },
      { name: '近半年', days: 180 },
      { name: '近一年', days: 365 },
      { name: '所有时间', days: null } // null 表示不限制时间范围
    ];

    const stats = [];

    // 根据时间段，从所有提交中筛选出符合条件的提交
    for (const period of periods) {
      try {
        let periodStart;
        let periodCommits;
        
        if (period.days === null) {
          // 所有时间，包含所有提交
          console.log(`   🔍 分析 ${period.name}（所有提交）...`);
          periodCommits = allCommits;
        } else {
          // 有时间限制的统计
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - period.days);
          const sinceDate = periodStart.toISOString().split('T')[0];
          console.log(`   🔍 分析 ${period.name} (${sinceDate} 至今)...`);
          
          // 从所有提交中筛选出该时间段内的提交
          periodCommits = allCommits.filter(commit => commit.date >= periodStart);
        }

        if (periodCommits.length === 0) {
          stats.push({
            name: period.name,
            days: period.days,
            commits: 0,
            insertions: 0,
            deletions: 0,
            totalChanges: 0,
            netChanges: 0,
            percentage: 0
          });
          continue;
        }

        // 汇总该时间段内的改动量
        const totalInsertions = periodCommits.reduce((sum, commit) => sum + commit.insertions, 0);
        const totalDeletions = periodCommits.reduce((sum, commit) => sum + commit.deletions, 0);
        const totalChanges = totalInsertions + totalDeletions; // 累计总改动量
        const netChanges = totalInsertions - totalDeletions; // 净变化量（实际增长）
        
        // 使用净变化量计算占比，这样更合理（净变化量占项目代码量的比例）
        // 使用 actualTotalLines 确保统计口径一致
        const percentage = actualTotalLines > 0 ? ((Math.abs(netChanges) / actualTotalLines) * 100) : 0;

        console.log(`      ✅ ${period.name}: ${periodCommits.length} 次提交, 新增 ${totalInsertions.toLocaleString()} 行, 删除 ${totalDeletions.toLocaleString()} 行, 累计改动 ${totalChanges.toLocaleString()} 行, 净变化 ${netChanges >= 0 ? '+' : ''}${netChanges.toLocaleString()} 行, 净变化占比 ${percentage.toFixed(2)}%`);

        stats.push({
          name: period.name,
          days: period.days,
          commits: periodCommits.length,
          insertions: totalInsertions,
          deletions: totalDeletions,
          totalChanges: totalChanges,
          netChanges: netChanges,
          percentage: percentage
        });
      } catch (error) {
        console.warn(`无法处理 ${period.name} 的统计:`, error.message);
        stats.push({
          name: period.name,
          days: period.days,
          commits: 0,
          insertions: 0,
          deletions: 0,
          totalChanges: 0,
          netChanges: 0,
          percentage: 0
        });
      }
    }

    return stats;
  } catch (error) {
    console.warn('⚠️  警告: 无法获取时间段提交统计:', error.message);
    return null;
  }
}

/**
 * 生成时间段改动量堆叠柱状图（按时间范围从长到短）
 * 每个时间段一个柱子，柱子高度代表该时间段的改动量
 */
function generateTimePeriodStackedBarChart(title, stats) {
  // 按时间范围从长到短排序（所有时间 > 一年 > 半年 > 一季 > 一月 > 一周）
  const sortedStats = [...stats].sort((a, b) => {
    // 所有时间排第一
    if (a.name === '所有时间') return -1;
    if (b.name === '所有时间') return 1;
    // 其他按 days 从大到小排序（null 或 undefined 的排在最后）
    const aDays = a.days || 0;
    const bDays = b.days || 0;
    return bDays - aDays;
  });

  const names = sortedStats.map(s => s.name);
  const totalChanges = sortedStats.map(s => s.totalChanges);
  const netChanges = sortedStats.map(s => s.netChanges || (s.insertions - s.deletions));
  const percentages = sortedStats.map(s => s.percentage);

  // 为不同时间段设置不同的颜色（从深到浅，时间范围越长颜色越深）
  const periodColors = [
    '#1f77b4',   // 所有时间 - 深蓝
    '#2ca02c',   // 近一年 - 绿色
    '#ff7f0e',   // 近半年 - 橙色
    '#d62728',   // 近一季 - 红色
    '#9467bd',   // 近一月 - 紫色
    '#8c564b'    // 近一周 - 棕色
  ];

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        const param = params[0];
        const stat = sortedStats[param.dataIndex];
        const net = stat.netChanges || (stat.insertions - stat.deletions);
        return `${stat.name}<br/>` +
               `累计改动量: ${stat.totalChanges.toLocaleString()} 行<br/>` +
               `净变化量: ${net >= 0 ? '+' : ''}${net.toLocaleString()} 行<br/>` +
               `净变化占比: ${stat.percentage.toFixed(2)}%<br/>` +
               `提交数: ${stat.commits} 次<br/>` +
               `新增: +${stat.insertions.toLocaleString()} 行<br/>` +
               `删除: -${stat.deletions.toLocaleString()} 行`;
      }
    },
    legend: {
      data: ['累计改动量', '净变化量'],
      top: '10%'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: {
        rotate: 0,
        fontSize: 12
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '累计改动量 (行)',
        position: 'left'
      },
      {
        type: 'value',
        name: '净变化占比 (%)',
        position: 'right',
        axisLabel: {
          formatter: '{value}%'
        }
      }
    ],
    series: [
      {
        name: '累计改动量',
        type: 'bar',
        yAxisIndex: 0,
        data: totalChanges.map((value, index) => ({
          value: value,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: periodColors[Math.min(index, periodColors.length - 1)] },
                { offset: 1, color: periodColors[Math.min(index, periodColors.length - 1)] + 'CC' }
              ]
            }
          }
        })),
        label: {
          show: true,
          position: 'top',
          formatter: function(params) {
            return params.value.toLocaleString();
          }
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      },
      {
        name: '净变化占比',
        type: 'line',
        yAxisIndex: 1,
        data: percentages,
        itemStyle: { color: '#67C23A' },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 8,
        label: {
          show: true,
          position: 'top',
          formatter: function(params) {
            return params.value.toFixed(1) + '%';
          }
        }
      }
    ]
  };
}

/**
 * 生成时间段改动量占比饼图（已废弃，改用堆叠柱状图）
 */
function generateTimePeriodPieChart(title, stats) {
  const data = stats.map(s => ({
    name: s.name,
    value: s.totalChanges
  })).filter(d => d.value > 0);

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'item',
      formatter: function(params) {
        const stat = stats.find(s => s.name === params.name);
        if (!stat) return '';
        return `${params.name}<br/>` +
               `改动量: ${stat.totalChanges.toLocaleString()} 行<br/>` +
               `占比: ${stat.percentage.toFixed(2)}%<br/>` +
               `提交数: ${stat.commits} 次`;
      }
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle'
    },
    series: [{
      name: '改动量',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}\n{d}%'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: data
    }]
  };
}

/**
 * 生成时间段改动量占比条形图
 */
function generateTimePeriodBarChart(title, stats) {
  const names = stats.map(s => s.name);
  const totalChanges = stats.map(s => s.totalChanges);
  const percentages = stats.map(s => s.percentage);

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        const param = params[0];
        const stat = stats[param.dataIndex];
        return `${stat.name}<br/>` +
               `改动量: ${stat.totalChanges.toLocaleString()} 行<br/>` +
               `占比: ${stat.percentage.toFixed(2)}%<br/>` +
               `提交数: ${stat.commits} 次<br/>` +
               `新增: +${stat.insertions.toLocaleString()} 行<br/>` +
               `删除: -${stat.deletions.toLocaleString()} 行`;
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: {
        rotate: 0
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '改动量 (行)',
        position: 'left'
      },
      {
        type: 'value',
        name: '占比 (%)',
        position: 'right',
        axisLabel: {
          formatter: '{value}%'
        }
      }
    ],
    series: [
      {
        name: '改动量',
        type: 'bar',
        yAxisIndex: 0,
        data: totalChanges,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#83bff6' },
              { offset: 0.5, color: '#188df0' },
              { offset: 1, color: '#188df0' }
            ]
          }
        }
      },
      {
        name: '占比',
        type: 'line',
        yAxisIndex: 1,
        data: percentages,
        itemStyle: { color: '#67C23A' },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 8
      }
    ]
  };
}

/**
 * 生成时间段改动量堆叠条形图（显示新增和删除）
 */
function generateTimePeriodStackedChart(title, stats) {
  const names = stats.map(s => s.name);
  const insertions = stats.map(s => s.insertions);
  const deletions = stats.map(s => s.deletions);

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        const param = params[0];
        const stat = stats[param.dataIndex];
        return `${stat.name}<br/>` +
               `新增: +${stat.insertions.toLocaleString()} 行<br/>` +
               `删除: -${stat.deletions.toLocaleString()} 行<br/>` +
               `总计: ${stat.totalChanges.toLocaleString()} 行<br/>` +
               `占比: ${stat.percentage.toFixed(2)}%`;
      }
    },
    legend: {
      data: ['新增', '删除'],
      top: '10%'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: names
    },
    yAxis: {
      type: 'value',
      name: '代码行数'
    },
    series: [
      {
        name: '新增',
        type: 'bar',
        stack: 'total',
        data: insertions,
        itemStyle: { color: '#67C23A' }
      },
      {
        name: '删除',
        type: 'bar',
        stack: 'total',
        data: deletions,
        itemStyle: { color: '#F56C6C' }
      }
    ]
  };
}

/**
 * 生成提交趋势折线图
 */
function generateCommitTrendChart(title, commits) {
  const dates = commits.map(c => {
    const d = c.date;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }).reverse();

  const insertions = commits.map(c => c.insertions).reverse();
  const deletions = commits.map(c => c.deletions).reverse();
  const netChanges = commits.map(c => c.insertions - c.deletions).reverse();

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['新增行数', '删除行数', '净变化'],
      top: '10%'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates
    },
    yAxis: {
      type: 'value',
      name: '代码行数'
    },
    series: [
      {
        name: '新增行数',
        type: 'line',
        smooth: true,
        data: insertions,
        itemStyle: { color: '#67C23A' },
        areaStyle: { opacity: 0.3 }
      },
      {
        name: '删除行数',
        type: 'line',
        smooth: true,
        data: deletions,
        itemStyle: { color: '#F56C6C' },
        areaStyle: { opacity: 0.3 }
      },
      {
        name: '净变化',
        type: 'line',
        smooth: true,
        data: netChanges,
        itemStyle: { color: '#409EFF' },
        lineStyle: { width: 2, type: 'dashed' }
      }
    ]
  };
}

/**
 * 生成提交影响条形图
 */
function generateCommitImpactChart(title, commits) {
  const messages = commits.map(c => {
    const msg = c.message.length > 30 ? c.message.substring(0, 30) + '...' : c.message;
    return msg;
  }).reverse();

  const filesChanged = commits.map(c => c.filesChanged).reverse();
  const totalChanges = commits.map(c => c.insertions + c.deletions).reverse();

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['文件变更数', '总变更行数'],
      top: '10%'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: messages,
      axisLabel: {
        rotate: 45,
        interval: 0,
        fontSize: 10
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '文件数',
        position: 'left'
      },
      {
        type: 'value',
        name: '代码行数',
        position: 'right'
      }
    ],
    series: [
      {
        name: '文件变更数',
        type: 'bar',
        data: filesChanged,
        itemStyle: { color: '#409EFF' }
      },
      {
        name: '总变更行数',
        type: 'bar',
        yAxisIndex: 1,
        data: totalChanges,
        itemStyle: { color: '#67C23A' }
      }
    ]
  };
}

/**
 * 生成提交者贡献饼图
 */
function generateContributorChart(title, commits) {
  const contributorStats = {};
  commits.forEach(commit => {
    const key = commit.author;
    if (!contributorStats[key]) {
      contributorStats[key] = {
        name: commit.author,
        commits: 0,
        insertions: 0,
        deletions: 0
      };
    }
    contributorStats[key].commits++;
    contributorStats[key].insertions += commit.insertions;
    contributorStats[key].deletions += commit.deletions;
  });

  const data = Object.values(contributorStats)
    .map(stat => ({
      name: stat.name,
      value: stat.commits
    }))
    .sort((a, b) => b.value - a.value);

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} 次提交 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle'
    },
    series: [{
      name: '提交次数',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}: {c}次'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: data
    }]
  };
}

/**
 * 生成提交频率柱状图
 */
function generateCommitFrequencyChart(title, commits) {
  // 按日期分组统计
  const dateGroups = {};
  commits.forEach(commit => {
    const dateKey = commit.date.toISOString().split('T')[0];
    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = 0;
    }
    dateGroups[dateKey]++;
  });

  const dates = Object.keys(dateGroups).sort();
  const counts = dates.map(d => dateGroups[d]);

  // 格式化日期显示
  const formattedDates = dates.map(d => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: formattedDates,
      axisLabel: {
        rotate: dates.length > 10 ? 45 : 0,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: '提交次数'
    },
    series: [{
      name: '提交次数',
      type: 'bar',
      data: counts,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#83bff6' },
            { offset: 0.5, color: '#188df0' },
            { offset: 1, color: '#188df0' }
          ]
        }
      }
    }]
  };
}

/**
 * 分析 npm 依赖项
 */
function analyzeNpmDependencies() {
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log('⚠️  警告: 找不到 package.json 文件，跳过依赖项分析');
      return null;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    // 动态按作用域分类 - 自动识别所有作用域
    const scopedDeps = {};

    // 提取作用域的函数
    const getScope = (name) => {
      // 如果包名以 @ 开头，提取作用域部分（@scope/package-name 中的 @scope）
      if (name.startsWith('@')) {
        const parts = name.split('/');
        if (parts.length >= 2) {
          return parts[0]; // 返回 @scope
        }
        return name; // 如果格式异常，返回整个名称
      }
      // 没有作用域的包归类为"无作用域"
      return '(无作用域)';
    };

    // 分类依赖项
    Object.keys(dependencies).forEach(name => {
      const scope = getScope(name);
      if (!scopedDeps[scope]) {
        scopedDeps[scope] = [];
      }
      scopedDeps[scope].push({
        name,
        version: dependencies[name],
        type: 'dependency'
      });
    });

    Object.keys(devDependencies).forEach(name => {
      const scope = getScope(name);
      if (!scopedDeps[scope]) {
        scopedDeps[scope] = [];
      }
      scopedDeps[scope].push({
        name,
        version: devDependencies[name],
        type: 'devDependency'
      });
    });

    // 统计版本前缀
    const versionPrefixes = {
      '^': 0,  // 兼容版本
      '~': 0,  // 近似版本
      '>=': 0, // 大于等于
      '<=': 0, // 小于等于
      'exact': 0 // 精确版本
    };

    const allDeps = { ...dependencies, ...devDependencies };
    Object.values(allDeps).forEach(version => {
      if (version.startsWith('^')) versionPrefixes['^']++;
      else if (version.startsWith('~')) versionPrefixes['~']++;
      else if (version.startsWith('>=')) versionPrefixes['>=']++;
      else if (version.startsWith('<=')) versionPrefixes['<=']++;
      else versionPrefixes['exact']++;
    });

    return {
      dependencies: Object.keys(dependencies).length,
      devDependencies: Object.keys(devDependencies).length,
      total: Object.keys(allDeps).length,
      scopedDeps,
      versionPrefixes,
      allDeps
    };
  } catch (error) {
    console.warn('⚠️  警告: 无法分析 npm 依赖项:', error.message);
    return null;
  }
}

/**
 * 生成依赖项作用域饼图
 */
function generateDependencyScopeChart(title, scopedDeps) {
  const data = Object.entries(scopedDeps)
    .filter(([scope, deps]) => deps.length > 0)
    .map(([scope, deps]) => ({
      name: scope === 'other' ? '其他' : scope,
      value: deps.length
    }))
    .sort((a, b) => b.value - a.value);

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} 个包 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle'
    },
    series: [{
      name: '依赖项',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}: {c}'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: data
    }]
  };
}

/**
 * 生成依赖项类型对比图
 */
function generateDependencyTypeChart(title, depsCount, devDepsCount) {
  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['生产依赖', '开发依赖']
    },
    yAxis: {
      type: 'value',
      name: '依赖项数量'
    },
    series: [{
      name: '依赖项数量',
      type: 'bar',
      data: [depsCount, devDepsCount],
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#83bff6' },
            { offset: 0.5, color: '#188df0' },
            { offset: 1, color: '#188df0' }
          ]
        }
      }
    }]
  };
}

/**
 * 生成版本前缀分布图
 */
function generateVersionPrefixChart(title, versionPrefixes) {
  const data = Object.entries(versionPrefixes)
    .filter(([prefix, count]) => count > 0)
    .map(([prefix, count]) => ({
      name: prefix === '^' ? '兼容版本 (^)' : 
            prefix === '~' ? '近似版本 (~)' :
            prefix === '>=' ? '大于等于 (>=' :
            prefix === '<=' ? '小于等于 (<=' :
            '精确版本',
      value: count
    }));

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} 个包 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle'
    },
    series: [{
      name: '版本前缀',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}: {c}'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: data
    }]
  };
}

/**
 * 生成依赖项作用域条形图
 */
function generateDependencyScopeBarChart(title, scopedDeps) {
  const entries = Object.entries(scopedDeps)
    .filter(([scope, deps]) => deps.length > 0)
    .map(([scope, deps]) => ({
      name: scope === 'other' ? '其他' : scope,
      count: deps.length
    }))
    .sort((a, b) => b.count - a.count);

  const names = entries.map(e => e.name);
  const counts = entries.map(e => e.count);

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: {
        rotate: 45,
        interval: 0,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: '依赖项数量'
    },
    series: [{
      name: '依赖项数量',
      type: 'bar',
      data: counts,
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#83bff6' },
            { offset: 0.5, color: '#188df0' },
            { offset: 1, color: '#188df0' }
          ]
        }
      }
    }]
  };
}

/**
 * 生成图表解释文字
 */
function generateChartExplanation(chartType, data, context = {}) {
  switch (chartType) {
    case 'processPie':
      const totalLines = data.reduce((sum, d) => sum + d.value, 0);
      const mainPercent = ((data.find(d => d.name === 'main')?.value || 0) / totalLines * 100).toFixed(1);
      const rendererPercent = ((data.find(d => d.name === 'renderer')?.value || 0) / totalLines * 100).toFixed(1);
      return `**图表说明**：该饼图展示了主进程（main）和渲染进程（renderer）的代码量占比。从图中可以看出，渲染进程占据了 ${rendererPercent}% 的代码量（${(data.find(d => d.name === 'renderer')?.value || 0).toLocaleString()} 行），而主进程占据了 ${mainPercent}% 的代码量（${(data.find(d => d.name === 'main')?.value || 0).toLocaleString()} 行）。这反映了项目的架构特点，渲染进程主要负责用户界面和交互逻辑，代码量相对较大。\n\n`;
    
    case 'processBar':
      const maxProcess = data.reduce((max, d) => d.value > max.value ? d : max, data[0]);
      const minProcess = data.reduce((min, d) => d.value < min.value ? d : min, data[0]);
      const ratio = (maxProcess.value / minProcess.value).toFixed(1);
      return `**图表说明**：该条形图直观对比了主进程和渲染进程的代码行数。${maxProcess.name} 进程的代码行数为 ${maxProcess.value.toLocaleString()} 行，是 ${minProcess.name} 进程（${minProcess.value.toLocaleString()} 行）的 ${ratio} 倍。这种差异体现了 Electron 应用的特点，渲染进程承担了更多的业务逻辑和 UI 实现。\n\n`;
    
    case 'languagePie':
      const topLang = data[0];
      const topLangPercent = ((topLang.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
      const top3Langs = data.slice(0, 3).map(d => d.name).join('、');
      return `**图表说明**：该饼图展示了项目中各编程语言的代码量占比。${topLang.name} 是项目中使用最多的语言，占据了 ${topLangPercent}% 的代码量（${topLang.value.toLocaleString()} 行）。排名前三的语言分别是 ${top3Langs}，这些语言共同构成了项目的主要技术栈。\n\n`;
    
    case 'languageBar':
      const maxFiles = Math.max(...data);
      const avgFiles = (data.reduce((sum, val) => sum + val, 0) / data.length).toFixed(1);
      return `**图表说明**：该条形图展示了各编程语言的文件数量对比。从图中可以看出，不同语言的文件数量存在明显差异。平均每个语言有 ${avgFiles} 个文件，最多的语言有 ${maxFiles} 个文件。文件数量的分布反映了项目的模块化程度和代码组织方式。\n\n`;
    
    case 'complexityPie':
      const simpleCount = data.find(d => d.name.includes('1-10'))?.value || 0;
      const complexCount = data.find(d => d.name.includes('50+'))?.value || 0;
      const totalFiles = data.reduce((sum, d) => sum + d.value, 0);
      const simplePercent = ((simpleCount / totalFiles) * 100).toFixed(1);
      const complexPercent = ((complexCount / totalFiles) * 100).toFixed(1);
      return `**图表说明**：该饼图展示了代码复杂度的分布情况。复杂度在 1-10 之间的简单文件占 ${simplePercent}%（${simpleCount} 个文件），复杂度超过 50 的非常复杂文件占 ${complexPercent}%（${complexCount} 个文件）。理想的代码库应该以简单和中等复杂度的文件为主，高复杂度的文件需要重点关注和重构。\n\n`;
    
    case 'complexityBar':
      const maxComplexityCount = Math.max(...data);
      const complexityDistribution = data.map((val, idx) => {
        const labels = ['1-10 (简单)', '11-20 (中等)', '21-50 (复杂)', '50+ (非常复杂)'];
        return { label: labels[idx], count: val };
      });
      const dominant = complexityDistribution.reduce((max, d) => d.count > max.count ? d : max, complexityDistribution[0]);
      return `**图表说明**：该条形图对比了不同复杂度范围的文件数量。${dominant.label} 的文件数量最多（${dominant.count} 个），这表明项目中的代码复杂度主要集中在 ${dominant.label.includes('简单') ? '较低' : dominant.label.includes('中等') ? '中等' : '较高'}的水平。建议关注复杂度超过 50 的文件，考虑进行重构以降低维护成本。\n\n`;
    
    case 'highComplexityLine':
      const maxComplexity = Math.max(...data);
      const minComplexity = Math.min(...data);
      const avgComplexity = (data.reduce((sum, val) => sum + val, 0) / data.length).toFixed(1);
      return `**图表说明**：该折线图展示了高复杂度文件的圈复杂度趋势。这些文件的复杂度范围从 ${minComplexity} 到 ${maxComplexity}，平均复杂度为 ${avgComplexity}。复杂度超过 20 的文件通常包含较多的条件分支和循环，建议进行拆分和重构以提高代码可维护性。\n\n`;
    
    case 'highComplexityBar':
      const topComplexity = Math.max(...data);
      return `**图表说明**：该条形图展示了高复杂度文件的圈复杂度对比。圈复杂度最高的文件达到了 ${topComplexity}，这表明该文件包含大量的控制流分支。高复杂度的文件通常难以测试和维护，建议将其拆分为多个小函数或模块，每个模块的复杂度控制在 10 以下。\n\n`;
    
    case 'radar':
      const processCount = data.length;
      return `**图表说明**：该雷达图从多个维度对比了不同进程的代码特征，包括代码行数、文件数、有效代码行数和平均圈复杂度。通过雷达图可以直观地看出各进程在不同指标上的表现。理想的代码库应该在各个维度上保持平衡，避免某个维度出现极端值。\n\n`;
    
    case 'stackedBar':
      const totalCode = context.totalCode || 0;
      const codePercent = totalCode > 0 ? ((context.codeLines / totalCode) * 100).toFixed(1) : 0;
      return `**图表说明**：该堆叠条形图展示了各进程的代码组成结构，包括有效代码、空行和注释/其他内容。从图中可以看出，有效代码占比约为 ${codePercent}%，空行和注释有助于提高代码可读性，但过多的空行可能会影响代码密度。建议保持合理的代码密度，既保证可读性又提高开发效率。\n\n`;
    
    case 'processLanguagePie':
      const processName = context.processName || '该进程';
      const mainLang = data[0];
      const mainLangPercent = ((mainLang.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
      return `**图表说明**：该饼图展示了 ${processName} 进程内部各编程语言的代码量分布。${mainLang.name} 是该进程中使用最多的语言，占据了 ${mainLangPercent}% 的代码量。这种分布反映了该进程的技术栈选择和使用情况。\n\n`;
    
    case 'commitTrend':
      const totalInsertions = context.totalInsertions || 0;
      const totalDeletions = context.totalDeletions || 0;
      const avgInsertions = context.avgInsertions || 0;
      return `**图表说明**：该折线图展示了近半年提交的代码变更趋势。新增行数和删除行数的变化反映了项目的开发活跃度。平均每次提交新增 ${avgInsertions.toFixed(0)} 行代码，总新增 ${totalInsertions.toLocaleString()} 行，总删除 ${totalDeletions.toLocaleString()} 行。净变化趋势可以帮助了解项目的代码增长情况。\n\n`;
    
    case 'commitImpact':
      const avgFilesChanged = context.avgFiles || 0;
      const maxFilesChanged = context.maxFiles || 0;
      return `**图表说明**：该条形图展示了每次提交的影响范围。平均每次提交修改 ${avgFilesChanged.toFixed(1)} 个文件，最多一次修改了 ${maxFilesChanged} 个文件。文件变更数和代码行数可以帮助评估提交的复杂度和影响范围。较大的提交可能需要更多时间进行代码审查。\n\n`;
    
    case 'contributor':
      const contributorCount = data.length;
      const topContributor = data[0];
      const topPercent = ((topContributor.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
      return `**图表说明**：该饼图展示了各贡献者的提交次数分布。共有 ${contributorCount} 位贡献者参与了近半年的开发工作，其中 ${topContributor.name} 贡献最多，占 ${topPercent}% 的提交。这反映了团队的协作情况和各成员的参与度。\n\n`;
    
    case 'commitFrequency':
      const avgCommits = context.avgCommits || 0;
      const maxCommits = context.maxCommits || 0;
      return `**图表说明**：该柱状图展示了提交的时间分布频率。平均每天有 ${avgCommits.toFixed(1)} 次提交，最多一天有 ${maxCommits} 次提交。提交频率可以反映项目的开发节奏和活跃度，持续稳定的提交频率通常表明项目处于良好的开发状态。\n\n`;
    
    case 'dependencyType':
      const totalDeps = context.totalDeps || 0;
      const depsPercent = totalDeps > 0 ? ((context.depsCount / totalDeps) * 100).toFixed(1) : 0;
      const devDepsPercent = totalDeps > 0 ? ((context.devDepsCount / totalDeps) * 100).toFixed(1) : 0;
      return `**图表说明**：该条形图对比了生产依赖和开发依赖的数量。生产依赖（${context.depsCount} 个）占 ${depsPercent}%，开发依赖（${context.devDepsCount} 个）占 ${devDepsPercent}%。合理的依赖结构应该以生产依赖为主，开发依赖用于构建和测试工具。\n\n`;
    
    case 'dependencyScope':
      const topScope = data[0];
      const topScopePercent = ((topScope.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
      return `**图表说明**：该饼图展示了依赖项按作用域（scope）的分布情况。${topScope.name} 作用域的依赖项最多，占 ${topScopePercent}%（${topScope.value} 个包）。作用域分布反映了项目使用的技术栈和工具链。\n\n`;
    
    case 'dependencyScopeBar':
      const maxScopeCount = Math.max(...data);
      const avgScopeCount = (data.reduce((sum, val) => sum + val, 0) / data.length).toFixed(1);
      return `**图表说明**：该条形图展示了各作用域的依赖项数量对比。平均每个作用域有 ${avgScopeCount} 个依赖项，最多的作用域有 ${maxScopeCount} 个依赖项。这反映了项目对不同技术栈的依赖程度。\n\n`;
    
    case 'versionPrefix':
      const caretCount = context.caretCount || 0;
      const totalVersions = context.totalVersions || 0;
      const caretPercent = totalVersions > 0 ? ((caretCount / totalVersions) * 100).toFixed(1) : 0;
      return `**图表说明**：该饼图展示了依赖项版本前缀的分布情况。兼容版本（^）占 ${caretPercent}%（${caretCount} 个包），这是最常见的版本管理方式，允许自动更新小版本和补丁版本。精确版本通常用于需要锁定特定版本的场景。\n\n`;
    
    case 'timePeriodPie':
      const maxPeriod = data.reduce((max, d) => d.value > max.value ? d : max, data[0]);
      const maxPeriodPercent = ((maxPeriod.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
      return `**图表说明**：该饼图展示了不同时间段的代码改动量占比。${maxPeriod.name} 的改动量最大，占 ${maxPeriodPercent}%。这反映了项目在不同时期的开发活跃度，可以帮助了解项目的开发节奏和代码演进情况。\n\n`;
    
    case 'timePeriodBar':
      const maxChange = Math.max(...data);
      const avgChange = (data.reduce((sum, val) => sum + val, 0) / data.length).toFixed(0);
      return `**图表说明**：该条形图对比了不同时间段的代码改动量。平均每个时间段的改动量为 ${avgChange.toLocaleString()} 行，最多为 ${maxChange.toLocaleString()} 行。结合占比趋势线可以直观看出各时间段改动量占项目总代码量的比例，有助于评估代码变更的规模和频率。\n\n`;
    
    case 'timePeriodStacked':
      const totalIns = context.totalInsertions || 0;
      const totalDels = context.totalDeletions || 0;
      const netChange = totalIns - totalDels;
      return `**图表说明**：该堆叠条形图展示了不同时间段的新增和删除代码行数。总新增 ${totalIns.toLocaleString()} 行，总删除 ${totalDels.toLocaleString()} 行，净增 ${netChange.toLocaleString()} 行。通过对比新增和删除可以了解代码的演进方向，净增为正表示代码在增长，净增为负表示代码在精简。\n\n`;
    
    default:
      return '';
  }
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(stats, outputPath, gitCommits = null, npmDeps = null) {
  const timestamp = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  let markdown = `# 代码审计报告\n\n`;
  markdown += `**生成时间**: ${timestamp}\n\n`;
  markdown += `---\n\n`;
  
  // 总体统计
  markdown += `## 📊 总体统计\n\n`;
  markdown += `| 指标 | 数值 |\n`;
  markdown += `|------|------|\n`;
  markdown += `| 总文件数 | ${stats.total.files} |\n`;
  markdown += `| 总代码行数 (LOC) | ${stats.total.lines.toLocaleString()} |\n`;
  markdown += `| 总代码行数 (KLOC) | ${(stats.total.lines / 1000).toFixed(2)} |\n`;
  markdown += `| 有效代码行数 | ${stats.total.codeLines.toLocaleString()} |\n`;
  markdown += `| 空行数 | ${stats.total.emptyLines.toLocaleString()} |\n`;
  markdown += `| 平均圈复杂度 | ${(stats.total.complexity / stats.total.codeFiles).toFixed(2)} |\n`;
  markdown += `| 最大圈复杂度 | ${stats.total.maxComplexity} |\n\n`;
  
  // 进程分类统计
  markdown += `## 🔀 进程分类统计\n\n`;
  markdown += `| 进程 | 文件数 | 代码行数 (LOC) | 代码行数 (KLOC) | 有效代码行数 | 平均圈复杂度 |\n`;
  markdown += `|------|--------|----------------|-----------------|--------------|--------------|\n`;
  
  const processOrder = ['main', 'renderer']; // 只统计 main 和 renderer 进程
  const processData = [];
  processOrder.forEach(process => {
    if (stats.processes[process]) {
      const p = stats.processes[process];
      const avgComplexity = p.codeFiles > 0 ? (p.complexity / p.codeFiles).toFixed(2) : '0.00';
      markdown += `| ${process} | ${p.files} | ${p.lines.toLocaleString()} | ${(p.lines / 1000).toFixed(2)} | ${p.codeLines.toLocaleString()} | ${avgComplexity} |\n`;
      if (p.lines > 0) {
        processData.push({ name: process, value: p.lines });
      }
    }
  });
  
  markdown += `\n`;
  
  // 进程代码量占比饼图
  markdown += `### 📊 进程代码量占比\n\n`;
  markdown += `\`\`\`echarts\n`;
  markdown += JSON.stringify(generatePieChart('进程代码量占比', processData), null, 2);
  markdown += `\n\`\`\`\n\n`;
  markdown += generateChartExplanation('processPie', processData);
  
  // 进程代码行数对比条形图
  markdown += `### 📊 进程代码行数对比\n\n`;
  const processNames = processData.map(d => d.name);
  const processLines = processData.map(d => d.value);
  markdown += `\`\`\`echarts\n`;
  markdown += JSON.stringify(generateBarChart('进程代码行数对比', processNames, processLines, '代码行数 (LOC)'), null, 2);
  markdown += `\n\`\`\`\n\n`;
  markdown += generateChartExplanation('processBar', processData.map((d, i) => ({ name: d.name, value: processLines[i] })));
  
  // 语言占比
  markdown += `## 🌐 语言占比统计\n\n`;
  markdown += `| 语言 | 文件数 | 代码行数 (LOC) | 代码行数 (KLOC) | 占比 |\n`;
  markdown += `|------|--------|----------------|-----------------|------|\n`;
  
  const languages = Object.entries(stats.languages)
    .sort((a, b) => b[1].lines - a[1].lines);
  
  const languagePieData = [];
  languages.forEach(([lang, data]) => {
    const percentage = ((data.lines / stats.total.lines) * 100).toFixed(2);
    markdown += `| ${lang} | ${data.files} | ${data.lines.toLocaleString()} | ${(data.lines / 1000).toFixed(2)} | ${percentage}% |\n`;
    if (data.lines > 0) {
      languagePieData.push({ name: lang, value: data.lines });
    }
  });
  
  markdown += `\n`;
  
  // 语言占比饼图
  markdown += `### 📊 语言代码量占比\n\n`;
  markdown += `\`\`\`echarts\n`;
  markdown += JSON.stringify(generatePieChart('语言代码量占比', languagePieData), null, 2);
  markdown += `\n\`\`\`\n\n`;
  markdown += generateChartExplanation('languagePie', languagePieData);
  
  // 语言文件数对比条形图
  markdown += `### 📊 各语言文件数对比\n\n`;
  const topLanguages = languages.slice(0, 10);
  const langNames = topLanguages.map(([lang]) => lang);
  const langFiles = topLanguages.map(([, data]) => data.files);
  markdown += `\`\`\`echarts\n`;
  markdown += JSON.stringify(generateBarChart('各语言文件数对比 (Top 10)', langNames, langFiles, '文件数'), null, 2);
  markdown += `\n\`\`\`\n\n`;
  markdown += generateChartExplanation('languageBar', langFiles);
  
  // 圈复杂度分析
  markdown += `## 🔄 圈复杂度分析\n\n`;
  markdown += `| 复杂度范围 | 文件数 | 占比 |\n`;
  markdown += `|-----------|--------|------|\n`;
  
  const complexityRanges = [
    { min: 0, max: 10, label: '1-10 (简单)' },
    { min: 11, max: 20, label: '11-20 (中等)' },
    { min: 21, max: 50, label: '21-50 (复杂)' },
    { min: 51, max: Infinity, label: '50+ (非常复杂)' }
  ];
  
  const complexityData = [];
  complexityRanges.forEach(range => {
    const count = stats.complexityDistribution.filter(c => c >= range.min && c <= range.max).length;
    const percentage = stats.total.codeFiles > 0 ? ((count / stats.total.codeFiles) * 100).toFixed(2) : '0.00';
    markdown += `| ${range.label} | ${count} | ${percentage}% |\n`;
    complexityData.push({ name: range.label.split(' ')[0], value: count });
  });
  
  markdown += `\n`;
  
  // 圈复杂度分布饼图
  markdown += `### 📊 圈复杂度分布\n\n`;
  markdown += `\`\`\`echarts\n`;
  markdown += JSON.stringify(generatePieChart('圈复杂度分布', complexityData), null, 2);
  markdown += `\n\`\`\`\n\n`;
  markdown += generateChartExplanation('complexityPie', complexityData);
  
  // 圈复杂度分布条形图
  markdown += `### 📊 圈复杂度分布对比\n\n`;
  const complexityLabels = complexityData.map(d => d.name);
  const complexityValues = complexityData.map(d => d.value);
  markdown += `\`\`\`echarts\n`;
  markdown += JSON.stringify(generateBarChart('圈复杂度分布对比', complexityLabels, complexityValues, '文件数'), null, 2);
  markdown += `\n\`\`\`\n\n`;
  markdown += generateChartExplanation('complexityBar', complexityValues);
  
  // 高复杂度文件（Top 10）
  if (stats.highComplexityFiles.length > 0) {
    markdown += `## ⚠️ 高复杂度文件 (Top 10)\n\n`;
    markdown += `| 文件路径 | 圈复杂度 | 代码行数 |\n`;
    markdown += `|---------|----------|----------|\n`;
    
    const top10Files = stats.highComplexityFiles.slice(0, 10);
    top10Files.forEach(file => {
      const relativePath = path.relative(process.cwd(), file.path);
      const fileName = path.basename(relativePath);
      markdown += `| \`${fileName}\` | ${file.complexity} | ${file.codeLines} |\n`;
    });
    
    markdown += `\n`;
    
    // 高复杂度文件折线图
    markdown += `### 📊 高复杂度文件趋势\n\n`;
    const fileNames = top10Files.map(f => path.basename(path.relative(process.cwd(), f.path)));
    const complexities = top10Files.map(f => f.complexity);
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateLineChart('高复杂度文件趋势 (Top 10)', fileNames, complexities, '圈复杂度'), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('highComplexityLine', complexities);
    
    // 高复杂度文件条形图
    markdown += `### 📊 高复杂度文件对比\n\n`;
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateBarChart('高复杂度文件对比 (Top 10)', fileNames, complexities, '圈复杂度'), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('highComplexityBar', complexities);
  }
  
  // 进程多维度雷达图
  markdown += `## 📈 进程多维度分析\n\n`;
  const processIndicators = [];
  const processSeriesData = [];
  
  processOrder.forEach(process => {
    if (stats.processes[process] && stats.processes[process].files > 0) {
      const p = stats.processes[process];
      const maxLines = Math.max(...processOrder.map(proc => stats.processes[proc]?.lines || 0));
      const maxFiles = Math.max(...processOrder.map(proc => stats.processes[proc]?.files || 0));
      const maxComplexity = Math.max(...processOrder.map(proc => {
        const procStats = stats.processes[proc];
        return procStats && procStats.codeFiles > 0 ? (procStats.complexity / procStats.codeFiles) : 0;
      }));
      
      if (processIndicators.length === 0) {
        processIndicators.push(
          { name: '代码行数', max: maxLines },
          { name: '文件数', max: maxFiles },
          { name: '有效代码行数', max: Math.max(...processOrder.map(proc => stats.processes[proc]?.codeLines || 0)) },
          { name: '平均圈复杂度', max: maxComplexity * 1.2 }
        );
      }
      
      processSeriesData.push({
        name: process,
        value: [
          p.lines,
          p.files,
          p.codeLines,
          p.codeFiles > 0 ? (p.complexity / p.codeFiles) : 0
        ]
      });
    }
  });
  
  if (processIndicators.length > 0) {
    markdown += `### 📊 进程多维度雷达图\n\n`;
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateRadarChart('进程多维度分析', processIndicators, processSeriesData), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('radar', processSeriesData);
  }
  
  // 进程代码组成堆叠图
  markdown += `## 📊 进程代码组成分析\n\n`;
  const processCompositionData = [];
  processOrder.forEach(process => {
    if (stats.processes[process] && stats.processes[process].files > 0) {
      const p = stats.processes[process];
      processCompositionData.push({
        name: process,
        codeLines: p.codeLines,
        emptyLines: p.emptyLines,
        commentLines: p.lines - p.codeLines - p.emptyLines
      });
    }
  });
  
  if (processCompositionData.length > 0) {
    const compositionNames = processCompositionData.map(d => d.name);
    const totalCode = processCompositionData.reduce((sum, d) => sum + d.codeLines + d.emptyLines + d.commentLines, 0);
    const totalCodeLines = processCompositionData.reduce((sum, d) => sum + d.codeLines, 0);
    const compositionSeries = [
      { name: '有效代码', data: processCompositionData.map(d => d.codeLines) },
      { name: '空行', data: processCompositionData.map(d => d.emptyLines) },
      { name: '注释/其他', data: processCompositionData.map(d => d.commentLines) }
    ];
    
    markdown += `### 📊 进程代码组成堆叠图\n\n`;
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateStackedBarChart('进程代码组成分析', compositionNames, compositionSeries), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('stackedBar', [], { totalCode, codeLines: totalCodeLines });
  }
  
  // 详细统计
  markdown += `## 📁 详细统计\n\n`;
  
  processOrder.forEach(process => {
    if (stats.processes[process] && stats.processes[process].files > 0) {
      markdown += `### ${process} 进程\n\n`;
      const p = stats.processes[process];
      
      // 语言分布
      const langStats = {};
      Object.values(stats.fileDetails)
        .filter(f => f.process === process)
        .forEach(f => {
          if (!langStats[f.language]) {
            langStats[f.language] = { files: 0, lines: 0 };
          }
          langStats[f.language].files++;
          langStats[f.language].lines += f.totalLines;
        });
      
      markdown += `| 语言 | 文件数 | 代码行数 |\n`;
      markdown += `|------|--------|----------|\n`;
      const processLangData = Object.entries(langStats)
        .sort((a, b) => b[1].lines - a[1].lines);
      
      processLangData.forEach(([lang, data]) => {
        markdown += `| ${lang} | ${data.files} | ${data.lines.toLocaleString()} |\n`;
      });
      
      // 进程内语言分布饼图
      if (processLangData.length > 0) {
        markdown += `\n#### ${process} 进程语言分布\n\n`;
        const processLangPieData = processLangData.map(([lang, data]) => ({
          name: lang,
          value: data.lines
        }));
        markdown += `\`\`\`echarts\n`;
        markdown += JSON.stringify(generatePieChart(`${process} 进程语言分布`, processLangPieData), null, 2);
        markdown += `\n\`\`\`\n\n`;
        markdown += generateChartExplanation('processLanguagePie', processLangPieData, { processName: process });
      }
      
      markdown += `\n`;
    }
  });
  
  // Git 提交分析
  if (gitCommits && gitCommits.length > 0) {
    markdown += `## 📝 Git 提交分析（近半年）\n\n`;
    markdown += `### 📊 提交概览\n\n`;
    markdown += `| 指标 | 数值 |\n`;
    markdown += `|------|------|\n`;
    
    const totalCommits = gitCommits.length;
    const totalInsertions = gitCommits.reduce((sum, c) => sum + c.insertions, 0);
    const totalDeletions = gitCommits.reduce((sum, c) => sum + c.deletions, 0);
    const totalFilesChanged = gitCommits.reduce((sum, c) => sum + c.filesChanged, 0);
    const avgInsertions = totalCommits > 0 ? (totalInsertions / totalCommits) : 0;
    const avgDeletions = totalCommits > 0 ? (totalDeletions / totalCommits) : 0;
    const avgFilesChanged = totalCommits > 0 ? (totalFilesChanged / totalCommits) : 0;
    
    markdown += `| 分析提交数（近半年） | ${totalCommits} |\n`;
    markdown += `| 总新增代码行数 | ${totalInsertions.toLocaleString()} |\n`;
    markdown += `| 总删除代码行数 | ${totalDeletions.toLocaleString()} |\n`;
    markdown += `| 净增代码行数 | ${(totalInsertions - totalDeletions).toLocaleString()} |\n`;
    markdown += `| 总变更文件数 | ${totalFilesChanged} |\n`;
    markdown += `| 平均每次新增行数 | ${avgInsertions.toFixed(1)} |\n`;
    markdown += `| 平均每次删除行数 | ${avgDeletions.toFixed(1)} |\n`;
    markdown += `| 平均每次变更文件数 | ${avgFilesChanged.toFixed(1)} |\n\n`;
    
    // 提交趋势折线图
    markdown += `### 📊 提交代码变更趋势\n\n`;
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateCommitTrendChart('提交代码变更趋势', gitCommits), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('commitTrend', [], {
      totalInsertions,
      totalDeletions,
      avgInsertions
    });
    
    // 提交影响条形图（按每10条拆分）
    markdown += `### 📊 提交影响分析\n\n`;
    
    // 将提交按时间倒序排列（最新的在前），然后每10条一组
    const sortedCommits = [...gitCommits].sort((a, b) => b.date - a.date);
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < sortedCommits.length; i += chunkSize) {
      chunks.push(sortedCommits.slice(i, i + chunkSize));
    }
    
    chunks.forEach((chunk, index) => {
      const startIndex = index * chunkSize + 1;
      const endIndex = Math.min((index + 1) * chunkSize, sortedCommits.length);
      const chartTitle = `提交影响分析 (${startIndex}-${endIndex})`;
      
      markdown += `#### ${chartTitle}\n\n`;
      markdown += `\`\`\`echarts\n`;
      markdown += JSON.stringify(generateCommitImpactChart(chartTitle, chunk), null, 2);
      markdown += `\n\`\`\`\n\n`;
      
      // 只为第一个图表添加总体说明
      if (index === 0) {
        const maxFiles = Math.max(...gitCommits.map(c => c.filesChanged));
        markdown += generateChartExplanation('commitImpact', [], {
          avgFiles: avgFilesChanged,
          maxFiles
        });
      }
    });
    
    // 贡献者饼图
    const contributorStats = {};
    gitCommits.forEach(commit => {
      const key = commit.author;
      if (!contributorStats[key]) {
        contributorStats[key] = 0;
      }
      contributorStats[key]++;
    });
    const contributorData = Object.entries(contributorStats)
      .map(([name, count]) => ({ name, value: count }))
      .sort((a, b) => b.value - a.value);
    
    if (contributorData.length > 0) {
      markdown += `### 📊 贡献者提交分布\n\n`;
      markdown += `\`\`\`echarts\n`;
      markdown += JSON.stringify(generateContributorChart('贡献者提交分布', gitCommits), null, 2);
      markdown += `\n\`\`\`\n\n`;
      markdown += generateChartExplanation('contributor', contributorData);
    }
    
    // 提交频率柱状图
    const dateGroups = {};
    gitCommits.forEach(commit => {
      const dateKey = commit.date.toISOString().split('T')[0];
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = 0;
      }
      dateGroups[dateKey]++;
    });
    const dates = Object.keys(dateGroups);
    const counts = Object.values(dateGroups);
    const avgCommits = counts.length > 0 ? (counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
    const maxCommits = counts.length > 0 ? Math.max(...counts) : 0;
    
    markdown += `### 📊 提交频率分析\n\n`;
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateCommitFrequencyChart('提交频率分析', gitCommits), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('commitFrequency', [], {
      avgCommits,
      maxCommits
    });
    
    // 最近提交列表（显示最近10次）
    markdown += `### 📋 最近提交列表（Top 10）\n\n`;
    markdown += `| 提交 Hash | 作者 | 日期 | 提交信息 | 文件数 | 新增 | 删除 |\n`;
    markdown += `|-----------|------|------|----------|--------|------|------|\n`;
    
    gitCommits.slice(0, 10).forEach(commit => {
      const dateStr = commit.date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      const message = commit.message.length > 50 
        ? commit.message.substring(0, 50) + '...' 
        : commit.message;
      markdown += `| \`${commit.hash}\` | ${commit.author} | ${dateStr} | ${message} | ${commit.filesChanged} | +${commit.insertions} | -${commit.deletions} |\n`;
    });
    
    markdown += `\n`;
  }
  
  // 时间段改动量占比分析
  console.log('📊 分析时间段改动量占比...');
  const timePeriodStats = getTimePeriodCommitStats(stats.total.lines);
  if (timePeriodStats) {
    console.log(`   找到时间段统计数据: ${timePeriodStats.length} 个时间段`);
    const hasChanges = timePeriodStats.some(s => s.totalChanges > 0);
    console.log(`   是否有改动: ${hasChanges}`);
    
    markdown += `## 📈 时间段改动量占比分析\n\n`;
    markdown += `### 📊 改动量概览\n\n`;
    markdown += `| 时间段 | 提交数 | 新增行数 | 删除行数 | 累计改动量 | 净变化量 | 净变化占比 |\n`;
    markdown += `|--------|--------|----------|----------|------------|----------|-------------|\n`;
    
    timePeriodStats.forEach(stat => {
      const netChanges = stat.netChanges || (stat.insertions - stat.deletions);
      const netChangesStr = netChanges >= 0 ? `+${netChanges.toLocaleString()}` : netChanges.toLocaleString();
      markdown += `| ${stat.name} | ${stat.commits} | +${stat.insertions.toLocaleString()} | -${stat.deletions.toLocaleString()} | ${stat.totalChanges.toLocaleString()} | ${netChangesStr} | ${stat.percentage.toFixed(2)}% |\n`;
    });
    
    markdown += `\n`;
    markdown += `> 💡 **说明**：\n`;
    markdown += `> - **累计改动量** = 新增行数 + 删除行数（同一文件多次修改会累加，可能超过项目代码量）\n`;
    markdown += `> - **净变化量** = 新增行数 - 删除行数（实际代码增长量）\n`;
    markdown += `> - **净变化占比** = 净变化量的绝对值 / 项目当前代码量 × 100%\n\n`;
    
    markdown += `\n`;
    
    // 时间段改动量堆叠柱状图（按时间范围从长到短）
    markdown += `### 📊 时间段改动量对比（堆叠柱状图）\n\n`;
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateTimePeriodStackedBarChart('时间段改动量对比', timePeriodStats), null, 2);
    markdown += `\n\`\`\`\n\n`;
    const timePeriodBarData = timePeriodStats.map(s => s.totalChanges);
    markdown += generateChartExplanation('timePeriodBar', timePeriodBarData);
    
    // 时间段改动量堆叠图（新增和删除）
    markdown += `### 📊 时间段改动量组成（新增/删除）\n\n`;
    const totalInsertions = timePeriodStats.reduce((sum, s) => sum + s.insertions, 0);
    const totalDeletions = timePeriodStats.reduce((sum, s) => sum + s.deletions, 0);
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateTimePeriodStackedChart('时间段改动量组成分析', timePeriodStats), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('timePeriodStacked', [], {
      totalInsertions,
      totalDeletions
    });
    
    // 分析说明
    markdown += `### 💡 分析说明\n\n`;
    const totalNetChanges = totalInsertions - totalDeletions;
    const maxPeriod = timePeriodStats.reduce((max, s) => {
      const sNet = Math.abs(s.netChanges || (s.insertions - s.deletions));
      const maxNet = Math.abs(max.netChanges || (max.insertions - max.deletions));
      return sNet > maxNet ? s : max;
    }, timePeriodStats[0]);
    const minPeriod = timePeriodStats.reduce((min, s) => {
      const sNet = Math.abs(s.netChanges || (s.insertions - s.deletions));
      const minNet = Math.abs(min.netChanges || (min.insertions - min.deletions));
      return sNet < minNet ? s : min;
    }, timePeriodStats[0]);
    const avgPercentage = (timePeriodStats.reduce((sum, s) => sum + s.percentage, 0) / timePeriodStats.length).toFixed(2);
    
    const maxNetChanges = maxPeriod.netChanges || (maxPeriod.insertions - maxPeriod.deletions);
    const minNetChanges = minPeriod.netChanges || (minPeriod.insertions - minPeriod.deletions);
    
    markdown += `- **最活跃时间段**：${maxPeriod.name}（净变化 ${maxNetChanges >= 0 ? '+' : ''}${maxNetChanges.toLocaleString()} 行，占比 ${maxPeriod.percentage.toFixed(2)}%）\n`;
    markdown += `- **最不活跃时间段**：${minPeriod.name}（净变化 ${minNetChanges >= 0 ? '+' : ''}${minNetChanges.toLocaleString()} 行，占比 ${minPeriod.percentage.toFixed(2)}%）\n`;
    markdown += `- **平均净变化占比**：${avgPercentage}%\n`;
    markdown += `- **累计总改动量**：${timePeriodStats.reduce((sum, s) => sum + s.totalChanges, 0).toLocaleString()} 行（新增 ${totalInsertions.toLocaleString()} 行，删除 ${totalDeletions.toLocaleString()} 行）\n`;
    markdown += `- **总净变化量**：${totalNetChanges >= 0 ? '+' : ''}${totalNetChanges.toLocaleString()} 行\n\n`;
    
    markdown += `> 💡 **提示**：时间段改动量占比反映了项目在不同时期的开发活跃度。净变化占比使用净变化量（新增-删除）的绝对值计算，更准确地反映了代码的实际增长情况。累计改动量可能超过项目代码量，因为同一文件可能被多次修改。\n\n`;
  } else {
    console.log('   ⚠️  无法获取时间段改动量统计（可能不是 Git 仓库或没有提交记录）');
  }
  
  // NPM 依赖项分析
  if (npmDeps) {
    markdown += `## 📦 NPM 依赖项分析\n\n`;
    markdown += `### 📊 依赖项概览\n\n`;
    markdown += `| 指标 | 数值 |\n`;
    markdown += `|------|------|\n`;
    markdown += `| 生产依赖 (dependencies) | ${npmDeps.dependencies} |\n`;
    markdown += `| 开发依赖 (devDependencies) | ${npmDeps.devDependencies} |\n`;
    markdown += `| 总依赖项数 | ${npmDeps.total} |\n`;
    markdown += `| 生产依赖占比 | ${((npmDeps.dependencies / npmDeps.total) * 100).toFixed(1)}% |\n`;
    markdown += `| 开发依赖占比 | ${((npmDeps.devDependencies / npmDeps.total) * 100).toFixed(1)}% |\n\n`;
    
    // 依赖项类型对比图
    markdown += `### 📊 依赖项类型对比\n\n`;
    markdown += `\`\`\`echarts\n`;
    markdown += JSON.stringify(generateDependencyTypeChart('依赖项类型对比', npmDeps.dependencies, npmDeps.devDependencies), null, 2);
    markdown += `\n\`\`\`\n\n`;
    markdown += generateChartExplanation('dependencyType', [], {
      depsCount: npmDeps.dependencies,
      devDepsCount: npmDeps.devDependencies,
      totalDeps: npmDeps.total
    });
    
    // 依赖项作用域饼图
    const scopeData = Object.entries(npmDeps.scopedDeps)
      .filter(([scope, deps]) => deps.length > 0)
      .map(([scope, deps]) => ({
        name: scope,
        value: deps.length
      }))
      .sort((a, b) => b.value - a.value);
    
    if (scopeData.length > 0) {
      markdown += `### 📊 依赖项作用域分布\n\n`;
      markdown += `\`\`\`echarts\n`;
      markdown += JSON.stringify(generateDependencyScopeChart('依赖项作用域分布', npmDeps.scopedDeps), null, 2);
      markdown += `\n\`\`\`\n\n`;
      markdown += generateChartExplanation('dependencyScope', scopeData);
      
      // 依赖项作用域条形图
      markdown += `### 📊 依赖项作用域对比\n\n`;
      const scopeNames = scopeData.map(d => d.name);
      const scopeCounts = scopeData.map(d => d.value);
      markdown += `\`\`\`echarts\n`;
      markdown += JSON.stringify(generateDependencyScopeBarChart('依赖项作用域对比', npmDeps.scopedDeps), null, 2);
      markdown += `\n\`\`\`\n\n`;
      markdown += generateChartExplanation('dependencyScopeBar', scopeCounts);
    }
    
    // 版本前缀分布图（只在有多种前缀时显示）
    const versionPrefixCounts = Object.values(npmDeps.versionPrefixes).filter(count => count > 0);
    const hasMultiplePrefixes = versionPrefixCounts.length > 1;
    
    if (hasMultiplePrefixes) {
      markdown += `### 📊 版本前缀分布\n\n`;
      markdown += `\`\`\`echarts\n`;
      markdown += JSON.stringify(generateVersionPrefixChart('版本前缀分布', npmDeps.versionPrefixes), null, 2);
      markdown += `\n\`\`\`\n\n`;
      const totalVersions = Object.values(npmDeps.versionPrefixes).reduce((sum, count) => sum + count, 0);
      markdown += generateChartExplanation('versionPrefix', [], {
        caretCount: npmDeps.versionPrefixes['^'] || 0,
        totalVersions
      });
    } else {
      // 如果只有一种版本前缀，在概览中说明即可，不显示图表
      const prefixType = Object.entries(npmDeps.versionPrefixes).find(([_, count]) => count > 0)?.[0] || 'unknown';
      const prefixName = prefixType === '^' ? '兼容版本（^）' : 
                        prefixType === '~' ? '近似版本（~）' :
                        prefixType === '>=' ? '大于等于（>=）' :
                        prefixType === '<=' ? '小于等于（<=）' :
                        '精确版本';
      markdown += `### 📊 版本管理策略\n\n`;
      markdown += `所有依赖项均使用 ${prefixName} 作为版本前缀，版本管理策略统一。\n\n`;
    }
    
    // 主要依赖项列表（Top 20）
    markdown += `### 📋 主要依赖项列表 (Top 20)\n\n`;
    markdown += `| 依赖项名称 | 版本 | 类型 |\n`;
    markdown += `|-----------|------|------|\n`;
    
    const allDepsList = Object.entries(npmDeps.allDeps)
      .map(([name, version]) => {
        const scope = getDependencyScope(name);
        const depInfo = npmDeps.scopedDeps[scope]?.find(d => d.name === name);
        return {
          name,
          version,
          type: depInfo?.type || 'dependency'
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20);
    
    allDepsList.forEach(dep => {
      const typeLabel = dep.type === 'dependency' ? '生产依赖' : '开发依赖';
      markdown += `| \`${dep.name}\` | ${dep.version} | ${typeLabel} |\n`;
    });
    
    markdown += `\n`;
  }
  
  // 写入文件
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`✅ 报告已生成: ${outputPath}`);
}

// 辅助函数：提取依赖项作用域
function getDependencyScope(name) {
  // 如果包名以 @ 开头，提取作用域部分（@scope/package-name 中的 @scope）
  if (name.startsWith('@')) {
    const parts = name.split('/');
    if (parts.length >= 2) {
      return parts[0]; // 返回 @scope
    }
    return name; // 如果格式异常，返回整个名称
  }
  // 没有作用域的包归类为"无作用域"
  return '(无作用域)';
}

/**
 * 主函数
 */
function main() {
  const srcDir = path.join(__dirname, '..', 'src');
  const outputPath = path.join(__dirname, '..', 'code-audit-report.md');
  
  if (!fs.existsSync(srcDir)) {
    console.error(`❌ 错误: 找不到 src 目录: ${srcDir}`);
    process.exit(1);
  }
  
  console.log('🔍 开始代码审计...');
  console.log(`📁 扫描目录: ${srcDir}`);
  
  // 获取所有文件
  const files = walkDirectory(srcDir, srcDir);
  console.log(`📄 找到 ${files.length} 个文件`);
  
  // 分析文件
  const stats = {
    total: {
      files: 0,
      lines: 0,
      codeLines: 0,
      emptyLines: 0,
      complexity: 0,
      codeFiles: 0,
      maxComplexity: 0
    },
    processes: {},
    languages: {},
    fileDetails: {},
    complexityDistribution: [],
    highComplexityFiles: []
  };
  
  console.log('📊 分析文件中...');
  let processed = 0;
  
  files.forEach(filePath => {
    const fileInfo = analyzeFile(filePath);
    if (!fileInfo) return;
    
    processed++;
    if (processed % 50 === 0) {
      console.log(`   已处理 ${processed}/${files.length} 个文件...`);
    }
    
    // 总体统计
    stats.total.files++;
    stats.total.lines += fileInfo.totalLines;
    stats.total.codeLines += fileInfo.codeLines;
    stats.total.emptyLines += fileInfo.emptyLines;
    
    if (fileInfo.isCode) {
      stats.total.codeFiles++;
      stats.total.complexity += fileInfo.complexity;
      stats.total.maxComplexity = Math.max(stats.total.maxComplexity, fileInfo.complexity);
      stats.complexityDistribution.push(fileInfo.complexity);
      
      if (fileInfo.complexity > 20) {
        stats.highComplexityFiles.push(fileInfo);
      }
    }
    
    // 进程分类
    const process = categorizeFile(filePath, srcDir);
    if (!stats.processes[process]) {
      stats.processes[process] = {
        files: 0,
        lines: 0,
        codeLines: 0,
        emptyLines: 0,
        complexity: 0,
        codeFiles: 0
      };
    }
    stats.processes[process].files++;
    stats.processes[process].lines += fileInfo.totalLines;
    stats.processes[process].codeLines += fileInfo.codeLines;
    stats.processes[process].emptyLines += fileInfo.emptyLines;
    if (fileInfo.isCode) {
      stats.processes[process].codeFiles++;
      stats.processes[process].complexity += fileInfo.complexity;
    }
    
    // 语言统计
    if (!stats.languages[fileInfo.language]) {
      stats.languages[fileInfo.language] = {
        files: 0,
        lines: 0
      };
    }
    stats.languages[fileInfo.language].files++;
    stats.languages[fileInfo.language].lines += fileInfo.totalLines;
    
    // 文件详情
    stats.fileDetails[filePath] = {
      ...fileInfo,
      process
    };
  });
  
  // 按复杂度排序高复杂度文件
  stats.highComplexityFiles.sort((a, b) => b.complexity - a.complexity);
  
  // 获取 Git 提交信息（近半年）
  console.log('📝 获取 Git 提交信息（近半年）...');
  const gitCommits = getRecentCommits(6);
  if (gitCommits) {
    console.log(`   找到 ${gitCommits.length} 次提交`);
  }
  
  // 分析 NPM 依赖项
  console.log('📦 分析 NPM 依赖项...');
  const npmDeps = analyzeNpmDependencies();
  if (npmDeps) {
    console.log(`   找到 ${npmDeps.total} 个依赖项（${npmDeps.dependencies} 个生产依赖，${npmDeps.devDependencies} 个开发依赖）`);
  }
  
  console.log('📝 生成报告...');
  generateMarkdownReport(stats, outputPath, gitCommits, npmDeps);
  
  // 控制台输出摘要
  console.log('\n📊 审计摘要:');
  console.log(`   总文件数: ${stats.total.files}`);
  console.log(`   总代码行数: ${stats.total.lines.toLocaleString()} (${(stats.total.lines / 1000).toFixed(2)} KLOC)`);
  console.log(`   有效代码行数: ${stats.total.codeLines.toLocaleString()}`);
  console.log(`   主进程代码: ${stats.processes.main?.lines.toLocaleString() || 0} 行`);
  console.log(`   渲染进程代码: ${stats.processes.renderer?.lines.toLocaleString() || 0} 行`);
  console.log(`   平均圈复杂度: ${(stats.total.complexity / stats.total.codeFiles).toFixed(2)}`);
  console.log(`\n✅ 审计完成！报告已保存到: ${outputPath}`);
}

// 运行主函数
main();

