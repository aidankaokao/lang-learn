// 文字轉語音：走後端的 /api/tts（微軟 Edge Neural 語音，見 backend/services/tts_service.py）。
//
// 為什麼不用瀏覽器內建的 Web Speech API：微軟語音是 Windows 的系統語音，
// Linux 上拿不到，只會退化成 espeak（機械音）。走後端則不分作業系統都一樣。
// 後端連不上時仍會退回瀏覽器語音，至少有聲音。

import { api } from "@/lib/api";

export type Voice = { id: string; label: string };

const VOICE_KEY = "yt-learn-voice";
export const FALLBACK_VOICE = "en-GB-SoniaNeural";

export function getVoice(): string {
  return localStorage.getItem(VOICE_KEY) || FALLBACK_VOICE;
}

export function setVoice(voice: string): void {
  localStorage.setItem(VOICE_KEY, voice);
}

let current: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  if (current) {
    current.pause();
    URL.revokeObjectURL(current.src);
    current = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

/** 朗讀一段英文。rate 是相對語速百分比（0 為原速，-20 約等於放慢一點）。 */
export async function speak(
  text: string,
  options: { rate?: number; onEnd?: () => void } = {},
): Promise<void> {
  stopSpeaking();

  try {
    const blob = await api.blob("/tts", {
      text,
      voice: getVoice(),
      rate: options.rate ?? -10, // 稍慢一點，適合跟讀
    });

    const audio = new Audio(URL.createObjectURL(blob));
    current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      if (current === audio) current = null;
      options.onEnd?.();
    };
    await audio.play();
  } catch (e) {
    options.onEnd?.();
    speakWithBrowser(text);
    throw e; // 讓呼叫端知道走了退路，可以提示使用者
  }
}

/** 後備方案：瀏覽器內建語音（品質看作業系統）。 */
function speakWithBrowser(text: string): void {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
