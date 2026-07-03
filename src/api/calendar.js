import request from "@/utils/request";

/**
 * 日历提醒模块接口（本地优先架构 V2.0）
 *
 * 服务端为薄同步层：事件/模块/标签 CRUD + 同步 + ack。
 * 提醒的展开与触发在客户端（utils/local_reminder.js）。
 *
 * 后端响应约定（ResponseUtil）：data=X → res.data = X
 */

// ====== 事件 CRUD（也可被同步复用）======

// 语音/文本 → 事件草稿（语义解析）
export function parseEvent(text, modelId) {
  return request({
    url: "/calendar/event/parse",
    method: "post",
    params: modelId ? { modelId } : undefined,
    data: { text },
  });
}

// 新增事件（含模块/优先级/标签）
export function addEvent(data) {
  return request({ url: "/calendar/event", method: "post", data });
}

export function listEvent(params) {
  return request({ url: "/calendar/event/list", method: "get", params });
}

export function getEvent(eventId) {
  return request({ url: "/calendar/event/" + eventId, method: "get" });
}

export function updateEvent(data) {
  return request({ url: "/calendar/event", method: "put", data });
}

export function deleteEvent(eventIds) {
  return request({ url: "/calendar/event/" + eventIds, method: "delete" });
}

export function markEventDone(eventId) {
  return request({ url: "/calendar/event/" + eventId + "/done", method: "put" });
}

// ====== 模块 /calendar/module ======

export function listModule() {
  return request({ url: "/calendar/module/list", method: "get" });
}

export function addModule(data) {
  return request({ url: "/calendar/module", method: "post", data });
}

export function updateModule(data) {
  return request({ url: "/calendar/module", method: "put", data });
}

export function deleteModule(moduleId) {
  return request({ url: "/calendar/module/" + moduleId, method: "delete" });
}

// 复制预置模块（含其标签）为我方
export function copyModule(moduleId, newName) {
  return request({
    url: "/calendar/module/" + moduleId + "/copy",
    method: "post",
    params: newName ? { newName } : undefined,
  });
}

// ====== 标签 /calendar/tag ======

export function listTag(moduleId) {
  return request({
    url: "/calendar/tag/list",
    method: "get",
    params: moduleId ? { moduleId } : undefined,
  });
}

export function addTag(data) {
  return request({ url: "/calendar/tag", method: "post", data });
}

export function updateTag(data) {
  return request({ url: "/calendar/tag", method: "put", data });
}

export function deleteTag(tagId) {
  return request({ url: "/calendar/tag/" + tagId, method: "delete" });
}

// 预览标签规则会生成的提醒（建事件前确认）
export function previewTag(tagId, baseAt) {
  return request({
    url: "/calendar/tag/" + tagId + "/preview",
    method: "post",
    data: { baseAt },
  });
}

// ====== 同步 /calendar/sync（本地优先核心）======

// 增量拉取：since 之后变更（since 为空=全量）
export function syncPull(since) {
  return request({
    url: "/calendar/sync/pull",
    method: "post",
    data: since ? { since } : {},
  });
}

// 增量推送：本地脏数据上推
export function syncPush(payload) {
  return request({ url: "/calendar/sync/push", method: "post", data: payload });
}

// 单条确认上报（跨端静音事实源）
export function syncAck(data) {
  return request({ url: "/calendar/sync/ack", method: "post", data });
}

// ====== 推送设备（module_push，未来全端离线兜底用；本次默认不启用）======

export function registerDevice(data) {
  return request({ url: "/push/device", method: "post", data });
}

export function listDevice() {
  return request({ url: "/push/device/list", method: "get" });
}

export function testPush(data) {
  return request({ url: "/push/test", method: "post", data });
}
