#!/usr/bin/env bash
# 一键打 Windows exe：临时移除 packageManager（绕 pnpm 收集器兼容问题）→ 构建 H5 → electron-builder → 还原
set -e
cd "$(dirname "$0")/.."

remove_pm() {
  node -e 'const fs=require("fs");const f="package.json";const p=JSON.parse(fs.readFileSync(f));if(p.packageManager){p._pm=p.packageManager;delete p.packageManager;fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n");console.log("[build] removed packageManager")}'
}
restore_pm() {
  node -e 'const fs=require("fs");const f="package.json";const p=JSON.parse(fs.readFileSync(f));if(p._pm){p.packageManager=p._pm;delete p._pm;fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n");console.log("[build] restored packageManager")}' || true
}
remove_pm
trap restore_pm EXIT

export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
export CSC_IDENTITY_AUTO_DISCOVERY=false

echo "[build] H5..."
npm run build:h5
echo "[build] electron-builder win nsis+portable..."
npx electron-builder --win nsis portable
echo "[build] done. 产物："
ls -lh release-win2/*.exe 2>/dev/null || true
