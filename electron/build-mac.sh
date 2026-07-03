#!/usr/bin/env bash
# macOS 上执行：打 .dmg + .zip（仅限 macOS 主机，electron-builder 不支持跨平台打 mac 包）
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

export CSC_IDENTITY_AUTO_DISCOVERY=false  # 无开发者证书时不尝试签名

echo "[build] H5..."
npm run build:h5
echo "[build] electron-builder mac dmg+zip..."
npx electron-builder --mac dmg zip
echo "[build] done. 产物："
ls -lh release-mac/*.dmg release-mac/*.zip 2>/dev/null || ls -lh release*/*.dmg 2>/dev/null || true
