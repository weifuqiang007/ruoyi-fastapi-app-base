import request from "@/utils/request";

/**
 * App 版本发布接口(wgt 资源热更新)
 *
 * 后端为薄层:/release/check 比对版本返回 wgt 下载地址,客户端本地下载热安装。
 * /release/check 免鉴权(后端未挂 PreAuthDependency),但走加密 request 即可。
 */

// 检查更新:传平台与当前 versionCode,返回 {hasUpdate, version, downloadUrl, forceUpdate...}
export function checkRelease(data) {
  return request({
    url: "/release/check",
    method: "post",
    data,
  });
}

export default { checkRelease };
