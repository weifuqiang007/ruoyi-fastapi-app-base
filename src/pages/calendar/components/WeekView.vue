<template>
  <view class="flex flex-col bg-white">
    <!-- 日历头（7 天）-->
    <view class="flex border-b border-gray-100">
      <view class="w-12 shrink-0"></view>
      <view v-for="(d, idx) in days" :key="idx" class="flex-1 py-2 text-center">
        <text class="block text-[10px] font-semibold uppercase" :class="d.today ? 'text-indigo-500' : 'text-gray-400'">{{ d.dow }}</text>
        <view class="mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full" :class="d.today ? 'bg-indigo-500' : ''">
          <text class="text-sm font-bold" :class="d.today ? 'text-white' : 'text-gray-800'">{{ d.day }}</text>
        </view>
      </view>
    </view>

    <!-- 主体：时间轴 + 7 列 -->
    <view class="flex">
      <!-- 左侧时间刻度 -->
      <view class="w-12 shrink-0">
        <view v-for="h in hours" :key="h" class="text-right pr-1 text-[9px] text-gray-400" :style="{ height: hourHeight + 'px', lineHeight: hourHeight + 'px' }">{{ h }}:00</view>
      </view>
      <!-- 网格区（拖放目标）-->
      <view class="week-grid relative flex-1" :style="{ height: totalPx + 'px' }">
        <!-- 横线（每小时）-->
        <view
          v-for="h in hours"
          :key="'l' + h"
          class="absolute left-0 right-0 border-t border-gray-100"
          :style="{ top: (h - hourStart) * hourHeight + 'px' }"
        ></view>
        <!-- 竖线（每天）-->
        <view v-for="i in 7" :key="'v' + i" class="absolute top-0 bottom-0 border-l border-gray-100" :style="{ left: (i - 1) * colPct + '%' }"></view>
        <!-- 事件块（触摸拖拽）-->
        <view
          v-for="ev in placed"
          :key="ev.event_id"
          class="absolute overflow-hidden rounded-md p-1 shadow-sm"
          :style="{ left: ev.left, top: ev.top, height: ev.height, width: ev.width, background: ev.color + '22', borderLeft: '3px solid ' + ev.color, touchAction: 'none' }"
          @touchstart="onTS($event, ev)"
          @touchmove.prevent="onTM"
          @touchend="onTE($event, ev)"
        >
          <text class="block truncate text-[9px] font-bold" :style="{ color: ev.color }">{{ ev.title }}</text>
          <text class="block text-[8px] text-gray-500">{{ ev.fmtTime }}</text>
        </view>
        <!-- 当前时间线 -->
        <view v-if="nowTop >= 0" class="absolute left-0 right-0" :style="{ top: nowTop + 'px' }">
          <view class="h-px w-full" style="background: #ef4444"></view>
          <view class="absolute -left-1 -top-1 h-2 w-2 rounded-full" style="background: #ef4444"></view>
        </view>
      </view>
    </view>

    <!-- 拖拽幽灵 -->
    <view
      v-if="drag.active && drag.moved"
      class="fixed z-50 rounded-md p-1 shadow-lg"
      :style="{ left: drag.ghostX - 50 + 'px', top: drag.ghostY - 16 + 'px', width: '100px', background: drag.color + '33', borderLeft: '3px solid ' + drag.color }"
    >
      <text class="block truncate text-[9px] font-bold" :style="{ color: drag.color }">{{ drag.title }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, getCurrentInstance } from 'vue'
import localdb from '@/utils/localdb'

const props = defineProps({
  events: { type: Array, default: () => [] },
  anchor: { type: String, default: '' }, // 选中日期 YYYY-MM-DD，决定显示哪一周
})
const emit = defineEmits(['reschedule', 'open'])

const BRAND = '#4F46E5'
const hourStart = 0
const hourEnd = 24
const hourHeight = 44
const colPct = 100 / 7
const totalPx = (hourEnd - hourStart) * hourHeight
const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i)
const instance = getCurrentInstance()

const weekHead = ['日', '一', '二', '三', '四', '五', '六']

function pad(n) {
  return String(n).padStart(2, '0')
}

// 计算本周起始（周日）
function weekStart() {
  const a = props.anchor ? new Date(props.anchor.replace(/-/g, '/')) : new Date()
  const ws = new Date(a)
  ws.setDate(a.getDate() - a.getDay())
  ws.setHours(0, 0, 0, 0)
  return ws
}

const days = computed(() => {
  const ws = weekStart()
  const todayStr = todayStrFn()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws)
    d.setDate(ws.getDate() + i)
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return { dow: weekHead[d.getDay()], day: d.getDate(), today: ds === todayStr, dateStr: ds, date: d }
  })
})

function todayStrFn() {
  const t = new Date()
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

function tagColor(e) {
  if (e.status === 'completed') return '#22C55E'
  const tagIds = localdb.getEventTagIds(e.event_id) || []
  const tag = localdb.all('tags').find((t) => tagIds.includes(t.tag_id))
  if (tag) return tag.color
  const mod = localdb.find('modules', 'module_id', e.module_id)
  return (mod && mod.color) || BRAND
}
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 事件定位：用 start_at 字符串前 10 位匹配当天（与月/日视图同源，避免 Date 时区漂移）
const placed = computed(() => {
  const out = []
  const dayIndex = {} // 'YYYY-MM-DD' -> 0..6
  days.value.forEach((d, i) => {
    dayIndex[d.dateStr] = i
  })
  ;(props.events || []).forEach((ev) => {
    const ds = (ev.start_at || '').slice(0, 10)
    const di = dayIndex[ds]
    if (di === undefined) return // 不在本周
    const start = new Date(String(ev.start_at || '').replace(' ', 'T'))
    if (isNaN(start)) return
    // 时间超出可视范围 → 吸附到边界（不丢弃，避免“月视图有周视图无”）
    const rawH = start.getHours() + start.getMinutes() / 60
    const sh = Math.max(hourStart, Math.min(hourEnd - 0.25, rawH))
    const end = ev.end_at ? new Date(String(ev.end_at).replace(' ', 'T')) : null
    const dur = end && !isNaN(end) ? Math.max(0.25, (end - start) / 3600000) : 0.5
    out.push({
      ...ev,
      left: di * colPct + 0.5 + '%',
      width: colPct - 1 + '%',
      top: (sh - hourStart) * hourHeight + 'px',
      height: Math.max(22, dur * hourHeight - 2) + 'px',
      color: tagColor(ev),
      fmtTime: fmtTime(ev.start_at),
      outOfRange: rawH < hourStart || rawH > hourEnd,
    })
  })
  return out
})

const nowTop = computed(() => {
  const t = new Date()
  const h = t.getHours() + t.getMinutes() / 60
  if (h < hourStart || h > hourEnd) return -1
  return (h - hourStart) * hourHeight
})

// ---------- 触摸拖拽 ----------
const drag = reactive({ active: false, eventId: null, color: '', title: '', ghostX: 0, ghostY: 0, moved: false, startX: 0, startY: 0 })
let gridRect = null

function queryGridRect() {
  uni.createSelectorQuery()
    .in(instance)
    .select('.week-grid')
    .boundingClientRect((r) => {
      gridRect = r
    })
    .exec()
}
function onTS(e, ev) {
  const t = e.touches[0]
  drag.active = true
  drag.eventId = ev.event_id
  drag.color = ev.color
  drag.title = ev.title
  drag.startX = t.clientX
  drag.startY = t.clientY
  drag.ghostX = t.clientX
  drag.ghostY = t.clientY
  drag.moved = false
  queryGridRect()
}
function onTM(e) {
  if (!drag.active) return
  const t = e.touches[0]
  drag.ghostX = t.clientX
  drag.ghostY = t.clientY
  if (Math.abs(t.clientX - drag.startX) > 6 || Math.abs(t.clientY - drag.startY) > 6) drag.moved = true
}
function onTE(e) {
  if (!drag.active) return
  const id = drag.eventId
  const moved = drag.moved
  drag.active = false
  if (!moved) {
    emit('open', id) // 点击 = 打开详情
    return
  }
  if (!gridRect) return
  const t = e.changedTouches[0]
  const dayIndex = Math.max(0, Math.min(6, Math.floor((t.clientX - gridRect.left) / (gridRect.width / 7))))
  let newHour = hourStart + (t.clientY - gridRect.top) / hourHeight
  newHour = Math.max(hourStart, Math.min(hourEnd - 0.25, newHour))
  const totalMin = Math.round((newHour * 60) / 15) * 15
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  const ns = new Date(weekStart())
  ns.setDate(ns.getDate() + dayIndex)
  ns.setHours(hh, mm, 0, 0)
  // 保留时长
  const orig = localdb.find('events', 'event_id', id)
  let newEnd = null
  if (orig && orig.end_at && orig.start_at) {
    const oe0 = new Date(String(orig.start_at).replace(' ', 'T'))
    const oe1 = new Date(String(orig.end_at).replace(' ', 'T'))
    if (!isNaN(oe0) && !isNaN(oe1)) {
      newEnd = localIso(new Date(ns.getTime() + (oe1 - oe0)))
    }
  }
  emit('reschedule', { eventId: id, newStartAt: localIso(ns), newEndAt: newEnd })
}

function localIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}
</script>
