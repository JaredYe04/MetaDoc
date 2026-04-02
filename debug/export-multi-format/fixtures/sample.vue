<template>
  <div class="app">
    <p>{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const message = ref('fixture')
</script>

<style scoped>
.app {
  padding: 8px;
}
</style>
