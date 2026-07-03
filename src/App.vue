<script setup>
import config from "./config";
import { getToken } from "@/utils/auth";
import { useConfigStore } from "@/store";
import { getCurrentInstance } from "vue";
import { onLaunch } from "@dcloudio/uni-app";
import { catchUp, startForegroundLoop, requestWebNotifyPermission, handlePushPayload } from "@/utils/local_reminder";
import { getAppVersion } from "@/utils/updater";
import localdb from "@/utils/localdb";

const { proxy } = getCurrentInstance();

onLaunch(() => {
  initApp();
});

// 初始化应用
function initApp() {
  // 初始化应用配置
  initConfig();
  // 提醒引擎：Web 授权 + push 监听 + 启动扫描/晨报
  initReminder();
  // App 端：把真实版本号(plus.runtime)同步到本地,作为显示与检查更新的基准
  initVersion();
  // 检查用户登录状态
  //#ifdef H5
  checkLogin();
  //#endif
}

// 提醒引擎初始化（跨 app 通知 + 浮层 + 晨报）
function initReminder() {
  // #ifdef H5
  // 申请浏览器 Web Notification 授权（跨 tab/后台通知）
  requestWebNotifyPermission();
  // #endif
  // #ifdef APP-PLUS
  // 系统本地通知：点击 → 拉浮层；前台接收 → 立即拉浮层
  try {
    plus.push.addEventListener("click", (msg) => handlePushPayload(safeParse(msg.payload)));
    plus.push.addEventListener("receive", (msg) => handlePushPayload(safeParse(msg.payload)));
  } catch (e) {
    console.warn("[App] plus.push listener unavailable", e);
  }
  // #endif
  // 启动补发（杀进程期间错过的）+ 晨报检查
  catchUp();
  // 全局前台扫描循环（60s；不止日历页才跑）
  startForegroundLoop();
}

function safeParse(p) {
  if (!p) return {};
  if (typeof p === "object") return p;
  try {
    return JSON.parse(p);
  } catch (e) {
    return {};
  }
}

function initVersion() {
  // #ifdef APP-PLUS
  // manifest 的 versionName/versionCode 是「当前版本」单一事实源;启动时同步进本地缓存
  getAppVersion().then((v) => {
    if (v.version) {
      localdb.setMeta("app_version", v.version);
      localdb.setMeta("app_version_code", v.versionCode);
    }
  });
  // #endif
}

function initConfig() {
  useConfigStore().setConfig(config);
}

function checkLogin() {
  // 本地优先：未登录也直接进日历（本地数据可用）；登录在「我的」页发起，触发同步。
  // token 失效时由 request 拦截器按需跳转登录。
  if (!getToken()) {
    console.info('[App] 未登录，进入离线日历模式（本地数据可用，登录后同步）');
  }
}
</script>

<style>
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Global Reset for UniApp/Mobile */
page,
body {
  height: 100%;
  min-height: 100%;
  overflow-x: hidden;
  /* Prevent default bounce effect on iOS if needed, or just handle overflow */
}

/* Global box-sizing for consistency with Tailwind preflight */
page,
view,
scroll-view,
image,
text,
button,
input,
textarea,
label,
navigator {
  box-sizing: border-box;
}

/* 修复 H5 端 uni.showToast 图标在引入 Tailwind 后可能偏左的问题 */
/* #ifdef H5 */
uni-toast img,
uni-toast svg {
  display: inline-block !important;
}
/* #endif */

/* Hide scrollbar for Chrome/Safari/Webkit */
::-webkit-scrollbar {
  display: none;
  width: 0 !important;
  height: 0 !important;
  -webkit-appearance: none;
  background: transparent;
}
</style>
