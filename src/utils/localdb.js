/**
 * 本地数据库（本地优先架构）
 *
 * 用 uni 同步存储（uni.getStorageSync/setStorageSync）做本地全量镜像，跨端可用（H5/App/小程序）。
 * 数据量增大后可换 plus.sqlite / uni-sqlite，接口保持不变。
 *
 * 表：events / modules / tags / event_tags / reminders / fires / meta(sync_cursor)
 * 行为：upsert 按 id 合并；event_tags 按复合键 (eventId,tagId)。
 */

const DB_KEY = 'cal_local_db'

const SCHEMA = {
  events: [],
  modules: [],
  tags: [],
  event_tags: [], // {eventId, tagId}
  reminders: [], // 本地派生：标签规则展开出的提醒计划
  fires: [], // 触发/确认 记录
  meta: { sync_cursor: null, device_id: null },
}

function load() {
  const raw = uni.getStorageSync(DB_KEY)
  if (!raw) return JSON.parse(JSON.stringify(SCHEMA))
  // 兜底补齐表
  const db = JSON.parse(JSON.stringify(SCHEMA))
  Object.keys(SCHEMA).forEach((k) => {
    if (raw[k] !== undefined) db[k] = raw[k]
  })
  return db
}

function save(db) {
  uni.setStorageSync(DB_KEY, db)
}

function nowStr() {
  // ISO 字符串去掉毫秒，与后端 update_time 对齐
  return new Date().toISOString().replace(/\.\d{3}Z$/, '')
}

function deviceId() {
  let db = load()
  if (!db.meta.device_id) {
    db.meta.device_id = 'dev-' + Math.random().toString(36).slice(2, 10)
    save(db)
  }
  return db.meta.device_id
}

// ---- 通用 CRUD ----
function all(table) {
  return load()[table] || []
}

function find(table, idField, id) {
  return all(table).find((r) => r[idField] === id) || null
}

function upsert(table, idField, row) {
  const db = load()
  const list = db[table]
  const i = list.findIndex((r) => r[idField] === row[idField])
  if (i >= 0) list[i] = Object.assign({}, list[i], row)
  else list.push(row)
  save(db)
  return row
}

function remove(table, idField, id) {
  const db = load()
  db[table] = db[table].filter((r) => r[idField] !== id)
  save(db)
}

// ---- 同步合并（服务端数据落本地，按 update_time 谁新谁赢）----
function mergeFromServer(table, idField, rows) {
  const db = load()
  const list = db[table]
  rows.forEach((srv) => {
    const i = list.findIndex((r) => r[idField] === srv[idField])
    if (i < 0) {
      list.push(srv)
    } else {
      const local = list[i]
      const lt = local.update_time ? String(local.update_time) : ''
      const st = srv.update_time ? String(srv.update_time) : ''
      if (!lt || st >= lt) list[i] = Object.assign({}, local, srv)
    }
  })
  save(db)
}

// ---- event_tags（复合键）----
function setEventTags(eventId, tagIds) {
  const db = load()
  db.event_tags = db.event_tags.filter((r) => r.event_id !== eventId)
  tagIds.forEach((tid) => db.event_tags.push({ event_id: eventId, tag_id: tid }))
  save(db)
}

function getEventTagIds(eventId) {
  return all('event_tags').filter((r) => r.event_id === eventId).map((r) => r.tag_id)
}

// ---- reminders（本地派生）----
function remindersByEvent(eventId) {
  return all('reminders').filter((r) => r.event_id === eventId)
}

function deleteRemindersByEvent(eventId, onlyTagDriven) {
  const db = load()
  db.reminders = db.reminders.filter(
    (r) => r.event_id !== eventId || (onlyTagDriven && !r.rule_key)
  )
  save(db)
}

function addReminder(r) {
  const db = load()
  db.reminders.push(r)
  save(db)
}

function dueReminders(now) {
  const ts = now || Date.now()
  return all('reminders').filter((r) => r.status === 'pending' && new Date(r.remind_at).getTime() <= ts)
}

function updateReminder(id, patch) {
  const db = load()
  const i = db.reminders.findIndex((r) => r.id === id)
  if (i >= 0) db.reminders[i] = Object.assign(db.reminders[i], patch)
  save(db)
}

// ---- fires（确认）----
function upsertFire(fire) {
  const db = load()
  const i = db.fires.findIndex((f) => f.event_id === fire.event_id && f.rule_key === fire.rule_key)
  if (i >= 0) {
    // 已 ack 则不再覆盖（首确认生效）
    if (db.fires[i].ack_at && !fire.ack_at) return db.fires[i]
    db.fires[i] = Object.assign(db.fires[i], fire)
  } else db.fires.push(fire)
  save(db)
  return fire
}

function isAcked(eventId, ruleKey) {
  const f = all('fires').find((x) => x.event_id === eventId && x.rule_key === ruleKey)
  return !!(f && f.ack_at)
}

// ---- 脏数据（待推送）----
function dirtyEvents() {
  // 本地 update_time 晚于 sync_cursor 的、或带 local_dirty
  const cur = getCursor()
  return all('events').filter((r) => r.local_dirty || (r.update_time && (!cur || r.update_time > cur)))
}

// ---- sync_cursor ----
function getCursor() {
  return load().meta.sync_cursor
}
// ---- meta 通用 KV（alert_queue / snooze_minutes / briefing_* 等）----
function getMeta(key, def) {
  const m = load().meta
  return m[key] !== undefined ? m[key] : def
}
function setMeta(key, val) {
  const db = load()
  db.meta[key] = val
  save(db)
}
function setCursor(ts) {
  const db = load()
  db.meta.sync_cursor = ts
  save(db)
}
function clearDirty() {
  const db = load()
  db.events.forEach((r) => delete r.local_dirty)
  save(db)
}

export default {
  nowStr,
  deviceId,
  all,
  find,
  upsert,
  remove,
  mergeFromServer,
  setEventTags,
  getEventTagIds,
  remindersByEvent,
  deleteRemindersByEvent,
  addReminder,
  dueReminders,
  updateReminder,
  upsertFire,
  isAcked,
  dirtyEvents,
  getCursor,
  setCursor,
  clearDirty,
  getMeta,
  setMeta,
}
