// YouTube IFrame Player API 載入器。
// 我們不下載音訊，AB 循環是靠這個播放器的 seekTo / getCurrentTime 控制的。

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const SCRIPT_SRC = "https://www.youtube.com/iframe_api";

let apiPromise: Promise<any> | null = null;

/** 載入 IFrame API（整個 app 只會載一次）。 */
export function loadYouTubeApi(): Promise<any> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    // API 準備好時會呼叫這個全域函式（YouTube 的規格）
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };

    if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => reject(new Error("無法載入 YouTube 播放器，請檢查網路連線"));
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

export const PLAYBACK_RATES = [0.5, 0.75, 1] as const;
