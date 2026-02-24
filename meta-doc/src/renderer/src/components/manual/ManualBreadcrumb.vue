<template>
  <div class="manual-breadcrumb">
    <Breadcrumb separator="/">
      <BreadcrumbItemComponent
        v-for="(item, index) in breadcrumbHistory"
        :key="item.articleId"
        :class="{ 'is-current': index === breadcrumbHistory.length - 1 }"
      >
        <span
          v-if="index < breadcrumbHistory.length - 1"
          class="breadcrumb-link"
          @click="handleClick(item.articleId)"
        >
          {{ item.title }}
        </span>
        <span v-else>{{ item.title }}</span>
      </BreadcrumbItemComponent>
    </Breadcrumb>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserManual } from '../../stores/userManual'
import type { BreadcrumbItem } from '../../manuals/types'
import {
  Breadcrumb,
  BreadcrumbItem as BreadcrumbItemComponent
} from '@renderer/components/ui/breadcrumb'

const { breadcrumbHistory, setCurrentArticle } = useUserManual()

const handleClick = (articleId: string) => {
  setCurrentArticle(articleId, 'breadcrumb')
}
</script>

<style scoped>
.manual-breadcrumb {
  padding: 12px 24px;
  border-bottom: 1px solid v-bind('themeState.currentTheme.borderColor || "rgba(0,0,0,0.1)"');
  background-color: v-bind('themeState.currentTheme.background2nd');
}

.manual-breadcrumb :deep(li) {
  font-size: 14px;
}

.manual-breadcrumb :deep(li.is-current) {
  color: v-bind('themeState.currentTheme.textColor');
  font-weight: 500;
}

.breadcrumb-link {
  color: v-bind('themeState.currentTheme.textColor2 || "rgba(0,0,0,0.6)"');
  text-decoration: none;
  transition: color 0.2s;
  cursor: pointer;
}

.breadcrumb-link:hover {
  color: v-bind('themeState.currentTheme.primaryColor || "#409EFF"');
}
</style>

<script lang="ts">
import { themeState } from '../../utils/themes'
export { themeState }
</script>
