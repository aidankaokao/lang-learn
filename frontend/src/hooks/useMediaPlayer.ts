import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { isAudioSource } from "@/lib/media";
import type { Video } from "@/lib/types";

/**
 * 依影片來源挑播放器：YouTube 走 IFrame，BBC 走 <audio>。
 * 兩個 hook 都會呼叫（React 規定 hook 數量固定），沒用到的那個拿到 undefined 就什麼都不做。
 *
 * `containerRef` 只有 YouTube 需要（它會把那個 div 換成 iframe），
 * 所以頁面在 `isAudio` 時改顯示封面圖，不掛 containerRef。
 */
export function useMediaPlayer(video: Pick<Video, "source" | "youtube_id" | "media_url"> | null) {
  const isAudio = video ? isAudioSource(video) : false;
  const youtube = useYouTubePlayer(video && !isAudio ? video.youtube_id : undefined);
  const audio = useAudioPlayer(video && isAudio ? (video.media_url ?? undefined) : undefined);

  const active = isAudio ? audio : youtube;
  return { ...active, containerRef: youtube.containerRef, isAudio };
}
