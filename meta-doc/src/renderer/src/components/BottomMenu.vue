<template>
    <div class="bottom-menu" :style="{
        background:themeState.currentTheme.background,
        color:themeState.currentTheme.textColor}"
        style="display: flex; justify-content: space-between; align-items: center; height: 100%; padding: 0 12px; font-size: 12px;">
        <span>{{ $t('bottomMenu.wordCount') }} {{ wordCount }}</span>
        <span>{{ $t('bottomMenu.currentFile') }}{{ current_file_path ? current_file_path :  $t('bottomMenu.newFile') }}</span>
        <el-tooltip :content="$t('bottomMenu.aiTaskQueueTooltip')" placement="left">
            <span class="ai-task-menu" @click.prevent="eventBus.emit('toggle-ai-task-queue')">
                <img :src="themeState.currentTheme.AiLogo" alt="AI" style="width: 18px; height: 18px; " />
                <span v-if="tasks.length > 0" style="margin-left: 4px; font-weight: bold;"
                    :style="{color:themeState.currentTheme.textColor}"
                    >{{ tasks.length }}</span>
            </span>
        </el-tooltip>

    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { current_article, current_file_path } from '../utils/common-data'
import eventBus from '../utils/event-bus'
import { themeState } from '../utils/themes'


//wordCount计算当前文章的字数，通过监听current_article.value的变化来实现
const wordCount = computed(() => {
    if (current_article.value) {
        return current_article.value ? current_article.value.trim().length : 0
    }
    return 0
})

import { useI18n } from 'vue-i18n'
import { Loading } from '@element-plus/icons-vue'
import { useAiTasks } from '../utils/ai_tasks'
const { t } = useI18n()
const tasks = useAiTasks()
</script>
<style scoped>
.bottom-menu {
    height: 30px;
    width: 100%;
    border: 1px solid #cccccc44;
    /*字体加粗 */
    font-weight: bold;
}

.ai-task-menu {
    cursor: pointer;
    color: #000000;
    height: 100%;
    width: 30px;
    margin-right: 5%;
    /*内容在中间对齐 */
    align-items: center;
    justify-content: center;
    justify-items: center;
    display: flex;
    transition: color 0.1s;
    /*鼠标悬停时背景有变灰效果 */
    user-select: none;

    &:hover {
        background-color: #b6b6b7;

        /* 鼠标点击时有变暗效果 */
        &:active {
            background-color: #8e8e8e;
        }
    }

}
</style>