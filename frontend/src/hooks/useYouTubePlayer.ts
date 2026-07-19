/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";

import { loadYouTubeApi } from "@/lib/youtube";

/**
 * 掛一個 YouTube 播放器，並以 100ms 輪詢目前播放位置。
 * 輪詢是必要的：IFrame API 沒有 timeupdate 事件，AB 循環要靠它判斷有沒有播過 B 點。
 */
export function useYouTubePlayer(videoId: string | undefined) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId || !containerRef.current) return;

    let cancelled = false;
    let player: any = null;

    void loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !containerRef.current) return;
        player = new YT.Player(containerRef.current, {
          videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              setDurationMs(Math.round((player.getDuration?.() ?? 0) * 1000));
              setReady(true);
            },
            onStateChange: (e: any) => {
              if (!cancelled) setPlaying(e.data === YT.PlayerState.PLAYING);
            },
            onError: () => {
              if (!cancelled) setError("這支影片無法嵌入播放（可能被上傳者限制或已下架）");
            },
          },
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      setReady(false);
      playerRef.current = null;
      player?.destroy?.();
    };
  }, [videoId]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      setCurrentMs(Math.round(p.getCurrentTime() * 1000));
      if (!durationMs && p.getDuration) setDurationMs(Math.round(p.getDuration() * 1000));
    }, 100);
    return () => window.clearInterval(timer);
  }, [ready, durationMs]);

  const seek = useCallback((ms: number, autoplay = true) => {
    const p = playerRef.current;
    if (!p?.seekTo) return;
    p.seekTo(ms / 1000, true);
    setCurrentMs(ms);
    if (autoplay) p.playVideo?.();
  }, []);

  /**
   * 在既有播放器上換一支影片並直接播。
   *
   * 手機瀏覽器要求「播放」必須發生在使用者手勢的同一個呼叫堆疊裡。
   * 如果等點擊後才建立播放器，等它 ready 再 playVideo 已經來不及，
   * 會變成沒有聲音但狀態顯示 playing。所以播放器要常駐，切換影片走這支。
   */
  const loadVideo = useCallback((nextVideoId: string, startMs = 0) => {
    const p = playerRef.current;
    if (!p?.loadVideoById) return;
    p.loadVideoById({ videoId: nextVideoId, startSeconds: startMs / 1000 });
    setCurrentMs(startMs);
  }, []);

  const play = useCallback(() => playerRef.current?.playVideo?.(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo?.(), []);
  const setRate = useCallback((rate: number) => playerRef.current?.setPlaybackRate?.(rate), []);

  return {
    containerRef,
    ready,
    playing,
    currentMs,
    durationMs,
    error,
    seek,
    loadVideo,
    play,
    pause,
    setRate,
  };
}
