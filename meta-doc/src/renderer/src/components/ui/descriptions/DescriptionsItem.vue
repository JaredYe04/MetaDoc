<script setup>
import { inject, computed } from 'vue'
import { cn } from '../../../lib/utils'

defineOptions({
  name: 'DescriptionsItem'
})

const props = defineProps({
  label: {
    type: String,
    default: ''
  },
  span: {
    type: Number,
    default: 1
  },
  content: {
    type: String,
    default: ''
  }
})

const border = inject('descriptionsBorder', computed(() => false))
const size = inject('descriptionsSize', computed(() => 'default'))
</script>

<template>
  <tr class="descriptions__row">
    <td
      :class="
        cn(
          'descriptions__cell descriptions__cell--label',
          border && 'descriptions__cell--border descriptions__cell--border-label'
        )
      "
    >
      <span class="descriptions__label-text">{{ label }}</span>
    </td>
    <td
      :class="
        cn(
          'descriptions__cell descriptions__cell--content',
          border && 'descriptions__cell--border descriptions__cell--border-content'
        )
      "
      :colspan="span"
    >
      <div class="descriptions__content-wrapper">
        <slot>
          <span class="descriptions__content-text">{{ content }}</span>
        </slot>
      </div>
    </td>
  </tr>
</template>
