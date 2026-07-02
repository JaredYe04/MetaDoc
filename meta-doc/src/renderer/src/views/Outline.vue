<template>
  <div class="outline-page" :class="{ 'outline-page--demo': isDemo }" :data-direction="direction">
    <!-- AI 工具栏与格式化标题：通过子组件 + inject 使用 selectedAiTool，避免 Outline 因 selectedAiTool 变化而 re-render 导致树图位置重置 -->
    <OutlineAiToolbar v-if="!isDemo && isAiEnabled" />

    <div class="container">
      <div
        ref="generatePreviewRef"
        class="aero-div generate-preview"
        v-if="generating || pendingAccept || pendingBatchAccept"
        :style="{
          backgroundColor: themeState.currentTheme.background2nd,
          top: position.top + 'px',
          left: position.left + 'px'
        }"
        @mousedown.stop="startDrag"
      >
        <el-scrollbar class="generate-preview-scrollbar" :wrap-style="generatePreviewWrapStyle">
          <div class="noselect-display">
            <!-- 单任务：生成中 -->
            <template v-if="generating && !parallelChildren.length">
              <h2>
                {{ $t('outline.generating') }}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="destructive"
                        size="sm"
                        class="aero-btn generate-preview-btn-square"
                        @click.stop="cancelAllAiTasks"
                      >
                        <X class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{{ $t('outline.cancelTasks') }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </h2>
              <div
                class="generate-preview-body"
                :class="{ 'is-node': singleGenerateType === 'children' }"
              >
                <template v-if="singleGenerateType === 'content'">
                  <div class="generate-preview-content generate-preview-content--text">
                    {{ rawstring }}
                  </div>
                </template>
                <template v-else>
                  <div class="generate-preview-json-wrap">
                    <StreamingJsonTree v-if="rawstring" :raw="rawstring" />
                    <div v-else class="generate-preview-content generate-preview-content--text">
                      {{ rawstring }}
                    </div>
                  </div>
                </template>
              </div>
            </template>
            <!-- 批量任务：生成中，多块流式输出 -->
            <template v-else-if="generating && parallelChildren.length">
              <h2>
                {{ $t('outline.generating') }}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="destructive"
                        size="sm"
                        class="aero-btn generate-preview-btn-square"
                        @click.stop="cancelAllAiTasks"
                      >
                        <X class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{{ $t('outline.cancelTasks') }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </h2>
              <div class="batch-panels">
                <div v-for="item in batchDisplayItems" :key="item.nodePath" class="batch-panel">
                  <div class="batch-panel-title">{{ item.nodeTitle }}</div>
                  <div class="generate-preview-body batch-panel-body">
                    <div class="generate-preview-json-wrap">
                      <StreamingJsonTree v-if="item.content" :raw="item.content" />
                      <div v-else class="generate-preview-content generate-preview-content--text">
                        {{ item.content }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <!-- 单任务：待接受/拒绝 -->
            <template v-else-if="pendingAccept">
              <h2>{{ $t('outline.previewResult') }}</h2>
              <div
                class="generate-preview-body"
                :class="{ 'is-node': singleGenerateType === 'children' }"
              >
                <template v-if="singleGenerateType === 'content'">
                  <div class="generate-preview-content generate-preview-content--text">
                    {{ rawstring }}
                  </div>
                </template>
                <template v-else>
                  <div class="generate-preview-json-wrap">
                    <StreamingJsonTree v-if="rawstring" :raw="rawstring" />
                    <div v-else class="generate-preview-content generate-preview-content--text">
                      {{ rawstring }}
                    </div>
                  </div>
                </template>
              </div>
            </template>
            <!-- 批量任务：待接受/拒绝 -->
            <template v-else-if="pendingBatchAccept">
              <h2>{{ $t('outline.previewResult') }}</h2>
              <div class="batch-panels">
                <div
                  v-for="(displayItem, idx) in batchPendingDisplayItems"
                  :key="displayItem.nodePath"
                  class="batch-panel"
                  :class="{ 'batch-panel--rejected': displayItem.rejected }"
                >
                  <div class="batch-panel-head">
                    <span class="batch-panel-title">{{ displayItem.nodeTitle }}</span>
                    <TooltipProvider v-if="!displayItem.rejected">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Button
                            variant="destructive"
                            size="sm"
                            class="aero-btn generate-preview-btn-square"
                            @click.stop="onBatchRejectItem(idx)"
                          >
                            <X class="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>{{ $t('outline.reject') }}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span v-else class="batch-panel-rejected-tag">{{ $t('outline.reject') }}</span>
                  </div>
                  <div class="generate-preview-body batch-panel-body">
                    <div class="generate-preview-json-wrap">
                      <StreamingJsonTree v-if="displayItem.content" :raw="displayItem.content" />
                      <div v-else class="generate-preview-content generate-preview-content--text">
                        {{ displayItem.content }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </el-scrollbar>
        <!-- 单任务：接受/拒绝 -->
        <div v-if="pendingAccept" class="generate-preview-actions">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="success"
                  size="sm"
                  class="aero-btn generate-preview-btn-square h-7 w-7 min-w-7 p-0 [&_svg]:size-3.5"
                  @click.stop="acceptChange"
                >
                  <Check class="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{{ $t('outline.accept') }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="destructive"
                  size="sm"
                  class="aero-btn generate-preview-btn-square"
                  @click.stop="discardChange"
                  :loading="generateChildChapterLoading"
                >
                  <X class="w-4 h-4" v-if="!generateChildChapterLoading" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{{ $t('outline.reject') }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <!-- 批量任务：接受全部 / 拒绝全部 -->
        <div
          v-if="pendingBatchAccept"
          class="generate-preview-actions generate-preview-actions--batch"
        >
          <Button
            variant="success"
            size="sm"
            class="aero-btn h-8 gap-1.5 px-2.5 text-xs"
            @click.stop="batchAcceptAll"
          >
            <Check class="w-3.5 h-3.5" />
            <span>{{ $t('outline.acceptAll') }}</span>
          </Button>
          <Button variant="destructive" size="sm" class="aero-btn" @click.stop="batchRejectAll">
            <X class="w-4 h-4" />
            <span>{{ $t('outline.rejectAll') }}</span>
          </Button>
        </div>
      </div>

      <!-- Viewport: 使用 vue-tree 内置的缩放与拖拽，不再自建 transform -->
      <div
        ref="viewportRef"
        class="outline-viewport"
        @wheel="handleViewportWheel"
        @mousedown.capture="onViewportMouseDownCapture"
        @mouseleave="onViewportMouseLeave"
        @contextmenu.capture="onOutlineDemoBlockContextMenu"
      >
        <vue-tree
          ref="treeRef"
          :key="outlineTreeKey"
          class="outline-tree-inner outline-viewport-tree"
          :dataset="chartDataset"
          :config="treeConfig"
          :direction="direction"
          link-style="straight"
          @node-click="handleNodeClick"
          @drag-node-end="handleNodeDrag"
        >
          <template
            #node="{ node, collapsed }"
            :style="{ backgroundColor: themeState.currentTheme.outlineNode }"
          >
            <!-- 节点被折叠且有子节点时：显示 badge 与区分样式（库折叠时会把 children 移到 _children） -->
            <template v-if="collapsed && hasNodeChildren(node)">
              <div
                class="tree-node tree-node--collapsed-with-children"
                :style="{
                  backgroundColor: themeState.currentTheme.outlineNode,
                  '--outline-primary': themeState.currentTheme.primaryColor
                }"
                :class="dropPreview.targetPath === node.path ? 'drop-' + dropPreview.mode : ''"
                :draggable="!isDemo && node.path !== 'dummy'"
                @dragstart.stop="onNodeDragStart(node)"
                @dragover.prevent="onNodeDragOver($event, node)"
                @dragleave="onNodeDragLeave(node)"
                @drop.stop="onNodeDrop(node, $event)"
                @dragend.stop="onNodeDragEnd"
                @mousedown.stop="onNodeMouseDown"
                @mousemove.stop="isDraggingNode ? $event.stopPropagation() : null"
                @contextmenu.prevent="openNodeContextMenu($event, node)"
              >
                <!-- 子节点数量 badge：背景与字体色与 tree-node 一致 -->
                <span
                  class="children-count-badge"
                  :style="{
                    backgroundColor: themeState.currentTheme.outlineNode,
                    color: themeState.currentTheme.textColor
                  }"
                >
                  {{ nodeChildrenCount(node) }}
                </span>
                <!-- 仅文字区域有标题 tooltip，避免与展开按钮的 tooltip 同时出现 -->
                <TooltipProvider>
                  <Tooltip :disabled="!node.title || !isNodeTextTruncated(node.path)">
                    <TooltipTrigger as-child>
                      <span
                        class="tree-node-text"
                        :ref="(el) => setTextElementRef(el, node.path)"
                        >{{ node.title }}</span
                      >
                    </TooltipTrigger>
                    <TooltipContent side="top" v-if="node.title && isNodeTextTruncated(node.path)">
                      <p>{{ node.title }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <!-- 展开按钮：未选中 AI 工具时显示 -->
                <TooltipProvider v-if="!isDemo && !selectedAiTool">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button
                        type="button"
                        class="tree-node-expand-btn"
                        @click.stop="toggleNodeExpand(node.path)"
                        v-if="node.path !== 'dummy'"
                        :disabled="pendingAccept || generating"
                        aria-label="Expand"
                      >
                        <component
                          :is="direction === 'vertical' ? ChevronDown : ChevronRight"
                          class="w-4 h-4"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{{ $t('outline.expand') }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </template>
            <!-- 展开时用详细面板替代该节点内容，留在原 slot 内随画布移动 -->
            <template v-else-if="expandedNodes[node.path] && node.path !== 'dummy'">
              <div
                class="detailed-node-wrapper"
                :class="{ 'detailed-node-wrapper--top': lastExpandedNodePath === node.path }"
                @mousedown.stop
                @pointerdown.stop
                @click.stop
                @contextmenu.prevent="openNodeContextMenu($event, node)"
              >
                <DetailedOutlineNode
                  :node="node"
                  :outlineTree="treeData"
                  :docPath="activeDocument?.path || ''"
                  :docFormat="(activeDocument?.format ?? 'md') as 'md' | 'tex'"
                  :userPrompt="aiConfig.userPrompt || userPrompt"
                  :temperature="aiConfig.temperature"
                  :wordCount="aiConfig.wordCount"
                  @content-updated="
                    (content: string) => handleNodeContentUpdate(node.path, content)
                  "
                  @cancel="handleNodeContentCancel(node.path)"
                  @collapse="toggleNodeExpand(node.path)"
                  class="detailed-node-inline"
                />
              </div>
            </template>
            <!-- 如果节点未展开，显示正常节点；有子节点时加样式区分 -->
            <template v-else>
              <div
                class="tree-node"
                :class="[
                  dropPreview.targetPath === node.path ? 'drop-' + dropPreview.mode : '',
                  hasNodeChildren(node) ? 'tree-node--has-children-collapsed' : ''
                ]"
                :style="{ backgroundColor: themeState.currentTheme.outlineNode }"
                :draggable="!isDemo && node.path !== 'dummy'"
                @dragstart.stop="onNodeDragStart(node)"
                @dragover.prevent="onNodeDragOver($event, node)"
                @dragleave="onNodeDragLeave(node)"
                @drop.stop="onNodeDrop(node, $event)"
                @dragend.stop="onNodeDragEnd"
                @mousedown.stop="onNodeMouseDown"
                @mousemove.stop="isDraggingNode ? $event.stopPropagation() : null"
                @contextmenu.prevent="openNodeContextMenu($event, node)"
              >
                <!-- 仅文字区域有标题 tooltip，避免与展开按钮的 tooltip 同时出现 -->
                <TooltipProvider>
                  <Tooltip :disabled="!node.title || !isNodeTextTruncated(node.path)">
                    <TooltipTrigger as-child>
                      <span
                        class="tree-node-text"
                        :ref="(el) => setTextElementRef(el, node.path)"
                        >{{ node.title }}</span
                      >
                    </TooltipTrigger>
                    <TooltipContent side="top" v-if="node.title && isNodeTextTruncated(node.path)">
                      <p>{{ node.title }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <!-- 展开按钮：未选中 AI 工具时显示 -->
                <TooltipProvider v-if="!isDemo && !selectedAiTool">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button
                        type="button"
                        class="tree-node-expand-btn"
                        @click.stop="toggleNodeExpand(node.path)"
                        v-if="node.path !== 'dummy'"
                        :disabled="pendingAccept || generating"
                        aria-label="Expand"
                      >
                        <component
                          :is="
                            direction === 'vertical'
                              ? expandedNodes[node.path]
                                ? ChevronUp
                                : ChevronDown
                              : expandedNodes[node.path]
                                ? ChevronDown
                                : ChevronRight
                          "
                          class="w-4 h-4"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>{{ $t('outline.expand') }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <!-- 节点操作按钮：仅在选中 AI 工具时显示，点击打开 AI 配置 -->
              <OutlineNodeActionButton
                v-if="!isDemo && selectedAiTool"
                :node="node"
                :pending-accept="pendingAccept"
                :generating="generating"
              />
            </template>
          </template>
        </vue-tree>
      </div>

      <!-- 节点右键菜单：Teleport 到 body，避免父级 transform 导致 fixed 定位偏移 -->
      <Teleport to="body">
        <transition name="fade">
          <div
            v-if="!isDemo && nodeContextMenuPath && nodeContextMenuPosition"
            class="outline-node-context-menu item-menu-context"
            :style="{ ...nodeContextMenuStyle, ...nodeContextMenuPositionStyle }"
            @click.stop
          >
            <button
              type="button"
              class="outline-node-context-menu__item item-menu__item"
              @click="onNodeContextAction('moveLeft')"
            >
              <ArrowLeft
                class="outline-node-context-menu__icon w-4 h-4"
                v-if="direction === 'vertical'"
              />
              <ArrowUp class="outline-node-context-menu__icon w-4 h-4" v-else />
              <span>{{
                direction === 'vertical' ? $t('outline.moveLeft') : $t('outline.moveUp')
              }}</span>
            </button>
            <button
              type="button"
              class="outline-node-context-menu__item item-menu__item"
              @click="onNodeContextAction('moveRight')"
            >
              <ArrowRight
                class="outline-node-context-menu__icon w-4 h-4"
                v-if="direction === 'vertical'"
              />
              <ArrowDown class="outline-node-context-menu__icon w-4 h-4" v-else />
              <span>{{
                direction === 'vertical' ? $t('outline.moveRight') : $t('outline.moveDown')
              }}</span>
            </button>
            <button
              type="button"
              class="outline-node-context-menu__item item-menu__item"
              @click="onNodeContextAction('addChild')"
            >
              <Plus class="outline-node-context-menu__icon w-4 h-4" />
              <span>{{ $t('outline.addChild') }}</span>
            </button>
            <button
              type="button"
              class="outline-node-context-menu__item item-menu__item"
              @click="onNodeContextAction('edit')"
            >
              <Pencil class="outline-node-context-menu__icon w-4 h-4" />
              <span>{{ $t('outline.editContent') }}</span>
            </button>
            <button
              type="button"
              class="outline-node-context-menu__item item-menu__item"
              @click="onNodeContextAction('moveToBasket')"
            >
              <Folder class="outline-node-context-menu__icon w-4 h-4" />
              <span>{{ $t('outline.materialBasket.moveToBasket') }}</span>
            </button>
            <button
              type="button"
              class="outline-node-context-menu__item item-menu__item danger"
              @click="onNodeContextAction('delete')"
            >
              <Trash2 class="outline-node-context-menu__icon w-4 h-4" />
              <span>{{ $t('outline.delete') }}</span>
            </button>
          </div>
        </transition>
      </Teleport>

      <Dialog v-model:open="formatTitleDialogVisible">
        <DialogContent class="sm:max-w-[30%]">
          <DialogHeader>
            <DialogTitle>{{ $t('outline.formatTitleWizard') }}</DialogTitle>
          </DialogHeader>
          <div class="grid gap-4 py-4">
            <div class="format-title-item">
              <div class="flex items-center justify-between">
                <span>{{ $t('outline.adjustMarkdown') }}</span>
                <Switch v-model:checked="formatTitleConfig.adjustMarkdown" />
              </div>
              <p class="format-title-hint">{{ $t('outline.adjustMarkdownTip') }}</p>
            </div>
            <div v-if="formatTitleConfig.adjustMarkdown" class="flex items-center justify-between">
              <span>{{ $t('outline.firstMarkdownTitleLevel') }}</span>
              <NumberField
                v-model="formatTitleConfig.firstMarkdownTitleLevel"
                :min="1"
                :max="6"
                :step="1"
                class="inline-input"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldContent>
              </NumberField>
            </div>
            <div class="format-title-item">
              <div class="flex items-center justify-between">
                <span>{{ $t('outline.adjustTitle') }}</span>
                <Switch v-model:checked="formatTitleConfig.adjustTitle" />
              </div>
              <p class="format-title-hint">{{ $t('outline.adjustTitleTip') }}</p>
            </div>
            <div v-if="formatTitleConfig.adjustTitle" class="format-title-item">
              <div class="flex items-center justify-between">
                <span>{{ $t('outline.coverOriginalNumber') }}</span>
                <Switch v-model:checked="formatTitleConfig.cover" />
              </div>
              <p class="format-title-hint">{{ $t('outline.coverTip') }}</p>
            </div>
            <div v-if="formatTitleConfig.adjustTitle" class="format-title-item">
              <div class="flex items-center justify-between">
                <span>{{ $t('outline.level1Chinese') }}</span>
                <Switch v-model:checked="formatTitleConfig.level1TitleChinese" />
              </div>
              <p class="format-title-hint">{{ $t('outline.level1ChineseTip') }}</p>
            </div>
          </div>
          <DialogFooter class="flex justify-between">
            <Button variant="outline" @click="formatTitleDialogVisible = false">{{
              $t('outline.cancel')
            }}</Button>
            <div style="display: flex; gap: 10px">
              <Button variant="destructive" @click="handleRemovePrefixes">{{
                $t('outline.removePrefixes')
              }}</Button>
              <Button @click="executeFormatTitle">{{ $t('outline.confirm') }}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- 移除前缀确认对话框 -->
      <AlertDialog v-model:open="removePrefixesDialogVisible">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{ $t('outline.warning') }}</AlertDialogTitle>
            <AlertDialogDescription>
              {{ $t('outline.removePrefixesConfirm') }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="removePrefixesDialogVisible = false">
              {{ $t('outline.cancel') }}
            </AlertDialogCancel>
            <AlertDialogAction
              @click="executeRemovePrefixes"
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {{ $t('outline.confirm') }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <!-- 编辑章节：与素材对话框同布局（标题/关键词/内容 + 可折叠 AI 辅助），支持接受/拒绝 AI 结果 -->
      <Dialog v-model:open="editValueDialogVisible">
        <DialogContent class="edit-chapter-dialog-content">
          <DialogHeader>
            <DialogTitle>{{ $t('outline.editChapterTitle') }}</DialogTitle>
          </DialogHeader>
          <div class="edit-chapter-dialog-body">
            <div class="edit-chapter-form-column">
              <section class="new-material-edit-section">
                <div class="material-field">
                  <label class="material-field-label">{{ $t('outline.chapterName') }}</label>
                  <Input
                    v-model="currentChapterValue"
                    class="aero-input"
                    :placeholder="$t('outline.chapterName')"
                    :disabled="chapterEditGenerating"
                  />
                </div>
                <div class="material-field">
                  <label class="material-field-label">{{
                    $t('outline.materialBasket.keywordsLabel')
                  }}</label>
                  <p class="material-field-hint">{{ $t('outline.materialBasket.keywordsHint') }}</p>
                  <KeywordInput
                    v-model="currentChapterKeywords"
                    :placeholder="$t('outline.materialBasket.keywordsPlaceholder')"
                    class="ai-config-keywords-input"
                    :disabled="chapterEditGenerating"
                  />
                </div>
              </section>
              <section v-if="isAiEnabled" class="new-material-ai-section">
                <button
                  type="button"
                  class="new-material-ai-heading-btn"
                  @click="chapterEditAiExpanded = !chapterEditAiExpanded"
                >
                  <component
                    :is="chapterEditAiExpanded ? ChevronDown : ChevronRight"
                    class="w-4 h-4"
                  />
                  <span>{{ $t('outline.materialBasket.aiAssistHeading') }}</span>
                </button>
                <template v-if="chapterEditAiExpanded">
                  <div class="material-field">
                    <label class="material-field-label">{{
                      $t('outline.materialBasket.prompt')
                    }}</label>
                    <AutoResizeTextarea
                      v-model="chapterEditPrompt"
                      :placeholder="$t('outline.materialBasket.promptPlaceholder')"
                      :autosize="{ minRows: 2 }"
                      class="ai-config-user-prompt"
                      :disabled="chapterEditGenerating"
                    />
                  </div>
                  <div class="material-field">
                    <label class="material-field-label">{{
                      $t('outline.aiConfig.temperature')
                    }}</label>
                    <div class="flex items-center gap-4">
                      <span class="text-sm text-muted-foreground w-8">{{
                        chapterEditTemperature
                      }}</span>
                      <Slider
                        v-model="chapterEditTemperature"
                        :min="0"
                        :max="2"
                        :step="0.1"
                        class="flex-1"
                        :disabled="chapterEditGenerating"
                      />
                    </div>
                  </div>
                  <div class="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="chapterEditGenerating"
                      @click="generateChapterContent"
                    >
                      <Loader2 v-if="chapterEditGenerating" class="w-4 h-4 animate-spin" />
                      <span v-else>{{ $t('outline.materialBasket.aiGenerate') }}</span>
                    </Button>
                    <Button
                      v-if="chapterEditGenerating"
                      variant="outline"
                      size="sm"
                      class="text-destructive hover:text-destructive"
                      @click="stopChapterGenerate"
                    >
                      <StopCircle class="w-4 h-4" />
                      <span>{{ $t('outline.stop') }}</span>
                    </Button>
                  </div>
                </template>
              </section>
            </div>
            <div class="edit-chapter-editor-column">
              <div class="material-field material-field-fill">
                <label class="material-field-label">{{ $t('outline.chapterContent') }}</label>
                <div
                  ref="chapterEditorWrapRef"
                  class="outline-md-editor-wrap edit-chapter-editor-wrap"
                  :class="{ 'is-disabled': chapterEditGenerating }"
                >
                  <md-editor
                    v-model="currentChapterContent"
                    show-code-row-number
                    preview-theme="github"
                    code-style-reverse
                    style="text-align: left"
                    :auto-fold-threshold="300"
                    :theme="editorTheme"
                    :language="currentLocaleForEditor"
                    :readonly="chapterEditGenerating"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <template v-if="pendingChapterAccept">
              <Button variant="destructive" @click="rejectChapterGenerate">{{
                $t('outline.reject')
              }}</Button>
              <Button variant="success" size="sm" @click="acceptChapterGenerate">{{
                $t('outline.accept')
              }}</Button>
            </template>
            <template v-else>
              <Button :disabled="chapterEditGenerating" @click="changeNodeValue">{{
                $t('outline.confirm')
              }}</Button>
            </template>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- AI 配置对话框：标题随所选工具变化，如「生成子章节」「生成内容」 -->
      <Dialog v-if="isAiEnabled" v-model:open="aiConfigDialogVisible">
        <DialogContent class="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{{ aiConfigDialogTitleForDisplay }}</DialogTitle>
          </DialogHeader>
          <div class="ai-config-body">
            <!-- 温度：刻度体现严谨 / 平衡 / 创意，默认 1 为平衡 -->
            <div class="ai-config-section">
              <label class="ai-config-label">{{ $t('outline.aiConfig.temperature') }}</label>
              <div class="flex items-center gap-4">
                <span class="text-sm text-muted-foreground w-8">{{ aiConfig.temperature }}</span>
                <Slider
                  v-model="aiConfig.temperature"
                  :min="0"
                  :max="2"
                  :step="0.1"
                  class="flex-1"
                />
              </div>
            </div>

            <!-- 关键词：KeywordInput + 下方 AI 推荐标签（标签内加号在文字左侧） -->
            <div class="ai-config-section">
              <label class="ai-config-label">{{ $t('outline.aiConfig.keywords') }}</label>
              <KeywordInput
                v-model="aiConfig.keywords"
                :placeholder="$t('outline.aiConfig.keywordsPlaceholder')"
                class="ai-config-keywords-input"
              />
              <div class="ai-config-recommended">
                <span class="ai-config-recommended-title"
                  >{{ $t('outline.aiConfig.recommendedKeywords') }}：</span
                >
                <template v-if="recommendedKeywordsLoading">
                  <Loader2 class="w-4 h-4 animate-spin" />
                  <span class="ai-config-recommended-text">{{
                    $t('outline.aiConfig.generatingKeywords')
                  }}</span>
                </template>
                <template v-else-if="recommendedKeywords.length">
                  <div class="ai-config-recommended-tags">
                    <span
                      v-for="k in recommendedKeywords"
                      :key="k"
                      class="ai-config-recommended-tag"
                      @click="addRecommendedKeyword(k)"
                    >
                      {{ k }}
                    </span>
                  </div>
                </template>
              </div>
            </div>

            <!-- 用户提示词 -->
            <div class="ai-config-section">
              <label class="ai-config-label">{{ $t('outline.aiConfig.userPrompt') }}</label>
              <AutoResizeTextarea
                v-model="aiConfig.userPrompt"
                :placeholder="$t('outline.aiConfig.userPromptPlaceholder')"
                :autosize="{ minRows: 4 }"
                :preset-options="presetPrompts"
                class="ai-config-user-prompt"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="aiConfigDialogVisible = false">{{
              $t('outline.cancel')
            }}</Button>
            <Button @click="handleAiConfigConfirm">{{ $t('outline.confirm') }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- 新建/编辑素材对话框：先编辑（标题/关键词/内容），AI 为辅助 -->
      <Dialog v-model:open="newMaterialDialogVisible">
        <DialogContent class="new-material-dialog-content">
          <DialogHeader>
            <DialogTitle>{{
              editingMaterialItem
                ? $t('outline.materialBasket.editMaterialTitle')
                : $t('outline.materialBasket.newMaterialTitle')
            }}</DialogTitle>
          </DialogHeader>
          <div class="new-material-dialog-body">
            <div class="new-material-form-column">
              <section class="new-material-edit-section">
                <div class="material-field">
                  <label class="material-field-label">{{
                    $t('outline.materialBasket.titleLabel')
                  }}</label>
                  <Input
                    v-model="newMaterialName"
                    class="aero-input"
                    :placeholder="$t('outline.materialBasket.titlePlaceholder')"
                    :disabled="newMaterialGenerating"
                  />
                </div>
                <div class="material-field">
                  <label class="material-field-label">{{
                    $t('outline.materialBasket.keywordsLabel')
                  }}</label>
                  <p class="material-field-hint">{{ $t('outline.materialBasket.keywordsHint') }}</p>
                  <KeywordInput
                    v-model="newMaterialKeywords"
                    :placeholder="$t('outline.materialBasket.keywordsPlaceholder')"
                    class="ai-config-keywords-input"
                    :disabled="newMaterialGenerating"
                  />
                </div>
              </section>
              <section v-if="isAiEnabled" class="new-material-ai-section">
                <button
                  type="button"
                  class="new-material-ai-heading-btn"
                  @click="newMaterialAiSectionExpanded = !newMaterialAiSectionExpanded"
                >
                  <component
                    :is="newMaterialAiSectionExpanded ? ChevronDown : ChevronRight"
                    class="w-4 h-4"
                  />
                  <span>{{ $t('outline.materialBasket.aiAssistHeading') }}</span>
                </button>
                <template v-if="newMaterialAiSectionExpanded">
                  <div class="material-field">
                    <label class="material-field-label">{{
                      $t('outline.materialBasket.prompt')
                    }}</label>
                    <AutoResizeTextarea
                      v-model="newMaterialPrompt"
                      :placeholder="$t('outline.materialBasket.promptPlaceholder')"
                      :autosize="{ minRows: 2 }"
                      class="ai-config-user-prompt"
                      :disabled="newMaterialGenerating"
                    />
                  </div>
                  <div class="material-field">
                    <label class="material-field-label">{{
                      $t('outline.aiConfig.temperature')
                    }}</label>
                    <div class="flex items-center gap-4">
                      <span class="text-sm text-muted-foreground w-8">{{
                        newMaterialTemperature
                      }}</span>
                      <Slider
                        v-model="newMaterialTemperature"
                        :min="0"
                        :max="2"
                        :step="0.1"
                        class="flex-1"
                        :disabled="newMaterialGenerating"
                      />
                    </div>
                  </div>
                  <div class="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="newMaterialGenerating"
                      @click="generateNewMaterialThreeSteps"
                    >
                      <Loader2 v-if="newMaterialGenerating" class="w-4 h-4 animate-spin" />
                      <span v-else>{{ $t('outline.materialBasket.aiGenerate') }}</span>
                    </Button>
                    <Button
                      v-if="newMaterialGenerating"
                      variant="outline"
                      size="sm"
                      class="text-destructive hover:text-destructive"
                      @click="stopMaterialGenerate"
                    >
                      <StopCircle class="w-4 h-4" />
                      <span>{{ $t('outline.stop') }}</span>
                    </Button>
                  </div>
                </template>
              </section>
            </div>
            <div class="new-material-editor-column">
              <div class="material-field material-field-fill">
                <label class="material-field-label">{{
                  $t('outline.materialBasket.content')
                }}</label>
                <div
                  ref="newMaterialEditorWrapRef"
                  class="new-material-editor-wrap"
                  :class="{ 'is-disabled': newMaterialGenerating }"
                >
                  <md-editor
                    v-model="newMaterialContent"
                    show-code-row-number
                    preview-theme="github"
                    code-style-reverse
                    class="new-material-md-editor"
                    style="text-align: left"
                    :auto-fold-threshold="300"
                    :theme="editorTheme"
                    :language="currentLocaleForEditor"
                    :readonly="newMaterialGenerating"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <template v-if="pendingMaterialAccept">
              <Button variant="destructive" @click="rejectMaterialGenerate">{{
                $t('outline.reject')
              }}</Button>
              <Button variant="success" size="sm" @click="acceptMaterialGenerate">{{
                $t('outline.accept')
              }}</Button>
            </template>
            <template v-else>
              <Button
                variant="outline"
                :disabled="newMaterialGenerating"
                @click="newMaterialDialogVisible = false"
                >{{ $t('outline.materialBasket.cancel') }}</Button
              >
              <Button :disabled="newMaterialGenerating" @click="saveNewMaterial">{{
                $t('outline.materialBasket.save')
              }}</Button>
            </template>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog v-model:open="mergeTargetDialogVisible">
        <DialogContent class="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{{ $t('outline.materialBasket.selectTargetNode') }}</DialogTitle>
          </DialogHeader>
          <div class="merge-target-list">
            <button
              v-for="n in mergeTargetNodeList"
              :key="n.path"
              type="button"
              class="merge-target-item"
              :class="{ active: selectedMergeTargetNode?.path === n.path }"
              @click="selectedMergeTargetNode = n"
            >
              <span class="merge-target-item-title">{{ n.title || n.path }}</span>
            </button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              @click="(mergeTargetDialogVisible = false, pendingMergeTarget = null)"
              >{{ $t('outline.materialBasket.cancel') }}</Button
            >
            <Button :disabled="!selectedMergeTargetNode" @click="confirmMergeTarget">{{
              $t('outline.confirm')
            }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- 素材篮：右上角浮动面板，不超出 .container 范围 -->
      <MaterialBasketPanel
        v-if="effectiveTabId && !isDemo"
        ref="materialBasketPanelRef"
        :basket="materialBasketList"
        :expanded="materialBasketExpanded"
        :is-dragging-from-outline="isDraggingNode && !!draggingNodePath"
        @update:expanded="materialBasketExpanded = $event"
        @drop-from-outline="moveDraggingNodeToBasket"
        @merge-to-tree="(item, mode) => openMergeTargetDialog(item, mode)"
        @copy-item="copyBasketItem"
        @delete-item="deleteBasketItem"
        @update-basket="commitMaterialBasket"
        @drag-start-basket="draggingBasketId = $event"
        @drag-end-basket="draggingBasketId = null"
        @request-add-item="openNewMaterialDialog"
        @edit-item="openEditMaterialDialog"
      />

      <div v-if="!isDemo" class="bottom-menu">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="outline" size="icon" @click="toggleLayout">
                <ArrowUpDown class="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>
                {{
                  direction === 'horizontal'
                    ? $t('outline.switchToVertical')
                    : $t('outline.switchToHorizontal')
                }}
              </p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="secondary" size="icon" @click="outlineZoomOut">
                <Minus class="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{{ $t('outline.zoomOut') }}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="default" size="icon" @click="outlineZoomIn">
                <Plus class="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{{ $t('outline.zoomIn') }}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="outline" size="icon" @click="outlineFitToScreen">
                <RefreshCw class="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{{ $t('outline.reset') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  watch,
  computed,
  onMounted,
  onUnmounted,
  nextTick,
  provide,
  type Ref,
  type ComponentPublicInstance
} from 'vue'
import { messageBox } from '@renderer/utils/messageBox'
import { notifyError, notifyInfo } from '@renderer/utils/notify'

// Demo mode support
const props = defineProps<{
  mode?: string
  /** 工作区分屏：固定为该 Tab 的大纲与文档上下文 */
  tabId?: string
}>()
const isDemo = computed(() => props.mode === 'demo')
const isAiEnabled = computed(() => settings.llmEnabled === true)

import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  NumberField,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
  NumberFieldContent
} from '@renderer/components/ui/number-field'
import AutoResizeTextarea from '../components/base/AutoResizeTextarea.vue'
import { tabs, useWorkspace, type DocumentView } from '../stores/workspace'
import { useDocumentViewContext } from '../view-api'
import eventBus, { getWindowType } from '../utils/event-bus.js'
import '../assets/aero-div.css'
import '../assets/aero-btn.css'
import '../assets/aero-input.css'
import { MdEditor, type Themes } from 'md-editor-v3'
import {
  Plus,
  Pencil,
  Trash2,
  Minus,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  Maximize,
  FolderOpen,
  Folder,
  StopCircle
} from 'lucide-vue-next'
import type { DocumentOutlineNode, MaterialBasketItem } from '../../../types'
import { TREE_NODE_SCHEMA, DEFAULT_OUTLINE_TREE } from '../constants/document'
import { searchNode, searchParentNode, syncChildrenFromNodeText } from '../utils/outline-helpers'
import {
  adjustTitleIndex,
  adjustTitleLevel,
  removeTextFromOutline,
  generateMarkdownFromOutlineTree
} from '../utils/md-utils.js'
import { removeTitleIndex } from '../utils/regex-utils.js'
import {
  expandTreeNodePrompt,
  generateContentPrompt,
  generateParentNodeContentPrompt,
  outlineChangePrompt
} from '../utils/prompts'

import { themeState } from '../utils/themes.js'
import { extractOuterJsonString } from '../utils/regex-utils.js'
import { getOutlineAdapter } from '../utils/outline-adapters'
import {
  generateChildNodes as generateChildNodesUtil,
  generateNodeContent as generateNodeContentUtil,
  generateChildrenChildren as generateChildrenChildrenUtil,
  generateChildrenContent as generateChildrenContentUtil,
  cleanNodeTitleMarkers,
  cleanRawContent
} from '../utils/outline-ai-utils'
import DetailedOutlineNode from '../components/outline/DetailedOutlineNode.vue'
import OutlineAiToolbar from '../components/outline/OutlineAiToolbar.vue'
import OutlineNodeActionButton from '../components/outline/OutlineNodeActionButton.vue'
import MaterialBasketPanel from '../components/outline/MaterialBasketPanel.vue'
import StreamingJsonTree from '../components/outline/StreamingJsonTree.vue'
import KeywordInput from '../components/KeywordInput.vue'
import '../assets/noselect-display.css'
import { generateWithSchema } from '../utils/ai-schema-task'
import { OUTLINE_SECTION_KEYWORDS_SCHEMA, DOCUMENT_TITLE_SCHEMA } from '../utils/schemas'
import {
  generateOutlineSectionKeywordsPrompt,
  getNewMaterialTitlePrompt,
  getNewMaterialKeywordsPrompt
} from '../utils/prompts'
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask, clearAiTasks } from '../utils/ai_tasks.ts'
import { getSetting, setSetting, settings } from '../utils/settings.js'
import { createRendererLogger } from '../utils/logger.ts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog-shadcn'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@renderer/components/ui/tooltip'
import { Switch } from '@renderer/components/ui/switch'
import { Slider } from '@renderer/components/ui/slider'

/** 批量生成时单个任务的结果项，用于接受/拒绝 */
interface BatchAcceptItem {
  nodePath: string
  nodeTitle: string
  /** 流式原始内容：可为 Ref 或已 unwrap 的 string */
  rawContentRef: { value: string } | string
  backupChildren?: DocumentOutlineNode[]
  backupText?: string
  rejected?: boolean
}
/** 批量生成待确认状态 */
interface BatchAcceptState {
  type: 'children' | 'content'
  rootPath: string
  items: BatchAcceptItem[]
}

const { t, locale } = useI18n()
const currentLocaleForEditor = computed(() =>
  String(locale?.value ?? 'zh_CN').startsWith('zh') ? 'zh-CN' : 'en-US'
)
const logger = createRendererLogger('Outline', {
  windowTypeProvider: () => getWindowType()
})
const workspace = useWorkspace()
const viewCtx = useDocumentViewContext(() => props.tabId)
const {
  activateTab,
  removeTab,
  updateDocumentMeta,
  withAutoOutlineSyncSuppressed
} = workspace

const effectiveTabId = viewCtx.effectiveTabId

const cloneOutline = (outline?: DocumentOutlineNode): DocumentOutlineNode =>
  JSON.parse(JSON.stringify(outline ?? DEFAULT_OUTLINE_TREE))

/** 用户手册内嵌 Demo：无活动文档时给树图一份可见示例数据 */
const OUTLINE_MANUAL_DEMO_TREE: DocumentOutlineNode = {
  path: 'dummy',
  title: '',
  text: '',
  title_level: 0,
  children: [
    {
      path: '1',
      title: '第一章 概述',
      text: '',
      title_level: 1,
      children: [
        {
          path: '1.1',
          title: '1.1 背景介绍',
          text: '',
          title_level: 2,
          children: []
        },
        {
          path: '1.2',
          title: '1.2 结构安排',
          text: '',
          title_level: 2,
          children: []
        }
      ]
    },
    {
      path: '2',
      title: '第二章 主体',
      text: '',
      title_level: 1,
      children: [
        {
          path: '2.1',
          title: '2.1 详细说明',
          text: '',
          title_level: 2,
          children: []
        }
      ]
    },
    {
      path: '3',
      title: '第三章 小结与展望',
      text: '',
      title_level: 1,
      children: [
        {
          path: '3.1',
          title: '3.1 结论',
          text: '',
          title_level: 2,
          children: []
        }
      ]
    }
  ]
}

const activeDocument = viewCtx.activeDocument

const treeData = ref<DocumentOutlineNode>(cloneOutline(activeDocument.value?.outline))
// 传给 vue-tree 的 dataset：交互期间不更新引用，避免库内 deep watch 触发 updateDataset 导致视口还原
const chartDataset = ref<DocumentOutlineNode>(treeData.value)
const editorTheme = computed<Themes | undefined>(
  () => themeState.currentTheme.vditorTheme as Themes | undefined
)
const selectedNode = ref<DocumentOutlineNode | null>(null)
const nodeContextMenuPath = ref<string | null>(null)
const nodeContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const nodeContextMenuStyle = computed<Record<string, string>>(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))
const nodeContextMenuPositionStyle = computed(() => {
  if (!nodeContextMenuPosition.value) return {} as Record<string, string>
  return {
    position: 'fixed',
    left: nodeContextMenuPosition.value.x + 'px',
    top: nodeContextMenuPosition.value.y + 'px'
  } as Record<string, string>
})
const generated = ref(false)
const generating = ref(false)
const rawstring = ref('')
const generatedText = ref('')

// 素材篮
const materialBasketExpanded = ref(false)
/** 大纲节点拖拽是否在 drop 中改变了结构，待 onNodeDragEnd 中 commit 后解锁 Steam 成就 */
const outlineDragAchUnlockPending = ref(false)
const draggingBasketId = ref<string | null>(null)
const materialBasketPanelRef = ref<InstanceType<typeof MaterialBasketPanel> | null>(null)
const MIME_MATERIAL_BASKET = 'application/x-metadoc-material-basket'

const materialBasketList = computed(() => {
  const meta = activeDocument.value?.meta
  const list = meta?.materialBasket
  return Array.isArray(list) ? list : []
})

function outlineNodeToBasketItem(node: DocumentOutlineNode): MaterialBasketItem {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `mb-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const children = node.children?.length
    ? node.children.map((c) => outlineNodeToBasketItem(c))
    : undefined
  return {
    id,
    title: node.title,
    text: node.text ?? '',
    title_level: node.title_level,
    children,
    createdAt: Date.now()
  }
}

function basketItemToOutlineNode(item: MaterialBasketItem): DocumentOutlineNode {
  const children = item.children?.length ? item.children.map((c) => basketItemToOutlineNode(c)) : []
  return {
    path: '', // 插入时由 reindexChildrenPaths 分配
    title: item.title,
    text: item.text ?? '',
    title_level: item.title_level ?? 1,
    children
  }
}

function commitMaterialBasket(items: MaterialBasketItem[]) {
  const tabId = effectiveTabId.value
  if (!tabId) return
  const prevLen = materialBasketList.value.length
  updateDocumentMeta(tabId, (meta) => {
    meta.materialBasket = JSON.parse(JSON.stringify(items))
  })
  if (items.length > prevLen) {
    void import('../services/steam-client').then((m) =>
      m.tryUnlockSteamAchievementByApi('ACH_MATERIAL_BASKET_ADD')
    )
  }
}

function moveSelectedNodeToBasket() {
  const node = selectedNode.value
  if (!node) return
  const tree = treeData.value
  const originParent = searchParentNode(node.path, tree)
  if (!originParent) return
  const fullNode = searchNode(node.path, tree)
  if (!fullNode) return
  const item = outlineNodeToBasketItem(fullNode)
  const nextBasket = [...materialBasketList.value, item]
  commitMaterialBasket(nextBasket)
  runWithTreeTransformPreserved(() => {
    removeNode(originParent, fullNode)
    reindexChildrenPaths(originParent)
    treeData.value = cloneOutline(tree)
    chartDataset.value = treeData.value
    commitOutline()
  })
  materialBasketExpanded.value = true
  notifyInfo(t('outline.materialBasket.moveToBasket') + ' ' + t('common.success'))
}

function moveDraggingNodeToBasket() {
  const fromPath = draggingNodePath.value
  if (!fromPath) return
  const tree = treeData.value
  const originParent = searchParentNode(fromPath, tree)
  if (!originParent) return
  const fullNode = searchNode(fromPath, tree)
  if (!fullNode) return
  const item = outlineNodeToBasketItem(fullNode)
  const nextBasket = [...materialBasketList.value, item]
  commitMaterialBasket(nextBasket)
  runWithTreeTransformPreserved(() => {
    removeNode(originParent, fullNode)
    reindexChildrenPaths(originParent)
    treeData.value = cloneOutline(tree)
    chartDataset.value = treeData.value
    commitOutline()
  })
  draggingNodePath.value = null
  isDraggingNode.value = false
  document.body.classList.remove('outline-dragging')
  if (suppressDocumentSync) {
    suppressDocumentSync = false
  }
  materialBasketExpanded.value = true
}

const pendingMergeTarget = ref<{
  item: MaterialBasketItem
  mode: 'child' | 'after' | 'before'
} | null>(null)
const mergeTargetDialogVisible = ref(false)
const mergeTargetNodeList = computed(() => {
  const root = treeData.value
  if (!root) return []
  const out: DocumentOutlineNode[] = []
  collectAllNodes(root, out)
  return out
})
const selectedMergeTargetNode = ref<DocumentOutlineNode | null>(null)
function openMergeTargetDialog(item: MaterialBasketItem, mode: 'child' | 'after' | 'before') {
  pendingMergeTarget.value = { item, mode }
  selectedMergeTargetNode.value = selectedNode.value
  mergeTargetDialogVisible.value = true
}
function confirmMergeTarget() {
  const pending = pendingMergeTarget.value
  const target = selectedMergeTargetNode.value
  if (!pending || !target) return
  mergeBasketItemToTree(pending.item, pending.mode, target)
  pendingMergeTarget.value = null
  selectedMergeTargetNode.value = null
  mergeTargetDialogVisible.value = false
}
function mergeBasketItemToTree(
  item: MaterialBasketItem,
  mode: 'child' | 'after' | 'before',
  targetNode?: DocumentOutlineNode | null
) {
  const target = targetNode ?? selectedNode.value
  if (!target) {
    notifyInfo(t('outline.materialBasket.selectTargetFirst'))
    return
  }
  const tree = treeData.value
  const targetInTree = searchNode(target.path, tree)
  const targetParent = searchParentNode(target.path, tree)
  if (!targetInTree || !targetParent) return
  const newNode = basketItemToOutlineNode(item)
  runWithTreeTransformPreserved(() => {
    if (mode === 'child') {
      targetInTree.children = targetInTree.children || []
      targetInTree.children.push(newNode)
      reindexChildrenPaths(targetInTree)
    } else {
      const idx = targetParent.children.findIndex((c) => c.path === target.path)
      if (idx === -1) return
      const insertIdx = mode === 'before' ? idx : idx + 1
      targetParent.children.splice(insertIdx, 0, newNode)
      reindexChildrenPaths(targetParent)
    }
    reindexChildrenPaths(tree)
    treeData.value = cloneOutline(tree)
    chartDataset.value = treeData.value
    commitOutline()
  })
  const nextBasket = materialBasketList.value.filter((i) => i.id !== item.id)
  commitMaterialBasket(nextBasket)
  notifyInfo(t('outline.materialBasket.mergeToOutline') + ' ' + t('common.success'))
}

function copyBasketItem(item: MaterialBasketItem) {
  const copy: MaterialBasketItem = {
    ...JSON.parse(JSON.stringify(item)),
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `mb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now()
  }
  commitMaterialBasket([...materialBasketList.value, copy])
}

function deleteBasketItem(item: MaterialBasketItem) {
  messageBox.confirm(t('outline.materialBasket.deleteConfirm'), t('outline.warning'), {
    confirmButtonText: t('outline.confirm'),
    cancelButtonText: t('outline.cancel'),
    type: 'warning'
  })
    .then(() => {
      const next = materialBasketList.value.filter((i) => i.id !== item.id)
      commitMaterialBasket(next)
    })
    .catch(() => {})
}

let suppressDocumentSync = false
let commitOutlineTimer: NodeJS.Timeout | null = null

const commitOutline = async (outline?: DocumentOutlineNode) => {
  const tabId = effectiveTabId.value
  if (!tabId) return
  const snapshot = cloneOutline(outline ?? treeData.value)
  outlineCommittedFromOutlineView = true

  // 使用 withAutoOutlineSyncSuppressed 防止死循环：
  // 从大纲生成文本 -> 自动提取大纲 -> 触发 watch -> 再次生成文本
  await withAutoOutlineSyncSuppressed(async () => {
    suppressDocumentSync = true
    try {
      viewCtx.updateOutline(snapshot)
      // 只有在当前视图确实是outline时才更新lastView，避免切换Tab时自动跳转到outline
      const currentView = viewCtx.lastView.value
      if (currentView === 'outline') {
        viewCtx.updateLastView('outline')
      }
      // 使用适配器按不同格式同步正文文本
      const doc = activeDocument.value
      const format = doc?.format ?? 'md'
      const adapter = getOutlineAdapter(format as any)
      if (format === 'tex') {
        const nextTex = await adapter.toText(snapshot, doc?.tex ?? '')
        viewCtx.updateTex(nextTex)
      } else {
        const nextMd = await adapter.toText(snapshot, doc?.markdown ?? '')
        viewCtx.updateMarkdown(nextMd)
      }
    } finally {
      suppressDocumentSync = false
    }
  })
}

const formatTitleDialogVisible = ref(false)
const removePrefixesDialogVisible = ref(false)
const formatTitle = () => {
  formatTitleDialogVisible.value = true
}
const formatTitleConfig = reactive({
  adjustMarkdown: true,
  firstMarkdownTitleLevel: 1,
  adjustTitle: true, //是否调整标题编号
  cover: true,
  level1TitleChinese: true //第一级标题使用中文，如一 二三四五六七八九十
})

const backupOutlineTree = ref<DocumentOutlineNode | null>(null)
const generateContentLoading = ref(false)
const generateChildrenContentLoading = ref(false)
const generateChildrenChildrenLoading = ref(false)
const parallelChildren = ref<Array<Ref<string> | string>>([]) // 用于存储并行生成的子节点
const batchItemsRef = ref<BatchAcceptItem[]>([]) // 批量任务项（含 backup、rawContentRef），用于接受/拒绝
const userPrompt = ref('') // 用户输入的提示词

function getBatchItemContent(refOrVal: { value: string } | string): string {
  return typeof refOrVal === 'object' && refOrVal && 'value' in refOrVal
    ? refOrVal.value
    : String(refOrVal ?? '')
}
const batchDisplayItems = computed(() =>
  batchItemsRef.value.map((item) => ({ ...item, content: getBatchItemContent(item.rawContentRef) }))
)
const batchPendingDisplayItems = computed(
  () =>
    pendingBatchAccept.value?.items.map((item) => ({
      ...item,
      content: getBatchItemContent(item.rawContentRef)
    })) ?? []
)

function collectLeaves(node: DocumentOutlineNode, out: DocumentOutlineNode[]): void {
  if (!node) return
  if (!node.children?.length) {
    if (node.path !== 'dummy') out.push(node)
    return
  }
  for (const c of node.children) collectLeaves(c, out)
}

function collectAllNodes(node: DocumentOutlineNode, out: DocumentOutlineNode[]): void {
  if (!node || node.path === 'dummy') {
    if (node?.children) for (const c of node.children) collectAllNodes(c, out)
    return
  }
  out.push(node)
  if (node.children) for (const c of node.children) collectAllNodes(c, out)
}

const direction = ref<'horizontal' | 'vertical'>('horizontal')
const treeConfig = ref({
  nodeWidth: 250,
  nodeHeight: 160,
  levelHeight: 200,
  siblingSpacing: 500
})

// 监听主题变化：同步连接线颜色与 CSS 自定义属性
watch(
  () => themeState.currentTheme,
  (theme) => {
    // 使用 CSS 自定义属性传递主题数据，避免触发 Vue 重新渲染
    const outlinePage = document.querySelector('.outline-page') as HTMLElement | null
    if (outlinePage) {
      const isDark = theme.type === 'dark'
      outlinePage.style.setProperty('--outline-link-color', isDark ? '#e0e0e0' : '#9ca3af')
      outlinePage.style.setProperty('--outline-node-bg', theme.outlineNode)
      outlinePage.style.setProperty('--outline-primary', theme.primaryColor)
      outlinePage.style.setProperty('--outline-text-color', theme.textColor)
      outlinePage.style.setProperty(
        '--outline-filter',
        isDark ? 'brightness(1.15)' : 'brightness(0.92)'
      )
    }
    scheduleForceOutlineLinkStyles()
  },
  { deep: true, immediate: true }
)

// 树数据变化后库会重绘连接线（D3 会再次设 opacity 0→1），需重新强制为不透明
watch(treeData, () => scheduleForceOutlineLinkStyles(), { deep: true })

// 由本视图 commit 引起的 outline 更新不要回写到 treeData，避免 vue-tree 收到新引用后重置视口（ pan/zoom 回到初始）
let outlineCommittedFromOutlineView = false
// 在 viewport 内按下鼠标时立即加锁（捕获阶段早于节点），避免随后触发的 outline watch 覆盖 treeData 导致视口跳回
// 使用普通变量：在 mousedown 时置 true 不会触发组件重渲染，从而 vue-tree 不重渲染、视口不被 patch 清空（无需 patch node_modules）
let viewportInteractionLock = false
const VIEWPORT_LOCK_CLEAR_DELAY_MS = 180

// 文档大纲与编辑器/AI 同步：当文档内容变化（编辑或 AI 生成）导致 outline 更新时，刷新树以保持一致。
// 仅当新 outline 与当前 treeData 结构/内容不一致时才赋值，避免相同数据新引用导致 vue-tree 收到新 dataset 触发重绘并重置视口
function outlineStructuralEqual(
  a: DocumentOutlineNode | undefined,
  b: DocumentOutlineNode | undefined
): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  if (a.path !== b.path || a.title !== b.title) return false
  const ac = a.children?.length ?? 0
  const bc = b.children?.length ?? 0
  if (ac !== bc) return false
  for (let i = 0; i < ac; i++) {
    if (!outlineStructuralEqual(a.children![i], b.children![i])) return false
  }
  return true
}
watch(
  () => activeDocument.value?.outline,
  (newOutline) => {
    if (isDemo.value) return
    if (outlineCommittedFromOutlineView) {
      outlineCommittedFromOutlineView = false
      return
    }
    // 拖动中、本视图正在抑制同步、或用户正在与 viewport 交互时，不要用 store 覆盖 treeData
    if (suppressDocumentSync || isDraggingNode.value || viewportInteractionLock) return
    if (newOutline) {
      if (outlineStructuralEqual(newOutline, treeData.value)) return
      treeData.value = cloneOutline(newOutline)
      chartDataset.value = treeData.value
    }
  },
  { deep: true }
)

// 加载保存的方向设置
onMounted(async () => {
  const savedDirection = await getSetting('outline.direction')
  direction.value = (savedDirection ?? 'horizontal') as 'horizontal' | 'vertical'
  updateTreeConfig(direction.value)

  // 加载 AI 配置默认值
  const savedAiConfig = await getSetting('outline.aiConfig')
  if (savedAiConfig != null) {
    Object.assign(aiConfig, savedAiConfig)
  }
  // 初始化 CSS 自定义属性（watch 中已设置，此处为保险）
  const outlinePage = document.querySelector('.outline-page') as HTMLElement | null
  if (outlinePage) {
    outlinePage.style.setProperty('--outline-cursor', 'inherit')
  }
  // 树绘制后强制连接线不透明，覆盖 D3 的 opacity 动画
  scheduleForceOutlineLinkStyles()

  if (isDemo.value) {
    const demo = cloneOutline(OUTLINE_MANUAL_DEMO_TREE)
    treeData.value = demo
    chartDataset.value = demo
    outlineTreeKey.value++
    await nextTick()
    scheduleForceOutlineLinkStyles()
    setTimeout(() => {
      outlineFitToScreen()
      applyOutlineDemoInitialZoom()
      scheduleForceOutlineLinkStyles()
    }, 150)
  }
})

const updateTreeConfig = (dir: 'horizontal' | 'vertical') => {
  if (dir === 'vertical') {
    // nodeWidth 控制 D3 节点中心间距（即 slot 宽度）
    // siblingSpacing 不被库使用，间距完全由 nodeWidth 控制
    treeConfig.value = {
      nodeWidth: 250, // 控制节点水平间距（中心到中心）
      nodeHeight: 160,
      levelHeight: 200,
      siblingSpacing: 500 // 不被库使用，仅作参考
    }
  } else {
    treeConfig.value = {
      nodeWidth: 200, // 140 visual + 60 spacing
      nodeHeight: 50,
      levelHeight: 180,
      siblingSpacing: 60
    }
  }
}

const toggleLayout = async () => {
  direction.value = direction.value === 'horizontal' ? 'vertical' : 'horizontal'
  updateTreeConfig(direction.value)
  await setSetting('outline.direction', direction.value)
}

// 使用 vue-tree 内置缩放与拖拽，不再自建 transform
const outlineZoomIn = () => {
  const tree = treeRef.value
  if (tree && typeof tree.zoomIn === 'function') tree.zoomIn()
}
const outlineZoomOut = () => {
  const tree = treeRef.value
  if (tree && typeof tree.zoomOut === 'function') tree.zoomOut()
}
const outlineFitToScreen = () => {
  const tree = treeRef.value
  if (tree && typeof tree.restoreScale === 'function') tree.restoreScale()
}

/** 手册内嵌 demo：在 restoreScale(1) 后将树图缩放到 50%（@ssthouse/vue3-tree-chart 的 TreeChartCore#setScale） */
function applyOutlineDemoInitialZoom() {
  const tree = treeRef.value as
    | { treeChartCore?: { setScale?: (n: number) => void }; zoomOut?: () => void }
    | null
    | undefined
  if (!tree) return
  const core = tree.treeChartCore
  if (core && typeof core.setScale === 'function') {
    core.setScale(0.5)
    return
  }
  // 无 treeChartCore 时回退：zoomOut 每步约 /1.2，4 次约 48%
  if (typeof tree.zoomOut === 'function') {
    for (let i = 0; i < 4; i++) tree.zoomOut()
  }
}

// Ctrl/Cmd + 滚轮缩放（调用 vue-tree 内置缩放）
const handleViewportWheel = (e: WheelEvent) => {
  const isZoomModifier = e.ctrlKey || e.metaKey
  if (!isZoomModifier) return

  e.preventDefault()

  if (e.deltaY < 0) {
    outlineZoomIn()
  } else if (e.deltaY > 0) {
    outlineZoomOut()
  }
}

let handleZoomShortcut: ((payload?: unknown) => void) | null = null

// 节点展开状态管理
const expandedNodes = ref<Record<string, boolean>>({})
const lastExpandedNodePath = ref<string | null>(null)
const outlineTreeKey = ref(0)

const toggleNodeExpand = (path: string) => {
  // 关闭其他已展开的节点（单开模式）
  if (expandedNodes.value[path]) {
    // 如果当前已展开，则关闭
    expandedNodes.value[path] = false
    lastExpandedNodePath.value = null
  } else {
    // 先关闭所有其他节点
    Object.keys(expandedNodes.value).forEach((key) => {
      expandedNodes.value[key] = false
    })
    // 再展开当前节点
    expandedNodes.value[path] = true
    lastExpandedNodePath.value = path
  }
  // 不刷新整棵树，保持用户当前的平移与缩放
}

const handleNodeContentUpdate = (path: string, content: string) => {
  const node = searchNode(path, treeData.value)
  if (node) {
    node.text = content
    commitOutline()
  }
}

const handleNodeContentCancel = (path: string) => {
  expandedNodes.value[path] = false
  if (lastExpandedNodePath.value === path) {
    lastExpandedNodePath.value = null
  }
}

// 展开所有节点
const expandAllNodes = () => {
  const traverseAndExpand = (node: DocumentOutlineNode) => {
    if (node.children && node.children.length > 0) {
      expandedNodes.value[node.path] = true
      for (const child of node.children) {
        traverseAndExpand(child)
      }
    }
  }
  if (treeData.value) {
    traverseAndExpand(treeData.value)
  }
}

// 折叠所有节点
const collapseAllNodes = () => {
  expandedNodes.value = {}
  lastExpandedNodePath.value = null
}

// AI 配置对话框相关
const aiConfigDialogVisible = ref(false)
const aiConfig = reactive({
  temperature: 1.0,
  keywords: [] as string[],
  userPrompt: '',
  wordCount: 800
})
const recommendedKeywords = ref<string[]>([])
const recommendedKeywordsLoading = ref(false)
const editingNodePath = ref<string | null>(null)
const selectedAiTool = ref<
  | null
  | 'generateChildren'
  | 'generateContent'
  | 'generateChildrenChildren'
  | 'generateChildrenContent'
>(null)
const wordCountInput = ref('')
const selectedPresetPrompt = ref('')

watch(isAiEnabled, (enabled) => {
  if (enabled) return
  selectedAiTool.value = null
  aiConfigDialogVisible.value = false
})

// 切换 AI 工具：已选中则取消，否则选中；选中时折叠已展开的编辑节点面板
async function toggleAiTool(
  tool:
    | 'generateChildren'
    | 'generateContent'
    | 'generateChildrenChildren'
    | 'generateChildrenContent'
) {
  if (!isAiEnabled.value) {
    selectedAiTool.value = null
    return
  }
  const { ensureEditorAiCapability } = await import('../ai-runtime/ensure-for-entry')
  await ensureEditorAiCapability()
  const wasSelected = selectedAiTool.value === tool
  selectedAiTool.value = wasSelected ? null : tool
  if (!wasSelected && selectedAiTool.value) {
    // 折叠已展开的编辑节点面板
    editingNodePath.value = null
  }
}

// 处理节点按钮点击：打开配置对话框并登记“确定”后要执行的 AI 动作
const handleNodeButtonClick = (node: DocumentOutlineNode) => {
  if (!isAiEnabled.value) return
  selectedNode.value = node
  if (selectedAiTool.value) {
    aiConfig.temperature = 1.0
    aiConfig.keywords = []
    wordCountInput.value = ''
    aiConfig.userPrompt = userPrompt.value || ''
    selectedPresetPrompt.value = ''
    const tool = selectedAiTool.value
    pendingAiAction.value = () => {
      if (tool === 'generateChildren') generateChildChapter()
      else if (tool === 'generateContent') generateContent()
      else if (tool === 'generateChildrenChildren') generateChildrenChildren()
      else if (tool === 'generateChildrenContent') generateChildrenContent()
    }
    aiConfigDialogVisible.value = true
    nextTick(() => {
      setTimeout(() => onAiConfigDialogOpened(), 150)
    })
  }
}

// 不再在 watch 里触发关键词生成，避免与 handleNodeButtonClick 的 setTimeout(150) 重复调用，
// 导致两个任务共写同一 keywordsTaskOutputRef、流式输出混在一起、JSON 解析失败并可能触发 Vite 重载

const pendingAiAction = ref<(() => void) | null>(null)

const temperatureMarks = computed(() => ({
  0: t('outline.aiConfig.precise'),
  1: t('outline.aiConfig.balanced'),
  2: t('outline.aiConfig.creative')
}))

const aiConfigDialogTitleForDisplay = computed(() => {
  const tool = selectedAiTool.value
  if (!tool) return t('outline.aiConfig.title')
  return t(`outline.aiConfig.titleFor.${tool}`) || t('outline.aiConfig.title')
})

const presetPrompts = computed(() => [
  { label: t('outline.aiConfig.presets.expand'), value: t('outline.aiConfig.presets.expandValue') },
  {
    label: t('outline.aiConfig.presets.abridge'),
    value: t('outline.aiConfig.presets.abridgeValue')
  },
  { label: t('outline.aiConfig.presets.polish'), value: t('outline.aiConfig.presets.polishValue') },
  {
    label: t('outline.aiConfig.presets.combineStructure'),
    value: t('outline.aiConfig.presets.combineStructureValue')
  },
  {
    label: t('outline.aiConfig.presets.detailed'),
    value: t('outline.aiConfig.presets.detailedValue')
  },
  {
    label: t('outline.aiConfig.presets.concise'),
    value: t('outline.aiConfig.presets.conciseValue')
  },
  {
    label: t('outline.aiConfig.presets.academic'),
    value: t('outline.aiConfig.presets.academicValue')
  }
])

const addRecommendedKeyword = (keyword: string) => {
  if (!aiConfig.keywords.includes(keyword)) {
    aiConfig.keywords.push(keyword)
  }
}

const getKeywordsPromptString = () => aiConfig.keywords.join('，')

const handleAiConfigConfirm = async () => {
  aiConfigDialogVisible.value = false
  // 同步到当前会话使用的 userPrompt，供后续生成函数读取
  userPrompt.value = aiConfig.userPrompt || ''
  // 保存配置到本地存储
  await setSetting('outline.aiConfig', {
    temperature: aiConfig.temperature,
    keywords: aiConfig.keywords,
    userPrompt: aiConfig.userPrompt
  })
  // 执行待执行的 AI 操作（在打开对话框时由 handleNodeButtonClick 登记）
  const run = pendingAiAction.value
  pendingAiAction.value = null
  if (run) run()
  // 执行后自动取消当前 AI 工具选中状态，避免与“未选中”时的节点操作混淆
  const currentTool = selectedAiTool.value
  if (currentTool) {
    toggleAiTool(currentTool)
  }
}

// 新建素材对话框
const newMaterialDialogVisible = ref(false)
const newMaterialName = ref('')
const newMaterialPrompt = ref('')
const newMaterialTemperature = ref(1.0)
const newMaterialKeywords = ref<string[]>([])
const newMaterialContent = ref('')
const newMaterialGenerating = ref(false)
const newMaterialKeywordsLoading = ref(false)
let newMaterialKeywordsTimer: NodeJS.Timeout | null = null
const newMaterialAiSectionExpanded = ref(false)
const pendingMaterialAccept = ref(false)
const backupMaterialContentBeforeGenerate = ref('')
const newMaterialEditorWrapRef = ref<HTMLElement | null>(null)
const materialGenerateAbortControllerRef = ref<AbortController | null>(null)

const editingMaterialItem = ref<MaterialBasketItem | null>(null)

function scrollMaterialEditorToBottom() {
  nextTick(() => {
    const el = newMaterialEditorWrapRef.value?.querySelector?.('.cm-scroller') as HTMLElement | null
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

watch(newMaterialContent, () => {
  if (newMaterialGenerating.value) scrollMaterialEditorToBottom()
})

function openNewMaterialDialog() {
  editingMaterialItem.value = null
  newMaterialName.value = ''
  newMaterialPrompt.value = ''
  newMaterialTemperature.value = 1.0
  newMaterialKeywords.value = []
  newMaterialContent.value = ''
  newMaterialDialogVisible.value = true
  materialBasketExpanded.value = true
  newMaterialAiSectionExpanded.value = false
  pendingMaterialAccept.value = false
  scheduleGenerateNewMaterialKeywords()
}

function openEditMaterialDialog(item: MaterialBasketItem) {
  editingMaterialItem.value = item
  newMaterialName.value = item.title || ''
  newMaterialPrompt.value = item.prompt || ''
  newMaterialTemperature.value = item.temperature ?? 1.0
  newMaterialKeywords.value = item.keywords ? [...item.keywords] : []
  newMaterialContent.value = item.text || ''
  newMaterialDialogVisible.value = true
  materialBasketExpanded.value = true
  newMaterialAiSectionExpanded.value = false
  pendingMaterialAccept.value = false
}

function scheduleGenerateNewMaterialKeywords() {
  if (newMaterialKeywordsTimer) clearTimeout(newMaterialKeywordsTimer)
  newMaterialKeywordsTimer = setTimeout(() => {
    generateNewMaterialKeywords()
  }, 450)
}

async function generateNewMaterialKeywords() {
  if (newMaterialKeywordsLoading.value) return
  if (newMaterialKeywords.value && newMaterialKeywords.value.length > 0) return

  const title = (newMaterialName.value || '').trim()
  const prompt = (newMaterialPrompt.value || '').trim()
  if (!title && !prompt) return

  newMaterialKeywordsLoading.value = true
  try {
    const outlineMarkdown = generateMarkdownFromOutlineTree(treeData.value) || ''
    const promptText = getNewMaterialKeywordsPrompt(
      title || t('outline.materialBasket.newMaterialTitle'),
      prompt,
      outlineMarkdown
    )
    const result = await generateWithSchema(
      OUTLINE_SECTION_KEYWORDS_SCHEMA,
      promptText,
      keywordsTaskOutputRef,
      { taskName: 'material_basket_keywords' }
    )
    if (result?.keywords && Array.isArray(result.keywords)) {
      newMaterialKeywords.value = result.keywords.slice(0, 5)
    }
  } catch (e) {
    logger.warn('素材篮生成推荐标签失败', e)
  } finally {
    newMaterialKeywordsLoading.value = false
  }
}

// 三步生成：标题 → 标签 → 内容（内容为流式输出）
async function generateNewMaterialThreeSteps() {
  const prompt = newMaterialPrompt.value?.trim()
  if (!prompt) {
    notifyInfo(t('outline.materialBasket.promptPlaceholder'))
    return
  }
  newMaterialGenerating.value = true
  const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
  const outlineMarkdown = generateMarkdownFromOutlineTree(treeData.value) || ''
  try {
    if (!(newMaterialName.value || '').trim()) {
      const titleResult = await generateWithSchema(
        DOCUMENT_TITLE_SCHEMA,
        getNewMaterialTitlePrompt(prompt),
        keywordsTaskOutputRef,
        { taskName: 'material_basket_title' }
      )
      if (titleResult?.title) newMaterialName.value = String(titleResult.title).trim()
    }
    await generateNewMaterialKeywords()
    const title = newMaterialName.value || t('outline.materialBasket.newMaterialTitle')
    const kwStr = newMaterialKeywords.value.length ? newMaterialKeywords.value.join('，') : ''
    const existingContent = (newMaterialContent.value || '').trim()
    backupMaterialContentBeforeGenerate.value = existingContent
    const fullDocMarkdown = outlineMarkdown || t('outline.emptyContent')
    const materialContext = `标题：${title}；关键词：${kwStr || t('outline.noContent')}；已有内容：${existingContent || t('outline.noContent')}`
    const enhancedUserPrompt = `${prompt}${kwStr ? `\n关键词：${kwStr}` : ''}\n\n【重要】请严格遵守用户在提示词中提出的格式、风格、长度、禁止事项等一切规约。\n\n【当前整篇文章内容（供参考）】\n${fullDocMarkdown}\n\n【当前素材信息】${materialContext}`
    newMaterialContent.value = ''
    const fakeNode: DocumentOutlineNode = {
      path: '0',
      title,
      text: '',
      title_level: 1,
      children: []
    }
    materialGenerateAbortControllerRef.value = new AbortController()
    try {
      const content = await generateNodeContentUtil(
        fakeNode,
        treeData.value,
        enhancedUserPrompt,
        materialGenerateAbortControllerRef.value.signal,
        docFormat,
        newMaterialContent,
        undefined,
        newMaterialTemperature.value
      )
      if (content) newMaterialContent.value = content
      pendingMaterialAccept.value = true
    } catch (contentErr) {
      const aborted = materialGenerateAbortControllerRef.value?.signal.aborted
      if (aborted) {
        pendingMaterialAccept.value = true
      } else {
        logger.warn('素材篮 AI 生成失败', contentErr)
        notifyError(t('outline.generateContentFail', { error: String(contentErr) }))
      }
    } finally {
      newMaterialGenerating.value = false
      materialGenerateAbortControllerRef.value = null
    }
  } catch (e) {
    logger.warn('素材篮 AI 生成失败', e)
    notifyError(t('outline.generateContentFail', { error: String(e) }))
  } finally {
    newMaterialGenerating.value = false
    materialGenerateAbortControllerRef.value = null
  }
}

function stopMaterialGenerate() {
  materialGenerateAbortControllerRef.value?.abort()
}

function acceptMaterialGenerate() {
  pendingMaterialAccept.value = false
  backupMaterialContentBeforeGenerate.value = ''
}

function rejectMaterialGenerate() {
  newMaterialContent.value = backupMaterialContentBeforeGenerate.value
  pendingMaterialAccept.value = false
  backupMaterialContentBeforeGenerate.value = ''
}

function saveNewMaterial() {
  const title = newMaterialName.value?.trim() || t('outline.materialBasket.newMaterialTitle')
  const editing = editingMaterialItem.value
  if (editing) {
    const updated: MaterialBasketItem = {
      ...editing,
      title,
      text: newMaterialContent.value,
      prompt: newMaterialPrompt.value || undefined,
      temperature: newMaterialTemperature.value,
      keywords: newMaterialKeywords.value.length ? [...newMaterialKeywords.value] : undefined
    }
    commitMaterialBasket(materialBasketList.value.map((i) => (i.id === editing.id ? updated : i)))
    editingMaterialItem.value = null
  } else {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `mb-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const item: MaterialBasketItem = {
      id,
      title,
      text: newMaterialContent.value,
      prompt: newMaterialPrompt.value || undefined,
      temperature: newMaterialTemperature.value,
      keywords: newMaterialKeywords.value.length ? [...newMaterialKeywords.value] : undefined,
      createdAt: Date.now()
    }
    commitMaterialBasket([...materialBasketList.value, item])
  }
  newMaterialDialogVisible.value = false
  notifyInfo(t('outline.materialBasket.save') + ' ' + t('common.success'))
}

const keywordsTaskOutputRef = ref('')
const onAiConfigDialogOpened = async () => {
  if (!selectedNode.value) return
  if (recommendedKeywordsLoading.value) return
  recommendedKeywordsLoading.value = true
  try {
    const result = await generateWithSchema(
      OUTLINE_SECTION_KEYWORDS_SCHEMA,
      generateOutlineSectionKeywordsPrompt(
        selectedNode.value.title,
        generateMarkdownFromOutlineTree(treeData.value) || ''
      ),
      keywordsTaskOutputRef,
      { taskName: 'outline_keywords' }
    )
    if (result?.keywords && Array.isArray(result.keywords)) {
      recommendedKeywords.value = result.keywords.slice(0, 5)
    }
  } catch (e) {
    logger.warn('生成推荐关键词失败', e)
  } finally {
    recommendedKeywordsLoading.value = false
  }
}

// 打开节点右键菜单（视口不还原依赖 vue3-tree-chart 补丁：模板不绑定 initialTransformStyle）
const openNodeContextMenu = (e: MouseEvent, node: DocumentOutlineNode) => {
  e.preventDefault()
  selectedNode.value = node
  nodeContextMenuPath.value = node.path
  nodeContextMenuPosition.value = { x: e.clientX, y: e.clientY }
}

// 关闭节点右键菜单（关闭时短暂保持 viewport 锁，避免点击关闭触发的 outline 同步导致视口跳回）
const closeNodeContextMenu = () => {
  if (nodeContextMenuPath.value != null) {
    viewportInteractionLock = true
    setTimeout(() => {
      viewportInteractionLock = false
      if (chartDataset.value !== treeData.value) chartDataset.value = treeData.value
    }, VIEWPORT_LOCK_CLEAR_DELAY_MS)
  }
  nodeContextMenuPath.value = null
  nodeContextMenuPosition.value = null
}

// 节点右键菜单操作
const onNodeContextAction = (action: string) => {
  closeNodeContextMenu()
  switch (action) {
    case 'moveLeft':
      move2Left()
      break
    case 'moveRight':
      move2Right()
      break
    case 'addChild':
      addChildNode()
      break
    case 'edit':
      editNode()
      break
    case 'moveToBasket':
      moveSelectedNodeToBasket()
      break
    case 'delete':
      deleteNode()
      break
  }
}

// 点击其他地方关闭右键菜单
onMounted(() => {
  document.addEventListener('click', closeNodeContextMenu)
  handleZoomShortcut = (payload?: unknown) => {
    const p = payload as { action?: 'zoomIn' | 'zoomOut' | 'zoomReset' } | undefined
    if (!p?.action) return
    if (p.action === 'zoomIn') outlineZoomIn()
    else if (p.action === 'zoomOut') outlineZoomOut()
    else if (p.action === 'zoomReset') outlineFitToScreen()
  }
  eventBus.on('zoom-shortcut', handleZoomShortcut as (payload?: unknown) => void)
})
onUnmounted(() => {
  document.removeEventListener('click', closeNodeContextMenu)
  if (handleZoomShortcut) {
    eventBus.off('zoom-shortcut', handleZoomShortcut as (payload?: unknown) => void)
    handleZoomShortcut = null
  }
})

// 节点相关操作
const move2Left = () => {
  const node = selectedNode.value
  if (!node) return
  const result = moveNodeLeft(node, treeData.value)
  if (result) {
    runWithTreeTransformPreserved(() => {
      treeData.value = result!.tree
      chartDataset.value = treeData.value
      selectedNode.value = result!.movedNode
      commitOutline()
    })
  }
}

const move2Right = () => {
  const node = selectedNode.value
  if (!node) return
  const result = moveNodeRight(node, treeData.value)
  if (result) {
    runWithTreeTransformPreserved(() => {
      treeData.value = result!.tree
      chartDataset.value = treeData.value
      selectedNode.value = result!.movedNode
      commitOutline()
    })
  }
}

const addChildNode = () => {
  const node = selectedNode.value
  if (!node) return
  const result = addChild(node, treeData.value)
  if (result) {
    runWithTreeTransformPreserved(() => {
      treeData.value = result!.tree
      chartDataset.value = treeData.value
      selectedNode.value = result!.newNode
      editNodeValue.value = result!.newNode.title
      currentChapterValue.value = result!.newNode.title
      currentChapterContent.value = result!.newNode.text || ''
      currentChapterKeywords.value =
        result!.newNode.extras?.keywords && Array.isArray(result!.newNode.extras.keywords)
          ? [...result!.newNode.extras.keywords]
          : []
      chapterEditPrompt.value = ''
      chapterEditTemperature.value = 1.0
      chapterEditAiExpanded.value = false
      pendingChapterAccept.value = false
      editValueDialogVisible.value = true
      commitOutline()
    })
  }
}

const editNode = () => {
  const node = selectedNode.value
  if (!node) return
  editNodeValue.value = node.title
  currentChapterValue.value = node.title
  currentChapterContent.value = node.text || ''
  currentChapterKeywords.value =
    node.extras?.keywords && Array.isArray(node.extras.keywords) ? [...node.extras.keywords] : []
  chapterEditPrompt.value = ''
  chapterEditTemperature.value = 1.0
  chapterEditAiExpanded.value = false
  pendingChapterAccept.value = false
  editValueDialogVisible.value = true
}

const deleteNode = () => {
  const node = selectedNode.value
  if (!node) return
  messageBox.confirm(t('outline.deleteConfirm'), t('outline.warning'), {
    confirmButtonText: t('outline.confirm'),
    cancelButtonText: t('outline.cancel'),
    type: 'warning'
  })
    .then(() => {
      const result = removeNodeAndReindex(node, treeData.value)
      if (result) {
        runWithTreeTransformPreserved(() => {
          treeData.value = result!
          chartDataset.value = treeData.value
          selectedNode.value = null
          commitOutline()
        })
      }
      closeNodeContextMenu()
      notifyInfo(t('outline.deleteSuccess'))
    })
    .catch(() => {})
}

const generateChildChapterLoading = ref(false)
const pendingAccept = ref(false)
const pendingBatchAccept = ref<BatchAcceptState | null>(null)
const backupChildren = ref<DocumentOutlineNode[] | null>(null)
const backupContent = ref<string>('')
const singleGenerateType = ref<'content' | 'children'>('children') // 单任务生成类型：内容或子节点

const generateChildChapter = async () => {
  viewCtx.lockUI()
  generateChildChapterLoading.value = true
  generating.value = true
  rawstring.value = ''
  try {
    const node = selectedNode.value
    if (!node) throw new Error(t('outline.noNodeSelected'))
    const currentNode = searchNode(node.path, treeData.value)
    if (!currentNode) throw new Error(t('outline.nodeNotExist'))

    const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
    rawstring.value = '' // 清空之前的内容

    // 构建增强的用户提示词
    let enhancedPrompt = aiConfig.userPrompt || userPrompt.value || ''
    const kwStr = getKeywordsPromptString()
    if (kwStr) enhancedPrompt += `\n关键词：${kwStr}`

    try {
      const newChildren = await generateChildNodesUtil(
        currentNode,
        treeData.value,
        enhancedPrompt,
        undefined, // signal
        docFormat,
        rawstring, // 传入rawstring ref，用于实时显示原始内容
        undefined, // onUpdate
        true, // enableFallback
        aiConfig.temperature !== undefined ? aiConfig.temperature : undefined // 传递温度参数
      )

      // rawstring.value 已经通过ref实时更新了，这里只在最终显示格式化后的JSON
      if (!rawstring.value) {
        rawstring.value = JSON.stringify(newChildren, null, 2)
      }
      backupChildren.value = currentNode.children ? [...currentNode.children] : []
      currentNode.children = [...currentNode.children, ...newChildren]
      pendingAccept.value = true
    } catch (err) {
      logger.warn('任务失败或取消：', err)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error('大纲 JSON 解析失败', e)
    notifyError(t('outline.generateChildRetryFail', { error: message }))
  } finally {
    generateChildChapterLoading.value = false
    generating.value = false
    viewCtx.unlockUI()
  }
}

const removeNode = (parent: DocumentOutlineNode, node: DocumentOutlineNode) => {
  if (!parent.children) return
  const index = parent.children.indexOf(node)
  if (index !== -1) {
    parent.children.splice(index, 1)
  } else {
    parent.children.forEach((child) => {
      removeNode(child, node)
    })
  }
}

// cleanRawContent 函数已迁移到 outline-ai-utils.ts，使用导入的版本
function reindexChildrenPaths(parent: DocumentOutlineNode) {
  if (!parent.children) return
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i]
    const base = parent.path ? parent.path + '.' : ''
    child.path = base + (i + 1)
    child.title_level = parent.title_level + 1
    if (child.children && child.children.length > 0) {
      reindexChildrenPaths(child)
    }
  }
}

/**
 * 移除大纲树中所有节点的标题前缀
 */
function removeAllTitlePrefixes(outlineTree: DocumentOutlineNode): DocumentOutlineNode {
  const node = cloneOutline(outlineTree)

  function dfs(n: DocumentOutlineNode): void {
    if (n.title) {
      n.title = removeTitleIndex(n.title)
    }

    for (const child of n.children) {
      dfs(child)
    }
  }

  if (node.path === 'dummy') {
    for (const child of node.children) {
      dfs(child)
    }
  } else {
    dfs(node)
  }

  return node
}

const acceptChange = () => {
  backupChildren.value = null
  backupContent.value = ''
  rawstring.value = ''
  pendingAccept.value = false
  commitOutline()
}

const discardChange = () => {
  if (backupChildren.value && selectedNode.value) {
    const currentNode = searchNode(selectedNode.value.path, treeData.value)
    if (currentNode) {
      currentNode.children = backupChildren.value
    }
  }
  backupChildren.value = null
  rawstring.value = ''
  pendingAccept.value = false
  generateChildChapterLoading.value = false
}

// 批量接受/拒绝相关
const batchAcceptAll = () => {
  if (!pendingBatchAccept.value) return
  pendingBatchAccept.value = null
  batchItemsRef.value = []
  parallelChildren.value = []
  commitOutline()
}

const batchRejectAll = () => {
  if (!pendingBatchAccept.value) return
  const { rootPath, type, items } = pendingBatchAccept.value
  const rootNode = searchNode(rootPath, treeData.value)
  if (rootNode) {
    if (type === 'children') {
      items.forEach((item) => {
        if (item.backupChildren) {
          const node = searchNode(item.nodePath, treeData.value)
          if (node) {
            node.children = [...item.backupChildren]
            const parent = searchParentNode(item.nodePath, treeData.value)
            if (parent) reindexChildrenPaths(parent)
          }
        }
      })
    } else if (type === 'content') {
      items.forEach((item) => {
        if (item.backupText !== undefined) {
          const node = searchNode(item.nodePath, treeData.value)
          if (node) {
            node.text = item.backupText
            syncChildrenFromNodeText(node)
          }
        }
      })
    }
  }
  pendingBatchAccept.value = null
  batchItemsRef.value = []
  parallelChildren.value = []
  commitOutline()
}

const batchRejectItem = (item: BatchAcceptItem) => {
  if (!pendingBatchAccept.value) return
  const { type } = pendingBatchAccept.value
  const node = searchNode(item.nodePath, treeData.value)
  if (!node) return
  if (type === 'children' && item.backupChildren) {
    node.children = [...item.backupChildren]
    const parent = searchParentNode(item.nodePath, treeData.value)
    if (parent) reindexChildrenPaths(parent)
  }
  if (type === 'content' && item.backupText !== undefined) {
    node.text = item.backupText
    syncChildrenFromNodeText(node)
  }
  item.rejected = true
}

const onBatchRejectItem = (idx: number) => {
  const state = pendingBatchAccept.value
  if (!state) return
  const item = state.items[idx]
  if (item) batchRejectItem(item)
}

const cancelAllAiTasks = () => {
  clearAiTasks()
  generating.value = false
  generateContentLoading.value = false
  generateChildChapterLoading.value = false
  generateChildrenContentLoading.value = false
  generateChildrenChildrenLoading.value = false
  rawstring.value = ''
  pendingAccept.value = false
  pendingBatchAccept.value = null
}

// 其他辅助函数占位符（实际应从原文件保留完整实现）
const moveNodeLeft = (
  node: DocumentOutlineNode,
  tree: DocumentOutlineNode
): { tree: DocumentOutlineNode; movedNode: DocumentOutlineNode } | null => {
  const parent = searchParentNode(node.path, tree)
  if (!parent) return null

  const index = parent.children.findIndex((c) => c.path === node.path)
  if (index <= 0) return null

  // 克隆树进行修改
  const clonedTree = cloneOutline(tree)
  const clonedParent = searchParentNode(node.path, clonedTree)
  if (!clonedParent) return null

  const clonedNode = clonedParent.children[index]
  // 移除节点
  clonedParent.children.splice(index, 1)
  // 在目标位置前插入
  clonedParent.children.splice(index - 1, 0, clonedNode)
  // 重新索引
  reindexChildrenPaths(clonedParent)

  // 找到移动后的节点
  const movedNode = searchNode(clonedNode.path, clonedTree)
  if (!movedNode) return null

  return { tree: clonedTree, movedNode }
}
const moveNodeRight = (
  node: DocumentOutlineNode,
  tree: DocumentOutlineNode
): { tree: DocumentOutlineNode; movedNode: DocumentOutlineNode } | null => {
  const parent = searchParentNode(node.path, tree)
  if (!parent) return null

  const index = parent.children.findIndex((c) => c.path === node.path)
  if (index < 0 || index >= parent.children.length - 1) return null

  // 克隆树进行修改
  const clonedTree = cloneOutline(tree)
  const clonedParent = searchParentNode(node.path, clonedTree)
  if (!clonedParent) return null

  const clonedNode = clonedParent.children[index]
  // 移除节点
  clonedParent.children.splice(index, 1)
  // 在目标位置后插入
  clonedParent.children.splice(index + 1, 0, clonedNode)
  // 重新索引
  reindexChildrenPaths(clonedParent)

  // 找到移动后的节点
  const movedNode = searchNode(clonedNode.path, clonedTree)
  if (!movedNode) return null

  return { tree: clonedTree, movedNode }
}
const addChild = (
  node: DocumentOutlineNode,
  tree: DocumentOutlineNode
): { tree: DocumentOutlineNode; newNode: DocumentOutlineNode } | null => {
  // 克隆树进行修改
  const clonedTree = cloneOutline(tree)
  const clonedNode = searchNode(node.path, clonedTree)
  if (!clonedNode) return null

  if (!clonedNode.children) {
    clonedNode.children = []
  }

  const newNode: DocumentOutlineNode = {
    title: t('outline.newNode'),
    text: '',
    title_level: clonedNode.title_level + 1,
    path: clonedNode.path + '.' + (clonedNode.children.length + 1),
    children: []
  }

  clonedNode.children.push(newNode)

  return { tree: clonedTree, newNode }
}
const removeNodeAndReindex = (
  node: DocumentOutlineNode,
  tree: DocumentOutlineNode
): DocumentOutlineNode | null => {
  const parent = searchParentNode(node.path, tree)
  if (!parent) return null

  // 克隆树进行修改
  const clonedTree = cloneOutline(tree)
  const clonedParent = searchParentNode(node.path, clonedTree)
  if (!clonedParent) return null

  // 查找并移除节点
  const index = clonedParent.children.findIndex((c) => c.path === node.path)
  if (index === -1) return null

  clonedParent.children.splice(index, 1)
  reindexChildrenPaths(clonedParent)

  return clonedTree
}
const handleNodeClick = (node: DocumentOutlineNode) => {
  runWithTreeTransformPreserved(() => {
    selectedNode.value = node
    editNode()
  })
}
const handleNodeDrag = (_dragNode: any, _targetNode: any) => {
  // 尝试将拖拽节点移动为目标节点的最后一个子节点
  try {
    if (!_dragNode || !_targetNode) return
    const drag = searchNode(_dragNode.path, treeData.value)
    if (!drag) return
    const originParent = searchParentNode(_dragNode.path, treeData.value)
    // 如果拖动的是根节点，则不允许
    if (!originParent) return

    // 暂停同步，防止频繁重新渲染
    const wasSuppressed = suppressDocumentSync
    suppressDocumentSync = true

    // 从原父节点移除
    removeNode(originParent, drag)
    // 确定目标插入位置（目标节点作为父）
    const target = searchNode(_targetNode.path, treeData.value)
    const targetParent = searchParentNode(_targetNode.path, treeData.value)
    if (target) {
      target.children = target.children || []
      target.children.push(drag)
      // 重新计算路径
      reindexChildrenPaths(target)
    } else if (targetParent) {
      // 退化为与目标同级追加
      targetParent.children = targetParent.children || []
      targetParent.children.push(drag)
      reindexChildrenPaths(targetParent)
    }

    // 恢复同步并提交更改
    suppressDocumentSync = wasSuppressed
    if (!wasSuppressed) {
      commitOutline()
    }
  } catch (err) {
    logger.warn('节点拖拽失败', err)
    // 即使出错也要恢复同步状态
    if (!suppressDocumentSync) {
      suppressDocumentSync = false
    }
  }
}
const draggingNodePath = ref<string | null>(null)
const isDraggingNode = ref(false)

// 树数据变更时仅执行 fn，不恢复视口（已通过修补 vue3-tree-chart：模板不再绑定 :style="initialTransformStyle"，仅在 init/direction 时写入 DOM，重渲染不会覆盖）
function runWithTreeTransformPreserved(fn: () => void) {
  fn()
}

// 让 vue-tree 内部的 pan 拖拽在鼠标释出视口或 document 时结束（库只监听 container 的 mouseup，移出后松开会一直处于拖动态）
function releaseTreePan() {
  const container = treeRef.value?.$refs?.container as HTMLElement | undefined
  if (container) {
    container.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
    )
  }
}

// 捕获阶段：仅设普通变量锁，不更新 ref，避免触发重渲染导致 vue-tree 重渲染并丢失视口 transform
// mouseup 后延迟解除并同步 chartDataset（仅当引用变化时赋值，减少不必要重渲染）
function onViewportMouseDownCapture() {
  viewportInteractionLock = true
  document.addEventListener(
    'mouseup',
    () => {
      releaseTreePan()
      setTimeout(() => {
        viewportInteractionLock = false
        if (chartDataset.value !== treeData.value) chartDataset.value = treeData.value
      }, VIEWPORT_LOCK_CLEAR_DELAY_MS)
    },
    { once: true }
  )
}

function onViewportMouseLeave() {
  releaseTreePan()
}

/** 手册内嵌 Demo：禁用右键菜单，避免 Teleport 菜单挂到 body 盖住整页 */
function onOutlineDemoBlockContextMenu(e: MouseEvent) {
  if (!isDemo.value) return
  e.preventDefault()
  e.stopPropagation()
}

// 在节点上 mousedown 时立即置位，避免 dragstart 前 outline watch 覆盖 treeData 导致视口跳回
function onNodeMouseDown() {
  isDraggingNode.value = true
  const clearIfNotDragging = () => {
    if (!draggingNodePath.value) isDraggingNode.value = false
  }
  document.addEventListener('mouseup', clearIfNotDragging, { once: true })
}

const onNodeDragStart = (node: DocumentOutlineNode) => {
  outlineDragAchUnlockPending.value = false
  draggingNodePath.value = node.path
  isDraggingNode.value = true
  // 使用 CSS 自定义属性设置拖拽状态，避免触发 Vue 重新渲染
  const outlinePage = document.querySelector('.outline-page') as HTMLElement | null
  if (outlinePage) {
    outlinePage.style.setProperty('--outline-cursor', 'default')
  }
  // 拖动开始时暂停文档同步，防止频繁重新渲染
  suppressDocumentSync = true
  // 清除可能存在的 commitOutline 定时器，避免在拖拽过程中触发提交
  if (commitOutlineTimer) {
    clearTimeout(commitOutlineTimer)
    commitOutlineTimer = null
  }
  // 在拖拽时给 body 添加 class，防止其他组件受影响
  document.body.classList.add('outline-dragging')
}
type DropMode = 'before' | 'after' | 'inside' | 'parent'

// 节流定时器，用于减少拖拽过程中的 dropPreview 更新频率
let dropPreviewThrottleTimer: NodeJS.Timeout | null = null
let pendingDropPreviewUpdate: { targetPath: string; mode: DropMode } | null = null

function computeDropMode(e: DragEvent, el: HTMLElement): DropMode {
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  if (direction.value === 'vertical') {
    // 纵向布局：左右调整平级顺序，上下调整父子关系
    const leftZone = w * 0.25
    const rightZone = w * 0.75
    const topZone = h * 0.25
    const bottomZone = h * 0.75
    if (x <= leftZone) return 'before'
    if (x >= rightZone) return 'after'
    if (y >= bottomZone) return 'inside'
    if (y <= topZone) return 'parent'
    // 默认作为 inside
    return 'inside'
  } else {
    // 横向布局：上下调整平级顺序，左右调整父子关系
    const topZone = h * 0.25
    const bottomZone = h * 0.75
    const leftZone = w * 0.25
    const rightZone = w * 0.75
    if (y <= topZone) return 'before'
    if (y >= bottomZone) return 'after'
    if (x >= rightZone) return 'inside'
    if (x <= leftZone) return 'parent'
    // 默认作为 inside
    return 'inside'
  }
}

const onNodeDragOver = (e: DragEvent, node: DocumentOutlineNode) => {
  const el = e.currentTarget as HTMLElement | null
  if (!el) return
  let mode = computeDropMode(e, el)
  // dummy 节点仅作为“放入其下”（顶级段落）的目标，不允许 before/after/parent
  if (node.path === 'dummy') mode = 'inside'

  // 保存待更新的值
  pendingDropPreviewUpdate = { targetPath: node.path, mode }

  // 如果定时器不存在，立即更新并设置定时器
  if (!dropPreviewThrottleTimer) {
    dropPreview.value.targetPath = node.path
    dropPreview.value.mode = mode
    // 使用节流，每 50ms 最多更新一次，减少重新渲染频率
    dropPreviewThrottleTimer = setTimeout(() => {
      dropPreviewThrottleTimer = null
      // 应用最后一次待更新的值
      if (pendingDropPreviewUpdate) {
        dropPreview.value.targetPath = pendingDropPreviewUpdate.targetPath
        dropPreview.value.mode = pendingDropPreviewUpdate.mode
        pendingDropPreviewUpdate = null
      }
    }, 50)
  }
}
const onNodeDragLeave = (_node: DocumentOutlineNode) => {
  // 清除节流定时器
  if (dropPreviewThrottleTimer) {
    clearTimeout(dropPreviewThrottleTimer)
    dropPreviewThrottleTimer = null
  }
  pendingDropPreviewUpdate = null
  dropPreview.value.targetPath = null
  dropPreview.value.mode = null
}
const onNodeDrop = (targetNode: DocumentOutlineNode, e: DragEvent) => {
  const restoreAfterDrop = () => {
    /* 视口由 vue3-tree-chart 补丁保持，无需恢复 */
  }
  try {
    // 清除节流定时器
    if (dropPreviewThrottleTimer) {
      clearTimeout(dropPreviewThrottleTimer)
      dropPreviewThrottleTimer = null
    }
    pendingDropPreviewUpdate = null

    // 从素材篮拖入：合并到当前树
    const basketId = e.dataTransfer?.getData(MIME_MATERIAL_BASKET)
    if (basketId) {
      outlineDragAchUnlockPending.value = false
      draggingBasketId.value = null
      const mode = dropPreview.value.mode
      dropPreview.value.targetPath = null
      dropPreview.value.mode = null
      const item = materialBasketList.value.find((i) => i.id === basketId)
      if (!item || !mode) return
      if (targetNode.path === 'dummy' && mode !== 'inside') {
        dropPreview.value.targetPath = null
        dropPreview.value.mode = null
        return
      }
      const tree = treeData.value
      const target = searchNode(targetNode.path, tree)
      if (!target) return
      const newNode = basketItemToOutlineNode(item)
      if (mode === 'inside') {
        target.children = target.children || []
        target.children.push(newNode)
        reindexChildrenPaths(target)
      } else {
        const targetParent = searchParentNode(targetNode.path, tree)
        if (!targetParent || !targetParent.children) return
        if (mode === 'parent') {
          const grandParent = searchParentNode(targetParent.path, tree)
          if (!grandParent || !grandParent.children) return
          const idxParent = grandParent.children.findIndex((c) => c.path === targetParent.path)
          const insertIdx = idxParent >= 0 ? idxParent + 1 : grandParent.children.length
          grandParent.children.splice(insertIdx, 0, newNode)
          reindexChildrenPaths(grandParent)
        } else {
          const idx = targetParent.children.findIndex((c) => c.path === target.path)
          if (idx === -1) return
          const insertIdx = mode === 'before' ? idx : idx + 1
          targetParent.children.splice(insertIdx, 0, newNode)
          reindexChildrenPaths(targetParent)
        }
      }
      reindexChildrenPaths(tree)
      commitOutline()
      const nextBasket = materialBasketList.value.filter((i) => i.id !== basketId)
      commitMaterialBasket(nextBasket)
      restoreAfterDrop()
      return
    }

    const fromPath = draggingNodePath.value
    const mode = dropPreview.value.mode
    if (!fromPath) return
    if (fromPath === targetNode.path || !mode) return
    if (targetNode.path === 'dummy' && mode !== 'inside') {
      dropPreview.value.targetPath = null
      dropPreview.value.mode = null
      return
    }
    draggingNodePath.value = null
    dropPreview.value.targetPath = null
    dropPreview.value.mode = null
    isDraggingNode.value = false
    const drag = searchNode(fromPath, treeData.value)
    if (!drag) return
    const originParent = searchParentNode(fromPath, treeData.value)
    if (!originParent) return
    // 工具：判断是否为后代（防止自包含导致的子树丢失）
    const isDescendant = (candidatePath: string, ancestorPath: string): boolean => {
      if (!ancestorPath) return false
      return candidatePath === ancestorPath || candidatePath.startsWith(ancestorPath + '.')
    }
    // 工具：创建只包含标题与正文的浅拷贝（不带子节点）
    const createShallowCopy = (node: DocumentOutlineNode): DocumentOutlineNode => {
      return {
        title: node.title,
        text: node.text,
        title_level: node.title_level,
        path: '',
        children: []
      }
    }

    const target = searchNode(targetNode.path, treeData.value)
    if (!target) return

    if (mode === 'inside') {
      // 插入为子节点；如果目标是拖拽节点的后代，分两类：
      // 1) 目标是拖拽节点的"直接子节点"：将该直接子节点及其同级（即拖拽节点的所有直接子）上移到原父级；再把拖拽节点作为该目标的子节点
      // 2) 目标是更深层后代：避免形成环，仅复制"当前节点内容"插入
      target.children = target.children || []
      if (isDescendant(target.path, drag.path)) {
        const targetParent = searchParentNode(target.path, treeData.value)
        const isDirectChild = targetParent && targetParent.path === drag.path
        if (isDirectChild) {
          const hostParent = originParent ?? treeData.value
          hostParent.children = hostParent.children || []
          const indexOfA = hostParent.children.indexOf(drag)
          const oldChildren = drag.children && drag.children.length ? [...drag.children] : []
          // 1) 在祖父层用 A 的子列表替换 A，自然保持原排序位置
          if (indexOfA >= 0) {
            hostParent.children.splice(indexOfA, 1, ...oldChildren)
          } else {
            // 找不到 A 的极端情况，退化为末尾插入
            hostParent.children.push(...oldChildren)
            removeNode(originParent ?? treeData.value, drag)
          }
          // 2) 清空 A 的子列表
          drag.children = []
          // 3) 把 A 作为 B 的子节点
          target.children.push(drag)
          // 4) 重新索引
          reindexChildrenPaths(hostParent)
          reindexChildrenPaths(target)
          reindexChildrenPaths(treeData.value)
        } else {
          // 更深层后代：仅复制"当前节点内容"，避免环
          const shallow = createShallowCopy(drag)
          target.children.push(shallow)
          reindexChildrenPaths(target)
        }
      } else {
        // 正常移动：先从原父移除再插入
        removeNode(originParent, drag)
        target.children.push(drag)
        reindexChildrenPaths(target)
      }
      outlineDragAchUnlockPending.value = true
      restoreAfterDrop()
      return
    }

    if (mode === 'before' || mode === 'after') {
      const parent = searchParentNode(target.path, treeData.value)
      if (!parent || !parent.children) return
      const targetIdx = parent.children.findIndex((c) => c.path === target.path)
      if (targetIdx === -1) return

      // 插入到目标同级；如果该"同级父节点"是拖拽节点的后代，同样只复制"当前节点内容"
      if (isDescendant(parent.path, drag.path)) {
        const insertIndex = mode === 'before' ? targetIdx : targetIdx + 1
        const shallow = createShallowCopy(drag)
        parent.children.splice(insertIndex, 0, shallow)
        reindexChildrenPaths(parent)
        outlineDragAchUnlockPending.value = true
        restoreAfterDrop()
        return
      }

      // 检查拖拽节点和目标节点是否在同一父节点（同层级）
      const isSameParent = originParent === parent
      let dragIdx = -1
      if (isSameParent) {
        dragIdx = parent.children.findIndex((c) => c.path === drag.path)
      }

      // 计算插入位置（基于移除前的索引）
      let insertIndex: number
      if (mode === 'before') {
        insertIndex = targetIdx
      } else {
        insertIndex = targetIdx + 1
      }

      // 如果同层级移动，需要调整插入索引
      if (isSameParent && dragIdx !== -1) {
        // 如果拖拽节点已经在目标位置（before模式：dragIdx === targetIdx，after模式：dragIdx === targetIdx + 1），保持顺序不变
        if (
          (mode === 'before' && dragIdx === targetIdx) ||
          (mode === 'after' && dragIdx === targetIdx + 1)
        ) {
          // 已经在目标位置，不需要移动
          reindexChildrenPaths(parent)
          outlineDragAchUnlockPending.value = false
          restoreAfterDrop()
          return
        }

        // 先移除拖拽节点
        parent.children.splice(dragIdx, 1)

        // 移除后，如果拖拽节点在目标节点之前，目标节点的索引会-1
        if (dragIdx < targetIdx) {
          // 目标节点索引变成 targetIdx - 1
          if (mode === 'before') {
            // 插入到目标前面，现在目标在 targetIdx - 1，所以插入位置也是 targetIdx - 1
            insertIndex = targetIdx - 1
          } else {
            // 插入到目标后面，现在目标在 targetIdx - 1，后面是 targetIdx
            insertIndex = targetIdx
          }
        } else {
          // 拖拽节点在目标节点之后（dragIdx > targetIdx），目标节点索引不变
          // 需要调整插入位置：如果 dragIdx < insertIndex，移除后 insertIndex 需要-1
          if (dragIdx < insertIndex) {
            insertIndex--
          }
        }
      } else {
        // 不同层级，直接移除
        removeNode(originParent, drag)
      }

      // 插入节点
      parent.children.splice(insertIndex, 0, drag)
      reindexChildrenPaths(parent)
      outlineDragAchUnlockPending.value = true
      restoreAfterDrop()
      return
    }

    if (mode === 'parent') {
      const targetParent = searchParentNode(target.path, treeData.value)
      if (!targetParent) {
        // 目标无父节点（根），放不到更上层，回退为 before
        const parent = searchParentNode(target.path, treeData.value)
        if (!parent || !parent.children) return
        const idx = parent.children.findIndex((c) => c.path === target.path)
        if (idx === -1) return
        if (isDescendant(parent.path, drag.path)) {
          const shallow = createShallowCopy(drag)
          parent.children.splice(idx, 0, shallow)
        } else {
          removeNode(originParent, drag)
          parent.children.splice(idx, 0, drag)
        }
        reindexChildrenPaths(parent)
        outlineDragAchUnlockPending.value = true
        restoreAfterDrop()
        return
      }
      const grandParent = searchParentNode(targetParent.path, treeData.value)
      if (!grandParent || !grandParent.children) return
      const idxParent = grandParent.children.findIndex((c) => c.path === targetParent.path)
      // 将拖拽节点插入到"父节点"的后面，等价于提升一层（作为父节点的同级）
      const insertIndex = idxParent + 1
      if (isDescendant(grandParent.path, drag.path)) {
        const shallow = createShallowCopy(drag)
        grandParent.children.splice(insertIndex, 0, shallow)
      } else {
        removeNode(originParent, drag)
        grandParent.children.splice(insertIndex, 0, drag)
      }
      reindexChildrenPaths(grandParent)
      outlineDragAchUnlockPending.value = true
      restoreAfterDrop()
      return
    }

    // 拖动操作完成后恢复同步并提交更改
    if (suppressDocumentSync) {
      suppressDocumentSync = false
      commitOutline()
    }
    restoreAfterDrop()
  } catch (err) {
    logger.warn('HTML5 拖拽节点失败', err)
    // 即使出错也要恢复同步状态
    if (suppressDocumentSync) {
      suppressDocumentSync = false
    }
  }
}
const onNodeDragEnd = () => {
  // 清除节流定时器
  if (dropPreviewThrottleTimer) {
    clearTimeout(dropPreviewThrottleTimer)
    dropPreviewThrottleTimer = null
  }
  pendingDropPreviewUpdate = null
  draggingNodePath.value = null
  dropPreview.value.targetPath = null
  dropPreview.value.mode = null
  isDraggingNode.value = false
  // 使用 CSS 自定义属性移除拖拽状态，避免触发 Vue 重新渲染
  const outlinePage = document.querySelector('.outline-page') as HTMLElement | null
  if (outlinePage) {
    outlinePage.style.setProperty('--outline-cursor', 'inherit')
  }
  // 移除 body 上的 class
  document.body.classList.remove('outline-dragging')
  // 拖动结束后短暂保持 viewport 锁，避免焦点还原等触发的 outline 同步导致视口跳回
  viewportInteractionLock = true
  setTimeout(() => {
    viewportInteractionLock = false
    chartDataset.value = treeData.value
  }, VIEWPORT_LOCK_CLEAR_DELAY_MS)
  // 拖动结束时恢复同步并提交更改
  if (suppressDocumentSync) {
    suppressDocumentSync = false
    const shouldUnlockOutlineDrag = outlineDragAchUnlockPending.value
    outlineDragAchUnlockPending.value = false
    void commitOutline().then(() => {
      if (shouldUnlockOutlineDrag) {
        void import('../services/steam-client').then((m) =>
          m.tryUnlockSteamAchievementByApi('ACH_OUTLINE_DRAG_REORDER')
        )
      }
    })
  }
}
const dropPreview = ref<{ targetPath: string | null; mode: string | null }>({
  targetPath: null,
  mode: null
})
const textElementRefs = ref<Record<string, HTMLElement>>({})
// 库折叠时会把 node.children 移到 node._children，判断是否有子节点需同时看两者
function hasNodeChildren(
  node: DocumentOutlineNode & { _children?: DocumentOutlineNode[] }
): boolean {
  return !!(node.children?.length || (node._children?.length ?? 0))
}
function nodeChildrenCount(
  node: DocumentOutlineNode & { _children?: DocumentOutlineNode[] }
): number {
  return node.children?.length ?? node._children?.length ?? 0
}

const isNodeTextTruncated = (path: string): boolean => {
  const el = textElementRefs.value[path]
  if (!el) return false
  return el.scrollWidth > el.clientWidth
}
const setTextElementRef = (el: any, path: string) => {
  if (el) {
    textElementRefs.value[path] = el
  }
}
const position = ref({ top: 100, left: 100 })
const generatePreviewRef = ref<HTMLElement | null>(null)
const generatePreviewVisible = computed(
  () => !!generating.value || !!pendingAccept.value || !!pendingBatchAccept.value
)
watch(generatePreviewVisible, (visible) => {
  if (visible) {
    nextTick(() => {
      const el = generatePreviewRef.value
      if (el) {
        const rect = el.getBoundingClientRect()
        position.value = {
          left: (window.innerWidth - rect.width) / 2,
          top: (window.innerHeight - rect.height) / 2
        }
      }
    })
  }
})
const generatePreviewWrapStyle = computed(() => ({
  maxHeight: pendingAccept.value || pendingBatchAccept.value ? '60vh' : '70vh'
}))
let isDragging = false
let offset: { x: number; y: number } = { x: 0, y: 0 }
const startDrag = (e: MouseEvent) => {
  isDragging = true
  offset.x = e.clientX - position.value.left
  offset.y = e.clientY - position.value.top
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}
function onDrag(e: MouseEvent) {
  if (!isDragging) return
  position.value.left = e.clientX - offset.x
  position.value.top = e.clientY - offset.y
}
function stopDrag() {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
const treeRef = ref<any>(null)
const viewportRef = ref<HTMLElement | null>(null)

/** 强制设置连接线样式：覆盖 tree-chart-core 的 D3 opacity 动画（0→1），避免首帧/少节点时连接线过淡；使用纯色不透明 */
function forceOutlineLinkStyles() {
  const el = treeRef.value?.$el ?? treeRef.value?.el
  if (!el || typeof el.querySelectorAll !== 'function') return
  const isDark = themeState.currentTheme.type === 'dark'
  const stroke = isDark ? '#e0e0e0' : '#9ca3af'
  el.querySelectorAll('.link').forEach((path: SVGPathElement) => {
    path.style.setProperty('opacity', '1', 'important')
    path.style.setProperty('stroke', stroke, 'important')
    path.style.setProperty('stroke-opacity', '1', 'important')
    path.style.setProperty('fill', 'none', 'important')
  })
}
function scheduleForceOutlineLinkStyles() {
  nextTick(() => {
    setTimeout(forceOutlineLinkStyles, 50)
    setTimeout(forceOutlineLinkStyles, 400)
  })
}
const editNodeValue = ref('')
const currentChapterValue = ref('')
const currentChapterContent = ref('')
const currentChapterKeywords = ref<string[]>([])
const chapterEditPrompt = ref('')
const chapterEditTemperature = ref(1.0)
const chapterEditAiExpanded = ref(false)
const chapterEditGenerating = ref(false)
const pendingChapterAccept = ref(false)
const backupChapterContentBeforeGenerate = ref('')
const chapterEditorWrapRef = ref<HTMLElement | null>(null)
const chapterGenerateAbortControllerRef = ref<AbortController | null>(null)
const editValueDialogVisible = ref(false)

function scrollChapterEditorToBottom() {
  nextTick(() => {
    const el = chapterEditorWrapRef.value?.querySelector?.('.cm-scroller') as HTMLElement | null
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

watch(currentChapterContent, () => {
  if (chapterEditGenerating.value) scrollChapterEditorToBottom()
})

const changeNodeValue = () => {
  const selected = selectedNode.value
  if (!selected) return
  const curNode = searchNode(selected.path, treeData.value)
  if (!curNode) return
  curNode.title = currentChapterValue.value
  curNode.text = currentChapterContent.value
  if (!curNode.extras) curNode.extras = {}
  curNode.extras.keywords = currentChapterKeywords.value.length
    ? [...currentChapterKeywords.value]
    : undefined
  editValueDialogVisible.value = false
}

async function generateChapterContent() {
  const node = selectedNode.value
  if (!node) return
  const prompt = chapterEditPrompt.value?.trim()
  if (!prompt) {
    notifyInfo(t('outline.materialBasket.promptPlaceholder'))
    return
  }
  const curNode = searchNode(node.path, treeData.value)
  if (!curNode) return
  chapterEditGenerating.value = true
  backupChapterContentBeforeGenerate.value = currentChapterContent.value || ''
  const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
  const outlineMarkdown = generateMarkdownFromOutlineTree(treeData.value) || ''
  const kwStr = currentChapterKeywords.value.length ? currentChapterKeywords.value.join('，') : ''
  const existingContent = (currentChapterContent.value || '').trim()
  const enhancedUserPrompt = `${prompt}${kwStr ? `\n关键词：${kwStr}` : ''}\n\n【重要】请严格遵守用户在提示词中提出的格式、风格、长度、禁止事项等一切规约。\n\n【当前整篇文章内容（供参考）】\n${outlineMarkdown || t('outline.emptyContent')}\n\n【当前章节信息】标题：${currentChapterValue.value || t('outline.noContent')}；关键词：${kwStr || t('outline.noContent')}；已有内容：${existingContent || t('outline.noContent')}`
  currentChapterContent.value = ''
  chapterGenerateAbortControllerRef.value = new AbortController()
  try {
    const content = await generateNodeContentUtil(
      { ...curNode, text: '' },
      treeData.value,
      enhancedUserPrompt,
      chapterGenerateAbortControllerRef.value.signal,
      docFormat,
      currentChapterContent,
      undefined,
      chapterEditTemperature.value
    )
    if (content) currentChapterContent.value = content
    pendingChapterAccept.value = true
  } catch (e) {
    const aborted = chapterGenerateAbortControllerRef.value?.signal.aborted
    if (aborted) {
      pendingChapterAccept.value = true
    } else {
      logger.warn('章节 AI 生成失败', e)
      notifyError(t('outline.generateContentFail', { error: String(e) }))
      currentChapterContent.value = backupChapterContentBeforeGenerate.value
    }
  } finally {
    chapterEditGenerating.value = false
    chapterGenerateAbortControllerRef.value = null
  }
}

function stopChapterGenerate() {
  chapterGenerateAbortControllerRef.value?.abort()
}

function acceptChapterGenerate() {
  pendingChapterAccept.value = false
  backupChapterContentBeforeGenerate.value = ''
}

function rejectChapterGenerate() {
  currentChapterContent.value = backupChapterContentBeforeGenerate.value
  pendingChapterAccept.value = false
  backupChapterContentBeforeGenerate.value = ''
}
// 执行移除前缀操作
const executeRemovePrefixes = async () => {
  backupOutlineTree.value = cloneOutline(treeData.value)

  // 暂停文档同步，避免触发 watch 导致循环
  const prevSync = suppressDocumentSync
  suppressDocumentSync = true

  try {
    let modifiedTree = cloneOutline(treeData.value)
    modifiedTree = removeAllTitlePrefixes(modifiedTree)

    // 更新 treeData（此时 suppressDocumentSync = true，不会触发 watch）
    treeData.value = modifiedTree
    chartDataset.value = treeData.value

    // 手动提交更改
    await commitOutline(modifiedTree)

    formatTitleDialogVisible.value = false
    eventBus.emit('show-success', t('outline.removePrefixesSuccess'))
  } finally {
    // 恢复同步状态
    suppressDocumentSync = prevSync
  }
}

const handleRemovePrefixes = () => {
  removePrefixesDialogVisible.value = true
}
const executeFormatTitle = async () => {
  backupOutlineTree.value = cloneOutline(treeData.value)

  // 暂停文档同步，避免触发 watch 导致循环
  const prevSync = suppressDocumentSync
  suppressDocumentSync = true

  try {
    let modifiedTree = cloneOutline(treeData.value)

    // 调整Markdown标题层级（如果指定）
    if (formatTitleConfig.adjustMarkdown) {
      const firstLevel = formatTitleConfig.firstMarkdownTitleLevel
      modifiedTree = cloneOutline(adjustTitleLevel(modifiedTree, firstLevel))
    }

    // 3. 调整章节编号（如果指定）
    if (formatTitleConfig.adjustTitle) {
      const cover = formatTitleConfig.cover
      const level1TitleChinese = formatTitleConfig.level1TitleChinese
      modifiedTree = cloneOutline(adjustTitleIndex(modifiedTree, cover, level1TitleChinese))
    }

    // 更新 treeData（此时 suppressDocumentSync = true，不会触发 watch）
    treeData.value = modifiedTree
    chartDataset.value = treeData.value

    // 手动提交更改
    await commitOutline(modifiedTree)

    formatTitleDialogVisible.value = false
    eventBus.emit('show-success', t('outline.formatSuccess'))
    void import('../services/steam-client').then((m) =>
      m.tryUnlockSteamAchievementByApi('ACH_OUTLINE_FORMAT_TITLES')
    )
  } finally {
    // 恢复同步状态
    suppressDocumentSync = prevSync
  }
}
const generateContent = async () => {
  viewCtx.lockUI()
  const node = selectedNode.value
  generating.value = true
  if (node) {
    backupContent.value = node.text
  }
  generateContentLoading.value = true
  const curNode = node ? searchNode(node.path, treeData.value) : null
  if (!curNode) {
    generateContentLoading.value = false
    generating.value = false
    viewCtx.unlockUI()
    return
  }
  const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
  rawstring.value = '' // 清空之前的内容
  try {
    const content = await generateNodeContentUtil(
      curNode,
      treeData.value,
      userPrompt.value,
      undefined, // signal
      docFormat,
      rawstring // 传入rawstring ref，用于实时显示原始内容
    )
    // rawstring.value 已经通过ref实时更新了，这里只需要设置处理后的内容
    curNode.text = content || ''
  } catch (err) {
    logger.warn('任务失败或取消：', err)
    const rawContent = rawstring.value?.trim() || ''
    if (rawContent) {
      curNode.text = rawContent
    } else {
      curNode.text = ''
    }
  } finally {
    pendingAccept.value = true
    generateContentLoading.value = false
    generating.value = false
    viewCtx.unlockUI()
  }
  eventBus.emit('show-success', t('outline.generateChapterSuccess'))
}
const generateChildrenContent = async () => {
  viewCtx.lockUI()
  const prevSync = suppressDocumentSync
  suppressDocumentSync = true
  const node = selectedNode.value
  generating.value = true
  generateChildrenContentLoading.value = true
  parallelChildren.value = []
  batchItemsRef.value = []

  const rootNode = node ? searchNode(node.path, treeData.value) : null
  if (!rootNode) {
    generateChildrenContentLoading.value = false
    generating.value = false
    suppressDocumentSync = prevSync
    viewCtx.unlockUI()
    return
  }

  const nodes: DocumentOutlineNode[] = []
  collectAllNodes(rootNode, nodes)
  const backupMap = new Map<string, string>()
  for (const n of nodes) {
    backupMap.set(n.path, n.text ?? '')
  }

  const taskPromises: Promise<unknown>[] = []

  const traverseAndGenerate = async (curNode: DocumentOutlineNode | null): Promise<void> => {
    if (!curNode) return
    if (curNode.path === 'dummy') {
      if (curNode.children) {
        await Promise.all(curNode.children.map((child) => traverseAndGenerate(child)))
      }
      return
    }

    if (curNode.children && curNode.children.length > 0) {
      await Promise.all(curNode.children.map((child) => traverseAndGenerate(child)))
    }

    const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
    const nodeRawContentRef = ref('')
    parallelChildren.value.push(nodeRawContentRef)
    batchItemsRef.value.push({
      nodePath: curNode.path,
      nodeTitle: curNode.title || curNode.path,
      rawContentRef: nodeRawContentRef,
      backupText: backupMap.get(curNode.path) ?? ''
    })

    const task = generateNodeContentUtil(
      curNode,
      treeData.value,
      userPrompt.value,
      undefined,
      docFormat,
      nodeRawContentRef
    )
      .then((content) => {
        curNode.text = content || ''
        syncChildrenFromNodeText(curNode)
        eventBus.emit(
          'show-success',
          t('outline.generateContentSuccessWithTitle', { title: curNode.title })
        )
      })
      .catch((err) => {
        logger.warn(`节点 ${curNode.title} 任务失败或取消：`, err)
        curNode.text = ''
      })

    taskPromises.push(task)
  }

  try {
    await traverseAndGenerate(rootNode)
    await Promise.all(taskPromises)
    if (commitOutlineTimer) {
      clearTimeout(commitOutlineTimer)
      commitOutlineTimer = null
    }
    pendingBatchAccept.value = {
      type: 'content',
      rootPath: rootNode.path,
      items: [...batchItemsRef.value]
    }
    generated.value = true
    eventBus.emit('show-success', t('outline.generateChildSuccess'))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logger.error('批量生成内容失败:', e)
    eventBus.emit('show-error', t('outline.generateContentFail', { error: message }))
  } finally {
    generating.value = false
    generateChildrenContentLoading.value = false
    suppressDocumentSync = prevSync
    if (!pendingBatchAccept.value) commitOutline()
    viewCtx.unlockUI()
  }
}
const generateChildrenChildren = async () => {
  viewCtx.lockUI()
  const prevSync = suppressDocumentSync
  suppressDocumentSync = true
  const node = selectedNode.value
  generating.value = true
  generateChildrenChildrenLoading.value = true
  parallelChildren.value = []
  batchItemsRef.value = []

  const rootNode = node ? searchNode(node.path, treeData.value) : null
  if (!rootNode) {
    generateChildrenChildrenLoading.value = false
    generating.value = false
    suppressDocumentSync = prevSync
    viewCtx.unlockUI()
    return
  }

  const leaves: DocumentOutlineNode[] = []
  collectLeaves(rootNode, leaves)
  const backupMap = new Map<string, DocumentOutlineNode[]>()
  for (const leaf of leaves) {
    const cloned = cloneOutline(leaf)
    backupMap.set(leaf.path, cloned.children ?? [])
  }

  const taskPromises: Promise<void>[] = []

  const traverseAndGenerate = async (curNode: DocumentOutlineNode | null): Promise<void> => {
    if (!curNode) return

    if (curNode.children && curNode.children.length > 0) {
      await Promise.all(curNode.children.map((child) => traverseAndGenerate(child)))
      return
    }

    if (curNode.path === 'dummy') return

    const docFormat = (activeDocument.value?.format ?? 'md') as 'md' | 'tex'
    const nodeRawContentRef = ref('')
    parallelChildren.value.push(nodeRawContentRef)
    batchItemsRef.value.push({
      nodePath: curNode.path,
      nodeTitle: curNode.title || curNode.path,
      rawContentRef: nodeRawContentRef,
      backupChildren: backupMap.get(curNode.path) ?? []
    })

    const task = generateChildNodesUtil(
      curNode,
      treeData.value,
      userPrompt.value,
      undefined,
      docFormat,
      nodeRawContentRef
    )
      .then((newChildren) => {
        if (!curNode.children) curNode.children = []
        curNode.children.push(...newChildren)
        eventBus.emit(
          'show-success',
          t('outline.generateChildSuccessWithTitle', { title: curNode.title })
        )
      })
      .catch((err) => {
        logger.warn(`节点 ${curNode.title} 生成子节点失败`, err)
      })

    taskPromises.push(task)
  }

  try {
    await traverseAndGenerate(rootNode)
    await Promise.all(taskPromises)
    if (commitOutlineTimer) {
      clearTimeout(commitOutlineTimer)
      commitOutlineTimer = null
    }
    pendingBatchAccept.value = {
      type: 'children',
      rootPath: rootNode.path,
      items: [...batchItemsRef.value]
    }
    eventBus.emit('show-success', t('outline.generateChildSuccess'))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    eventBus.emit('show-error', t('outline.generateChildFail', { error: message }))
  } finally {
    generateChildrenChildrenLoading.value = false
    generating.value = false
    suppressDocumentSync = prevSync
    if (!pendingBatchAccept.value) commitOutline()
    viewCtx.unlockUI()
  }
}

// Provide AI toolbar dependencies to child components
provide('outlineSelectedAiTool', selectedAiTool)
provide('outlineToggleAiTool', toggleAiTool)
provide('outlineFormatTitle', formatTitle)
provide('outlineHandleNodeButtonClick', handleNodeButtonClick)
</script>

<style scoped>
/* 无 max-width/max-height 限制，大分辨率下画布与树图可铺满整屏 */
.outline-page {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  max-width: none;
  max-height: none;
  display: flex;
  flex-direction: column;
}

.container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  max-width: none;
  max-height: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* 无限画布视口系统：无尺寸上限，树图可铺满右侧与底部 */
.outline-viewport {
  flex: 1;
  min-width: 0;
  min-height: 0;
  max-width: none;
  max-height: none;
  position: relative;
  overflow: hidden;
}

/* 使用 CSS 自定义属性控制拖拽状态，避免响应式 class 触发重新渲染 */
.outline-viewport {
  cursor: var(--outline-cursor, inherit);
}

/* vue-tree 填满视口，无最大尺寸限制，缩放与拖拽由库内置处理 */
.outline-viewport-tree {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
}

/* CSS 自定义属性定义 */
.outline-page {
  --outline-cursor: inherit;
  --outline-link-color: #9ca3af;
  --outline-node-bg: #ffffff;
  --outline-primary: #3b82f6;
  --outline-text-color: #1f2937;
  --outline-filter: brightness(0.92);
}

.outline-tree-inner {
  width: 100%;
  height: 100%;
  /* 覆盖 vue-tree 内部的 overflow 限制，防止内容被截断 */
  overflow: visible !important;
  /* 容器本身透明 */
  background: transparent !important;
}

/* 覆盖 vue-tree 内部的 tree-container 样式，无最大尺寸限制 */
.outline-tree-inner :deep(.tree-container) {
  overflow: visible !important;
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  /* 容器本身透明 */
  background: transparent !important;
}

/* 覆盖 vue-tree 内部的 dom-container 和 svg 尺寸限制，大屏下铺满 */
.outline-tree-inner :deep(.dom-container),
.outline-tree-inner :deep(.vue-tree) {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  overflow: visible !important;
  transform-origin: 0 0 !important;
  /* 容器本身透明 */
  background: transparent !important;
}
/* 连接线：纯色不透明，由 JS forceOutlineLinkStyles 覆盖 D3 的 opacity 动画，此处作兜底 */
.outline-viewport .outline-tree-inner :deep(.tree-container .link),
.outline-viewport .outline-tree-inner :deep(.tree-container path.link) {
  fill: none !important;
  stroke-width: 2px !important;
  opacity: 1 !important;
  stroke-opacity: 1 !important;
}
/* 使用 CSS 自定义属性控制主题颜色，避免响应式 class 触发重新渲染 */
.outline-viewport .outline-tree-inner :deep(.tree-container .link),
.outline-viewport .outline-tree-inner :deep(.tree-container path.link) {
  stroke: var(--outline-link-color, #9ca3af) !important;
}

/* 缩放工具栏样式 */
/* 底栏按钮统一为正方形 */
.bottom-menu :deep(button) {
  width: 36px;
  height: 36px;
  padding: 0;
}

.generate-preview {
  position: fixed;
  z-index: 100;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  max-width: 500px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.generate-preview-scrollbar {
  flex: 1;
  min-height: 0;
}

.generate-preview-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

/* 标题行（如「AI正在工作中」+ 取消按钮）与下方预览内容之间的空隙 */
.noselect-display > .generate-preview-body {
  margin-top: 12px;
}
.noselect-display > .batch-panels {
  margin-top: 12px;
}

.generate-preview-content {
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  margin-top: 8px;
}

.batch-panels {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.batch-panel {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.batch-panel--rejected {
  opacity: 0.5;
}

.batch-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.batch-panel-title {
  font-weight: 600;
  font-size: 14px;
}

.batch-panel-rejected-tag {
  font-size: 12px;
  color: #f56c6c;
}

.generate-preview-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

.generate-preview-actions--batch {
  justify-content: space-between;
}

/* 接受/拒绝/取消图标按钮保持正方形（不含“接受全部/拒绝全部”） */
.generate-preview-btn-square {
  width: 28px;
  height: 28px;
  min-width: 28px;
  padding: 0;
}

.tree-node {
  position: relative;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: auto;
  max-width: none;
  margin: 0;
  background: transparent !important;
  box-sizing: border-box;
  transition: all 0.2s;
}

.tree-node:hover {
  filter: brightness(1.05);
}

/* 拖放预览：根据放置位置高亮节点对应边（before/after/inside/parent） */
.tree-node.drop-before::before,
.tree-node.drop-after::after,
.tree-node.drop-inside::before,
.tree-node.drop-parent::before {
  content: '';
  position: absolute;
  background: v-bind('themeState.currentTheme.primaryColor');
  opacity: 0.85;
  border-radius: 2px;
  z-index: 1;
  pointer-events: none;
}
/* 纵向布局：左/右为平级前后，上为提升层级，下为作为子节点 */
.outline-page[data-direction='vertical'] .tree-node.drop-before::before {
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.outline-page[data-direction='vertical'] .tree-node.drop-after::after {
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.outline-page[data-direction='vertical'] .tree-node.drop-inside::before {
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
}
.outline-page[data-direction='vertical'] .tree-node.drop-parent::before {
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
}
/* 横向布局：上/下为平级前后，左为提升层级，右为作为子节点 */
.outline-page[data-direction='horizontal'] .tree-node.drop-before::before {
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
}
.outline-page[data-direction='horizontal'] .tree-node.drop-after::after {
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
}
.outline-page[data-direction='horizontal'] .tree-node.drop-inside::before {
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.outline-page[data-direction='horizontal'] .tree-node.drop-parent::before {
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
/* 折叠态节点同样需要定位上下文以便伪元素显示 */
.tree-node--collapsed-with-children.drop-before::before,
.tree-node--collapsed-with-children.drop-after::after,
.tree-node--collapsed-with-children.drop-inside::before,
.tree-node--collapsed-with-children.drop-parent::before {
  content: '';
  position: absolute;
  background: v-bind('themeState.currentTheme.primaryColor');
  opacity: 0.85;
  border-radius: 2px;
  z-index: 1;
  pointer-events: none;
}
.outline-page[data-direction='vertical'] .tree-node--collapsed-with-children.drop-before::before {
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.outline-page[data-direction='vertical'] .tree-node--collapsed-with-children.drop-after::after {
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.outline-page[data-direction='vertical'] .tree-node--collapsed-with-children.drop-inside::before {
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
}
.outline-page[data-direction='vertical'] .tree-node--collapsed-with-children.drop-parent::before {
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
}
.outline-page[data-direction='horizontal'] .tree-node--collapsed-with-children.drop-before::before {
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
}
.outline-page[data-direction='horizontal'] .tree-node--collapsed-with-children.drop-after::after {
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
}
.outline-page[data-direction='horizontal'] .tree-node--collapsed-with-children.drop-inside::before {
  right: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.outline-page[data-direction='horizontal'] .tree-node--collapsed-with-children.drop-parent::before {
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}

.tree-node-text {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 8px 16px;
  border-radius: 9999px;
  background-color: v-bind('themeState.currentTheme.outlineNode');
  max-width: 140px;
}

.tree-node-expand-btn {
  width: auto;
  height: auto;
  padding: 8px 12px;
  border: none;
  background-color: v-bind('themeState.currentTheme.outlineNode');
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  opacity: 0.8;
  transition: all 0.2s;
}

.tree-node-expand-btn:hover {
  opacity: 1;
  filter: brightness(1.1);
}

/* 折叠且有子节点的节点：使用 CSS 自定义属性适配主题，避免响应式 class 触发重新渲染 */
.tree-node--collapsed-with-children {
  position: relative;
  filter: var(--outline-filter, brightness(0.92));
}
/* 有子节点但当前为折叠态（库用普通 slot 渲染时）：使用 CSS 自定义属性适配主题 */
.tree-node--has-children-collapsed {
  position: relative;
  filter: var(--outline-filter, brightness(0.92));
}

/* 子节点数量 badge - 显示在节点文字前，背景与字体色由内联 style 与 tree-node 一致 */
.children-count-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  padding: 0 4px;
  flex-shrink: 0;
  margin-right: 4px;
}

/* 展开面板留在 node-slot 内，替代原节点；通过 :has 让该 slot 置顶，避免被右侧节点盖住 */
.outline-tree-inner :deep(.node-slot:has(.detailed-node-wrapper)) {
  z-index: 99999;
}
.detailed-node-wrapper {
  position: relative;
  z-index: 1;
  min-width: 400px;
  max-width: 600px;
}
.detailed-node-wrapper--top {
  z-index: 1;
}

.outline-node-context-menu {
  position: fixed;
  z-index: 9999;
  border-radius: 8px;
  padding: 8px 0;
  min-width: 160px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.outline-node-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.2s;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  font-size: 14px;
}

.outline-node-context-menu__item:hover {
  background: rgba(0, 0, 0, 0.05);
}

.outline-node-context-menu__item.danger {
  color: #f56c6c;
}

.outline-node-context-menu__icon {
  flex-shrink: 0;
}

.bottom-menu {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 12px;
  z-index: 100;
  background: transparent;
  border: none;
  box-shadow: none;
}

.merge-target-list {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
}
.merge-target-item {
  padding: 8px 12px;
  text-align: left;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}
.merge-target-item:hover {
  background: rgba(0, 0, 0, 0.06);
}
.merge-target-item.active {
  background: rgba(64, 158, 255, 0.16);
}
.merge-target-item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

/* 格式化标题向导：每项底部显示 hint，不用 tooltip */
.format-title-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.format-title-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.4;
  padding-left: 0;
}

/* 新建/编辑素材对话框：整体宽度约 2.5 倍，左右 1:2 + 编辑器加高 */
.new-material-dialog-content {
  width: 80vw;
  height: 80vh;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}
.new-material-dialog-content :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.new-material-dialog-body {
  display: flex;
  gap: 24px;
  padding: 20px 0;
  flex: 1;
  min-height: 0;
}
.new-material-form-column {
  flex: 0 0 33.33%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
}
.new-material-edit-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.new-material-ai-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}
.new-material-ai-heading-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.new-material-ai-heading-btn:hover {
  color: var(--foreground);
}
.new-material-ai-heading {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.material-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.material-field-label {
  font-weight: 500;
  font-size: 14px;
}
.material-field-hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground);
  line-height: 1.3;
}
.new-material-editor-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.material-field-fill {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.material-field-fill .new-material-editor-wrap {
  flex: 1;
  min-height: 0;
}
.new-material-editor-wrap {
  flex: 1;
  min-height: 0;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.new-material-editor-wrap.is-disabled {
  pointer-events: none;
  opacity: 0.85;
}
.new-material-editor-wrap :deep(.md-editor) {
  border: none;
  border-radius: 0;
  flex: 1;
  min-height: 0;
  height: 100%;
}
.new-material-editor-wrap :deep(.cm-scroller) {
  overflow-y: auto !important;
}
.new-material-md-editor {
  height: 100%;
  min-height: 0;
}

/* 编辑章节对话框：与新建/编辑素材同布局与宽度（左标题/关键词/AI + 右编辑器） */
.edit-chapter-dialog-content {
  width: 80vw;
  height: 80vh;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}
.edit-chapter-dialog-content :deep(.el-scrollbar__view) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.edit-chapter-dialog-body {
  display: flex;
  gap: 24px;
  padding: 20px 0;
  flex: 1;
  min-height: 0;
}
.edit-chapter-form-column {
  flex: 0 0 33.33%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
}
.edit-chapter-editor-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.edit-chapter-editor-column .material-field-fill {
  flex: 1;
  min-height: 0;
}
.edit-chapter-editor-wrap {
  flex: 1;
  min-height: 0;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.edit-chapter-editor-wrap.is-disabled {
  pointer-events: none;
  opacity: 0.85;
}
.edit-chapter-editor-wrap :deep(.md-editor) {
  border: none;
  border-radius: 0;
  flex: 1;
  min-height: 0;
  height: 100%;
}
.edit-chapter-editor-wrap :deep(.cm-scroller) {
  overflow-y: auto !important;
}
.edit-chapter-editor-wrap :deep(.md-editor-toolbar-wrapper),
.edit-chapter-editor-wrap :deep(.md-editor-content) {
  border: none;
}
.edit-chapter-editor-wrap :deep(.md-editor) {
  height: 100%;
  min-height: 0;
}

.outline-md-editor-wrap {
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 8px;
  overflow: hidden;
}
.outline-md-editor-wrap :deep(.md-editor) {
  border: none;
  border-radius: 0;
}

.ai-config-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.ai-config-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 关键词与用户提示词输入区域同宽 */
.ai-config-keywords-input,
.ai-config-user-prompt {
  width: 100%;
}

.ai-config-label {
  font-weight: 500;
  font-size: 14px;
}

/* 关键词输入框容器：与文本框一致的可见边框，避免被全局 --border 覆盖 */
.ai-config-keywords-input :deep(.keywords-container) {
  border: 1px solid rgba(145, 145, 145, 0.55) !important;
}

.ai-config-recommended {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.ai-config-recommended-title {
  font-size: 12px;
  color: #666;
}

.ai-config-recommended-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-config-recommended-tag {
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  font-size: 12px;
}

/* 确保 Tooltip 永远在最高层级 */
:global([data-reka-tooltip-content]) {
  z-index: 99999 !important;
}

.ai-config-recommended-tag:hover {
  background: rgba(0, 0, 0, 0.1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<!-- 编辑/新建对话框：不用 grid，用 flex；body 高度固定，仅左侧滚动，右侧编辑器始终占满 -->
<style>
.dialog-content-box.new-material-dialog-content,
.dialog-content-box.edit-chapter-dialog-content {
  width: 80vw !important;
  max-width: 80vw !important;
  height: 80vh !important;
  max-height: 80vh !important;
  display: flex !important;
  flex-direction: column !important;
  grid-template-rows: unset !important;
}
.dialog-content-box.new-material-dialog-content .dialog-slot-scrollbar,
.dialog-content-box.edit-chapter-dialog-content .dialog-slot-scrollbar {
  flex: 1;
  min-height: 0;
}
/* 约束 wrap 与 view 高度，避免 view 随内容增高，这样 body 高度固定、右侧才能始终占满 */
.dialog-content-box.new-material-dialog-content .el-scrollbar__wrap,
.dialog-content-box.edit-chapter-dialog-content .el-scrollbar__wrap {
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}
.dialog-content-box.new-material-dialog-content .el-scrollbar__view,
.dialog-content-box.edit-chapter-dialog-content .el-scrollbar__view {
  height: 100% !important;
  max-height: 100% !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  flex: 1 !important;
  min-height: 0 !important;
}
.dialog-content-box.new-material-dialog-content
  .el-scrollbar__view
  > *:not(.new-material-dialog-body),
.dialog-content-box.edit-chapter-dialog-content
  .el-scrollbar__view
  > *:not(.edit-chapter-dialog-body) {
  flex-shrink: 0;
}
</style>
