/**
 * 本地提醒引擎 v2（本地优先架构）
 *
 * 三层提醒（详见 日历提醒_触发与呈现方案.md）：
 *  1) 触发层（跨 app）：App plus.push 系统通知 / H5 Web Notification
 *  2) 浮层页 remind.vue：到点或点通知时展开，完成/稍后(15min 可改)/详情，多条分页
 *  3) 晨间摘要：每日固定时点汇总「今天 N 件待办」
 *
 * 同点合并：多条同时到点 → 进 alert_queue，浮层分页逐条处理，按优先级排序。
 *
 * 算法与后端 TagService.compute_rule 保持一致（见 module_calendar/service/tag_service.py）。
 */

import localdb from './localdb'

let _timer = null
const _h5Timers = {} // scheduleKey -> timeout（H5 预览/桌面用）

const SNOOZE_DEFAULT = 15
const BRIEFING_HOUR_DEFAULT = 8

// ---------- meta 便捷 ----------
const getSnoozeMin = () => Number(localdb.getMeta('snooze_minutes', SNOOZE_DEFAULT)) || SNOOZE_DEFAULT
const getBriefingHour = () => Number(localdb.getMeta('briefing_hour', BRIEFING_HOUR_DEFAULT)) || BRIEFING_HOUR_DEFAULT

function pad(n) {
  return String(n).padStart(2, '0')
}
function fmtHM(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).replace(' ', 'T'))
  return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------- 时间计算（镜像服务端 _compute_one）----------
function computeAt(base, entry) {
  const at = entry.at || '09:00'
  const unit = entry.unit || 'day'
  const offset = Number(entry.offset || 0)
  const baseDate = base ? new Date(base) : new Date()
  if (at === 'now') return new Date() // 立即（如立案缴费）
  let target
  if (unit === 'hour') target = new Date(baseDate.getTime() + offset * 3600 * 1000)
  else if (unit === 'minute') target = new Date(baseDate.getTime() + offset * 60 * 1000)
  else target = new Date(baseDate.getTime() + offset * 86400 * 1000)
  const [hh, mm] = String(at).split(':').map((x) => parseInt(x, 10) || 0)
  target.setHours(hh || 9, mm || 0, 0, 0)
  return target
}

// ---------- 纯预览（不写库、不调度，供新建页实时显示将生成几条提醒）----------
export function computePreview(baseAt, tags) {
  const out = []
  tags.forEach((tag) => {
    const rule = tag.remind_rule || {}
    ;(rule.schedule || []).forEach((entry, idx) => {
      const remindAt = computeAt(baseAt, entry)
      if (!remindAt) return
      out.push({
        remind_at: remindAt.toISOString(),
        priority: entry.priority || 1,
        label: entry.label || tag.name,
        rule_key: `${tag.tag_id}:${idx}`,
      })
    })
  })
  return out
}

// ---------- 展开：事件 + 标签 → 本地提醒 ----------
export function expandReminders(event, tags) {
  // 先清旧的（标签驱动的）
  localdb.deleteRemindersByEvent(event.event_id, true)
  const created = []
  // 无标签：在 start_at 单次提醒（避免"建了事件却不响"）
  if (!tags || tags.length === 0) {
    const at = new Date(String(event.start_at || '').replace(' ', 'T'))
    const r = {
      id: `${event.event_id}:manual:0`,
      event_id: event.event_id,
      user_id: event.user_id,
      tag_id: null,
      rule_key: 'manual',
      remind_at: (isNaN(at) ? new Date() : at).toISOString(),
      priority: event.priority || 1,
      label: '到点提醒',
      status: 'pending',
    }
    localdb.addReminder(r)
    scheduleLocal(r, event)
    created.push(r)
    return created
  }
  tags.forEach((tag) => {
    const rule = tag.remind_rule || {}
    ;(rule.schedule || []).forEach((entry, idx) => {
      const remindAt = computeAt(event.start_at, entry)
      if (!remindAt) return
      const reminder = {
        id: `${event.event_id}:${tag.tag_id}:${idx}`,
        event_id: event.event_id,
        user_id: event.user_id,
        tag_id: tag.tag_id,
        rule_key: `${tag.tag_id}:${idx}`,
        remind_at: remindAt.toISOString(),
        priority: entry.priority || 1,
        label: entry.label || '',
        status: 'pending',
      }
      localdb.addReminder(reminder)
      scheduleLocal(reminder, event)
      created.push(reminder)
    })
  })
  return created
}

// ---------- 系统通知（跨 app 本体）----------
export function requestWebNotifyPermission() {
  // #ifdef H5
  try {
    if (typeof window !== 'undefined' && window.Notification && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  } catch (e) {}
  // #endif
}

function pushSystemNow(title, body, payload) {
  // #ifdef APP-PLUS
  try {
    plus.push.createMessage(title, JSON.stringify(payload || {}), { delay: 0, sound: 'system', cover: false })
  } catch (e) {
    console.warn('[local_reminder] plus.push unavailable', e)
  }
  // #endif
  // #ifdef H5
  try {
    if (typeof window !== 'undefined' && window.Notification) {
      if (Notification.permission === 'granted') {
        const n = new Notification(title, { body, tag: JSON.stringify(payload || {}), requireInteraction: true })
        n.onclick = () => {
          window.focus()
          presentAlert()
        }
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') pushSystemNow(title, body, payload)
        })
      }
    }
  } catch (e) {}
  // #endif
}

// ---------- 注册系统本地通知（未来时点）----------
export function scheduleLocal(reminder, event) {
  const delay = Math.max(0, (new Date(reminder.remind_at).getTime() - Date.now()) / 1000)
  const title = (event && event.title) || '日历提醒'
  const payload = { event_id: reminder.event_id, rule_key: reminder.rule_key }
  const skey = reminder.event_id + ':' + reminder.rule_key
  // #ifdef APP-PLUS
  if (delay <= 0) {
    fireReminder(reminder, true)
    return
  }
  try {
    plus.push.createMessage(title, JSON.stringify(payload), { delay, sound: 'system', cover: false })
  } catch (e) {
    console.warn('[local_reminder] plus.push unavailable', e)
  }
  // #endif
  // #ifdef H5
  if (_h5Timers[skey]) clearTimeout(_h5Timers[skey])
  if (delay <= 0) {
    fireReminder(reminder, true)
  } else {
    _h5Timers[skey] = setTimeout(() => fireReminder(reminder, true), delay * 1000)
  }
  // #endif
}

export function cancelLocal(eventId, ruleKey) {
  // #ifdef H5
  const k = eventId + ':' + ruleKey
  if (_h5Timers[k]) {
    clearTimeout(_h5Timers[k])
    delete _h5Timers[k]
  }
  // #endif
}

// ---------- 到点触发（H5 timer / 前台扫描 / 补发共用）----------
// pushSystem=true → 同时弹系统通知（H5 timer 路径需要；前台扫描/补发不重复弹）
function fireReminder(reminder, pushSystem) {
  if (localdb.isAcked(reminder.event_id, reminder.rule_key)) {
    cancelLocal(reminder.event_id, reminder.rule_key)
    return
  }
  const event = localdb.find('events', 'event_id', reminder.event_id) || {}
  const title = event.title || '日历提醒'
  const body = reminder.label || '到点了，点击查看'
  if (pushSystem) pushSystemNow(title, body, { event_id: reminder.event_id, rule_key: reminder.rule_key })
  // 标记已触发 + fire 记录
  localdb.updateReminder(reminder.id, { status: 'fired', fired_at: new Date().toISOString() })
  localdb.upsertFire({
    event_id: reminder.event_id,
    user_id: reminder.user_id,
    rule_key: reminder.rule_key,
    fired_at: new Date().toISOString(),
    status: 'fired',
    update_time: new Date().toISOString(),
  })
  enqueueAlert(reminder, event)
}

// ---------- alert_queue（同点合并：多条 → 分页浮层）----------
function enqueueAlert(reminder, event) {
  const q = localdb.getMeta('alert_queue', []) || []
  const key = reminder.event_id + ':' + reminder.rule_key
  if (q.find((x) => x.key === key)) {
    // 已在队列：刷新即可
    uni.$emit('alert:updated')
    return
  }
  const ev = event || localdb.find('events', 'event_id', reminder.event_id) || {}
  q.push({
    key,
    reminder_id: reminder.id,
    event_id: reminder.event_id,
    rule_key: reminder.rule_key,
    title: ev.title || reminder.label || '日历提醒',
    label: reminder.label || '',
    priority: ev.priority != null ? ev.priority : reminder.priority || 0,
    remind_at: reminder.remind_at,
    enq_at: new Date().toISOString(),
  })
  // 紧急优先
  q.sort((a, b) => (b.priority || 0) - (a.priority || 0))
  localdb.setMeta('alert_queue', q)
  presentAlert()
}

function removeFromQueue(key) {
  const q = (localdb.getMeta('alert_queue', []) || []).filter((x) => x.key !== key)
  localdb.setMeta('alert_queue', q)
  uni.$emit('alert:updated')
}

// 拉起浮层页（若已在浮层页则只刷新）
export function presentAlert() {
  const q = localdb.getMeta('alert_queue', []) || []
  if (!q.length) return
  // Electron 桌面：强制把窗口从最小化/后台拉到最前（覆盖其他 app）
  try {
    if (typeof window !== 'undefined' && window.desktop && window.desktop.isElectron) {
      window.desktop.focusReminder()
    }
  } catch (e) {}
  try {
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1]
    if (cur && cur.route === 'pages/calendar/remind') {
      uni.$emit('alert:updated')
      return
    }
  } catch (e) {}
  uni.navigateTo({ url: '/pages/calendar/remind' })
}

// push 点击/接收落地：按 payload 定位提醒 → 进队列 → 拉浮层
export function handlePushPayload(payload) {
  if (!payload || !payload.event_id) {
    presentAlert()
    return
  }
  const r = localdb.all('reminders').find((x) => x.event_id === payload.event_id && x.rule_key === payload.rule_key && x.status === 'pending')
  if (r) fireReminder(r, false)
  else presentAlert()
}

// ---------- 稍后（默认 15min，可改）----------
export function snoozeReminder(reminderId, ruleKey, minutes) {
  const min = Number(minutes) || getSnoozeMin()
  const r = localdb.all('reminders').find((x) => x.id === reminderId)
  if (!r) {
    removeFromQueue(':' + ruleKey) // 兜底
    return
  }
  const next = new Date(Date.now() + min * 60 * 1000)
  cancelLocal(r.event_id, ruleKey)
  localdb.updateReminder(reminderId, { remind_at: next.toISOString(), status: 'pending', fired_at: null })
  removeFromQueue(r.event_id + ':' + ruleKey)
  const ev = localdb.find('events', 'event_id', r.event_id) || {}
  scheduleLocal(Object.assign({}, r, { remind_at: next.toISOString(), status: 'pending' }), ev)
}

// ---------- 确认（跨端静音）----------
export function ackReminder(eventId, ruleKey) {
  cancelLocal(eventId, ruleKey)
  removeFromQueue(eventId + ':' + ruleKey)
  localdb.upsertFire({
    event_id: eventId,
    rule_key: ruleKey,
    ack_at: new Date().toISOString(),
    ack_device: localdb.deviceId(),
    status: 'acked',
    update_time: new Date().toISOString(),
  })
  // 上报服务端（失败不阻断，下次 sync 补推）
  import('./sync')
    .then((m) => m.default.ack(eventId, ruleKey))
    .catch(() => {})
}

// ---------- 前台扫描循环 ----------
export function startForegroundLoop() {
  if (_timer) return
  checkDue()
  maybeDailyBriefing()
  _timer = setInterval(() => {
    checkDue()
    maybeDailyBriefing()
  }, 60 * 1000)
}

export function stopForegroundLoop() {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}

// ---------- 补发（启动/onShow）----------
export function catchUp() {
  checkDue()
  maybeDailyBriefing()
}

function checkDue() {
  const due = localdb.dueReminders()
  due.forEach((r) => fireReminder(r, false)) // 前台/补发不重复弹系统通知
}

// ---------- 晨间摘要（需求3 第1层）----------
function maybeDailyBriefing() {
  const d = new Date()
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const key = 'briefing_' + today
  if (localdb.getMeta(key)) return // 当天已发
  if (d.getHours() < getBriefingHour()) return // 未到点
  const todayEv = localdb
    .all('events')
    .filter((e) => !e.deleted_at && e.status !== 'cancelled' && (e.start_at || '').slice(0, 10) === today)
  if (!todayEv.length) return
  todayEv.sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''))
  const lines = todayEv.slice(0, 5).map((e, i) => `${i + 1}. ${fmtHM(e.start_at)} ${e.title}`)
  const more = todayEv.length > 5 ? `\n…共 ${todayEv.length} 件` : ''
  pushSystemNow(`⏰ 今天有 ${todayEv.length} 件待办`, lines.join('\n') + more, { briefing: today })
  localdb.setMeta(key, '1')
}

export default {
  expandReminders,
  scheduleLocal,
  cancelLocal,
  startForegroundLoop,
  stopForegroundLoop,
  catchUp,
  ackReminder,
  snoozeReminder,
  presentAlert,
  handlePushPayload,
  requestWebNotifyPermission,
}
