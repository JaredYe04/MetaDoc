<template>
  <div class="meta-panel" :style="panelStyle">
    <el-scrollbar class="meta-panel__scroll" wrap-class="meta-panel__scroll-wrap">
      <div class="meta-panel__content">
        <div class="meta-panel__header">
          <el-tooltip :content="$t('article.edit_meta_info')" placement="left">
            <h1
              class="meta-panel__title interactive-text"
              @click="metaDialogVisible = true"
              :style="{ color: themeState.currentTheme.textColor }"
            >
              {{ $t('article.meta_info') }}
            </h1>
          </el-tooltip>
        </div>

        <div
          class="meta-panel__item interactive-text"
          role="button"
          tabindex="0"
          @click="titleAssistantVisible = true"
          @keydown.enter.prevent="titleAssistantVisible = true"
          @keydown.space.prevent="titleAssistantVisible = true"
        >
          <span class="meta-panel__label" :style="{ color: themeState.currentTheme.textColor }">{{ $t('article.title') }}：</span>
          <span class="meta-panel__value" :style="{ color: themeState.currentTheme.textColor }">{{ meta.title || $t('article.no_title') }}</span>
        </div>

        <div
          class="meta-panel__item interactive-text"
          role="button"
          tabindex="0"
          @click="authorAssistantVisible = true"
          @keydown.enter.prevent="authorAssistantVisible = true"
          @keydown.space.prevent="authorAssistantVisible = true"
        >
          <span class="meta-panel__label" :style="{ color: themeState.currentTheme.textColor }">{{ $t('article.author') }}：</span>
          <span class="meta-panel__value" :style="{ color: themeState.currentTheme.textColor }">{{ meta.author || $t('article.no_author') }}</span>
        </div>

        <div
          class="meta-panel__item interactive-text"
          role="button"
          tabindex="0"
          @click="descriptionAssistantVisible = true"
          @keydown.enter.prevent="descriptionAssistantVisible = true"
          @keydown.space.prevent="descriptionAssistantVisible = true"
        >
          <span class="meta-panel__label" :style="{ color: themeState.currentTheme.textColor }">{{ $t('article.description') }}：</span>
          <span class="meta-panel__value" :style="{ color: themeState.currentTheme.textColor }">{{ meta.description || $t('article.no_description') }}</span>
        </div>

        <div class="meta-panel__item meta-panel__item--keywords">
          <span
            class="meta-panel__label meta-panel__label--keywords"
            :style="{ color: themeState.currentTheme.textColor }"
            role="button"
            tabindex="0"
            :aria-busy="keywordsGenerating"
            @click="handleKeywordsGenerate"
            @keydown.enter.prevent="handleKeywordsGenerate"
            @keydown.space.prevent="handleKeywordsGenerate"
          >
            {{ $t('article.keywords') }}：
            <el-icon v-if="keywordsGenerating" class="meta-keywords__icon" :size="14">
              <Loading />
            </el-icon>
          </span>
          <div class="meta-panel__value meta-panel__value--keywords">
            <KeywordInput
              :model-value="meta.keywords || []"
              :placeholder="$t('article.keywords_placeholder')"
              @update:modelValue="emitUpdate({ keywords: $event })"
            />
            <p v-if="!(meta.keywords && meta.keywords.length)" class="meta-keywords__empty" :style="{ color: themeState.currentTheme.textColor }">
              {{ $t('article.no_keywords') }}
            </p>
          </div>
        </div>

        <MetaFieldAssistant
          v-if="titleAssistantVisible"
          :visible="titleAssistantVisible"
          :prompt="generateTitlePrompt(outlineJson)"
          :title="$t('article.generate_title')"
          :default-value="meta.title || ''"
          :default-input-size="1"
          @accept="(value) => emitUpdate({ title: normalizeStringValue(value) })"
          @update:visible="titleAssistantVisible = $event"
        />

        <MetaFieldAssistant
          v-if="authorAssistantVisible"
          :visible="authorAssistantVisible"
          :prompt="''"
          :title="$t('article.modify_author')"
          :default-value="meta.author || ''"
          :auto-generate="false"
          :allow-generate="false"
          :default-input-size="1"
          @accept="(value) => emitUpdate({ author: normalizeStringValue(value) })"
          @update:visible="authorAssistantVisible = $event"
        />

        <MetaFieldAssistant
          v-if="descriptionAssistantVisible"
          :visible="descriptionAssistantVisible"
          :prompt="generateDescriptionPrompt(outlineJson)"
          :title="$t('article.generate_description')"
          :default-value="meta.description || ''"
          :default-input-size="10"
          @accept="(value) => emitUpdate({ description: normalizeStringValue(value) })"
          @update:visible="descriptionAssistantVisible = $event"
        />

        <el-dialog v-model="metaDialogVisible" :title="$t('article.edit_meta_info')" width="30%">
          <el-form>
            <el-form-item :label="$t('article.title')">
              <el-input v-model="formState.title" autocomplete="off" class="aero-input" />
            </el-form-item>
            <el-form-item :label="$t('article.author')">
              <el-input v-model="formState.author" autocomplete="off" class="aero-input" />
            </el-form-item>
            <el-form-item :label="$t('article.description')">
              <el-input
                type="textarea"
                v-model="formState.description"
                autocomplete="off"
                resize="none"
                :autoSize="{ minRows: 3, maxRows: 5 }"
                class="aero-input"
              />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="metaDialogVisible = false" :style="{ color: themeState.currentTheme.textColor }">{{ $t('common.cancel') }}</el-button>
            <el-button type="primary" @click="commitForm" :style="{ color: themeState.currentTheme.textColor }">{{ $t('common.confirm') }}</el-button>
          </template>
        </el-dialog>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElIcon, ElMessage, ElMessageBox } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import { themeState, mixColors } from '../utils/themes';
import { generateDescriptionPrompt, generateKeywordsPrompt, generateTitlePrompt, wholeArticleContextPrompt } from '../utils/prompts';
import type { ArticleMetaData, AIDialogMessage } from '../../../types';
import MetaFieldAssistant from './MetaFieldAssistant.vue';
import KeywordInput from './KeywordInput.vue';
import { createAiTask, ai_types } from '../utils/ai_tasks';
import { getSetting } from '../utils/settings';
import { extractOuterJsonString } from '../utils/regex-utils';

const props = defineProps<{
  meta: ArticleMetaData;
  markdown?: string | null;
  latex?: string | null;
  outlineJson: string;
}>();

const emit = defineEmits<{
  (e: 'update-meta', patch: Partial<ArticleMetaData>): void;
}>();

const { t } = useI18n();

const metaDialogVisible = ref(false);
const titleAssistantVisible = ref(false);
const authorAssistantVisible = ref(false);
const descriptionAssistantVisible = ref(false);
const keywordsGenerating = ref(false);

const formState = reactive({
  title: '',
  author: '',
  description: '',
});

const panelStyle = computed(() => {
  const textColor = themeState.currentTheme.textColor;
  const muted = mixColors(themeState.currentTheme.background2nd, textColor, 0.4);
  return {
    backgroundColor: themeState.currentTheme.background2nd,
    color: textColor,
    '--meta-text-color': textColor,
    '--meta-muted-color': muted,
  };
});

watch(
  () => props.meta,
  (meta) => {
    formState.title = meta.title || '';
    formState.author = meta.author || '';
    formState.description = meta.description || '';
  },
  { immediate: true, deep: true },
);

const emitUpdate = (patch: Partial<ArticleMetaData>) => {
  emit('update-meta', patch);
};

const normalizeStringValue = (value: string | string[]): string => {
  return Array.isArray(value) ? value.join(' ') : value;
};

const sanitizeKeywords = (keywords: string[]): string[] => {
  const unique = new Set<string>();
  keywords.forEach((item) => {
    const trimmed = String(item).trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  });
  return Array.from(unique);
};

const parseKeywordsResult = (raw: string): string[] => {
  const jsonString = extractOuterJsonString(raw);
  if (!jsonString) {
    return [];
  }
  try {
    const parsed = JSON.parse(jsonString);
    const payload = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { keywords?: unknown[] })?.keywords)
        ? (parsed as { keywords: unknown[] }).keywords
        : [];
    return sanitizeKeywords(payload.map((item) => String(item ?? '')));
  } catch {
    return [];
  }
};

const handleKeywordsGenerate = async () => {
  if (keywordsGenerating.value) return;
  keywordsGenerating.value = true;
  const previousKeywords = [...(props.meta.keywords || [])];
  const rawResult = ref('');
  try {
    // 构建消息数组，将 prompt 转换为对话格式
    const messages: AIDialogMessage[] = [];
    const prompt = generateKeywordsPrompt(props.outlineJson);
    
    // 如果有现有关键词，在 prompt 中添加上下文信息
    const currentKeywords = props.meta.keywords || [];
    let userPrompt = prompt;
    if (currentKeywords.length > 0) {
      userPrompt = prompt + `\n\n**现有关键词：**${JSON.stringify(currentKeywords)}\n\n请基于上述现有关键词进行补充或优化。`;
    }
    
    messages.push({
      role: 'user',
      content: userPrompt,
    });
    
    const { done } = createAiTask(
      t('article.generate_keywords'),
      messages,
      rawResult,
      ai_types.chat,
      'meta-keywords',
      { stream: true },
    );
    await done;
    const nextKeywords = parseKeywordsResult(rawResult.value);
    if (!nextKeywords.length) {
      throw new Error(t('article.generate_keywords_parse_error'));
    }
    emitUpdate({ keywords: nextKeywords });
    ElMessage.success(t('article.apply_keywords_success'));
  } catch (error) {
    emitUpdate({ keywords: previousKeywords });
    const message =
      error instanceof Error ? error.message : t('article.generate_keywords_failed');
    ElMessage.error(message);
  } finally {
    keywordsGenerating.value = false;
  }
};

const commitForm = () => {
  emitUpdate({
    title: formState.title,
    author: formState.author,
    description: formState.description,
  });
  metaDialogVisible.value = false;
};
</script>

<style scoped>
.meta-panel {
  width: 100%;
  height: 100%;
  padding: 14px;
  border-radius: 10px;
  color: var(--meta-text-color);
  box-sizing: border-box;
  margin: 0;
  overflow: hidden;
}

.meta-panel__scroll {
  width: 100%;
  height: 100%;
}

.meta-panel__scroll :deep(.el-scrollbar__wrap) {
  max-height: 100%;
}

.meta-panel__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-panel__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}

.meta-panel__title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.meta-panel__item {
  display: flex;
  gap: 10px;
  font-size: 15px;
  line-height: 1.6;
  cursor: pointer;
  padding: 6px 0;
}

.meta-panel__label {
  font-weight: 600;
  min-width: 64px;
}

.meta-panel__value {
  flex: 1;
  text-align: left;
  word-break: break-word;
}

.meta-panel__item--keywords {
  align-items: flex-start;
}

.meta-panel__label--keywords {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-panel__label--keywords[aria-busy='true'] {
  cursor: progress;
  opacity: 0.8;
}

.meta-panel__value--keywords {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-keywords__icon {
  color: var(--meta-muted-color);
}

.meta-keywords__empty {
  font-size: 13px;
  opacity: 0.7;
  margin: 0;
}
</style>

