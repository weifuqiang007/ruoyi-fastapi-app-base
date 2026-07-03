/**
 * App 检查更新 + wgt 资源热安装
 *
 * 流程:
 *   plus.runtime.getProperty 取当前 version/versionCode
 *   → POST /release/check
 *   → 有更新:uni.downloadFile 下载 MinIO presigned wgt
 *   → plus.runtime.install 安装 → plus.runtime.restart 重启生效
 *
 * 关键:wgt 下载走 uni.downloadFile 直连 presigned URL,绕开 utils/request.js
 *       的传输加密(request 只用于 /release/check 的 JSON 响应)。
 *
 * 仅 App 端(APP-PLUS)实现真实逻辑;非 App 端调用为 stub。
 */

import { checkRelease } from "@/api/release";
import localdb from "@/utils/localdb";
import config from "@/config";

/**
 * 当前版本号的同步读法(优先 App 运行时同步的真实值,fallback config.js)
 * about / setting 页用它显示版本,与 manifest 解耦。
 */
export function getCurrentVersion() {
  return localdb.getMeta("app_version") || config.appInfo.version;
}

// #ifdef APP-PLUS
function getProperty() {
  return new Promise((resolve) => {
    plus.runtime.getProperty(plus.runtime.appid, (widgetInfo) => resolve(widgetInfo || {}));
  });
}

function getPlatform() {
  return (plus.os.name || "").toLowerCase().indexOf("ios") >= 0 ? "ios" : "android";
}

function downloadWgt(url, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uni.downloadFile({
      url,
      success: (res) =>
        res.statusCode === 200 ? resolve(res.tempFilePath) : reject(new Error("下载失败 " + res.statusCode)),
      fail: reject,
    });
    if (onProgress) task.onProgressUpdate((e) => onProgress(e.progress));
  });
}

/**
 * 异步取真实版本(plus.runtime.getProperty,即 manifest 的 versionName/versionCode)。
 * App 启动时调用,把结果写入 localdb.meta,作为「当前版本」单一事实源。
 */
export async function getAppVersion() {
  const w = await getProperty();
  return { version: w.version || "", versionCode: Number(w.versionCode || 0) };
}

/** 触发检查更新(setting 页「检查更新」按钮调用) */
export async function checkAndUpdate() {
  const w = await getProperty();
  const versionCode = Number(w.versionCode || 0);
  if (!versionCode) {
    uni.showToast({ title: "无法获取当前版本", icon: "none" });
    return;
  }
  uni.showLoading({ title: "检查更新...", mask: true });
  let res;
  try {
    res = await checkRelease({
      platform: getPlatform(),
      versionCode,
      versionName: w.version,
      deviceId: localdb.deviceId(),
    });
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: "检查更新失败", icon: "none" });
    return;
  }
  uni.hideLoading();
  const d = res.data || res;
  if (!d.hasUpdate) {
    uni.showToast({ title: "已是最新版本", icon: "none" });
    return;
  }
  await doUpdate(d);
}

async function doUpdate(d) {
  const ok = await new Promise((resolve) => {
    if (d.forceUpdate) {
      // 强制更新:不可取消(单按钮)
      plus.nativeUI.confirm(
        `发现新版本 ${d.version || ""}\n\n${d.updateLog || ""}\n\n该版本必须更新`,
        () => resolve(true),
        "更新提示",
        ["立即更新"]
      );
    } else {
      uni.showModal({
        title: `发现新版本 ${d.version || ""}`,
        content: d.updateLog || "是否立即更新?",
        confirmText: "立即更新",
        cancelText: "以后再说",
        success: (e) => resolve(e.confirm),
        fail: () => resolve(false),
      });
    }
  });
  if (!ok) return;

  uni.showLoading({ title: "下载中 0%", mask: true });
  let tmpPath;
  try {
    tmpPath = await downloadWgt(d.downloadUrl, (p) =>
      uni.showLoading({ title: `下载中 ${p}%`, mask: true })
    );
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: "下载失败", icon: "none" });
    return;
  }

  uni.showLoading({ title: "安装中...", mask: true });
  plus.runtime.install(
    tmpPath,
    { force: false },
    () => {
      uni.hideLoading();
      if (d.forceUpdate) {
        plus.runtime.restart();
      } else {
        uni.showModal({
          title: "安装成功",
          content: "更新已就绪,是否立即重启生效?",
          success: (e) => {
            if (e.confirm) plus.runtime.restart();
          },
        });
      }
    },
    () => {
      uni.hideLoading();
      uni.showToast({ title: "安装失败", icon: "none" });
    }
  );
}
// #endif

// #ifndef APP-PLUS
// 非 App 端(H5 / 小程序):版本以 config.js 为准,检查更新为 stub
export async function getAppVersion() {
  return { version: config.appInfo.version, versionCode: 0 };
}
export async function checkAndUpdate() {
  uni.showToast({ title: "请在 App 内检查更新", icon: "none" });
}
// #endif
