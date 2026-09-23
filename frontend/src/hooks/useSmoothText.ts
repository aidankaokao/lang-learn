import { useEffect, useRef, useState } from "react";

// 每拍的間隔與「最多讓畫面落後幾拍」
const TICK_MS = 40;
const CATCH_UP_TICKS = 10;
const MIN_TOKENS_PER_TICK = 2;

/**
 * 一個 token = 前面的空白 + 一個英文單字，或一個中日韓字元（中文沒有空白可切，只能逐字）。
 * useSmoothText 與 rehypeFadeWords 共用同一套切法，淡入的單位才會和放出的單位一致。
 */
const CJK = "\\u3000-\\u9fff\\uac00-\\ud7af\\uff00-\\uffef";
export const TOKEN_RE = new RegExp(`\\s*(?:[${CJK}]|[^\\s${CJK}]+)|\\s+$`, "g");

/**
 * Smooth streaming：把一段段湧進來的文字，以固定節奏一次放出幾個 token。
 *
 * 網路送來的量忽多忽少（常常一次一大段、然後停一下），直接顯示會一頓一頓的。
 * 這裡先緩衝，每 40ms 放出一小批；積壓越多每批越大，確保畫面最多落後約 0.4 秒。
 * 搭配 ChatMarkdown 的淡入，看起來是文字「浮現」而不是打字機逐字敲出。
 *
 * active=false 且一開始就有完整文字（例如歷史紀錄）時直接顯示，不播動畫；
 * 串流結束（active 變 false）但還有積壓時，會繼續放完。
 */
export function useSmoothText(target: string, active: boolean) {
  const [shown, setShown] = useState(active ? "" : target);
  const shownRef = useRef(shown);

  useEffect(() => {
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      const current = shownRef.current;

      // 目標不是目前內容的延續（例如整段被換掉）→ 直接對齊，不硬播
      if (!target.startsWith(current)) {
        shownRef.current = target;
        setShown(target);
        return;
      }
      if (current.length === target.length) {
        if (active) frame = requestAnimationFrame(tick); // 等下一批
        return;
      }

      if (now - last >= TICK_MS) {
        last = now;
        const backlog = target.slice(current.length);
        const tokens = backlog.match(TOKEN_RE) ?? [backlog];
        const count = Math.max(MIN_TOKENS_PER_TICK, Math.ceil(tokens.length / CATCH_UP_TICKS));
        const next = current + tokens.slice(0, count).join("");
        shownRef.current = next;
        setShown(next);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active]);

  return shown;
}
