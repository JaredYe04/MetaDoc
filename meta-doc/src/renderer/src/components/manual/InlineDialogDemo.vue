<script setup lang="ts">
/**
 * InlineDialogDemo - InlineDialog 使用示例
 *
 * 展示如何在用户手册中内嵌展示各种 Dialog 组件
 */
import { ref } from 'vue'
import InlineDialog from './InlineDialog.vue'
import DialogDemoWrapper from './DialogDemoWrapper.vue'
import ExportOptionsDialog from '../ExportOptionsDialog.vue'
import { FileText, Settings, User, Image, Database, Sparkles, Palette } from 'lucide-vue-next'

// 示例 1: 使用 DialogDemoWrapper（通用包装器）
const example1Open = ref(false)

// 示例 2: ExportOptionsDialog 的 mock 数据
const mockExportAdapter = {
  name: 'Markdown 导出',
  nameKey: 'export.adapter.markdown',
  getDefaultOptions: () => ({
    font: 'Arial',
    fontSize: 12,
    lineHeight: 1.5,
    margins: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
    pageSize: 'A4',
    orientation: 'portrait',
    includeTOC: true,
    includePageNumbers: true
  }),
  getOptionFields: () => [
    { key: 'font', type: 'font', label: '字体', tab: 'basic' },
    { key: 'fontSize', type: 'fontSize', label: '字号', tab: 'basic' },
    { key: 'lineHeight', type: 'number', label: '行高', min: 1, max: 3, step: 0.1, tab: 'basic' },
    {
      key: 'margins',
      type: 'object',
      label: '页边距',
      tab: 'style',
      fields: [
        { key: 'margins.top', type: 'number', label: '上边距(cm)', min: 0, max: 5, step: 0.1 },
        { key: 'margins.bottom', type: 'number', label: '下边距(cm)', min: 0, max: 5, step: 0.1 },
        { key: 'margins.left', type: 'number', label: '左边距(cm)', min: 0, max: 5, step: 0.1 },
        { key: 'margins.right', type: 'number', label: '右边距(cm)', min: 0, max: 5, step: 0.1 }
      ]
    },
    {
      key: 'pageSize',
      type: 'select',
      label: '页面大小',
      options: [
        { value: 'A4', label: 'A4' },
        { value: 'Letter', label: 'Letter' },
        { value: 'Legal', label: 'Legal' }
      ],
      tab: 'style'
    },
    {
      key: 'orientation',
      type: 'select',
      label: '方向',
      options: [
        { value: 'portrait', label: '纵向' },
        { value: 'landscape', label: '横向' }
      ],
      tab: 'style'
    },
    { key: 'includeTOC', type: 'boolean', label: '包含目录', tab: 'advanced' },
    { key: 'includePageNumbers', type: 'boolean', label: '包含页码', tab: 'advanced' }
  ],
  validateOptions: (options: any) => ({ valid: true })
}

// 控制 ExportOptionsDialog 显示
const exportDialogOpen = ref(true)

// 示例 3: 简单内容演示
const simpleDialogOpen = ref(false)
</script>

<template>
  <div class="inline-dialog-demo">
    <h3 class="demo-title">InlineDialog 组件演示</h3>

    <!-- 示例 1: 使用 DialogDemoWrapper 包装任意内容 -->
    <section class="demo-section">
      <h4 class="section-title">
        <Settings class="w-5 h-5" />
        示例 1: 通用 DialogDemoWrapper
      </h4>
      <p class="section-desc">使用 DialogDemoWrapper 包装任意 Dialog 内容，支持完全自定义：</p>

      <DialogDemoWrapper
        title="设置对话框"
        description="这是一个在文档流中渲染的 Dialog 示例"
        :default-open="true"
      >
        <div class="demo-form">
          <div class="form-field">
            <label>用户名</label>
            <input type="text" value="admin" class="demo-input" />
          </div>
          <div class="form-field">
            <label>邮箱</label>
            <input type="email" value="admin@example.com" class="demo-input" />
          </div>
          <div class="form-field">
            <label class="checkbox-label">
              <input type="checkbox" checked />
              启用通知
            </label>
          </div>
        </div>

        <template #footer="{ close }">
          <div class="demo-footer">
            <button class="btn-secondary" @click="close">取消</button>
            <button class="btn-primary" @click="close">保存</button>
          </div>
        </template>
      </DialogDemoWrapper>

      <div class="code-block">
        <pre><code>&lt;DialogDemoWrapper
  title="设置对话框"
  description="在文档流中渲染的 Dialog"
  :default-open="true"
&gt;
  &lt;!-- 自定义内容 --&gt;
  &lt;div class="form-content"&gt;... 表单内容 ...&lt;/div&gt;
  
  &lt;template #footer="{ close }"&gt;
    &lt;button @click="close"&gt;取消&lt;/button&gt;
    &lt;button @click="close"&gt;保存&lt;/button&gt;
  &lt;/template&gt;
&lt;/DialogDemoWrapper&gt;</code></pre>
      </div>
    </section>

    <!-- 示例 2: InlineDialog 组件 -->
    <section class="demo-section">
      <h4 class="section-title">
        <FileText class="w-5 h-5" />
        示例 2: InlineDialog 组件
      </h4>
      <p class="section-desc">InlineDialog 支持传入组件名和 mock 数据，适合动态渲染组件：</p>

      <InlineDialog
        title="导出选项"
        description="Markdown 导出为 DOCX 的设置"
        :default-open="true"
        :mock-data="{
          adapter: mockExportAdapter,
          sourceFormat: 'markdown',
          targetFormat: 'docx'
        }"
      >
        <!-- 使用 slot 传入实际组件 -->
        <ExportOptionsDialog
          v-model="exportDialogOpen"
          :adapter="mockExportAdapter"
          source-format="markdown"
          target-format="docx"
          @confirm="(opts) => console.log('导出选项:', opts)"
        />
      </InlineDialog>

      <div class="code-block">
        <pre><code>&lt;InlineDialog
  title="导出选项"
  description="Markdown 导出设置"
  :default-open="true"
&gt;
  &lt;ExportOptionsDialog
    v-model="dialogOpen"
    :adapter="mockAdapter"
    source-format="markdown"
    target-format="docx"
    @confirm="handleConfirm"
  /&gt;
&lt;/InlineDialog&gt;</code></pre>
      </div>
    </section>

    <!-- 示例 3: 自定义内容 -->
    <section class="demo-section">
      <h4 class="section-title">
        <Sparkles class="w-5 h-5" />
        示例 3: 完全自定义内容
      </h4>
      <p class="section-desc">使用 slot 可以完全自定义 Dialog 内容：</p>

      <DialogDemoWrapper title="AI 助手" :default-open="true">
        <div class="ai-demo-content">
          <div class="ai-avatar">
            <Sparkles class="w-8 h-8" />
          </div>
          <div class="ai-message">
            <p>你好！我是你的 AI 助手，可以帮助你：</p>
            <ul>
              <li>✍️ 润色文章</li>
              <li>📝 生成摘要</li>
              <li>🔍 语法检查</li>
              <li>🌐 翻译内容</li>
            </ul>
            <div class="ai-input-area">
              <input type="text" placeholder="输入你的问题..." class="ai-input" />
              <button class="ai-send-btn">发送</button>
            </div>
          </div>
        </div>
      </DialogDemoWrapper>

      <div class="code-block">
        <pre><code>&lt;DialogDemoWrapper title="AI 助手"&gt;
  &lt;div class="custom-content"&gt;
    &lt;div class="avatar"&gt;... 头像 ...&lt;/div&gt;
    &lt;div class="message"&gt;
      &lt;p&gt;AI 消息内容&lt;/p&gt;
      &lt;input placeholder="输入问题..." /&gt;
    &lt;/div&gt;
  &lt;/div&gt;
&lt;/DialogDemoWrapper&gt;</code></pre>
      </div>
    </section>

    <!-- 特性说明 -->
    <section class="demo-section">
      <h4 class="section-title">
        <Palette class="w-5 h-5" />
        特性说明
      </h4>
      <div class="features-grid">
        <div class="feature-card">
          <h5>🎯 内嵌渲染</h5>
          <p>Dialog 内容直接渲染在文档流中，不会跳出覆盖全屏</p>
        </div>
        <div class="feature-card">
          <h5>🎨 保持样式</h5>
          <p>完全保留 shadcn-vue Dialog 的样式和动画效果</p>
        </div>
        <div class="feature-card">
          <h5>⚡ 支持交互</h5>
          <p>表单输入、按钮点击、选项切换等交互完全正常</p>
        </div>
        <div class="feature-card">
          <h5>🔧 灵活配置</h5>
          <p>支持动态组件加载、mock 数据传递、自定义 slot</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inline-dialog-demo {
  padding: 1.5rem;
  background: hsl(var(--background));
  border-radius: var(--radius);
}

.demo-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1.5rem;
  color: hsl(var(--foreground));
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 0.75rem;
}

.demo-section {
  margin-bottom: 2rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
  color: hsl(var(--foreground));
}

.section-desc {
  margin: 0 0 1rem;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
  line-height: 1.6;
}

/* 表单样式 */
.demo-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-field label {
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.demo-input {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) - 2px);
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}

.demo-input:focus {
  outline: none;
  border-color: hsl(var(--ring));
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.demo-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  background: hsl(var(--muted));
}

.btn-primary {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border: 1px solid transparent;
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-primary:hover {
  opacity: 0.9;
}

/* AI 演示样式 */
.ai-demo-content {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
}

.ai-avatar {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7));
  color: hsl(var(--primary-foreground));
  border-radius: 50%;
  flex-shrink: 0;
}

.ai-message {
  flex: 1;
}

.ai-message p {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: hsl(var(--foreground));
}

.ai-message ul {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: hsl(var(--foreground));
}

.ai-message li {
  margin-bottom: 0.375rem;
}

.ai-input-area {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.ai-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) - 2px);
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}

.ai-send-btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  border: none;
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer;
  transition: opacity 0.15s;
}

.ai-send-btn:hover {
  opacity: 0.9;
}

/* 代码块样式 */
.code-block {
  margin-top: 1rem;
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) - 2px);
  overflow: hidden;
}

.code-block pre {
  margin: 0;
  padding: 1rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow-x: auto;
}

.code-block code {
  font-family:
    ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  color: hsl(var(--foreground));
}

/* 特性网格 */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.feature-card {
  padding: 1rem;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.feature-card h5 {
  margin: 0 0 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.feature-card p {
  margin: 0;
  font-size: 0.8125rem;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
}
</style>
