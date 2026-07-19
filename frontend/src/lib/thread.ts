/**
 * 對話串跟著頁面走：在哪一頁就接續哪一頁的對話。
 *
 * 影片頁刻意沿用 `video-<id>`，和學習頁原本的對話串是同一條，
 * 所以改成懸浮視窗之後，先前的問答紀錄不會不見。
 */
export type ThreadTarget = {
  threadId: string;
  /** 帶給後端的影片 id：有值時 tutor 才能用 search_transcript 查證原文 */
  videoId: number | null;
  label: string;
};

export function resolveThread(pathname: string): ThreadTarget {
  const video = pathname.match(/^\/videos\/(\d+)/);
  if (video) {
    return { threadId: `video-${video[1]}`, videoId: Number(video[1]), label: "這支影片" };
  }

  const clip = pathname.match(/^\/clips\/(\d+)/);
  if (clip) {
    return { threadId: `clip-${clip[1]}`, videoId: null, label: "這個例句" };
  }

  if (pathname.startsWith("/clips")) return { threadId: "clips", videoId: null, label: "例句庫" };
  if (pathname.startsWith("/phrases")) return { threadId: "phrases", videoId: null, label: "片語庫" };
  if (pathname.startsWith("/videos")) return { threadId: "videos", videoId: null, label: "影片庫" };

  return { threadId: "general", videoId: null, label: "一般問答" };
}
