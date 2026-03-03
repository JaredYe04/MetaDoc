# 中文硬编码检查报告 - Wave 2

## 📊 检查范围

- **搜索目录**: `/src/renderer/src/views/` 和 `/src/renderer/src/components/`
- **文件类型**: `*.vue`
- **排除项**: 注释、console.log、logger、已使用 `$t()` 的文本

---

## 🔍 发现的硬编码中文位置

### 1. UserManual.vue (用户手册主页面)

**位置**: `/src/renderer/src/views/UserManual.vue`

| 行号 | 当前代码                                                           | 问题类型       |
| ---- | ------------------------------------------------------------------ | -------------- |
| 7    | `{{ $t('userManual.backToOverview') \|\| '返回概览' }}`            | fallback硬编码 |
| 19   | `{{ $t('userManual.replayCelebration') \|\| '重新播放庆祝动画' }}` | fallback硬编码 |
| 33   | `{{ $t('userManual.overview.title') \|\| '概览' }}`                | fallback硬编码 |

**状态**: ⚠️ i18n key已存在，但fallback硬编码需要移除（应确保key一定存在）

---

### 2. NewDocumentWorkspace.vue (新建文档工作区)

**位置**: `/src/renderer/src/views/NewDocumentWorkspace.vue`

| 行号 | 当前代码                                                             | 问题类型       |
| ---- | -------------------------------------------------------------------- | -------------- |
| 48   | `:aria-label="t('common.delete') \|\| '删除'"`                       | fallback硬编码 |
| 212  | `return [{ text: t('newDocument.emptyTemplate', '空白文档'), ... }]` | fallback硬编码 |
| 285  | `return [{ text: t('newDocument.emptyTemplate', '空白文档'), ... }]` | fallback硬编码 |

**状态**: ✅ `newDocument.emptyTemplate` 已在 `zh_cn.json:2498` 定义，但Vue文件中使用的是fallback形式

---

### 3. LearningGraph.vue (学习路径图组件)

**位置**: `/src/renderer/src/components/manual/LearningGraph.vue`

| 行号 | 当前代码                                               | 问题类型       |
| ---- | ------------------------------------------------------ | -------------- |
| 4    | `{{ $t('userManual.graph.title') \|\| '学习路径图' }}` | fallback硬编码 |
| 9    | `{{ $t('userManual.graph.collapse') \|\| '收起' }}`    | fallback硬编码 |
| 10   | `{{ $t('userManual.graph.expand') \|\| '展开' }}`      | fallback硬编码 |
| 28   | `{{ $t('userManual.graph.completed') \|\| '已完成' }}` | fallback硬编码 |
| 32   | `{{ $t('userManual.graph.current') \|\| '当前' }}`     | fallback硬编码 |
| 36   | `{{ $t('userManual.graph.pending') \|\| '待学习' }}`   | fallback硬编码 |
| 40   | `{{ $t('userManual.graph.selected') \|\| '已选中' }}`  | fallback硬编码 |

**状态**: ⚠️ 部分key已存在（已在`zh_cn.json:3794-3801`定义），但代码中仍使用fallback

---

### 4. DialogDemoWrapper.vue (Dialog演示包装器)

**位置**: `/src/renderer/src/components/manual/DialogDemoWrapper.vue`

| 行号 | 当前代码                                                 | 问题类型          |
| ---- | -------------------------------------------------------- | ----------------- |
| 35   | `previewText: '组件预览'`                                | props默认值硬编码 |
| 92   | `:title="isFullscreen ? '退出全屏' : '全屏预览'"`        | 模板文本硬编码    |
| 130  | `<p class="dialog-demo-placeholder">Dialog 内容区域</p>` | 占位文本硬编码    |

**状态**: ❌ 需要新增i18n key

---

### 5. InlineDialog.vue (内联Dialog组件)

**位置**: `/src/renderer/src/components/manual/InlineDialog.vue`

| 行号 | 当前代码                                          | 问题类型          |
| ---- | ------------------------------------------------- | ----------------- |
| 75   | `previewText: '组件预览'`                         | props默认值硬编码 |
| 181  | `:title="isFullscreen ? '退出全屏' : '全屏预览'"` | 模板文本硬编码    |

**状态**: ❌ 需要新增i18n key

---

### 6. SettingDebugSection.vue (调试设置面板) - 严重问题

**位置**: `/src/renderer/src/views/setting/SettingDebugSection.vue`

| 行号 | 当前代码                                         | 建议i18n key                           |
| ---- | ------------------------------------------------ | -------------------------------------- |
| 2658 | `notifyError('保存配置失败')`                    | `setting.debug.saveConfigFailed`       |
| 2674 | `notifyWarning('请先选择Tool')`                  | `setting.debug.selectToolFirst`        |
| 2679 | `notifyWarning('请输入配置名称')`                | `setting.debug.enterConfigName`        |
| 2687 | `notifyError('参数JSON格式错误')`                | `setting.debug.invalidJsonFormat`      |
| 2861 | `notifyWarning('请先选择Tool')`                  | `setting.debug.selectToolFirst`        |
| 2903 | `notifyWarning('请先选择Tool')`                  | `setting.debug.selectToolFirst`        |
| 2923 | `notifyError('参数JSON格式错误')`                | `setting.debug.invalidJsonFormat`      |
| 2938 | `notifyError('上下文Tab必须是文档类型的Tab...')` | `setting.debug.contextTabMustBeDoc`    |
| 3363 | `notifySuccess('Tool执行成功')`                  | `setting.debug.toolExecutionSuccess`   |
| 3365 | `notifyError('Tool执行失败...')`                 | `setting.debug.toolExecutionFailed`    |
| 3528 | `` `已完成 ${completedCount}...` ``              | 动态中文模板                           |
| 3976 | `autoTestCurrentTest.value = '测试已停止'`       | `setting.debug.testStopped`            |
| 3977 | `notifyInfo('测试已停止')`                       | `setting.debug.testStopped`            |
| 4315 | `unitTestBatchCurrentTest.value = '测试已停止'`  | `setting.debug.testStopped`            |
| 4316 | `notifyInfo('测试已停止')`                       | `setting.debug.testStopped`            |
| 4325 | `notifyError('找不到工具配置')`                  | `setting.debug.toolConfigNotFound`     |
| 4443 | `` `工具 ${snapshot.toolId} 不存在...` ``        | 动态中文模板                           |
| 4680 | `notifySuccess('模拟安装完成...')`               | `setting.debug.simulateInstallSuccess` |
| 4700 | `notifySuccess('状态已重置')`                    | `setting.debug.stateReset`             |
| 4712 | `notifySuccess('会话已加载')`                    | `setting.debug.sessionLoaded`          |
| 4720 | `notifyWarning('请先选择文档')`                  | `setting.debug.selectDocFirst`         |
| 4789 | `` `会话 "${legacySession.title}" 已存在...` ``  | 动态中文模板                           |
| 4825 | `` `确定要回溯到节点 ${nodeId...} 吗？...` ``    | 动态中文模板                           |
| 4881 | `notifySuccess('已回溯到指定节点')`              | `setting.debug.rollbackSuccess`        |
| 4892 | `notifyWarning('请先选择会话')`                  | `setting.debug.selectSessionFirst`     |
| 4898 | `'确定要重新执行此消息吗？...'`                  | 确认对话框文本                         |
| 4928 | `notifyError('无法找到用户消息')`                | `setting.debug.userMessageNotFound`    |
| 4938 | `notifyError('未找到Agent引擎')`                 | `setting.debug.agentEngineNotFound`    |
| 4944 | `notifyError('未找到Agent配置')`                 | `setting.debug.agentConfigNotFound`    |
| 4957 | `notifyInfo('开始重新执行Agent...')`             | `setting.debug.restartAgent`           |
| 4987 | `notifySuccess('Agent执行完成')`                 | `setting.debug.agentExecutionComplete` |
| 4998 | `notifyWarning('请先选择会话')`                  | `setting.debug.selectSessionFirst`     |
| 5005 | `notifyWarning('节点类型错误...')`               | `setting.debug.invalidNodeType`        |
| 5011 | `'确定要重新执行此工具调用吗？...'`              | 确认对话框文本                         |
| 5041 | `'确定要重新执行此工具调用吗？...'`              | 确认对话框文本                         |
| 5085 | `` `工具 ${toolCallData.tool_id} 已重新执行` ``  | 动态中文模板                           |
| 5119 | `notifySuccess('工具调用已重新执行')`            | `setting.debug.toolReexecuted`         |
| 5131 | `'tool-call': '工具调用'`                        | 类型映射硬编码                         |
| 5132 | `'llm-call': 'LLM调用'`                          | 类型映射硬编码                         |
| 5154 | `cancelled: '已取消'`                            | 状态映射硬编码                         |
| 5174 | `user: '用户'`                                   | 角色映射硬编码                         |
| 5313 | `notifySuccess('会话导入成功...')`               | `setting.debug.sessionImportSuccess`   |
| 5332 | `notifyInfo('已清除回放会话')`                   | `setting.debug.sessionCleared`         |
| 5338 | `notifyWarning('请先导入会话')`                  | `setting.debug.importSessionFirst`     |
| 5464 | `notifySuccess('回放完成')`                      | `setting.debug.playbackComplete`       |
| 5495 | `notifyInfo('回放已停止')`                       | `setting.debug.playbackStopped`        |
| 5515 | `notifyInfo('已重置到开头')`                     | `setting.debug.resetToStart`           |

**状态**: ❌❌❌ 严重问题 - 大量调试相关的用户可见文本完全硬编码

---

### 7. DialogDemoExample.vue & InlineDialogDemo.vue

**位置**: 多个演示组件

| 文件                  | 行号  | 当前代码                 |
| --------------------- | ----- | ------------------------ |
| DialogDemoExample.vue | 17-60 | 多个演示标题和描述硬编码 |
| InlineDialogDemo.vue  | 43    | `label: '右边距(cm)'` 等 |

**状态**: ⚠️ 这些是演示/示例组件，优先级较低

---

## 📋 需要新增的i18n Key汇总

### A. userManual 模块 (zh_cn.json 中已部分存在，需检查完整性)

```json
{
  "userManual": {
    "backToOverview": "返回概览",
    "replayCelebration": "重新播放庆祝动画",
    "overview": {
      "title": "概览"
    },
    "graph": {
      "title": "学习路径图",
      "expand": "展开",
      "collapse": "收起",
      "completed": "已完成",
      "current": "当前",
      "pending": "待学习",
      "selected": "已选中"
    }
  }
}
```

**注意**: 以上key已在 `zh_cn.json:3746-3806` 存在，只需移除Vue文件中的fallback硬编码

### B. manual 组件模块 (新增)

```json
{
  "manual": {
    "demo": {
      "previewText": "组件预览",
      "fullscreen": "全屏预览",
      "exitFullscreen": "退出全屏",
      "contentPlaceholder": "Dialog 内容区域"
    }
  }
}
```

### C. setting.debug 模块 (大量新增)

```json
{
  "setting": {
    "debug": {
      "saveConfigFailed": "保存配置失败",
      "selectToolFirst": "请先选择Tool",
      "enterConfigName": "请输入配置名称",
      "invalidJsonFormat": "参数JSON格式错误",
      "contextTabMustBeDoc": "上下文Tab必须是文档类型的Tab，不能是工具Tab或系统Tab",
      "toolExecutionSuccess": "Tool执行成功",
      "toolExecutionFailed": "Tool执行失败: {error}",
      "testStopped": "测试已停止",
      "testProgress": "已完成 {completed}/{total}，剩余 {remaining} 个测试用例...",
      "toolConfigNotFound": "找不到工具配置",
      "toolNotExist": "工具 {toolId} 不存在，将使用快照中的配置",
      "simulateInstallSuccess": "模拟安装完成（实际环境中会重启应用）",
      "stateReset": "状态已重置",
      "sessionLoaded": "会话已加载",
      "selectDocFirst": "请先选择文档",
      "sessionExistsConfirm": "会话 \"{title}\" 已存在，是否覆盖？",
      "rollbackConfirm": "确定要回溯到节点 {nodeId}... 吗？此操作将删除该节点之后的所有内容。",
      "rollbackSuccess": "已回溯到指定节点",
      "selectSessionFirst": "请先选择会话",
      "restartMessageConfirm": "确定要重新执行此消息吗？此操作将删除该消息之后的所有内容，然后重新触发Agent执行。",
      "userMessageNotFound": "无法找到用户消息",
      "agentEngineNotFound": "未找到Agent引擎",
      "agentConfigNotFound": "未找到Agent配置",
      "restartAgent": "开始重新执行Agent...",
      "agentExecutionComplete": "Agent执行完成",
      "invalidNodeType": "节点类型错误，无法重新执行",
      "restartToolConfirm": "确定要重新执行此工具调用吗？此操作将删除该工具调用之后的所有内容。",
      "toolReexecuted": "工具 {toolId} 已重新执行",
      "toolReexecutionSuccess": "工具调用已重新执行",
      "typeMapping": {
        "toolCall": "工具调用",
        "llmCall": "LLM调用"
      },
      "status": {
        "cancelled": "已取消"
      },
      "role": {
        "user": "用户"
      },
      "sessionImportSuccess": "会话导入成功，可以开始回放",
      "sessionCleared": "已清除回放会话",
      "importSessionFirst": "请先导入会话",
      "playbackComplete": "回放完成",
      "playbackStopped": "回放已停止",
      "resetToStart": "已重置到开头"
    }
  }
}
```

---

## 🔧 修复步骤

### Step 1: 移除已存在key的fallback硬编码

对于 `userManual` 相关的fallback硬编码，直接移除 `|| '中文'` 部分：

```vue
<!-- 修改前 -->
{{ $t('userManual.backToOverview') || '返回概览' }}

<!-- 修改后 -->
{{ $t('userManual.backToOverview') }}
```

**涉及文件**:

- `UserManual.vue` (3处)
- `LearningGraph.vue` (7处)
- `NewDocumentWorkspace.vue` (1处 - aria-label)

### Step 2: 新增 manual 模块i18n key

在 `zh_cn.json` 和 `en_us.json` 中添加：

```json
{
  "manual": {
    "demo": {
      "previewText": "组件预览",
      "fullscreen": "全屏预览",
      "exitFullscreen": "退出全屏",
      "contentPlaceholder": "Dialog 内容区域"
    }
  }
}
```

**涉及文件**:

- `DialogDemoWrapper.vue`
- `InlineDialog.vue`

### Step 3: SettingDebugSection 全面i18n化 (工作量最大)

需要将 ~40+ 处硬编码中文替换为 `$t()` 调用，包括：

- notifyInfo/Success/Warning/Error 调用
- ElMessageBox.confirm 对话框文本
- 动态模板字符串
- 类型/状态/角色映射表

**建议优先级**:

1. 🔴 高: 用户可见的通知消息 (notifyXXX)
2. 🟡 中: 确认对话框文本
3. 🟢 低: 内部调试日志、映射表

### Step 4: 同步其他语言文件

将新增的key同步到：

- `en_us.json` (英文)
- `ja_JP.json` (日文)
- `ko_KR.json` (韩文)
- `de_DE.json` (德文)
- `fr_FR.json` (法文)

---

## 📊 问题统计

| 类别                       | 数量  | 优先级 |
| -------------------------- | ----- | ------ |
| fallback硬编码 (key已存在) | 12处  | 低     |
| 完全硬编码 (需新增key)     | 50+处 | 高     |
| 动态模板字符串             | 8处   | 中     |
| 类型/状态映射              | 4处   | 低     |

**最严重文件**: `SettingDebugSection.vue` (~45处硬编码)

---

## 💡 建议

1. **优先修复 SettingDebugSection.vue** - 这是用户可见的调试面板，硬编码问题最严重
2. **建立CI检查** - 添加脚本在构建时检查Vue文件中的中文硬编码
3. **代码审查规范** - 要求新代码必须使用i18n，禁止中文硬编码
4. **考虑提取公共key** - 如 "请先选择XX" 这类通用提示可以复用
