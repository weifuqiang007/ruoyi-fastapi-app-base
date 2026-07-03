<template>
  <view class="flex h-full flex-col overflow-y-auto bg-gray-50 pt-4 pb-10">
    <!-- 提醒设置 -->
    <view class="px-4 pb-1 pt-2">
      <text class="text-xs font-bold text-gray-400">提醒设置</text>
    </view>
    <view class="mb-4 bg-white">
      <view class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <view class="flex items-center">
          <view class="i-mdi-bell-snooze text-xl text-indigo-500 mr-3"></view>
          <view>
            <text class="block text-base text-gray-800">稍后提醒（分钟）</text>
            <text class="block text-[11px] text-gray-400">浮层点「稍后」时默认延后的分钟数</text>
          </view>
        </view>
        <input
          v-model="snoozeMin"
          type="number"
          class="w-16 rounded-lg bg-gray-100 px-2 py-1 text-right text-sm text-gray-800"
          @blur="saveSnooze"
        />
      </view>
      <view class="flex items-center justify-between px-5 py-4">
        <view class="flex items-center">
          <view class="i-mdi-weather-sunny text-xl text-orange-500 mr-3"></view>
          <view>
            <text class="block text-base text-gray-800">晨报时点（小时）</text>
            <text class="block text-[11px] text-gray-400">每日几点推送「今天 N 件待办」摘要</text>
          </view>
        </view>
        <input
          v-model="briefingHour"
          type="number"
          class="w-16 rounded-lg bg-gray-100 px-2 py-1 text-right text-sm text-gray-800"
          @blur="saveBriefing"
        />
      </view>
    </view>

    <view class="bg-white">
      <!-- Change Password -->
      <view
        class="flex items-center justify-between border-b border-gray-100 px-5 py-4 active:bg-gray-50"
        @click="handleToPwd"
      >
        <view class="flex items-center">
          <view class="i-mdi-lock text-xl text-gray-600 mr-3"></view>
          <text class="text-base text-gray-800">修改密码</text>
        </view>
        <view class="i-mdi-chevron-right text-base text-gray-400"></view>
      </view>

      <!-- Check Update -->
      <view
        class="flex items-center justify-between border-b border-gray-100 px-5 py-4 active:bg-gray-50"
        @click="handleToUpgrade"
      >
        <view class="flex items-center">
          <view class="i-mdi-refresh text-xl text-gray-600 mr-3"></view>
          <text class="text-base text-gray-800">检查更新</text>
        </view>
        <view class="flex items-center">
          <text class="text-sm text-gray-400 mr-2">v{{ currentVersion }}</text>
          <view class="i-mdi-chevron-right text-base text-gray-400"></view>
        </view>
      </view>

      <!-- Clean Cache -->
      <view
        class="flex items-center justify-between px-5 py-4 active:bg-gray-50"
        @click="handleCleanTmp"
      >
        <view class="flex items-center">
          <view class="i-mdi-delete text-xl text-gray-600 mr-3"></view>
          <text class="text-base text-gray-800">清理缓存</text>
        </view>
        <view class="i-mdi-chevron-right text-base text-gray-400"></view>
      </view>
    </view>

    <!-- Logout -->
    <view class="mt-8 px-4">
      <view
        class="flex h-12 w-full items-center justify-center rounded-xl bg-red-50 text-base font-semibold text-red-600 transition-colors active:bg-red-100"
        @click="handleLogout"
        >退出登录</view
      >
    </view>
  </view>
</template>

<script setup>
import { useUserStore } from "@/store";
import { getCurrentInstance, ref } from "vue";
import localdb from "@/utils/localdb";
import { checkAndUpdate, getCurrentVersion } from "@/utils/updater";

const { proxy } = getCurrentInstance();

// 当前版本(优先 App 运行时同步值,fallback config.js 硬编码)
const currentVersion = ref(getCurrentVersion());

// 提醒设置（存本地 meta，由 local_reminder 读取）
const snoozeMin = ref(String(localdb.getMeta("snooze_minutes", 15) || 15));
const briefingHour = ref(String(localdb.getMeta("briefing_hour", 8) || 8));
function saveSnooze() {
  const v = Math.max(1, Math.min(1440, parseInt(snoozeMin.value, 10) || 15));
  snoozeMin.value = String(v);
  localdb.setMeta("snooze_minutes", v);
  proxy.$modal.showToast("已保存");
}
function saveBriefing() {
  const v = Math.max(0, Math.min(23, parseInt(briefingHour.value, 10) || 8));
  briefingHour.value = String(v);
  localdb.setMeta("briefing_hour", v);
  proxy.$modal.showToast("已保存");
}

function handleToPwd() {
  proxy.$tab.navigateTo("/pages/mine/pwd/index");
}

function handleToUpgrade() {
  checkAndUpdate();
}

function handleCleanTmp() {
  proxy.$modal.showToast("模块建设中~");
}

function handleLogout() {
  proxy.$modal.confirm("确定注销并退出系统吗？").then(() => {
    useUserStore()
      .logOut()
      .then(() => {})
      .finally(() => {
        proxy.$tab.reLaunch("/pages/index");
      });
  });
}
</script>

<style>
page {
  height: 100%;
  background-color: #f9fafb;
}
</style>
