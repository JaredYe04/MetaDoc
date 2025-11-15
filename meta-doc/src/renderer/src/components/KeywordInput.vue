<template>
  <el-select
    class="keyword-input"
    v-model="internalValue"
    multiple
    filterable
    allow-create
    default-first-option
    :placeholder="placeholder"
    @change="handleChange"
  >
    <el-option
      v-for="keyword in internalValue"
      :key="keyword"
      :label="keyword"
      :value="keyword"
    />
  </el-select>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElSelect, ElOption } from 'element-plus';

const props = withDefaults(defineProps<{
  modelValue: string[];
  placeholder?: string;
}>(), {
  modelValue: () => [],
  placeholder: '',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

const internalValue = ref<string[]>([...props.modelValue]);

watch(
  () => props.modelValue,
  (value) => {
    internalValue.value = [...value];
  },
  { deep: true },
);

const sanitizeKeywords = (value: string[]): string[] => {
  const unique = new Set<string>();
  value.forEach((item) => {
    const trimmed = item.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  });
  return Array.from(unique);
};

const handleChange = (value: string[]) => {
  const nextValue = sanitizeKeywords(value);
  internalValue.value = [...nextValue];
  emit('update:modelValue', nextValue);
};
</script>

<style scoped>
.keyword-input {
  width: 90%;
}
</style>

