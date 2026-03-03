# 拼写检查逻辑梳理文档

## 当前逻辑架构

### 1. 字典来源（三层结构）

#### 1.1 内置词典（Builtin Dictionary）

- **位置**: `src/main/utils/builtin-dictionaries/`
- **内容**: 硬编码的单词集合，包含多个领域：
  - tech（技术）
  - ai（人工智能）
  - academic（学术）
  - protocol（协议）
  - misc（杂项）
  - languages（语言）
  - database（数据库）
  - infra（基础设施）
  - math（数学）
  - physics（物理）
  - chemistry（化学）
  - biology（生物）
  - economics（经济）
- **加载方式**: 通过 `getBuiltinDictionary()` 函数合并所有领域词典，返回 `Set<string>`
- **存储方式**: 写入临时 `.txt` 文件 `metadoc-builtin.txt`

#### 1.2 自定义词典（Custom Dictionary）

- **位置**: `{userData}/spell-check-dictionary.json`
- **内容**: 用户手动添加的单词列表（JSON 数组）
- **加载方式**: 通过 `loadCustomDictionary()` 函数加载，返回 `Set<string>`
- **存储方式**: 写入临时 `.txt` 文件 `metadoc-custom.txt`

#### 1.3 cspell 配置字典（Config Dictionaries）

- **位置**: `resources/cspell.json`
- **内容**: 从 npm 包加载的多语言字典：
  - `@cspell/dict-en-US` - 英语（美式）
  - `@cspell/dict-fr-FR` - 法语
  - `@cspell/dict-es-ES` - 西班牙语
  - `@cspell/dict-de-DE` - 德语
  - `@cspell/dict-ru-RU` - 俄语
  - `@cspell/dict-markdown` - Markdown 格式
  - `@cspell/dict-latex` - LaTeX 格式
- **加载方式**: 通过 `loadCSpellConfig()` 函数从配置文件加载

### 2. 语言配置逻辑

#### 2.1 `getMultiLanguageConfig()` 函数

- **输入**: 用户选择的语言代码（如 `zh_CN`）和文档格式（`text` | `markdown` | `latex`）
- **输出**: cspell 语言配置字符串（如 `en-US,markdown`）
- **逻辑**:
  1. 始终包含英语（`en-US`）
  2. 如果用户语言不是英语，添加用户语言
  3. 根据格式添加 `markdown` 或 `latex`
- **问题**:
  - ❌ 只支持单一用户语言，不支持多语言混合
  - ❌ 没有启用所有配置文件中定义的字典

#### 2.2 `i18nLocaleToCSpellLocale()` 函数

- **功能**: 将 i18n 语言代码转换为 cspell 语言代码
- **支持的语言**: `zh_CN`, `en_US`, `ja_JP`, `ko_KR`, `de_DE`, `fr_FR`

### 3. 配置加载逻辑

#### 3.1 `loadCSpellConfig()` 函数

- **流程**:
  1. 从 `resources/cspell.json` 加载基础配置
  2. 创建动态词典配置（内置和自定义）
  3. 合并配置：
     - 合并 `dictionaryDefinitions`
     - 合并 `dictionaries`
     - 移除 `overrides` 中的 `language` 字段（避免覆盖）
- **问题**:
  - ❌ 虽然加载了所有字典定义，但 `language` 字段可能只包含部分语言
  - ❌ 逻辑复杂，有多个 fallback 分支

### 4. 拼写检查执行流程

#### 4.1 `performSpellCheck()` 函数

1. **预处理文本**（已禁用）:
   - 原逻辑会移除代码块、链接、公式等
   - 现在直接使用原始文本，让 cspell 自动处理

2. **加载字典**:
   - 加载内置词典 → 写入临时文件
   - 加载自定义词典 → 写入临时文件

3. **加载配置**:
   - 调用 `loadCSpellConfig()` 合并配置
   - 获取语言配置（通过 `getMultiLanguageConfig()`）

4. **执行检查**:
   - 调用 `spellCheckDocument()` 进行拼写检查
   - 使用合并后的配置和语言设置

5. **过滤结果**:
   - 跳过符合命名规则的单词（ALL_CAPS, PascalCase, CamelCase）
   - 跳过建议列表为空或包含单词本身的错误（说明单词在词典中）

## 当前问题分析

### 问题 1: 多语言支持不完整

- **现状**: 只检查用户选择的语言 + 英语 + 格式语言
- **需求**: 支持多语言混合文档，需要检查所有语言
- **影响**: 如果文档包含未选择语言的文本，可能无法正确检查

### 问题 2: 字典启用不完整

- **现状**: 虽然配置文件中定义了多种语言字典，但 `language` 字段可能只包含部分语言
- **需求**: 启用所有配置文件中定义的字典
- **影响**: 某些语言的字典可能未被使用

### 问题 3: 逻辑复杂且混乱

- **现状**:
  - 多个配置来源（内置、自定义、cspell 配置）
  - 复杂的合并逻辑
  - 多个 fallback 分支
- **需求**: 简化逻辑，提高可维护性

### 问题 4: 配置不一致

- **现状**:
  - `resources/cspell.json` 和 `cspell.json` 内容不一致
  - `resources/cspell.json` 使用 `en-US, fr-FR` 等格式
  - `cspell.json` 使用 `fr-fr, es-es` 等格式
- **需求**: 统一配置格式

## 改进方案

### 方案 1: 启用所有可用字典

- 从配置文件中读取所有 `dictionaryDefinitions`
- 将所有字典名称添加到 `dictionaries` 数组
- 将所有语言代码添加到 `language` 字段

### 方案 2: 简化语言配置

- 移除 `getMultiLanguageConfig()` 的复杂逻辑
- 直接使用配置文件中的所有语言
- 根据文档格式添加格式特定语言（markdown/latex）

### 方案 3: 统一配置管理

- 只使用 `resources/cspell.json` 作为配置源
- 移除对 `cspell.json` 的依赖
- 统一语言代码格式

### 方案 4: 优化配置加载

- 简化 `loadCSpellConfig()` 函数
- 减少 fallback 分支
- 提高错误处理的清晰度

## 实施计划

1. ✅ 梳理当前逻辑（本文档）
2. ✅ 重构 `getMultiLanguageConfig()` - 启用所有语言
3. ✅ 优化 `loadCSpellConfig()` - 确保所有字典被启用
4. ✅ 更新 `performSpellCheck()` - 使用新的配置逻辑
5. ⏳ 测试多语言混合文档的拼写检查

## 已实施的改进

### 改进 1: 启用所有可用语言

- **修改**: `getMultiLanguageConfig()` 函数
- **变化**:
  - 新增 `getAllAvailableLanguages()` 函数，从配置文件中读取所有可用语言
  - `getMultiLanguageConfig()` 不再依赖用户选择的语言，而是启用所有配置文件中定义的语言
  - 支持多语言混合文档的拼写检查
- **效果**: 文档中包含的任何语言（英语、法语、西班牙语、德语、俄语等）都能被正确检查

### 改进 2: 确保所有字典被启用

- **修改**: `loadCSpellConfig()` 函数
- **变化**:
  - 添加逻辑确保所有 `dictionaryDefinitions` 中的字典都被添加到 `dictionaries` 数组
  - 避免某些字典定义但未启用的情况
- **效果**: 所有配置的字典都会被使用，不会遗漏

### 改进 3: 简化语言配置逻辑

- **修改**: `performSpellCheck()` 函数
- **变化**:
  - 移除了对 `userLocale` 的依赖（不再需要根据用户语言选择字典）
  - 直接使用 `getMultiLanguageConfig(format)` 获取所有可用语言
  - 移除了 `primaryLocale` 相关逻辑
- **效果**: 代码更简洁，逻辑更清晰

### 改进 4: 增强日志输出

- **修改**: 多个函数
- **变化**:
  - 添加更详细的日志，显示启用的语言和字典
  - 便于调试和问题排查
- **效果**: 更容易了解拼写检查使用的配置

## 使用说明

### 多语言混合文档支持

现在系统会自动启用所有配置文件中定义的语言字典，包括：

- 英语（en-US）
- 法语（fr-FR）
- 西班牙语（es-ES）
- 德语（de-DE）
- 俄语（ru-RU）
- Markdown 格式（markdown）
- LaTeX 格式（latex）

### 配置管理

- 主配置文件：`resources/cspell.json`
- 添加新语言：在配置文件的 `dictionaryDefinitions` 中添加新字典定义，系统会自动启用
- 自定义单词：通过 `addWordToDictionary()` 函数添加到用户自定义词典

### 性能考虑

- 启用所有字典可能会略微影响性能，但能确保多语言混合文档的正确检查
- 如果性能成为问题，可以考虑：
  1. 优化字典加载（懒加载）
  2. 缓存配置
  3. 允许用户选择要启用的语言子集（未来功能）
