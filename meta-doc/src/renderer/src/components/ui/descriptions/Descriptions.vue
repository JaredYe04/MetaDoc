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
        <tr
          v-for="(row, rowIndex) in computedRows"
          :key="rowIndex"
          class="descriptions__row"
        >
          <template v-for="(item, itemIndex) in row" :key="itemIndex">
            <td
              :class="
                cn(
                  'descriptions__cell descriptions__cell--label',
                  border && 'descriptions__cell--border descriptions__cell--border-label'
                )
              "
            >
              <span class="descriptions__label-text">{{ item.label }}</span>
            </td>
            <td
              :class="
                cn(
                  'descriptions__cell descriptions__cell--content',
                  border && 'descriptions__cell--border descriptions__cell--border-content'
                )
              "
              :colspan="item.span"
            >
              <div class="descriptions__content-wrapper">
                <slot :name="item.slotName" v-bind="item">
                  <span class="descriptions__content-text">{{ item.content }}</span>
                </slot>
              </div>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed, provide, ref } from 'vue'
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

// Provide props to child items
provide('descriptionsBorder', computed(() => props.border))
provide('descriptionsColumn', computed(() => props.column))
provide('descriptionsSize', computed(() => props.size))

// Reactive items list from registered DescriptionsItem components
const items = ref([])

// Register/unregister functions provided to children
provide('registerDescriptionsItem', (item) => {
  items.value.push(item)
})

provide('unregisterDescriptionsItem', (item) => {
  const index = items.value.indexOf(item)
  if (index > -1) {
    items.value.splice(index, 1)
  }
})

// Compute rows based on column count and item spans
const computedRows = computed(() => {
  const rows = []
  let currentRow = []
  let currentColSpan = 0
  const maxCols = Math.max(1, props.column)

  items.value.forEach((item) => {
    const itemSpan = Math.min(item.span || 1, maxCols)

    // Check if item fits in current row
    if (currentColSpan + itemSpan > maxCols && currentRow.length > 0) {
      // Start new row
      rows.push(currentRow)
      currentRow = []
      currentColSpan = 0
    }

    currentRow.push({
      ...item,
      span: itemSpan
    })
    currentColSpan += itemSpan

    // If row is full, push it and reset
    if (currentColSpan >= maxCols) {
      rows.push(currentRow)
      currentRow = []
      currentColSpan = 0
    }
  })

  // Push remaining items
  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  return rows
})
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
  background-color: var(--descriptions-item-bordered-label-background, var(--sidebar-bg, var(--el-fill-color-light, #f5f7fa)));
  color: var(--descriptions-item-bordered-label-color, var(--sidebar-text, var(--el-text-color-regular, #606266)));
  border: 1px solid var(--el-border-color, #e5e7eb);
  border-right: none;
}

.descriptions--border .descriptions__cell--content {
  padding: 12px 16px;
  background-color: var(--descriptions-item-bordered-content-background, var(--background2nd, var(--el-bg-color, #ffffff)));
  color: var(--descriptions-item-bordered-content-color, var(--textColor, var(--el-text-color-primary, #303133)));
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
