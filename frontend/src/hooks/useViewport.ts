import { useEffect, useState } from "react";

/** 訂閱 CSS media query，例如 useMediaQuery("(max-width: 639px)")。 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * 「扣掉鍵盤後」真正看得到的範圍。
 *
 * 手機的 100vh 不會因為鍵盤彈出而變小，貼底的全螢幕面板會被鍵盤蓋住、
 * 標題列被推出畫面。visualViewport 才是實際可見的區域：
 *   height     可見高度（鍵盤彈出時變小）
 *   offsetTop  iOS 彈鍵盤時會把整頁往上捲，面板要跟著往下補回這段位移
 * 不支援 visualViewport 的瀏覽器退回 window.innerHeight。
 */
export function useVisualViewport(enabled = true) {
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }));

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    const update = () =>
      setViewport({
        height: vv?.height ?? window.innerHeight,
        offsetTop: vv?.offsetTop ?? 0,
      });
    update();

    const target = vv ?? window;
    target.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      target.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return viewport;
}
