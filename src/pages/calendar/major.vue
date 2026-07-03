<template>
  <view class="flex h-full flex-col bg-gray-50 overflow-hidden">
    <!-- 月份切换头 -->
    <view class="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
      <view class="flex items-center">
        <view class="i-mdi-chevron-left text-xl text-gray-400" @click="prevMonth"></view>
        <text class="mx-3 text-base font-bold text-gray-900">{{ vy }}年{{ vm }}月</text>
        <view class="i-mdi-chevron-right text-xl text-gray-400" @click="nextMonth"></view>
      </view>
      <text class="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style="background: #4f46e5">重大 {{ list.length }}</text>
    </view>

    <scroll-view scroll-y class="flex-1" :show-scrollbar="false">
      <view class="p-3">
        <view v-if="!list.length" class="rounded-2xl bg-white p-10 text-center text-sm text-gray-400">{{ vy }}年{{ vm }}月 没有重大事件（高/紧急）</view>
        <view v-for="e in list" :key="e.event_id" class="mb-2 flex items-stretch overflow-hidden rounded-2xl bg-white shadow-sm active:bg-gray-50" @click="toDetail(e.event_id)">
          <view class="w-1.5" :style="{ background: e.status === 'completed' ? '#22C55E' : '#EF4444' }"></view>
          <view class="flex-1 p-3">
            <view class="flex items-center justify-between">
              <text class="flex-1 text-sm font-bold text-gray-900" :class="e.status === 'completed' ? 'line-through opacity-50' : ''">{{ e.title }}</text>
              <text class="ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" :style="{ background: priColor(e.priority) + '1a', color: priColor(e.priority) }">{{ priLabel(e.priority) }}</text>
            </view>
            <view class="mt-1 flex items-center text-[11px] font-semibold" :style="{ color: e.status === 'completed' ? '#16A34A' : '#EF4444' }">
              <view class="i-mdi-clock-outline mr-1 text-sm"></view>
              <text>{{ fmtFull(e.start_at) }}</text>
              <text class="ml-2">· {{ e.status === 'completed' ? '已完成' : '未完成' }}</text>
              <template v-if="e.location">
                <view class="i-mdi-map-marker-outline ml-3 mr-1 text-sm text-gray-400"></view>
                <text class="text-gray-400">{{ e.location }}</text>
              </template>
              <template v-if="e.contact_name">
                <view class="i-mdi-account-outline ml-3 mr-1 text-sm text-gray-400"></view>
                <text class="text-gray-400">{{ e.contact_name }}</text>
              </template>
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

const { proxy } = getCurrentInstance()
const PRI_COLOR = { 0: '#9CA3AF', 1: '#F59E0B', 2: '#EA580C', 3: '#DC2626' }
const PRI_LABEL = { 0: '低', 1: '中', 2: '高', 3: '紧急' }

const now = new Date()
const vy = ref(now.getFullYear())
const vm = ref(now.getMonth() + 1)
const events = ref([])

function pad(n) {
  return String(n).padStart(2, '0')
}
function priColor(p) {
  return PRI_COLOR[p] || PRI_COLOR[0]
}
function priLabel(p) {
  return PRI_LABEL[p] || ''
}
function fmtFull(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(d)) return iso
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function load() {
  events.value = localdb.all('events').filter((e) => !e.deleted_at && e.status !== 'cancelled')
}
const list = computed(() =>
  events.value
    .filter((e) => (e.priority || 0) >= 2 && (e.start_at || '').slice(0, 7) === `${vy.value}-${pad(vm.value)}`)
    .sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''))
)

function prevMonth() {
  if (vm.value === 1) {
    vm.value = 12
    vy.value--
  } else vm.value--
}
function nextMonth() {
  if (vm.value === 12) {
    vm.value = 1
    vy.value++
  } else vm.value++
}
function toDetail(id) {
  proxy.$tab.navigateTo('/pages/calendar/detail?eventId=' + id)
}

onShow(() => load())
</script>
