<template>
    <el-card :body-style="{ padding: '10px' }" style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>{{ task.name.length>20?task.name.substring(0,20)+'...':task.name }}</strong><br />
                状态：{{ task.status }}
            </div>
            <div style="display: flex; gap: 6px;">
                <el-button size="small" type="success" v-if="task.status === '就绪'" circle
                    @click="$emit('start')">
                    <el-icon><PlayIcon /></el-icon>
                </el-button>
                <el-button size="small" type="danger"  circle
                @click="$emit('cancel')">
                    <el-icon><Close /></el-icon>
                </el-button>
            </div>
        </div>
    </el-card>
</template>

<script setup>
import { Close } from '@element-plus/icons-vue';
import { PlayIcon } from 'tdesign-icons-vue-next';

defineProps({
    task: Object
})
</script>
