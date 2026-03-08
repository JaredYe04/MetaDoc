<template>
  <div
    :class="
      cn(
        'descriptions',
        border && 'descriptions--border',
        size === 'small' && 'descriptions--small',
        size === 'large' && 'descriptions--large',
        $attrs.class ?? ''
      )
    "
    :data-column="column"
  >
    <table class="descriptions__table">
      <tbody>
        <!-- 直接渲染默认 slot，使 DescriptionsItem 挂载并各渲染一行，避免 register 模式下子组件未挂载导致 tbody 为空 -->
        <slot />
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { provide, computed } from 'vue'
import { cn } from '../../../lib/utils'

defineOptions({
  inheritAttrs: false,
  name: 'Descriptions'
})

const props = defineProps({
  column: {
    type: Number,
    default: 1
  },
  size: {
    type: String,
    default: 'default',
    validator: (value) => ['small', 'default', 'large'].includes(value)
  },
  border: {
    type: Boolean,
    default: false
  }
})

provide(
  'descriptionsBorder',
  computed(() => props.border)
)
provide(
  'descriptionsColumn',
  computed(() => props.column)
)
provide(
  'descriptionsSize',
  computed(() => props.size)
)
</script>

<style scoped>
.descriptions {
  width: 100%;
  font-size: 14px;
  line-height: 1.5715;
  color: var(--textColor, var(--el-text-color-primary, #303133));
}

.descriptions__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.descriptions__row {
  vertical-align: top;
}

.descriptions__cell {
  padding: 0;
  vertical-align: top;
  box-sizing: border-box;
}

.descriptions__cell--label {
  font-weight: 500;
  color: var(--sidebar-text, var(--el-text-color-regular, #606266));
  padding: 8px 16px 8px 0;
  width: 120px;
  min-width: 120px;
}

.descriptions__cell--content {
  padding: 8px 0;
  word-break: break-word;
  color: var(--textColor, var(--el-text-color-primary, #303133));
}

.descriptions__label-text {
  display: inline-block;
}

.descriptions__content-wrapper {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

/* Bordered mode */
.descriptions--border .descriptions__cell--label {
  padding: 12px 16px;
  background-color: var(
    --descriptions-item-bordered-label-background,
    var(--sidebar-bg, var(--el-fill-color-light, #f5f7fa))
  );
  color: var(
    --descriptions-item-bordered-label-color,
    var(--sidebar-text, var(--el-text-color-regular, #606266))
  );
  border: 1px solid var(--el-border-color, #e5e7eb);
  border-right: none;
}

.descriptions--border .descriptions__cell--content {
  padding: 12px 16px;
  background-color: var(
    --descriptions-item-bordered-content-background,
    var(--background2nd, var(--el-bg-color, #ffffff))
  );
  color: var(
    --descriptions-item-bordered-content-color,
    var(--textColor, var(--el-text-color-primary, #303133))
  );
  border: 1px solid var(--el-border-color, #e5e7eb);
}

.descriptions--border .descriptions__row:not(:first-child) .descriptions__cell--label,
.descriptions--border .descriptions__row:not(:first-child) .descriptions__cell--content {
  border-top: none;
}

/* Small size */
.descriptions--small {
  font-size: 12px;
}

.descriptions--small .descriptions__cell--label {
  padding: 6px 12px 6px 0;
  width: 100px;
  min-width: 100px;
}

.descriptions--small .descriptions__cell--content {
  padding: 6px 0;
}

.descriptions--small.descriptions--border .descriptions__cell--label,
.descriptions--small.descriptions--border .descriptions__cell--content {
  padding: 8px 12px;
}

/* Large size */
.descriptions--large {
  font-size: 16px;
}

.descriptions--large .descriptions__cell--label {
  padding: 12px 20px 12px 0;
  width: 140px;
  min-width: 140px;
}

.descriptions--large .descriptions__cell--content {
  padding: 12px 0;
}

.descriptions--large.descriptions--border .descriptions__cell--label,
.descriptions--large.descriptions--border .descriptions__cell--content {
  padding: 16px 20px;
}

/* Dark mode support */
:global(.dark) .descriptions__cell--label {
  color: var(--sidebar-text, var(--el-text-color-secondary, #a0aec0));
}

:global(.dark) .descriptions__cell--content {
  color: var(--textColor, var(--el-text-color-primary, #e5e7eb));
}

:global(.dark).descriptions--border .descriptions__cell--label {
  background-color: var(--sidebar-bg, var(--el-fill-color-light, #374151));
  border-color: var(--el-border-color, #4b5563);
}

:global(.dark).descriptions--border .descriptions__cell--content {
  background-color: var(--background2nd, var(--el-bg-color, #1f2937));
  border-color: var(--el-border-color, #4b5563);
}
</style>
