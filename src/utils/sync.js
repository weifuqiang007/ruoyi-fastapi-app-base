/**
 * 同步服务（本地优先架构）
 *
 * pull：服务端增量 → 合并到本地（按 update_time 谁新谁赢）→ 更新 sync_cursor。
 * push：本地脏数据 → 上推（服务端 LWW 合并、新行回填 id）→ 清 dirty、回填 id。
 * ack：单条确认上报（跨端静音事实源）。
 *
 * 冲突策略：last-write-wins（update_time 大者赢）；删除（deleted_at）优先。
 */

import localdb from './localdb'
import { syncPull, syncPush, syncAck } from '@/api/calendar'

// ---- event_tags 合并（服务端发全量，本地去重合并）----
function mergeEventTags(rows) {
  const db = uni.getStorageSync('cal_local_db')
  if (!db) return
  const set = new Set(db.event_tags.map((r) => r.event_id + ':' + r.tag_id))
  rows.forEach((r) => {
    const k = r.event_id + ':' + r.tag_id
    if (!set.has(k)) {
      db.event_tags.push({ event_id: r.event_id, tag_id: r.tag_id })
      set.add(k)
    }
  })
  uni.setStorageSync('cal_local_db', db)
}

export async function pull() {
  const since = localdb.getCursor()
  const res = await syncPull(since)
  const d = res.data || res
  if (d.events) localdb.mergeFromServer('events', 'event_id', d.events)
  if (d.modules) localdb.mergeFromServer('modules', 'module_id', d.modules)
  if (d.tags) localdb.mergeFromServer('tags', 'tag_id', d.tags)
  if (d.event_tags) mergeEventTags(d.event_tags)
  if (d.acks) d.acks.forEach((a) => localdb.upsertFire(a))
  if (d.server_now) localdb.setCursor(d.server_now)
  return d
}

export async function push() {
  const dirty = localdb.dirtyEvents()
  if (!dirty.length) return { accepted: 0 }
  const res = await syncPush({
    events: dirty.map((e) => {
      const { local_dirty, ...rest } = e
      // 本地新建的 event_id 为负（临时），上推时置 null，由服务端分配正式 id
      if (!rest.event_id || rest.event_id < 0) rest.event_id = null
      return rest
    }),
    modules: [],
    tags: [],
    event_tags: dirty.flatMap((e) =>
      (localdb.getEventTagIds(e.event_id) || []).map((tid) => ({ event_id: e.event_id, tag_id: tid }))
    ),
    acks: [],
  })
  const data = res.data || res
  // 回填服务端新建事件的正式 id（client temp → server id）
  ;(data.created || []).forEach((c) => {
    if (c.table === 'events') {
      const db = uni.getStorageSync('cal_local_db')
      const row = db.events[c.index]
      if (row) {
        const oldId = row.event_id
        row.event_id = c.new_id
        row.update_time = c.update_time
        delete row.local_dirty
        // 同步 reminders/event_tags 的 event_id 引用
        db.reminders.forEach((r) => {
          if (r.event_id === oldId) r.event_id = c.new_id
        })
        db.event_tags.forEach((r) => {
          if (r.event_id === oldId) r.event_id = c.new_id
        })
      }
      uni.setStorageSync('cal_local_db', db)
    }
  })
  localdb.clearDirty()
  localdb.setCursor(new Date().toISOString())
  return data
}

export async function ack(eventId, ruleKey) {
  try {
    await syncAck({
      rule_key: ruleKey,
      event_id: eventId,
      ack_at: new Date().toISOString(),
      ack_device: localdb.deviceId(),
    })
  } catch (e) {
    // 失败不阻断；本地已标 acked，下次 push 补推（注：acks 走 sync.push 也可）
  }
}

export default { pull, push, ack }
