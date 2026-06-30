<template>
  <div class="setting-plugins-section">
    <h2 class="section-title">{{ t('setting.plugins.title') }}</h2>
    <p class="section-desc">{{ t('setting.plugins.description') }}</p>

    <h3 class="subsection-title">{{ t('setting.plugins.builtin') }}</h3>
    <table class="plugins-table">
      <thead>
        <tr>
          <th>{{ t('setting.plugins.colName') }}</th>
          <th>{{ t('setting.plugins.colId') }}</th>
          <th>{{ t('setting.plugins.colActivation') }}</th>
          <th>{{ t('setting.plugins.colEnabled') }}</th>
          <th>{{ t('setting.plugins.colStatus') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="plugin in builtinPlugins" :key="plugin.id">
          <td>{{ plugin.name }}</td>
          <td class="mono">{{ plugin.id }}</td>
          <td>{{ formatActivation(plugin.activationEvents) }}</td>
          <td>
            <Switch
              :checked="isPluginEnabled(plugin.id)"
              :disabled="isToggleBusy(plugin.id)"
              @update:checked="(v: boolean) => onTogglePlugin(plugin.id, v)"
            />
          </td>
          <td>
            <span :class="['status-badge', isActive(plugin.id) ? 'active' : 'inactive']">
              {{
                isActive(plugin.id)
                  ? t('setting.plugins.statusActive')
                  : t('setting.plugins.statusInactive')
              }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <h3 class="subsection-title">{{ t('setting.plugins.examples') }}</h3>
    <table class="plugins-table">
      <thead>
        <tr>
          <th>{{ t('setting.plugins.colName') }}</th>
          <th>{{ t('setting.plugins.colId') }}</th>
          <th>{{ t('setting.plugins.colActivation') }}</th>
          <th>{{ t('setting.plugins.colEnabled') }}</th>
          <th>{{ t('setting.plugins.colStatus') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="plugin in examplePlugins" :key="plugin.id">
          <td>{{ plugin.name }}</td>
          <td class="mono">{{ plugin.id }}</td>
          <td>{{ formatActivation(plugin.activationEvents) }}</td>
          <td>
            <Switch
              :checked="isPluginEnabled(plugin.id)"
              :disabled="isToggleBusy(plugin.id)"
              @update:checked="(v: boolean) => onTogglePlugin(plugin.id, v)"
            />
          </td>
          <td>
            <span :class="['status-badge', isActive(plugin.id) ? 'active' : 'inactive']">
              {{
                isActive(plugin.id)
                  ? t('setting.plugins.statusActive')
                  : t('setting.plugins.statusInactive')
              }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <template v-if="communityPlugins.length">
      <h3 class="subsection-title">{{ t('setting.plugins.community') }}</h3>
      <table class="plugins-table">
        <thead>
          <tr>
            <th>{{ t('setting.plugins.colName') }}</th>
            <th>{{ t('setting.plugins.colId') }}</th>
            <th>{{ t('setting.plugins.colStatus') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="plugin in communityPlugins" :key="plugin.id">
            <td>{{ plugin.name }}</td>
            <td class="mono">{{ plugin.id }}</td>
            <td>
              <span :class="['status-badge', isActive(plugin.id) ? 'active' : 'inactive']">
                {{
                  isActive(plugin.id)
                    ? t('setting.plugins.statusActive')
                    : t('setting.plugins.statusInactive')
                }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <p v-else-if="isElectron" class="hint">{{ t('setting.plugins.noCommunity') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Switch } from '@renderer/components/ui/switch'
import { builtinPluginCatalog, examplePluginCatalog } from '../../plugins/builtin-manifests'
import { getActivePluginIds, setPluginEnabled } from '../../core/plugin-loader'
import { isAiRuntimeLoaded } from '../../ai-runtime/loader'
import {
  getDisabledPluginIds,
  getDisabledPluginIdsSync,
  isPluginDisabled
} from '../../utils/plugin-preferences'
import eventBus, { isElectronEnv } from '../../utils/event-bus'
import messageBridge from '../../bridge/message-bridge'

const { t } = useI18n()
const isElectron = isElectronEnv()
const revision = ref(0)
const communityPlugins = ref<Array<{ id: string; name: string }>>([])
const busyPluginIds = ref<Set<string>>(new Set())

const builtinPlugins = builtinPluginCatalog
const examplePlugins = examplePluginCatalog

const activeIds = computed(() => {
  revision.value
  return new Set(getActivePluginIds())
})

function isActive(id: string): boolean {
  return activeIds.value.has(id)
}

function isPluginEnabled(id: string): boolean {
  revision.value
  return !isPluginDisabled(id)
}

function isToggleBusy(id: string): boolean {
  return busyPluginIds.value.has(id)
}

function formatActivation(events: readonly string[]): string {
  return events.length ? events.join(', ') : 'onLlmEnabled'
}

function refresh() {
  revision.value++
}

async function onTogglePlugin(id: string, enabled: boolean) {
  if (busyPluginIds.value.has(id)) return
  busyPluginIds.value = new Set([...busyPluginIds.value, id])
  try {
    await setPluginEnabled(id, enabled)
    refresh()
  } finally {
    const next = new Set(busyPluginIds.value)
    next.delete(id)
    busyPluginIds.value = next
  }
}

async function loadCommunityList() {
  if (!isElectron) return
  try {
    const result = await messageBridge.invoke('community-plugins:list')
    communityPlugins.value = Array.isArray(result)
      ? (result as Array<{ id: string; name: string }>)
      : []
  } catch {
    communityPlugins.value = []
  }
}

onMounted(async () => {
  const disabled = await getDisabledPluginIds()
  if (disabled.length) {
    const { settings } = await import('../../utils/settings.js')
    settings.disabledPluginIds = disabled
  } else {
    getDisabledPluginIdsSync()
  }
  eventBus.on('ai-runtime-ready', refresh)
  eventBus.on('ai-runtime-unloaded', refresh)
  void loadCommunityList()
})

onBeforeUnmount(() => {
  eventBus.off('ai-runtime-ready', refresh)
  eventBus.off('ai-runtime-unloaded', refresh)
})
</script>

<style scoped>
.setting-plugins-section {
  padding: 24px;
  max-width: 960px;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 8px;
}

.section-desc {
  margin: 0 0 24px;
  opacity: 0.75;
}

.subsection-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 24px 0 12px;
}

.plugins-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.plugins-table th,
.plugins-table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  opacity: 0.85;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.status-badge.active {
  background: color-mix(in srgb, #22c55e 20%, transparent);
  color: #16a34a;
}

.status-badge.inactive {
  background: color-mix(in srgb, currentColor 10%, transparent);
  opacity: 0.7;
}

.hint {
  margin-top: 16px;
  font-size: 0.875rem;
  opacity: 0.7;
}
</style>
