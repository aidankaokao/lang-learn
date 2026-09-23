// 影片來源的判斷集中在這裡：YouTube 走 IFrame 播放器，其他（目前只有 BBC）走 <audio>。

export type MediaSource = "youtube" | "bbc";

/** 舊資料的 source 是 null，一律視為 YouTube。 */
export function isAudioSource(item: { source?: MediaSource | null; media_url?: string | null }) {
  return item.source === "bbc" && !!item.media_url;
}
