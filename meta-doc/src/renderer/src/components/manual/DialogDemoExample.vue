<script setup lang="ts">
/**
 * DialogDemoExample - DialogDemoWrapper 使用示例
 *
 * 展示如何在用户手册中展示 Dialog 组件而不跳出文档
 */
import { ref } from 'vue'
import { DialogDemoWrapper } from './index'

// 控制 Dialog 显示状态
const dialogOpen = ref(false)
const customDialogOpen = ref(false)
</script>

<template>
  <div class="dialog-demo-example">
    <h3>DialogDemoWrapper 使用示例</h3>

    <!-- 示例 1: 基础用法 -->
    <div class="example-section">
      <h4>1. 基础用法</h4>
      <DialogDemoWrapper title="示例 Dialog" description="这是一个在文档流中展示的 Dialog">
        <p>Dialog 内容会显示在容器内部，不会跳出到整个页面。</p>
        <div class="demo-content">
          <input type="text" placeholder="输入一些内容..." />
          <button>提交</button>
        </div>
        <template #footer="{ close }">
          <button @click="close">取消</button>
          <button @click="close">确认</button>
        </template>
      </DialogDemoWrapper>
    </div>

    <!-- 示例 2: 自定义触发按钮 -->
    <div class="example-section">
      <h4>2. 自定义触发按钮</h4>
      <DialogDemoWrapper title="自定义触发器" :show-trigger="false" v-model:open="dialogOpen">
        <p>你可以通过 v-model:open 控制 Dialog 的显示状态。</p>
        <template #trigger="{ open }">
          <button class="custom-trigger" @click="open">点击打开自定义 Dialog</button>
        </template>
      </DialogDemoWrapper>
    </div>

    <!-- 示例 3: 完全自定义内容 -->
    <div class="example-section">
      <h4>3. 完全自定义内容</h4>
      <DialogDemoWrapper v-model:open="customDialogOpen">
        <template #header="{ close }">
          <div class="custom-header">
            <h3>完全自定义 Header</h3>
            <button @click="close">✕</button>
          </div>
        </template>

        <div class="custom-body">
          <p>这是完全自定义的内容区域。</p>
          <ul>
            <li>可以包含任意内容</li>
            <li>列表、表单、图表等</li>
            <li>不会跳出文档容器</li>
          </ul>
        </div>

        <template #footer="{ close }">
          <div class="custom-footer">
            <button @click="close">关闭</button>
          </div>
        </template>
      </DialogDemoWrapper>
    </div>
  </div>
</template>

<style scoped>
.dialog-demo-example {
  padding: 1.5rem;
}

.example-section {
  margin-bottom: 2rem;
  padding: 1rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.example-section h4 {
  margin: 0 0 1rem;
  color: hsl(var(--foreground));
}

.demo-content {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.demo-content input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.demo-content button {
  padding: 0.5rem 1rem;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
}

.custom-trigger {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
  color: white;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-weight: 500;
}

.custom-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid hsl(var(--border));
}

.custom-header h3 {
  margin: 0;
}

.custom-header button {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
}

.custom-body {
  padding: 1rem 0;
}

.custom-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid hsl(var(--border));
}

.custom-footer button {
  padding: 0.5rem 1rem;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  cursor: pointer;
}
</style>
