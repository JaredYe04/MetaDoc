<template>
  <div class="about">
    <!-- <h2>{{ $t('about.aboutUs') }}</h2> -->
    <p>{{ $t('about.content') }}</p>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<style scoped>
.about {
  padding: 20px;
}
</style>
