<template>
  <view class="flex flex-col bg-white">
    <!-- 日期头 -->
    <view class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
      <view class="flex items-center">
        <view class="mr-2 flex h-8 w-8 flex-col items-center justify-center rounded-full" style="background: #4f46e5">
          <text class="text-xs font-bold leading-none text-white">{{ dayNum }}</text>
        </view>
        <view>
          <text class="block text-sm font-bold text-gray-900">{{ headerStr }}</text>
          <text class="block text-[10px] text-gray-400">{{ lunarHint }}</text>
        </view>
      </view>
      <view class="flex items-center rounded-full px-3 py-1 text-[11px] font-bold text-white" style="background: #4f46e5" @click="$emit('create', { hour: 9, minute: 0 })">
        <view class="i-mdi-plus mr-0.5 text-sm"></view>创建
      </view>
    </view>

    <!-- 时间轴：左侧刻度 + 右侧单列 -->
    <scroll-view scroll-y class="px-1" :style="{ height: '60vh' }" :show-scrollbar="false">
      <view class="flex">
        <!-- 小时刻度 -->
        <view class="w-12 shrink-0">
          <view v-for="h in hours" :key="h" class="relative pr-1 text-right text-[10px] text-gray-400" :style="{ height: hourHeight + 'px' }">
            <text class="absolute -top-1.5 right-1">{{ fmtHour(h) }}</text>
          </view>
        </view>
        <!-- 网格区 -->
        <view class="relative flex-1" :style="{ height: totalPx + 'px' }">
          <!-- 半小时槽（可点建事件）-->
          <view
            v-for="s in slots"
            :key="s.key"
            class="absolute left-0 right-0 active:bg-indigo-50"
            :style="{ top: s.top + 'px', height: slotH + 'px', borderTop: s.half === 0 ? '1px solid #F3F4F6' : '1px dashed #F9FAFB' }"
            @click="$emit('create', { hour: s.hour, minute: s.half === 0 ? 0 : 30 })"
          ></view>
          <!-- 事件块 -->
          <view
            v-for="ev in placed"
            :key="ev.event_id"
            class="absolute overflow-hidden rounded-lg shadow-sm active:opacity-80"
            :style="{ left: '2%', top: ev.top, height: ev.height, width: '96%', background: ev.color + '18', borderLeft: '3px solid ' + ev.color }"
            @click.stop="$emit('open', ev.event_id)"
          >
            <view class="flex h-full flex-col p-1.5">
              <view class="flex items-center">
                <text class="flex-1 truncate text-xs font-bold" :style="{ color: ev.color }">{{ ev.title }}</text>
                <view v-if="ev.done" class="i-mdi-check-circle text-sm" style="color: #22c55e"></view>
              </view>
              <text class="text-[10px] text-gray-500">{{ ev.fmtTime }}{{ ev.location ? ' · ' + ev.location : '' }}</text>
            </view>
          </view>
          <!-- 当前时间线 -->
          <view v-if="nowTop >= 0" class="absolute left-0 right-0" :style="{ top: nowTop + 'px' }">
            <view class="h-px w-full" style="background: #ef4444"></view>
            <view class="absolute -left-1 -top-1 h-2 w-2 rounded-full" style="background: #ef4444"></view>
          </view>
        </view>
      </view>
      <view class="h-4"></view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import localdb from '@/utils/localdb'

const props = defineProps({
  events: { type: Array, default: () => [] },
  anchor: { type: String, default: '' },
})
defineEmits(['open', 'create'])

const BRAND = '#4F46E5'
const GREEN = '#22C55E'
const hourStart = 0
const hourEnd = 24
const hourHeight = 56
const slotH = hourHeight / 2
const totalPx = (hourEnd - hourStart) * hourHeight
const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i)
// 半小时槽
const slots = computed(() => {
  const arr = []
  for (let h = hourStart; h < hourEnd; h++) {
    arr.push({ key: h + '-0', hour: h, half: 0, top: (h - hourStart) * hourHeight })
    arr.push({ key: h + '-1', hour: h, half: 1, top: (h - hourStart) * hourHeight + slotH })
  }
  return arr
})

const anchorDate = computed(() => {
  if (!props.anchor) return new Date()
  const d = new Date(props.anchor.replace(/-/g, '/'))
  return isNaN(d) ? new Date() : d
})

const dayNum = computed(() => anchorDate.value.getDate())
const headerStr = computed(() => {
  const d = anchorDate.value
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${w}`
})
const lunarHint = computed(() => {
  const d = anchorDate.value
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  return isToday ? '今天' : ''
})

function pad(n) {
  return String(n).padStart(2, '0')
}
function fmtHour(h) {
  if (h === 0) return '0点'
  if (h === 12) return '12点'
  const ap = h < 6 ? '凌晨' : h < 12 ? '上午' : h < 18 ? '下午' : '晚上'
  const hh = h <= 12 ? h : h - 12
  return `${ap}${hh}点`
}

function tagColor(e) {
  const tagIds = localdb.getEventTagIds(e.event_id) || []
  const tag = localdb.all('tags').find((t) => tagIds.includes(t.tag_id))
  if (tag) return tag.color
  const mod = localdb.find('modules', 'module_id', e.module_id)
  return (mod && mod.color) || BRAND
}

const placed = computed(() => {
  const ds = props.anchor
  const out = []
  ;(props.events || []).forEach((ev) => {
    if (!ev.start_at || (ev.start_at || '').slice(0, 10) !== ds) return
    const start = new Date(String(ev.start_at).replace(' ', 'T'))
    if (isNaN(start)) return
    // 时间超出可视范围 → 吸附到边界（不丢弃）
    const rawH = start.getHours() + start.getMinutes() / 60
    const sh = Math.max(hourStart, Math.min(hourEnd - 0.25, rawH))
    const end = ev.end_at ? new Date(String(ev.end_at).replace(' ', 'T')) : null
    const dur = end && !isNaN(end) ? Math.max(0.5, (end - start) / 3600000) : 0.5
    const done = ev.status === 'completed'
    out.push({
      ...ev,
      top: (sh - hourStart) * hourHeight + 'px',
      height: Math.max(28, dur * hourHeight - 4) + 'px',
      color: done ? GREEN : tagColor(ev),
      done,
      fmtTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      outOfRange: rawH < hourStart || rawH > hourEnd,
    })
  })
  return out
})

const nowTop = computed(() => {
  const ds = props.anchor
  const t = new Date()
  const todayStr = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  if (ds !== todayStr) return -1
  const h = t.getHours() + t.getMinutes() / 60
  if (h < hourStart || h > hourEnd) return -1
  return (h - hourStart) * hourHeight
})
</script>
