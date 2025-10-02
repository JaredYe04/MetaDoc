<script setup >
import MarkdownEditor from './MarkdownEditor.vue';
import LaTeXEditor from './LaTeXEditor.vue';
import { current_format } from '../utils/common-data';


</script>

<template>
    <!-- <keep-alive>
        <MarkdownEditor v-show="current_format=='md'" />
    </keep-alive>
    <keep-alive>
        <LaTeXEditor v-show="current_format=='tex'" />
    </keep-alive> -->
    <MarkdownEditor v-if="current_format=='md'" />
    <LaTeXEditor v-if="current_format=='tex'" />

</template>