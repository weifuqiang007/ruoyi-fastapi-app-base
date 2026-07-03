<template>
  <view class="flex h-full overflow-hidden bg-[#FAFAFA]">
    <!-- 抽屉遮罩（仅移动）-->
    <view v-if="drawer" class="fixed inset-0 z-30 bg-black/30 md:hidden" @click="drawer = false"></view>
    <!-- 左侧栏：迷你日历 + 重大事件（桌面常驻 / 移动抽屉）-->
    <view
      class="fixed inset-y-0 left-0 z-40 w-72 shrink-0 transform border-r border-gray-100 transition-transform duration-200 md:static md:z-0 md:translate-x-0"
      :class="drawer ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
    >
      <CalendarSidebar :events="events" :anchor="selectedDate" @select="onSideSelect" @open-major="toMajor" @open-event="toDetail" />
    </view>

    <!-- 右侧主区 -->
    <view class="flex flex-1 flex-col overflow-hidden">
      <!-- 顶部工具栏 -->
      <view class="bg-white px-3 pb-2 pt-3 shadow-sm">
        <view class="flex items-center justify-between">
          <view class="flex items-center">
            <view class="i-mdi-menu mr-2 text-xl text-gray-500 md:hidden" @click="drawer = true"></view>
            <text class="mr-2 text-sm font-semibold" style="color: #4f46e5" @click="goToday">今天</text>
            <view class="i-mdi-chevron-left text-lg text-gray-400" @click="prevUnit"></view>
            <view class="i-mdi-chevron-right text-lg text-gray-400" @click="nextUnit"></view>
          </view>
          <text class="text-base font-bold text-gray-900">{{ titleText }}</text>
          <view class="flex items-center space-x-2">
            <view class="i-mdi-sync text-lg text-gray-500" @click="doSync"></view>
            <view class="flex items-center rounded-full px-3 py-1 text-xs font-bold text-white" style="background: #4f46e5" @click="openQuickAdd">
              <view class="i-mdi-plus mr-0.5 text-base"></view>新建
            </view>
          </view>
        </view>
        <view class="mt-2 flex rounded-lg bg-gray-100 p-0.5">
          <view
            v-for="v in views"
            :key="v.key"
            class="flex-1 rounded-md py-1 text-center text-xs font-semibold transition-colors"
            :class="view === v.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'"
            @click="switchView(v.key)"
            >{{ v.label }}</view
          >
        </view>
      </view>

      <scroll-view scroll-y class="flex-1" :show-scrollbar="false">
        <!-- ============ 月视图 ============ -->
        <template v-if="view === 'month'">
          <view class="grid grid-cols-7 bg-white px-1 py-1 text-center text-[10px] font-semibold text-gray-400">
            <text v-for="w in weekHead" :key="w">{{ w }}</text>
          </view>
          <view class="grid grid-cols-7 gap-px bg-gray-100">
            <view
              v-for="(cell, i) in grid"
              :key="i"
              class="flex min-h-[64px] flex-col bg-white px-1 py-1"
              :class="cell.inMonth ? '' : 'opacity-40'"
              @click="cell.inMonth && selectDay(cell.day)"
            >
              <view class="flex justify-center">
                <view
                  class="flex h-6 w-6 items-center justify-center rounded-full"
                  :class="cell.today ? '' : cell.selected ? 'ring-1' : ''"
                  :style="cell.today ? 'background:#4F46E5' : cell.selected ? '--tw-ring-color:#4F46E5' : ''"
                >
                  <text class="text-xs font-bold" :class="cell.today ? 'text-white' : 'text-gray-900'">{{ cell.inMonth ? cell.day : '' }}</text>
                </view>
              </view>
              <view v-if="cell.inMonth" class="mt-1 space-y-0.5">
                <view v-for="(e, idx) in cell.events.slice(0, 2)" :key="idx" class="truncate rounded px-1 text-[8px] leading-tight" :style="{ background: chipColor(e) + '22', color: chipColor(e) }">{{ e.title }}</view>
                <text v-if="cell.events.length > 2" class="text-[8px] text-gray-400">+{{ cell.events.length - 2 }}</text>
              </view>
            </view>
          </view>
          <!-- 当日提醒卡片列表（图2 风格）-->
          <view class="mt-2 bg-white">
            <view class="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <text class="text-xs font-bold uppercase tracking-wide text-gray-500">{{ dayHeader }}</text>
              <text class="text-[10px] text-gray-400">{{ dayEvents.length }} 件</text>
            </view>
            <view v-if="dayEvents.length" class="p-2">
              <view v-for="e in dayEvents" :key="e.event_id" class="mb-2 flex items-stretch overflow-hidden rounded-xl bg-gray-50 active:bg-gray-100" @click="toDetail(e.event_id)">
                <view class="w-1.5" :style="{ background: e.status === 'completed' ? '#22C55E' : priColor(e.priority) }"></view>
                <view class="w-16 shrink-0 py-3 text-center">
                  <text class="block text-sm font-bold text-gray-800" :class="e.status === 'completed' ? 'line-through opacity-50' : ''">{{ fmtTime(e.start_at) }}</text>
                  <text class="block text-[10px] text-gray-400">{{ fmtTime(e.end_at) || '—' }}</text>
                </view>
                <view class="flex-1 py-3 pr-3">
                  <view class="flex items-center">
                    <text class="flex-1 text-sm font-semibold text-gray-900" :class="e.status === 'completed' ? 'line-through opacity-50' : ''">{{ e.title }}</text>
                    <text v-if="e.status === 'completed'" class="ml-1 rounded bg-green-100 px-1 text-[9px] font-bold" style="color: #16a34a">已处理</text>
                  </view>
                  <text v-if="e.location || e.contact_name" class="block text-[11px] text-gray-400">{{ e.location || e.contact_name }}</text>
                </view>
                <!-- 勾选完成 -->
                <view class="flex w-10 items-center justify-center" @click.stop="toggleDone(e)">
                  <view
                    class="flex h-6 w-6 items-center justify-center rounded-full border-2"
                    :style="e.status === 'completed' ? 'background:#22C55E;border-color:#22C55E' : 'border-color:#D1D5DB'"
                  >
                    <view v-if="e.status === 'completed'" class="i-mdi-check text-sm text-white"></view>
                  </view>
                </view>
              </view>
            </view>
            <view v-else class="px-4 py-10 text-center text-sm text-gray-400">这天还没有事件</view>
          </view>
        </template>

        <!-- ============ 日视图（时间轴）============ -->
        <template v-else-if="view === 'day'">
          <DayView :events="events" :anchor="selectedDate" @open="toDetail" @create="onCreateSlot" />
        </template>

        <!-- ============ 周视图 ============ -->
        <template v-else-if="view === 'week'">
          <WeekView :events="events" :anchor="selectedDate" @reschedule="onReschedule" @open="toDetail" />
        </template>

        <!-- ============ 年视图（占位）============ -->
        <template v-else>
          <view class="flex flex-col items-center px-4 py-24 text-center">
            <view class="i-mdi-calendar-blank-outline mb-3 text-5xl text-gray-300"></view>
            <text class="text-sm text-gray-400">年视图开发中</text>
          </view>
        </template>
        <view class="h-6"></view>
      </scroll-view>
    </view>

    <!-- ============ 快速添加浮层 ============ -->
    <view v-if="showQuickAdd" class="absolute inset-0 z-50 flex flex-col justify-end" style="background: rgba(0, 0, 0, 0.35)" @click.self="showQuickAdd = false">
      <view class="rounded-t-2xl bg-white p-4 shadow-2xl" style="box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12)">
        <view class="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200"></view>
        <text class="mb-2 block text-sm font-bold text-gray-800">快速添加事件</text>
        <view class="flex items-center rounded-xl bg-gray-100 px-3 py-2.5">
          <view class="i-mdi-auto-fix mr-2 text-base" style="color: #4f46e5"></view>
          <input v-model="nlText" class="flex-1 text-sm text-gray-800" placeholder="明天下午3点和张三开会，提前15分钟提醒" confirm-type="done" @input="onNLInput" @confirm="confirmQuickAdd" />
          <view v-if="nlLoading" class="i-mdi-loading text-base text-gray-400"></view>
        </view>
        <view v-if="nlPreview" class="mt-3 rounded-xl p-3" style="background: #eef2ff">
          <view class="mb-1 flex flex-wrap gap-1.5">
            <view class="rounded-md px-2 py-0.5 text-[11px] font-bold text-white" style="background: #4f46e5">{{ nlPreview.title || '(未识别标题)' }}</view>
            <view v-if="nlPreview.startAt" class="rounded-md bg-white px-2 py-0.5 text-[11px] text-gray-600">🕒 {{ fmtFull(nlPreview.startAt) }}</view>
            <view v-if="nlPreview.contactName" class="rounded-md bg-white px-2 py-0.5 text-[11px] text-gray-600">👤 {{ nlPreview.contactName }}</view>
            <view v-if="nlPreview.location" class="rounded-md bg-white px-2 py-0.5 text-[11px] text-gray-600">📍 {{ nlPreview.location }}</view>
          </view>
          <text class="text-[10px] text-gray-400">核对无误后点保存；或进详细编辑调整</text>
        </view>
        <view class="mt-3 flex gap-2">
          <view class="flex-1 rounded-xl bg-gray-100 py-2.5 text-center text-sm text-gray-600 active:opacity-80" @click="goFullEdit">详细编辑</view>
          <view class="flex-[2] rounded-xl py-2.5 text-center text-sm font-bold text-white active:opacity-90" style="background: #4f46e5" @click="confirmQuickAdd">保存事件</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, getCurrentInstance } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import localdb from '@/utils/localdb'
import { catchUp, startForegroundLoop, expandReminders, cancelLocal } from '@/utils/local_reminder'
import sync from '@/utils/sync'
import { parseEvent } from '@/api/calendar'
import { getToken } from '@/utils/auth'
import WeekView from './components/WeekView.vue'
import CalendarSidebar from './components/CalendarSidebar.vue'
import DayView from './components/DayView.vue'

const { proxy } = getCurrentInstance()
const BRAND = '#4F46E5'
const weekHead = ['日', '一', '二', '三', '四', '五', '六']
const views = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
]

const today = new Date()
const y = ref(today.getFullYear())
const m = ref(today.getMonth() + 1)
const selDay = ref(today.getDate())
const events = ref([])
const view = ref('month')
const drawer = ref(false)

const showQuickAdd = ref(false)
const nlText = ref('')
const nlPreview = ref(null)
const nlLoading = ref(false)
let parseTimer = null

function pad(n) {
  return String(n).padStart(2, '0')
}
function loadLocal() {
  events.value = localdb.all('events').filter((e) => !e.deleted_at && e.status !== 'cancelled')
}

const selectedDate = computed(() => `${y.value}-${pad(m.value)}-${pad(selDay.value)}`)
const titleText = computed(() => (view.value === 'year' ? `${y.value}年` : `${y.value}年 ${m.value}月`))

const grid = computed(() => {
  const first = new Date(y.value, m.value - 1, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(y.value, m.value, 0).getDate()
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const cells = []
  for (let i = 0; i < startPad; i++) cells.push({ inMonth: false })
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y.value}-${pad(m.value)}-${pad(d)}`
    cells.push({
      inMonth: true,
      day: d,
      selected: ds === selectedDate.value,
      today: ds === todayStr,
      events: events.value.filter((e) => (e.start_at || '').slice(0, 10) === ds),
    })
  }
  while (cells.length % 7 !== 0) cells.push({ inMonth: false })
  return cells
})

const dayEvents = computed(() =>
  events.value
    .filter((e) => (e.start_at || '').slice(0, 10) === selectedDate.value)
    .sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''))
)

const dayHeader = computed(() => {
  const d = new Date(y.value, m.value - 1, selDay.value)
  return `${m.value}月${selDay.value}日 · 周${weekHead[d.getDay()]}`
})

function selectDay(d) {
  selDay.value = d
}
function onSideSelect(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'))
  if (!isNaN(d)) {
    y.value = d.getFullYear()
    m.value = d.getMonth() + 1
    selDay.value = d.getDate()
  }
  drawer.value = false
}
function goToday() {
  y.value = today.getFullYear()
  m.value = today.getMonth() + 1
  selDay.value = today.getDate()
}
function prevUnit() {
  if (view.value === 'day') prevDay()
  else if (view.value === 'week') shiftDay(-7)
  else prevMonth()
}
function nextUnit() {
  if (view.value === 'day') nextDay()
  else if (view.value === 'week') shiftDay(7)
  else nextMonth()
}
function shiftDay(n) {
  const d = new Date(y.value, m.value - 1, selDay.value)
  d.setDate(d.getDate() + n)
  y.value = d.getFullYear()
  m.value = d.getMonth() + 1
  selDay.value = d.getDate()
}
function prevDay() {
  shiftDay(-1)
}
function nextDay() {
  shiftDay(1)
}
function prevMonth() {
  if (m.value === 1) {
    m.value = 12
    y.value--
  } else m.value--
}
function nextMonth() {
  if (m.value === 12) {
    m.value = 1
    y.value++
  } else m.value++
}
function switchView(k) {
  view.value = k
}

function tagColor(e) {
  const tagIds = localdb.getEventTagIds(e.event_id) || []
  const tag = localdb.all('tags').find((t) => tagIds.includes(t.tag_id))
  if (tag) return tag.color
  const mod = localdb.find('modules', 'module_id', e.module_id)
  return (mod && mod.color) || BRAND
}

const PRI_COLOR = { 0: '#9CA3AF', 1: '#F59E0B', 2: '#EA580C', 3: '#DC2626' }
function priColor(p) {
  return PRI_COLOR[p] || PRI_COLOR[0]
}
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtFull(iso) {
  const d = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(d)) return iso
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 勾选完成 / 取消完成
function toggleDone(e) {
  const done = e.status === 'completed'
  localdb.upsert('events', 'event_id', {
    ...e,
    status: done ? 'active' : 'completed',
    local_dirty: true,
    update_time: localdb.nowStr(),
  })
  if (getToken()) sync.push().catch(() => {})
  loadLocal()
}

function toDetail(id) {
  proxy.$tab.navigateTo('/pages/calendar/detail?eventId=' + id)
}
function toMajor() {
  drawer.value = false
  proxy.$tab.navigateTo('/pages/calendar/major')
}
// 日视图点空白槽 → 新建（预填日期+时间）
function onCreateSlot({ hour, minute }) {
  const hh = String(hour || 9).padStart(2, '0')
  const mm = String(minute || 0).padStart(2, '0')
  proxy.$tab.navigateTo(`/pages/calendar/new?date=${selectedDate.value}&time=${hh}:${mm}`)
}
// 事件条颜色：完成→绿，否则标签/模块色
function chipColor(e) {
  return e.status === 'completed' ? '#22C55E' : tagColor(e)
}

// 周视图拖拽改期
async function onReschedule({ eventId, newStartAt, newEndAt }) {
  const ev = localdb.find('events', 'event_id', eventId)
  if (!ev) return
  localdb.remindersByEvent(eventId).forEach((r) => cancelLocal(r.event_id, r.rule_key))
  localdb.deleteRemindersByEvent(eventId, false)
  localdb.upsert('events', 'event_id', { ...ev, start_at: newStartAt, end_at: newEndAt || ev.end_at, local_dirty: true, update_time: localdb.nowStr() })
  const tags = localdb.all('tags').filter((t) => (localdb.getEventTagIds(eventId) || []).includes(t.tag_id))
  expandReminders(localdb.find('events', 'event_id', eventId), tags)
  if (getToken()) {
    try {
      await sync.push()
    } catch (e) {}
  }
  loadLocal()
  proxy.$modal.msgSuccess('已改期')
}

// ---------- 快速添加 ----------
function openQuickAdd() {
  showQuickAdd.value = true
  nlText.value = ''
  nlPreview.value = null
}
function onNLInput() {
  clearTimeout(parseTimer)
  nlPreview.value = null
  const t = nlText.value.trim()
  if (!t) return
  if (!getToken()) return
  parseTimer = setTimeout(async () => {
    nlLoading.value = true
    try {
      const res = await parseEvent(t)
      nlPreview.value = res.data || res
    } catch (e) {
      nlPreview.value = null
    }
    nlLoading.value = false
  }, 500)
}
async function confirmQuickAdd() {
  const d = nlPreview.value || {}
  const title = d.title || nlText.value.trim().slice(0, 30)
  if (!title) {
    proxy.$modal.msg('请输入事件内容')
    return
  }
  const startAt = d.startAt ? String(d.startAt).replace(' ', 'T') : new Date().toISOString().slice(0, 16)
  const tempId = -Date.now()
  const ev = {
    event_id: tempId,
    title,
    contact_name: d.contactName || null,
    location: d.location || null,
    event_type: 'reminder',
    start_at: startAt,
    is_repeat: '0',
    repeat_rule: 'none',
    priority: 1,
    status: 'active',
    local_dirty: true,
    update_time: localdb.nowStr(),
  }
  localdb.upsert('events', 'event_id', ev)
  expandReminders(ev, [])
  if (getToken()) {
    try {
      await sync.push()
      await sync.pull()
    } catch (e) {}
  }
  showQuickAdd.value = false
  loadLocal()
  proxy.$modal.msgSuccess('已创建')
}
function goFullEdit() {
  showQuickAdd.value = false
  if (nlText.value.trim()) {
    proxy.$tab.navigateTo('/pages/calendar/new?text=' + encodeURIComponent(nlText.value))
  } else {
    proxy.$tab.navigateTo('/pages/calendar/new')
  }
}

async function doSync() {
  if (!getToken()) {
    proxy.$modal.msg('请先在「我的」登录后再同步')
    return
  }
  try {
    await sync.pull()
    loadLocal()
    proxy.$modal.msgSuccess('已同步')
  } catch (e) {
    proxy.$modal.msgError('同步失败')
  }
}

onShow(() => {
  loadLocal()
  catchUp()
  startForegroundLoop()
  if (getToken()) sync.pull().then(loadLocal).catch(() => {})
})
</script>
