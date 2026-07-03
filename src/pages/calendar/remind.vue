<template>
  <view class="flex h-full flex-col justify-end" style="background: rgba(0, 0, 0, 0.55)">
    <view class="rounded-t-3xl bg-white p-5 shadow-2xl" style="box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.18)" @click.stop>
      <view class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-200"></view>

      <!-- 队列空态（兜底）-->
      <view v-if="!queue.length" class="py-8 text-center">
        <view class="i-mdi-check-circle mb-2 text-5xl" style="color: #4f46e5"></view>
        <text class="text-sm text-gray-500">全部处理完，暂无待提醒</text>
        <view class="mt-4 rounded-full bg-gray-100 py-2.5 text-center text-sm text-gray-600" @click="dismiss">返回日历</view>
      </view>

      <template v-else>
        <!-- 头：第 N/M 件 + 优先级 -->
        <view class="mb-3 flex items-center justify-between">
          <view class="flex items-center">
            <text class="text-xs font-bold text-gray-400">第 {{ idx + 1 }} / {{ queue.length }} 件</text>
            <view v-if="queue.length > 1" class="ml-2 flex gap-0.5">
              <view v-for="(d, i) in queue" :key="i" class="h-1.5 rounded-full" :style="{ width: '14px', background: i === idx ? priColor(cur.priority) : '#E5E7EB' }"></view>
            </view>
          </view>
          <view class="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" :style="{ background: priColor(cur.priority) }">{{ priLabel(cur.priority) }}</view>
        </view>

        <!-- 事件卡片 -->
        <view class="rounded-2xl bg-gray-50 p-4">
          <view class="flex items-start">
            <view class="mt-1 h-10 w-1 rounded-full" :style="{ background: priColor(cur.priority) }"></view>
            <view class="ml-3 flex-1">
              <text class="block text-base font-bold text-gray-900">{{ cur.title }}</text>
              <text v-if="cur.label" class="mt-0.5 block text-xs text-gray-400">📌 {{ cur.label }}</text>
            </view>
          </view>
          <view class="mt-3 space-y-1">
            <view v-if="event.start_at" class="flex items-center text-xs text-gray-600">
              <view class="i-mdi-clock-outline mr-1.5 text-sm text-gray-400"></view>
              <text>{{ fmtFull(event.start_at) }}{{ event.end_at ? ' — ' + fmtTime(event.end_at) : '' }}</text>
            </view>
            <view v-if="event.location" class="flex items-center text-xs text-gray-600">
              <view class="i-mdi-map-marker-outline mr-1.5 text-sm text-gray-400"></view>
              <text>{{ event.location }}</text>
            </view>
            <view v-if="event.contact_name" class="flex items-center text-xs text-gray-600">
              <view class="i-mdi-account-outline mr-1.5 text-sm text-gray-400"></view>
              <text>{{ event.contact_name }}</text>
            </view>
          </view>
        </view>

        <!-- 稍后时间选择（需求2）-->
        <view class="mt-4">
          <text class="mb-2 block text-xs font-bold text-gray-500">稍后提醒（默认 {{ snoozeMin }} 分钟）</text>
          <view class="flex flex-wrap gap-2">
            <view
              v-for="opt in snoozeOptions"
              :key="opt"
              class="rounded-full px-3 py-1.5 text-xs font-bold transition-all"
              :class="snoozeSel === opt ? '-translate-y-0.5 text-white' : 'bg-gray-100 text-gray-500'"
              :style="snoozeSel === opt ? { background: '#4f46e5' } : {}"
              @click="snoozeSel = opt"
              >{{ opt }} 分</view
            >
            <view class="flex items-center rounded-full bg-gray-100 px-2 py-1">
              <input
                v-model="customMin"
                type="number"
                class="w-8 bg-transparent text-center text-xs font-bold text-gray-700"
                placeholder="自"
                @focus="snoozeSel = 0"
              />
              <text class="text-[10px] text-gray-400">自定义</text>
            </view>
          </view>
        </view>

        <!-- 主操作 -->
        <view class="mt-5 flex gap-3">
          <view class="flex-1 rounded-full bg-gray-100 py-3 text-center text-sm text-gray-600 active:opacity-80" @click="toDetail">详情</view>
          <view
            class="flex-1 rounded-full py-3 text-center text-sm font-bold text-white active:opacity-90"
            style="background: #4f46e5"
            @click="doSnooze"
            >稍后提醒</view
          >
          <view
            class="flex-[1.4] rounded-full py-3 text-center text-sm font-bold text-white active:opacity-90"
            :style="{ background: priColor(cur.priority) }"
            @click="doAck"
            >完成</view
          >
        </view>
        <view v-if="queue.length > 1" class="mt-2 text-center text-[11px] text-gray-400" @click="next">下一条 →</view>
      </template>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, getCurrentInstance } from 'vue'
import { onShow, onHide } from '@dcloudio/uni-app'
import localdb from '@/utils/localdb'
import { ackReminder, snoozeReminder } from '@/utils/local_reminder'

const { proxy } = getCurrentInstance()
const BRAND = '#4F46E5'
const PRI_COLOR = { 0: '#9CA3AF', 1: '#F59E0B', 2: '#EA580C', 3: '#DC2626' }
const PRI_LABEL = { 0: '低', 1: '中', 2: '高', 3: '紧急' }

const snoozeMin = Number(localdb.getMeta('snooze_minutes', 15)) || 15
const snoozeOptions = [5, 15, 30, 60]
const queue = ref([])
const idx = ref(0)
const snoozeSel = ref(snoozeMin)
const customMin = ref('')

const cur = computed(() => queue.value[idx.value] || {})
const event = computed(() => localdb.find('events', 'event_id', cur.value.event_id) || {})

function priColor(p) {
  return PRI_COLOR[p] || PRI_COLOR[0]
}
function priLabel(p) {
  return PRI_LABEL[p] || ''
}

function refresh() {
  const q = localdb.getMeta('alert_queue', []) || []
  queue.value = q
  if (idx.value >= q.length) idx.value = Math.max(0, q.length - 1)
  if (!q.length) {
    // 队列空：延迟返回，避免立刻消失看不到"已完成"反馈
    setTimeout(() => dismiss(), 600)
  }
}

function onUpdated() {
  refresh()
}

function doAck() {
  ackReminder(cur.value.event_id, cur.value.rule_key)
  // 出队后由 alert:updated 触发 refresh；无下一条则返回
}
function doSnooze() {
  const min = snoozeSel.value || (Number(customMin.value) || 0) || snoozeMin
  snoozeReminder(cur.value.reminder_id, cur.value.rule_key, min)
  proxy.$modal.msgSuccess(`${min} 分钟后再提醒`)
}
function toDetail() {
  // 保留队列项，返回后继续处理
  proxy.$tab.navigateTo('/pages/calendar/detail?eventId=' + cur.value.event_id)
}
function next() {
  if (idx.value < queue.value.length - 1) idx.value++
  else idx.value = 0
}
function dismiss() {
  uni.$off('alert:updated', onUpdated)
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/calendar/index' })
}

function pad(n) {
  return String(n).padStart(2, '0')
}
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtFull(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(d)) return iso
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onShow(() => {
  refresh()
  uni.$on('alert:updated', onUpdated)
})
onHide(() => {
  uni.$off('alert:updated', onUpdated)
})
</script>
