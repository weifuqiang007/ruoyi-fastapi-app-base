<template>
  <view class="flex h-full flex-col bg-gray-50 overflow-hidden">
    <scroll-view scroll-y class="flex-1" :show-scrollbar="false">
      <view class="space-y-3 p-4">
        <view v-if="!modules.length" class="rounded-xl bg-white p-8 text-center text-sm text-gray-400">
          还没有模块。登录同步后会自动出现预置模板（律师-民事 / 律师-刑事）。
        </view>

        <view v-for="mod in modules" :key="mod.module_id" class="rounded-2xl bg-white p-4 shadow-sm">
          <view class="mb-2 flex items-center justify-between">
            <view class="flex items-center space-x-2">
              <view class="h-3 w-3 rounded-full" :style="{ background: mod.color }"></view>
              <text class="text-base font-bold text-gray-800">{{ mod.name }}</text>
              <text v-if="mod.is_preset === '1'" class="rounded bg-gray-100 px-1 text-[10px] text-gray-400">预置</text>
            </view>
            <view
              v-if="mod.is_preset === '1'"
              class="rounded-full bg-indigo-50 px-2 py-1 text-[11px] text-indigo-500"
              @click="copyPreset(mod)"
              >复制成我的</view
            >
          </view>
          <view class="space-y-2">
            <view
              v-for="t in tagsOf(mod.module_id)"
              :key="t.tag_id"
              class="rounded-xl bg-gray-50 p-2.5"
            >
              <view class="flex items-center">
                <view class="mr-2 h-2.5 w-2.5 rounded-full" :style="{ background: t.color || '#999' }"></view>
                <text class="text-sm font-bold text-gray-800">{{ t.name }}</text>
              </view>
              <text class="mt-1 block pl-4 text-[11px] text-gray-500">{{ ruleText(t) }}</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, getCurrentInstance } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import localdb from '@/utils/localdb'
import { copyModule } from '@/api/calendar'
import sync from '@/utils/sync'
import { getToken } from '@/utils/auth'

const { proxy } = getCurrentInstance()
const modules = ref([])
const tags = ref([])

function load() {
  modules.value = localdb.all('modules').filter((m) => !m.deleted_at)
  tags.value = localdb.all('tags').filter((t) => !t.deleted_at)
}
function tagsOf(moduleId) {
  return tags.value.filter((t) => t.module_id === moduleId)
}
function ruleText(t) {
  const s = (t.remind_rule && t.remind_rule.schedule) || []
  if (!s.length) return '无自动提醒（仅记录）'
  const parts = s.map((e) => {
    const off = Number(e.offset || 0)
    const when = off === 0 ? '当天' : off > 0 ? `之后${off}天` : `提前${-off}天`
    const at = e.at === 'now' ? '立即' : e.at && e.at !== 'now' ? ` ${e.at}` : ''
    const pri = e.priority >= 3 ? '·紧急' : e.priority === 2 ? '·重要' : ''
    return `${when}${at}${pri}`
  })
  let txt = `提醒 ${parts.join('、')}（共${s.length}次）`
  const nag = t.remind_rule && t.remind_rule.nag
  if (nag) txt += `；未确认每${nag.interval_min}分钟再响×${nag.max_times}`
  return txt
}

async function copyPreset(mod) {
  if (!getToken()) {
    proxy.$modal.msg('请先在「我的」登录')
    return
  }
  try {
    await copyModule(mod.module_id)
    await sync.pull()
    load()
    proxy.$modal.msgSuccess('已复制，可在此基础上改')
  } catch (e) {
    proxy.$modal.msgError('复制失败')
  }
}

onShow(() => {
  load()
  if (getToken()) sync.pull().then(load).catch(() => {})
})
</script>
