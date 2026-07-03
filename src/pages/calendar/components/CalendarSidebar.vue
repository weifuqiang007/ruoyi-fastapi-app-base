<template>
  <view class="flex h-full flex-col bg-white">
    <!-- ===== 上：当月迷你日历（带状态点）===== -->
    <view class="border-b border-gray-100 p-3">
      <view class="mb-2 flex items-center justify-between">
        <text class="text-sm font-bold text-gray-800">{{ sideY }}年{{ sideM }}月</text>
        <view class="flex items-center">
          <view class="i-mdi-chevron-left text-lg text-gray-400" @click="sidePrev"></view>
          <text class="mx-1 text-[11px] text-indigo-500" @click="sideToday">今</text>
          <view class="i-mdi-chevron-right text-lg text-gray-400" @click="sideNext"></view>
        </view>
      </view>
      <!-- 星期头 -->
      <view class="grid grid-cols-7 text-center text-[10px] font-semibold text-gray-400">
        <text v-for="w in weekHead" :key="w">{{ w }}</text>
      </view>
      <!-- 日期格 -->
      <view class="mt-1 grid grid-cols-7 gap-y-0.5">
        <view
          v-for="(c, i) in sideGrid"
          :key="i"
          class="flex flex-col items-center py-0.5"
          @click="c.inMonth && $emit('select', c.dateStr)"
        >
          <view
            class="flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
            :style="c.today ? 'background:#4F46E5;color:#fff' : c.selected ? 'background:#EEF2FF;color:#4F46E5' : ''"
          >
            <text :class="c.inMonth ? 'text-gray-700' : 'text-gray-300'" :style="c.today || c.selected ? 'color:inherit' : ''">{{ c.day || '' }}</text>
          </view>
          <!-- 状态点：绿=完成 红=未处理 最多3 -->
          <view v-if="c.dots && c.dots.length" class="mt-0.5 flex justify-center gap-0.5" style="height: 4px">
            <view v-for="(d, k) in c.dots" :key="k" class="rounded-full" :style="{ width: '4px', height: '4px', background: d === 'r' ? '#EF4444' : '#22C55E' }"></view>
          </view>
          <view v-else style="height: 4px"></view>
        </view>
      </view>
      <!-- 图例 -->
      <view class="mt-2 flex items-center justify-center gap-3 text-[9px] text-gray-400">
        <view class="flex items-center"><view class="mr-1 h-1.5 w-1.5 rounded-full" style="background:#EF4444"></view>未处理</view>
        <view class="flex items-center"><view class="mr-1 h-1.5 w-1.5 rounded-full" style="background:#22C55E"></view>已完成</view>
      </view>
    </view>

    <!-- ===== 下：重大事件纪要 ===== -->
    <view class="flex flex-1 flex-col overflow-hidden p-3">
      <view class="mb-2 flex items-center justify-between">
        <text class="text-sm font-bold text-gray-800">重大事件</text>
        <text class="text-[10px] text-gray-400">紧急/高优先级</text>
      </view>
      <scroll-view scroll-y class="flex-1" :show-scrollbar="false">
        <view v-if="!majorList.length" class="rounded-xl bg-gray-50 p-4 text-center text-xs text-gray-400">今日起暂无重大事件</view>
        <view
          v-for="e in majorList"
          :key="e.event_id"
          class="mb-2 flex items-start rounded-xl bg-gray-50 p-2.5 active:bg-gray-100"
          @click="$emit('open-event', e.event_id)"
        >
          <!-- 状态点：绿=已完成 红=未完成 -->
          <view class="mt-1 mr-2 h-3 w-3 shrink-0 rounded-full" :style="{ background: e.status === 'completed' ? '#22C55E' : '#EF4444' }"></view>
          <view class="flex-1 overflow-hidden">
            <view class="flex items-center">
              <text class="flex-1 truncate text-xs font-bold" :class="e.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'">{{ e.title }}</text>
              <text class="ml-1 shrink-0 rounded px-1 text-[8px] font-bold" :style="{ background: priColor(e.priority) + '1a', color: priColor(e.priority) }">{{ priLabel(e.priority) }}</text>
            </view>
            <view class="mt-0.5 flex items-center text-[10px] font-semibold" :style="{ color: e.status === 'completed' ? '#16A34A' : '#EF4444' }">
              <view class="i-mdi-clock-outline mr-1 text-xs"></view>
              <text>{{ fmtShort(e.start_at) }}</text>
              <text class="ml-1.5">· {{ e.status === 'completed' ? '已完成' : '未完成' }}</text>
            </view>
            <text v-if="e.location" class="mt-0.5 block truncate text-[10px] text-gray-400">📍 {{ e.location }}</text>
          </view>
        </view>
      </scroll-view>
      <view class="mt-2 rounded-xl py-2 text-center text-xs font-bold text-indigo-500 active:bg-indigo-50" style="background:#EEF2FF" @click="$emit('open-major')">全部重大事件 →</view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import localdb from '@/utils/localdb'

const props = defineProps({
  events: { type: Array, default: () => [] },
  anchor: { type: String, default: '' },
})
const emit = defineEmits(['select', 'open-major', 'open-event'])

const weekHead = ['日', '一', '二', '三', '四', '五', '六']
const PRI_COLOR = { 0: '#9CA3AF', 1: '#F59E0B', 2: '#EA580C', 3: '#DC2626' }
const PRI_LABEL = { 0: '低', 1: '中', 2: '高', 3: '紧急' }

function priColor(p) {
  return PRI_COLOR[p] || PRI_COLOR[0]
}
function priLabel(p) {
  return PRI_LABEL[p] || ''
}
function pad(n) {
  return String(n).padStart(2, '0')
}

// 迷你日历的年月（独立于主区，可单独翻）
const init = props.anchor ? new Date(props.anchor.replace(/-/g, '/')) : new Date()
const sideY = ref(init.getFullYear())
const sideM = ref(init.getMonth() + 1)

// 主区选中变化时，若属于另一月则跟随（仅在首次/跨月点选时同步）
watch(
  () => props.anchor,
  (a) => {
    if (!a) return
    const d = new Date(a.replace(/-/g, '/'))
    if (d.getFullYear() !== sideY.value || d.getMonth() + 1 !== sideM.value) {
      sideY.value = d.getFullYear()
      sideM.value = d.getMonth() + 1
    }
  }
)

function sidePrev() {
  if (sideM.value === 1) {
    sideM.value = 12
    sideY.value--
  } else sideM.value--
}
function sideNext() {
  if (sideM.value === 12) {
    sideM.value = 1
    sideY.value++
  } else sideM.value++
}
function sideToday() {
  const t = new Date()
  sideY.value = t.getFullYear()
  sideM.value = t.getMonth() + 1
  emit('select', `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`)
}

const sideGrid = computed(() => {
  const first = new Date(sideY.value, sideM.value - 1, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(sideY.value, sideM.value, 0).getDate()
  const t = new Date()
  const todayStr = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push({ inMonth: false })
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${sideY.value}-${pad(sideM.value)}-${pad(d)}`
    const evts = (props.events || []).filter((e) => (e.start_at || '').slice(0, 10) === ds)
    cells.push({
      inMonth: true,
      day: d,
      dateStr: ds,
      today: ds === todayStr,
      selected: ds === props.anchor,
      dots: dotsForDay(evts),
    })
  }
  while (cells.length % 7 !== 0) cells.push({ inMonth: false })
  return cells
})

// 状态点：红=未处理 绿=已完成；最多3；有未处理→至少1红；全完成→全绿
function dotsForDay(evts) {
  if (!evts.length) return []
  const pending = evts.filter((e) => e.status !== 'completed').length
  const done = evts.length - pending
  const show = Math.min(3, evts.length)
  const red = pending > 0 ? Math.min(show, pending) : 0
  const green = show - red
  const arr = []
  for (let i = 0; i < red; i++) arr.push('r')
  for (let i = 0; i < green; i++) arr.push('g')
  return arr
}

// 重大事件：今日起，priority>=2（高/紧急），最多4
const majorList = computed(() => {
  const t = new Date()
  const todayStr = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  return (props.events || [])
    .filter((e) => !e.deleted_at && e.status !== 'cancelled' && (e.priority || 0) >= 2 && (e.start_at || '').slice(0, 10) >= todayStr)
    .sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''))
    .slice(0, 4)
})

function fmtShort(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(d)) return iso
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}
</script>
