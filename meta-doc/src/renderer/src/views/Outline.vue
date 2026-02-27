<template>
  <div class="outline-page" :data-direction="direction" :class="{ 'is-dragging': isDraggingNode }">
    <!-- AI 工具栏与格式化标题：通过子组件 + inject 使用 selectedAiTool，避免 Outline 因 selectedAiTool 变化而 re-render 导致树图位置重置 -->
    <OutlineAiToolbar />

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
                  variant="outline"
                  size="sm"
                  class="aero-btn generate-preview-btn-square generate-preview-accept-btn"
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
          <Button variant="outline" size="sm" class="aero-btn generate-preview-accept-btn" @click.stop="batchAcceptAll">
            <Check class="w-4 h-4" />
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
        :class="{ 'is-dragging': isDraggingNode }"
        @wheel="handleViewportWheel"
      >
        <vue-tree
            ref="treeRef"
            :key="outlineTreeKey"
            class="outline-tree-inner outline-viewport-tree"
            :class="{
              'is-dragging': isDraggingNode,
              'outline-theme-dark': themeState.currentTheme.type === 'dark'
            }"
            :dataset="treeData"
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
              <!-- 节点被折叠时显示正常节点，但在文字前显示子节点数量 badge，并加样式区分 -->
              <template v-if="collapsed && node.children && node.children.length > 0">
                <div
                  class="tree-node tree-node--collapsed-with-children"
                  :style="{
                    backgroundColor: themeState.currentTheme.outlineNode,
                    '--outline-primary': themeState.currentTheme.primaryColor
                  }"
                  :class="dropPreview.targetPath === node.path ? 'drop-' + dropPreview.mode : ''"
                  draggable="true"
                  @dragstart.stop="onNodeDragStart(node)"
                  @dragover.prevent="onNodeDragOver($event, node)"
                  @dragleave="onNodeDragLeave(node)"
                  @drop.stop="onNodeDrop(node, $event)"
                  @dragend.stop="onNodeDragEnd"
                  @mousedown.stop
                  @mousemove.stop="isDraggingNode ? $event.stopPropagation() : null"
                  @contextmenu.prevent="openNodeContextMenu($event, node)"
                >
                  <!-- 子节点数量 badge -->
                  <span
                    class="children-count-badge"
                    :style="{ backgroundColor: themeState.currentTheme.primaryColor }"
                  >
                    {{ node.children.length }}
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
                      <TooltipContent
                        side="top"
                        v-if="node.title && isNodeTextTruncated(node.path)"
                      >
                        <p>{{ node.title }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <!-- 展开按钮：未选中 AI 工具时显示 -->
                  <TooltipProvider v-if="!selectedAiTool">
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
              <!-- 如果节点未展开，显示正常节点 -->
              <template v-else>
                <div
                  class="tree-node"
                  :style="{ backgroundColor: themeState.currentTheme.outlineNode }"
                  :class="dropPreview.targetPath === node.path ? 'drop-' + dropPreview.mode : ''"
                  draggable="true"
                  @dragstart.stop="onNodeDragStart(node)"
                  @dragover.prevent="onNodeDragOver($event, node)"
                  @dragleave="onNodeDragLeave(node)"
                  @drop.stop="onNodeDrop(node, $event)"
                  @dragend.stop="onNodeDragEnd"
                  @mousedown.stop
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
                      <TooltipContent
                        side="top"
                        v-if="node.title && isNodeTextTruncated(node.path)"
                      >
                        <p>{{ node.title }}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <!-- 展开按钮：未选中 AI 工具时显示 -->
                  <TooltipProvider v-if="!selectedAiTool">
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
                  v-if="selectedAiTool"
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
            v-if="nodeContextMenuPath && nodeContextMenuPosition"
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

      <Dialog v-model:open="editValueDialogVisible">
        <DialogContent class="sm:max-w-[40%]">
          <DialogHeader>
            <DialogTitle>{{ $t('outline.editChapterTitle') }}</DialogTitle>
          </DialogHeader>
          <div class="grid gap-4 py-4">
            <div class="grid gap-2">
              <label class="text-sm font-medium">{{ $t('outline.chapterName') }}</label>
              <Input v-model="currentChapterValue" class="aero-input" />
            </div>
            <div class="grid gap-2">
              <label class="text-sm font-medium">{{ $t('outline.chapterContent') }}</label>
              <md-editor
                v-model="currentChapterContent"
                show-code-row-number
                preview-theme="github"
                code-style-reverse
                style="text-align: left"
                :auto-fold-threshold="300"
                :theme="editorTheme"
              />
            </div>
          </div>
          <DialogFooter>
            <Button @click="changeNodeValue">{{ $t('outline.confirm') }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- AI 配置对话框：标题随所选工具变化，如「生成子章节」「生成内容」 -->
      <Dialog v-model:open="aiConfigDialogVisible">
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
                <span class="ai-config-recommended-title">{{
                  $t('outline.aiConfig.recommendedKeywords')
                }}：</span>
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

      <div class="bottom-menu aero-div">
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
import { ElMessageBox } from 'element-plus'
import { notifyError, notifyInfo } from '@renderer/utils/notify'

// Demo mode support
const props = defineProps<{
  mode?: string
}>()
const isDemo = computed(() => props.mode === 'demo')

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
  Folder
} from 'lucide-vue-next'
import type { DocumentOutlineNode } from '../../../types'
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
import StreamingJsonTree from '../components/outline/StreamingJsonTree.vue'
import KeywordInput from '../components/KeywordInput.vue'
import '../assets/noselect-display.css'
import { generateWithSchema } from '../utils/ai-schema-task'
import { OUTLINE_SECTION_KEYWORDS_SCHEMA } from '../utils/schemas'
import { generateOutlineSectionKeywordsPrompt } from '../utils/prompts'
import { useI18n } from 'vue-i18n'
import { ai_types, createAiTask, clearAiTasks } from '../utils/ai_tasks.ts'
import { getSetting, setSetting } from '../utils/settings.js'
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
  rawContentRef: Ref<string>
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

const { t } = useI18n()
const logger = createRendererLogger('Outline', {
  windowTypeProvider: () => getWindowType()
})
const workspace = useWorkspace()
const {
  activeTabId,
  activateTab,
  ensureDocument,
  removeTab,
  updateDocumentOutline,
  updateDocumentLastView,
  updateDocumentMarkdown,
  withAutoOutlineSyncSuppressed
} = workspace

const cloneOutline = (outline?: DocumentOutlineNode): DocumentOutlineNode =>
  JSON.parse(JSON.stringify(outline ?? DEFAULT_OUTLINE_TREE))

const activeDocument = computed(() => {
  if (!activeTabId.value) return null
  try {
    return ensureDocument(activeTabId.value)
  } catch (error) {
    logger.warn('获取当前文档失败', error)
    return null
  }
})

const treeData = ref<DocumentOutlineNode>(cloneOutline(activeDocument.value?.outline))
const editorTheme = computed<Themes | undefined>(
  () => themeState.currentTheme.vditorTheme as Themes | undefined
)
const selectedNode = ref<DocumentOutlineNode | null>(null)
const nodeContextMenuPath = ref<string | null>(null)
const nodeContextMenuPosition = ref<{ x: number; y: number } | null>(null)
const nodeContextMenuStyle = computed(() => ({
  backgroundColor: themeState.currentTheme.background,
  color: themeState.currentTheme.textColor,
  borderColor:
    themeState.currentTheme.type === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
}))
const nodeContextMenuPositionStyle = computed(() => {
  if (!nodeContextMenuPosition.value) return {}
  return {
    position: 'fixed',
    left: nodeContextMenuPosition.value.x + 'px',
    top: nodeContextMenuPosition.value.y + 'px'
  }
})
const generated = ref(false)
const generating = ref(false)
const rawstring = ref('')
const generatedText = ref('')

let suppressDocumentSync = false
let commitOutlineTimer: NodeJS.Timeout | null = null

const commitOutline = async (outline?: DocumentOutlineNode) => {
  const tabId = activeTabId.value
  if (!tabId) return
  const snapshot = cloneOutline(outline ?? treeData.value)

  // 使用 withAutoOutlineSyncSuppressed 防止死循环：
  // 从大纲生成文本 -> 自动提取大纲 -> 触发 watch -> 再次生成文本
  await withAutoOutlineSyncSuppressed(async () => {
    suppressDocumentSync = true
    try {
      updateDocumentOutline(tabId, snapshot)
      // 只有在当前视图确实是outline时才更新lastView，避免切换Tab时自动跳转到outline
      const currentView = workspace.ensureDocument(tabId).lastView
      if (currentView === 'outline') {
        updateDocumentLastView(tabId, 'outline')
      }
      // 使用适配器按不同格式同步正文文本
      const doc = activeDocument.value
      const format = doc?.format ?? 'md'
      const adapter = getOutlineAdapter(format as any)
      if (format === 'tex') {
        const nextTex = await adapter.toText(snapshot, doc?.tex ?? '')
        workspace.updateDocumentTex(tabId, nextTex)
      } else {
        const nextMd = await adapter.toText(snapshot, doc?.markdown ?? '')
        updateDocumentMarkdown(tabId, nextMd)
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
const parallelChildren = ref<Array<Ref<string>>>([]) // 用于存储并行生成的子节点
const batchItemsRef = ref<BatchAcceptItem[]>([]) // 批量任务项（含 backup、rawContentRef），用于接受/拒绝
const userPrompt = ref('') // 用户输入的提示词

function getBatchItemContent(refOrVal: Ref<string> | string): string {
  return typeof refOrVal === 'object' && refOrVal && 'value' in refOrVal ? refOrVal.value : String(refOrVal ?? '')
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

// 监听主题变化：同步连接线颜色
watch(
  () => themeState.currentTheme,
  () => scheduleForceOutlineLinkStyles(),
  { deep: true }
)

// 树数据变化后库会重绘连接线（D3 会再次设 opacity 0→1），需重新强制为不透明
watch(treeData, () => scheduleForceOutlineLinkStyles(), { deep: true })

// 文档大纲与编辑器/AI 同步：当文档内容变化（编辑或 AI 生成）导致 outline 更新时，刷新树以保持一致
watch(
  () => activeDocument.value?.outline,
  (newOutline) => {
    if (newOutline) {
      treeData.value = cloneOutline(newOutline)
    }
  },
  { deep: true }
)

// 加载保存的方向设置
onMounted(async () => {
  const savedDirection = await getSetting('outline.direction', 'horizontal')
  direction.value = savedDirection as 'horizontal' | 'vertical'
  updateTreeConfig(direction.value)

  // 加载 AI 配置默认值
  const savedAiConfig = await getSetting('outline.aiConfig', null)
  if (savedAiConfig) {
    Object.assign(aiConfig, savedAiConfig)
  }
  // 树绘制后强制连接线不透明，覆盖 D3 的 opacity 动画
  scheduleForceOutlineLinkStyles()
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
const selectedAiTool = ref<string | null>(null)
const wordCountInput = ref('')
const selectedPresetPrompt = ref('')

// 切换 AI 工具：已选中则取消，否则选中；选中时折叠已展开的编辑节点面板
function toggleAiTool(
  tool:
    | 'generateChildren'
    | 'generateContent'
    | 'generateChildrenChildren'
    | 'generateChildrenContent'
) {
  const wasSelected = selectedAiTool.value === tool
  selectedAiTool.value = wasSelected ? null : tool
  if (!wasSelected && selectedAiTool.value) {
    // 折叠已展开的编辑节点面板
    editingNodePath.value = null
  }
}

// 处理节点按钮点击：打开配置对话框并登记“确定”后要执行的 AI 动作
const handleNodeButtonClick = (node: DocumentOutlineNode) => {
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
  { label: t('outline.aiConfig.presets.abridge'), value: t('outline.aiConfig.presets.abridgeValue') },
  { label: t('outline.aiConfig.presets.polish'), value: t('outline.aiConfig.presets.polishValue') },
  {
    label: t('outline.aiConfig.presets.combineStructure'),
    value: t('outline.aiConfig.presets.combineStructureValue')
  },
  { label: t('outline.aiConfig.presets.detailed'), value: t('outline.aiConfig.presets.detailedValue') },
  { label: t('outline.aiConfig.presets.concise'), value: t('outline.aiConfig.presets.conciseValue') },
  { label: t('outline.aiConfig.presets.academic'), value: t('outline.aiConfig.presets.academicValue') }
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

// 打开节点右键菜单
const openNodeContextMenu = (e: MouseEvent, node: DocumentOutlineNode) => {
  e.preventDefault()
  selectedNode.value = node
  nodeContextMenuPath.value = node.path
  nodeContextMenuPosition.value = { x: e.clientX, y: e.clientY }
}

// 关闭节点右键菜单
const closeNodeContextMenu = () => {
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
    case 'delete':
      deleteNode()
      break
  }
}

// 点击其他地方关闭右键菜单
onMounted(() => {
  document.addEventListener('click', closeNodeContextMenu)
})
onUnmounted(() => {
  document.removeEventListener('click', closeNodeContextMenu)
})

// 节点相关操作
const move2Left = () => {
  const node = selectedNode.value
  if (!node) return
  const result = moveNodeLeft(node, treeData.value)
  if (result) {
    treeData.value = result.tree
    selectedNode.value = result.movedNode
    commitOutline()
  }
}

const move2Right = () => {
  const node = selectedNode.value
  if (!node) return
  const result = moveNodeRight(node, treeData.value)
  if (result) {
    treeData.value = result.tree
    selectedNode.value = result.movedNode
    commitOutline()
  }
}

const addChildNode = () => {
  const node = selectedNode.value
  if (!node) return
  const result = addChild(node, treeData.value)
  if (result) {
    treeData.value = result.tree
    selectedNode.value = result.newNode
    editNodeValue.value = result.newNode.title
    currentChapterValue.value = result.newNode.title
    currentChapterContent.value = result.newNode.text || ''
    editValueDialogVisible.value = true
    commitOutline()
  }
}

const editNode = () => {
  const node = selectedNode.value
  if (!node) return
  editNodeValue.value = node.title
  currentChapterValue.value = node.title
  currentChapterContent.value = node.text || ''
  editValueDialogVisible.value = true
}

const deleteNode = () => {
  const node = selectedNode.value
  if (!node) return
  ElMessageBox.confirm(t('outline.deleteConfirm'), t('outline.warning'), {
    confirmButtonText: t('outline.confirm'),
    cancelButtonText: t('outline.cancel'),
    type: 'warning'
  })
    .then(() => {
      const result = removeNodeAndReindex(node, treeData.value)
      if (result) {
        treeData.value = result
        selectedNode.value = null
        commitOutline()
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
  workspace.lockUI?.()
  generateChildChapterLoading.value = true
  generating.value = true
  rawstring.value = ''
  try {
    const node = selectedNode.value
    if (!node) throw new Error('未选择节点')
    const currentNode = searchNode(node.path, treeData.value)
    if (!currentNode) throw new Error('节点不存在')

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
    workspace.unlockUI?.()
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
  selectedNode.value = node
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
const onNodeDragStart = (node: DocumentOutlineNode) => {
  draggingNodePath.value = node.path
  isDraggingNode.value = true
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
  const mode = computeDropMode(e, el)

  // 保存待更新的值
  pendingDropPreviewUpdate = { targetPath: node.path, mode }

  // 如果定时器不存在，立即更新并设置定时器
  if (!dropPreviewThrottleTimer) {
    dropPreview.targetPath = node.path
    dropPreview.mode = mode
    // 使用节流，每 50ms 最多更新一次，减少重新渲染频率
    dropPreviewThrottleTimer = setTimeout(() => {
      dropPreviewThrottleTimer = null
      // 应用最后一次待更新的值
      if (pendingDropPreviewUpdate) {
        dropPreview.targetPath = pendingDropPreviewUpdate.targetPath
        dropPreview.mode = pendingDropPreviewUpdate.mode
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
  dropPreview.targetPath = null
  dropPreview.mode = null
}
const onNodeDrop = (targetNode: DocumentOutlineNode, e: DragEvent) => {
  try {
    // 清除节流定时器
    if (dropPreviewThrottleTimer) {
      clearTimeout(dropPreviewThrottleTimer)
      dropPreviewThrottleTimer = null
    }
    pendingDropPreviewUpdate = null

    const fromPath = draggingNodePath.value
    draggingNodePath.value = null
    const mode = dropPreview.mode
    dropPreview.targetPath = null
    dropPreview.mode = null
    isDraggingNode.value = false
    if (!fromPath) return
    if (fromPath === targetNode.path || !mode) return
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
      return
    }

    // 拖动操作完成后恢复同步并提交更改
    if (suppressDocumentSync) {
      suppressDocumentSync = false
      commitOutline()
    }
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
  dropPreview.targetPath = null
  dropPreview.mode = null
  isDraggingNode.value = false
  // 移除 body 上的 class
  document.body.classList.remove('outline-dragging')
  // 拖动结束时恢复同步并提交更改
  if (suppressDocumentSync) {
    suppressDocumentSync = false
    commitOutline()
  }
}
const dropPreview = ref<{ targetPath: string | null; mode: string | null }>({
  targetPath: null,
  mode: null
})
const textElementRefs = ref<Record<string, HTMLElement>>({})
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
const editValueDialogVisible = ref(false)
const changeNodeValue = () => {
  const selected = selectedNode.value
  if (!selected) return
  const curNode = searchNode(selected.path, treeData.value)
  if (!curNode) return
  curNode.title = currentChapterValue.value
  curNode.text = currentChapterContent.value
  editValueDialogVisible.value = false
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

    // 手动提交更改
    await commitOutline(modifiedTree)

    formatTitleDialogVisible.value = false
    eventBus.emit('show-success', t('outline.formatSuccess'))
  } finally {
    // 恢复同步状态
    suppressDocumentSync = prevSync
  }
}
const generateContent = async () => {
  workspace.lockUI?.()
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
    workspace.unlockUI?.()
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
    workspace.unlockUI?.()
  }
  eventBus.emit('show-success', t('outline.generateChapterSuccess'))
}
const generateChildrenContent = async () => {
  workspace.lockUI?.()
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
    workspace.unlockUI?.()
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
    workspace.unlockUI?.()
  }
}
const generateChildrenChildren = async () => {
  workspace.lockUI?.()
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
    workspace.unlockUI?.()
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
    workspace.unlockUI?.()
  }
}

// Provide AI toolbar dependencies to child components
provide('outlineSelectedAiTool', selectedAiTool)
provide('outlineToggleAiTool', toggleAiTool)
provide('outlineFormatTitle', formatTitle)
provide('outlineHandleNodeButtonClick', handleNodeButtonClick)
</script>

<style scoped>
.outline-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* 无限画布视口系统 */
.outline-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.outline-viewport.is-dragging {
  cursor: default;
}

/* vue-tree 填满视口，缩放与拖拽由库内置处理 */
.outline-viewport-tree {
  width: 100%;
  height: 100%;
}

.outline-tree-inner {
  width: 100%;
  height: 100%;
  /* 覆盖 vue-tree 内部的 overflow 限制，防止内容被截断 */
  overflow: visible !important;
  /* 容器本身透明 */
  background: transparent !important;
}

/* 覆盖 vue-tree 内部的 tree-container 样式 */
.outline-tree-inner :deep(.tree-container) {
  overflow: visible !important;
  width: 100% !important;
  height: 100% !important;
  /* 容器本身透明 */
  background: transparent !important;
}

/* 覆盖 vue-tree 内部的 dom-container 和 svg 尺寸限制 */
.outline-tree-inner :deep(.dom-container),
.outline-tree-inner :deep(.vue-tree) {
  width: 100% !important;
  height: 100% !important;
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
.outline-viewport .outline-tree-inner:not(.outline-theme-dark) :deep(.tree-container .link),
.outline-viewport .outline-tree-inner:not(.outline-theme-dark) :deep(.tree-container path.link) {
  stroke: #9ca3af !important;
}
.outline-viewport .outline-tree-inner.outline-theme-dark :deep(.tree-container .link),
.outline-viewport .outline-tree-inner.outline-theme-dark :deep(.tree-container path.link) {
  stroke: #e0e0e0 !important;
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

/* 接受/接受全部：成功绿色，避免暗色下白底白字 */
.generate-preview-accept-btn {
  background: var(--el-color-success) !important;
  border-color: var(--el-color-success) !important;
  color: #fff !important;
}
.generate-preview-accept-btn:hover {
  background: var(--el-color-success-light-3) !important;
  border-color: var(--el-color-success-light-3) !important;
  color: #fff !important;
}

.tree-node {
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

/* 折叠且有子节点的节点：左侧竖线 + 轻微背景区分，便于识别可展开 */
.tree-node--collapsed-with-children {
  border-left: 3px solid v-bind('themeState.currentTheme.primaryColor');
  border-radius: 0 8px 8px 0;
  padding-left: 6px;
}
.tree-node--collapsed-with-children .children-count-badge {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3);
}

/* 子节点数量 badge - 显示在节点文字前 */
.children-count-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
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
