<template>
  <view class="flex h-full flex-col bg-gray-50 overflow-hidden">
    <scroll-view scroll-y class="flex-1" :show-scrollbar="false">
      <view class="space-y-4 p-4 pb-32">
        <!-- 模块 -->
        <view class="rounded-2xl bg-white p-4 shadow-sm">
          <text class="mb-2 block text-sm font-bold text-gray-700">模块</text>
          <view class="flex flex-wrap gap-2">
            <view
              v-for="mod in modules"
              :key="mod.module_id"
              class="flex items-center rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200"
              :class="mod.module_id === form.moduleId ? '-translate-y-0.5 shadow-md' : ''"
              :style="mod.module_id === form.moduleId ? { background: mod.color, color: '#fff' } : { background: (mod.color || '#999') + '1a', color: mod.color || '#999' }"
              @click="pickModule(mod.module_id)"
            >
              <view class="mr-1.5 h-2 w-2 rounded-full" :style="{ background: mod.module_id === form.moduleId ? '#fff' : mod.color || '#999' }"></view>
              {{ mod.name }}
            </view>
          </view>
        </view>

        <!-- 标签（多选） -->
        <view v-if="tags.length" class="rounded-2xl bg-white p-4 shadow-sm">
          <text class="mb-2 block text-sm font-bold text-gray-700">标签（决定自动提醒）</text>
          <view class="flex flex-wrap gap-2">
            <view
              v-for="t in tags"
              :key="t.tag_id"
              class="flex items-center rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200"
              :class="form.tagIds.includes(t.tag_id) ? '-translate-y-0.5 shadow-md' : ''"
              :style="form.tagIds.includes(t.tag_id) ? { background: t.color, color: '#fff' } : { background: (t.color || '#999') + '1a', color: t.color || '#999' }"
              @click="toggleTag(t.tag_id)"
            >
              <view class="mr-1.5 h-2 w-2 rounded-full" :style="{ background: form.tagIds.includes(t.tag_id) ? '#fff' : t.color || '#999' }"></view>
              {{ t.name }}
            </view>
          </view>
        </view>

        <!-- 提醒预览 -->
        <view v-if="preview.length" class="rounded-2xl bg-indigo-50/50 p-4">
          <text class="mb-2 block text-xs font-bold text-indigo-500">📌 将生成 {{ preview.length }} 条提醒</text>
          <view v-for="(p, i) in preview" :key="i" class="text-xs text-gray-600">
            · {{ fmtFull(p.remind_at) }} <text class="text-gray-400">{{ p.label }}</text>
          </view>
        </view>

        <!-- 标题 -->
        <view class="rounded-2xl bg-white p-4 shadow-sm">
          <text class="mb-1 block text-xs text-gray-500">任务名称 *</text>
          <input v-model="form.title" placeholder="如：王某交通事故案" class="text-base text-gray-800" />
          <text class="mt-3 mb-1 block text-xs text-gray-500">联系人</text>
          <input v-model="form.contactName" placeholder="选填" class="text-sm text-gray-700" />
          <text class="mt-3 mb-1 block text-xs text-gray-500">地点</text>
          <input v-model="form.location" placeholder="选填" class="text-sm text-gray-700" />
        </view>

        <!-- 时间 + 优先级 -->
        <view class="rounded-2xl bg-white p-4 shadow-sm">
          <text class="mb-2 block text-xs text-gray-500">{{ timeLabel }} *</text>
          <text class="mb-2 block text-[11px] text-gray-400">{{ timeHint }}</text>
          <picker mode="date" :value="form.date" @change="(e) => (form.date = e.detail.value)">
            <view class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">{{ form.date }}</view>
          </picker>
          <picker mode="time" :value="form.time" @change="(e) => (form.time = e.detail.value)">
            <view class="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">{{ form.time }}</view>
          </picker>
          <text class="mb-2 mt-3 block text-xs text-gray-500">优先级</text>
          <view class="flex gap-2">
            <view
              v-for="p in priorityOptions"
              :key="p.v"
              class="flex-1 rounded-xl py-2.5 text-center text-xs font-bold transition-all duration-200"
              :class="form.priority === p.v ? '-translate-y-1' : ''"
              :style="priorityStyle(p.v)"
              @click="form.priority = p.v"
              >{{ p.label }}</view
            >
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="border-t border-gray-100 bg-white p-4">
      <view class="flex gap-3">
        <view class="flex-1 rounded-full bg-gray-100 py-3 text-center text-sm text-gray-600" @click="back">取消</view>
        <view class="flex-[2] rounded-full bg-indigo-500 py-3 text-center text-sm font-bold text-white active:opacity-80" @click="save">
          {{ saveText }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, getCurrentInstance } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import localdb from '@/utils/localdb'
import { expandReminders, computePreview, cancelLocal } from '@/utils/local_reminder'
import sync from '@/utils/sync'
import { parseEvent } from '@/api/calendar'
import { getToken } from '@/utils/auth'

const { proxy } = getCurrentInstance()

const priorityOptions = [
  { v: 0, label: '低' },
  { v: 1, label: '中' },
  { v: 2, label: '高' },
  { v: 3, label: '紧急' },
]

// 优先级配色：低灰 / 中琥珀 / 高橙 / 紧急红；选中时上浮 + 色阴影
const priorityColors = { 0: '#9CA3AF', 1: '#F59E0B', 2: '#EA580C', 3: '#DC2626' }
function priorityStyle(v) {
  const c = priorityColors[v] || '#9CA3AF'
  return form.value.priority === v
    ? { background: c, color: '#fff', boxShadow: `0 10px 18px -4px ${c}aa` }
    : { background: c + '1a', color: c }
}

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const form = ref({
  moduleId: null,
  tagIds: [],
  title: '',
  contactName: '',
  location: '',
  date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  time: '09:00',
  priority: 1,
})
// 编辑模式
const isEdit = ref(false)
const editId = ref(null)
const saveText = computed(() => (isEdit.value ? '保存修改' : '创建事件'))

const modules = computed(() => localdb.all('modules').filter((m) => !m.deleted_at))
const tags = computed(() =>
  form.value.moduleId ? localdb.all('tags').filter((t) => t.module_id === form.value.moduleId && !t.deleted_at) : []
)

// 入参：?eventId= 编辑 / ?text= 自然语言 / ?date=&time= 点时间槽预填 / 无则默认现在
onLoad(async (options) => {
  if (!options) return
  // 编辑模式：载入既有事件预填
  if (options.eventId) {
    const id = Number(options.eventId)
    const e = localdb.find('events', 'event_id', id)
    if (e) {
      isEdit.value = true
      editId.value = id
      form.value.moduleId = e.module_id || null
      form.value.tagIds = localdb.getEventTagIds(id) || []
      form.value.title = e.title || ''
      form.value.contactName = e.contact_name || ''
      form.value.location = e.location || ''
      form.value.priority = e.priority != null ? e.priority : 1
      if (e.start_at) {
        const dt = new Date(String(e.start_at).replace(' ', 'T'))
        if (!isNaN(dt)) {
          form.value.date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
          form.value.time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
        }
      }
      uni.setNavigationBarTitle({ title: '编辑事件' })
      return
    }
  }
  // 点时间槽：预填日期+时间
  if (options.date) form.value.date = decodeURIComponent(options.date)
  if (options.time) form.value.time = decodeURIComponent(options.time)
  // 自然语言：AI 解析预填
  if (options.text) {
    try {
      const res = await parseEvent(decodeURIComponent(options.text))
      const d = res.data || res
      if (!d) return
      if (d.title) form.value.title = d.title
      if (d.contactName) form.value.contactName = d.contactName
      if (d.location) form.value.location = d.location
      if (d.startAt) {
        const dt = new Date(String(d.startAt).replace(' ', 'T'))
        if (!isNaN(dt)) {
          form.value.date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
          form.value.time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`
        }
      }
      proxy.$modal.msgSuccess('已按语义预填，请核对时间')
    } catch (e) {
      proxy.$modal.msg('解析失败，请手动填写')
    }
  }
})

// 时间字段语义随"是否选标签"动态切换
const timeLabel = computed(() => (form.value.tagIds.length ? '事件基准日（如开庭日）' : '提醒时间'))
const timeHint = computed(() =>
  form.value.tagIds.length ? '提醒按标签规则提前，实际响铃时间见下方预览' : '到点响一次'
)

function pickModule(id) {
  form.value.moduleId = id
  form.value.tagIds = []
}
function toggleTag(id) {
  const i = form.value.tagIds.indexOf(id)
  if (i >= 0) form.value.tagIds.splice(i, 1)
  else form.value.tagIds.push(id)
}

// 提醒预览（本地算法，与服务端一致）
const preview = computed(() => {
  if (!form.value.date) return []
  const baseAt = `${form.value.date}T${form.value.time}:00`
  const selTags = localdb.all('tags').filter((t) => form.value.tagIds.includes(t.tag_id))
  return computePreview(baseAt, selTags)
})

function back() {
  uni.navigateBack()
}

async function save() {
  if (!form.value.title) {
    proxy.$modal.msg('请填任务名称')
    return
  }
  const startAt = `${form.value.date}T${form.value.time}:00`
  const selTags = localdb.all('tags').filter((t) => form.value.tagIds.includes(t.tag_id))

  // ===== 编辑模式：更新既有事件，重建提醒 =====
  if (isEdit.value) {
    const orig = localdb.find('events', 'event_id', editId.value) || {}
    localdb.remindersByEvent(editId.value).forEach((r) => cancelLocal(r.event_id, r.rule_key))
    localdb.deleteRemindersByEvent(editId.value, false)
    localdb.upsert('events', 'event_id', {
      ...orig,
      title: form.value.title,
      contact_name: form.value.contactName,
      location: form.value.location,
      start_at: startAt,
      module_id: form.value.moduleId,
      priority: form.value.priority,
      local_dirty: true,
      update_time: localdb.nowStr(),
    })
    localdb.setEventTags(editId.value, form.value.tagIds)
    expandReminders(localdb.find('events', 'event_id', editId.value), selTags)
    if (getToken()) {
      try {
        await sync.push()
      } catch (e) {
        proxy.$modal.msg('已存本地，联网后将自动同步')
      }
    }
    proxy.$modal.msgSuccess('已保存')
    setTimeout(() => uni.navigateBack(), 500)
    return
  }

  // ===== 新建模式 =====
  const tempId = -Date.now()
  const event = {
    event_id: tempId,
    user_id: null,
    title: form.value.title,
    contact_name: form.value.contactName,
    location: form.value.location,
    event_type: 'reminder',
    start_at: startAt,
    is_repeat: '0',
    repeat_rule: 'none',
    module_id: form.value.moduleId,
    priority: form.value.priority,
    status: 'active',
    local_dirty: true,
    update_time: localdb.nowStr(),
  }
  localdb.upsert('events', 'event_id', event)
  localdb.setEventTags(tempId, form.value.tagIds)
  expandReminders(event, selTags)
  if (getToken()) {
    try {
      await sync.push()
      await sync.pull()
    } catch (e) {
      proxy.$modal.msg('已存本地，联网后将自动同步')
    }
  }
  proxy.$modal.msgSuccess('已创建')
  setTimeout(() => uni.navigateBack(), 500)
}

function fmtFull(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  return isNaN(d) ? iso : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>
