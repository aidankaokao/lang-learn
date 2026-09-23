import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 純音檔播放器（BBC Learning English 的 mp3），介面與 useYouTubePlayer 相同，
 * 頁面的 AB 循環、逐句高亮不必分來源。
 *
 * 同樣用 100ms 輪詢播放位置：<audio> 雖然有 timeupdate，但約 250ms 才觸發一次，
 * AB 循環在 B 點會明顯多播半個字。
 *
 * 手機限制和 YouTube 一樣：play() 必須在使用者手勢的同一個呼叫堆疊裡。
 * iOS 在第一次 play() 前不一定會載入 metadata，此時設 currentTime 會被忽略，
 * 所以 seek 先記在 pendingRef，等 loadedmetadata 再套用。
 */
export function useAudioPlayer(src: string | undefined) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;

    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = src;
    audioRef.current = audio;
    setError(null);

    const onMetadata = () => {
      setDurationMs(Math.round(audio.duration * 1000) || 0);
      if (pendingRef.current !== null) {
        audio.currentTime = pendingRef.current / 1000;
        pendingRef.current = null;
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => setError("音檔無法播放（可能是原網站移除了檔案，或網路連線有問題）");

    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("error", onError);
    // 不等 metadata：iOS 在使用者按播放前可能永遠不載入，等下去頁面會一直卡在未就緒
    setReady(true);

    return () => {
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load(); // 放掉網路連線
      audioRef.current = null;
      pendingRef.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [src]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const a = audioRef.current;
      if (!a) return;
      // 還沒套用的 seek 以它為準，否則 AB 循環會以為還在 0 秒而一直重跳
      setCurrentMs(pendingRef.current ?? Math.round(a.currentTime * 1000));
    }, 100);
    return () => window.clearInterval(timer);
  }, [ready]);

  const setTime = useCallback((a: HTMLAudioElement, ms: number) => {
    if (a.readyState >= HTMLMediaElement.HAVE_METADATA) {
      a.currentTime = ms / 1000;
      pendingRef.current = null;
    } else {
      pendingRef.current = ms;
    }
  }, []);

  const seek = useCallback(
    (ms: number, autoplay = true) => {
      const a = audioRef.current;
      if (!a) return;
      setTime(a, ms);
      setCurrentMs(ms);
      // 非手勢觸發的 play() 可能被瀏覽器擋，擋了就停在原地等使用者按播放
      if (autoplay) void a.play().catch(() => undefined);
    },
    [setTime],
  );

  /** 換一個音檔並直接播（對應 useYouTubePlayer.loadVideo，必須在點擊事件裡同步呼叫）。 */
  const loadVideo = useCallback(
    (nextSrc: string, startMs = 0) => {
      const a = audioRef.current;
      if (!a) return;
      if (a.src !== nextSrc) {
        const rate = a.playbackRate;
        a.src = nextSrc;
        a.playbackRate = rate; // 換 src 會把速度重設回 defaultPlaybackRate
      }
      setTime(a, startMs);
      setCurrentMs(startMs);
      void a.play().catch(() => undefined);
    },
    [setTime],
  );

  const play = useCallback(() => void audioRef.current?.play().catch(() => undefined), []);
  const pause = useCallback(() => audioRef.current?.pause(), []);
  const setRate = useCallback((rate: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = rate;
    a.defaultPlaybackRate = rate;
  }, []);

  return { ready, playing, currentMs, durationMs, error, seek, loadVideo, play, pause, setRate };
}
