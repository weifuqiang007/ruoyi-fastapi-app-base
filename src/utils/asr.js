/**
 * 语音识别工具（ASR）—— 前端侧
 *
 * 设计取舍（见后端落地确认书 §三修正：第一期 ASR 放前端，后端只做语义结构化）：
 *  - H5（网页端 / Tauri 桌面）：用浏览器 Web Speech API（webkitSpeechRecognition），实时识别，开箱即用。
 *  - App / 小程序：用 uni.getRecorderManager 录音；ASR 需平台能力（微信小程序自带语音识别插件；
 *    App 用 plus.speech 或第三方原生插件）。本文件提供录音 + 可插拔识别钩子，未配置时降级为"请手输"。
 *  - 任何端、任何失败都不阻断：new.vue 页面始终允许直接输入文本。
 */

// 当前是否支持"实时语音识别"（仅 H5 Web Speech API 可探测）
export function isSpeechRecognitionSupported() {
  // #ifdef H5
  const g = typeof window !== "undefined" ? window : {};
  return !!(g.SpeechRecognition || g.webkitSpeechRecognition);
  // #endif
  // #ifndef H5
  return false;
  // #endif
}

/**
 * H5：启动一次实时语音识别。
 * @param {object} handlers { onResult(text, isFinal), onError(err), onEnd() }
 * @returns {object|null} controller { stop() } 或 null（不支持）
 */
export function startSpeechRecognition({ onResult, onError, onEnd } = {}) {
  // #ifdef H5
  const SR =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onError && onError(new Error("当前浏览器不支持语音识别"));
    return null;
  }
  const rec = new SR();
  rec.lang = "zh-CN";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (event) => {
    let text = "";
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
      if (event.results[i].isFinal) isFinal = true;
    }
    onResult && onResult(text, isFinal);
  };
  rec.onerror = (e) => onError && onError(e);
  rec.onend = () => onEnd && onEnd();
  try {
    rec.start();
  } catch (e) {
    onError && onError(e);
    return null;
  }
  return { stop: () => rec.stop() };
  // #endif
  // #ifndef H5
  onError && onError(new Error("当前端请使用录音识别模式 recordAndRecognize"));
  return null;
  // #endif
}

/**
 * App / 小程序：录音 + 识别（可插拔）。
 * 第一步用 RecorderManager 录音到临时文件；第二步 ASR 由 asrProvider 提供
 * （微信小程序可接 wx 插件；App 可接 plus.speech / 第三方）。
 *
 * @param {function} asrProvider async (filePath) => string  识别器，返回文本
 * @param {function} onStatus (s) => void  状态回调：recording / recognizing
 * @returns {Promise<string>} 识别文本
 */
export function recordAndRecognize(asrProvider, onStatus) {
  return new Promise((resolve, reject) => {
    // #ifdef H5
    reject(new Error("H5 请使用 startSpeechRecognition"));
    // #endif
    // #ifndef H5
    if (!asrProvider) {
      reject(
        new Error(
          "未配置 ASR 识别器：小程序请在 manifest 开启语音识别插件，App 请接入 plus.speech 或第三方插件"
        )
      );
      return;
    }
    const rm = uni.getRecorderManager();
    let tempPath = null;
    rm.onStop((res) => {
      tempPath = res.tempFilePath;
      onStatus && onStatus("recognizing");
      Promise.resolve(asrProvider(tempPath))
        .then((text) => resolve((text || "").trim()))
        .catch((e) => reject(e));
    });
    rm.onError((e) => reject(e));
    onStatus && onStatus("recording");
    rm.start({
      duration: 60000, // 最长 60s
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: "mp3",
    });
    // 暴露 stop 以便 UI 主动结束录音
    arguments.callee._controller = { stop: () => rm.stop() };
    // #endif
  });
}

/**
 * 便捷方法：识别一句（自动选择最优路径）。
 * - H5 优先 Web Speech API
 * - 其它端走 recordAndRecognize(asrProvider)
 */
export async function recognizeOnce(asrProvider, onStatus) {
  if (isSpeechRecognitionSupported()) {
    return new Promise((resolve, reject) => {
      let finalText = "";
      const ctrl = startSpeechRecognition({
        onResult: (text, isFinal) => {
          finalText = text;
          onStatus && onStatus(text, isFinal);
          if (isFinal) {
            setTimeout(() => resolve(finalText.trim()), 50);
          }
        },
        onError: (e) => reject(e),
      });
      if (!ctrl) reject(new Error("语音识别不可用"));
      // 兜底：15s 自动结束
      setTimeout(() => {
        if (ctrl) ctrl.stop();
      }, 15000);
    });
  }
  return recordAndRecognize(asrProvider, onStatus);
}
