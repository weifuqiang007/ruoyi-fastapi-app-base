<template>
  <view class="flex h-full flex-col bg-gray-50 overflow-hidden">
    <scroll-view scroll-y class="flex-1" :show-scrollbar="false">
      <view class="space-y-4 p-4 pb-32">
        <!-- 标题卡 -->
        <view class="rounded-2xl bg-white p-5 shadow-sm">
          <view class="flex items-start justify-between">
            <text class="flex-1 text-xl font-bold text-gray-800">{{ event.title || '加载中...' }}</text>
            <text class="ml-3 rounded-full px-2 py-0.5 text-[11px]" :class="statusBadge(event.status)">{{ statusLabel(event.status) }}</text>
          </view>
          <view class="mt-3 flex items-center text-sm text-gray-500">
            <view class="i-mdi-clock-outline mr-1 text-base"></view>
            <text>{{ fmtFull(event.start_at) }}</text>
            <text v-if="event.priority" class="ml-2 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-500">{{ priorityLabel(event.priority) }}</text>
          </view>
          <!-- 标签 -->
          <view v-if="tagNames.length" class="mt-2 flex flex-wrap gap-1.5">
            <text v-for="t in tagNames" :key="t.id" class="rounded-full px-2 py-0.5 text-[10px]" :style="{ background: (t.color||'#999')+'1a', color: t.color }">{{ t.name }}</text>
          </view>
        </view>

        <!-- 详情字段 -->
        <view class="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <view v-if="event.contact_name" class="flex items-center">
            <view class="i-mdi-account-outline mr-2 text-gray-400"></view>
            <text class="w-20 text-sm text-gray-500">联系人</text>
            <text class="flex-1 text-sm text-gray-800">{{ event.contact_name }}</text>
          </view>
          <view v-if="event.location" class="flex items-center">
            <view class="i-mdi-map-marker-outline mr-2 text-gray-400"></view>
            <text class="w-20 text-sm text-gray-500">地点</text>
            <text class="flex-1 text-sm text-gray-800">{{ event.location }}</text>
          </view>
          <view v-if="event.description">
            <view class="mb-1 flex items-center">
              <view class="i-mdi-text-subject mr-2 text-gray-400"></view>
              <text class="w-20 text-sm text-gray-500">描述</text>
            </view>
            <text class="block rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{{ event.description }}</text>
          </view>
        </view>

        <!-- 本地提醒预览（该事件展开的提醒） -->
        <view v-if="reminders.length" class="rounded-2xl bg-indigo-50/40 p-4">
          <text class="mb-2 block text-xs font-bold text-indigo-500">本地提醒计划</text>
          <view v-for="(r, i) in reminders" :key="i" class="text-xs text-gray-600">
            · {{ fmtFull(r.remind_at) }} <text class="text-gray-400">{{ r.label }} · {{ r.status }}</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="border-t border-gray-100 bg-white p-4">
      <view class="flex space-x-3">
        <view class="flex-1 rounded-full bg-gray-100 py-3 text-center text-sm text-gray-600 active:opacity-80" @click="onEdit">编辑</view>
        <view v-if="!isDone" class="flex-1 rounded-full bg-green-500 py-3 text-center text-sm font-bold text-white active:opacity-80" @click="onDone">标记完成</view>
        <view class="flex-1 rounded-full bg-red-50 py-3 text-center text-sm text-red-500 active:opacity-80" @click="onDelete">删除</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, getCurrentInstance } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import localdb from '@/utils/localdb'
import { cancelLocal } from '@/utils/local_reminder'
import sync from '@/utils/sync'
import { getToken } from '@/utils/auth'

const { proxy } = getCurrentInstance()
const event = ref({})
const eventId = ref(null)
const reminders = ref([])

onLoad((options) => {
  eventId.value = Number(options.eventId)
  load()
})

function load() {
  const e = localdb.find('events', 'event_id', eventId.value)
  event.value = e || {}
  reminders.value = localdb.remindersByEvent(eventId.value)
}
const tagNames = computed(() => {
  const ids = localdb.getEventTagIds(eventId.value) || []
  return localdb.all('tags').filter((t) => ids.includes(t.tag_id)).map((t) => ({ id: t.tag_id, name: t.name, color: t.color }))
})

async function onDone() {
  const ok = await proxy.$modal.confirm('标记为已完成？将取消后续提醒')
  if (!ok) return
  localdb.upsert('events', 'event_id', { event_id: eventId.value, status: 'completed', local_dirty: true, update_time: localdb.nowStr() })
  cancelAll()
  if (getToken()) await sync.push().catch(() => {})
  proxy.$modal.msgSuccess('已完成')
  setTimeout(() => uni.navigateBack(), 500)
}
function onEdit() {
  proxy.$tab.navigateTo('/pages/calendar/new?eventId=' + eventId.value)
}
async function onDelete() {
  const ok = await proxy.$modal.confirm('删除该事件？将取消对应提醒')
  if (!ok) return
  localdb.upsert('events', 'event_id', { event_id: eventId.value, deleted_at: localdb.nowStr(), local_dirty: true, update_time: localdb.nowStr() })
  cancelAll()
  if (getToken()) await sync.push().catch(() => {})
  proxy.$modal.msgSuccess('已删除')
  setTimeout(() => uni.navigateBack(), 500)
}
function cancelAll() {
  localdb.remindersByEvent(eventId.value).forEach((r) => cancelLocal(r.event_id, r.rule_key))
}

function pad(n) { return String(n).padStart(2, '0') }
function fmtFull(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  return isNaN(d) ? iso : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function statusLabel(s) { return { active: '进行中', done: '已完成', completed: '已完成', cancelled: '已取消' }[s] || s }
function statusBadge(s) { return { active: 'bg-indigo-50 text-indigo-500', done: 'bg-green-50 text-green-600', completed: 'bg-green-50 text-green-600', cancelled: 'bg-gray-100 text-gray-500' }[s] }
function priorityLabel(p) { return { 0: '低', 1: '中', 2: '高', 3: '紧急' }[p] || '' }
const isDone = computed(() => event.value.status === 'completed' || event.value.status === 'done')
</script>
