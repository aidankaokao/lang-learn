import { Eye, Headphones, Loader2, PenLine, Repeat, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Pagination } from "@/components/Pagination";
import { SearchBox } from "@/components/SearchBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePagination } from "@/hooks/usePagination";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { Clip } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePageHeader } from "@/stores/pageHeader";

export function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<Clip | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [translating, setTranslating] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  // 原文、中文對照、影片標題都能搜
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clips;
    return clips.filter((c) =>
      [c.text, c.translation, c.video_title].some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [clips, query]);

  const { page, setPage, pageCount, paged, total } = usePagination(filtered);

  // 一個播放器輪流服務所有例句：換例句時 hook 會自己重建
  const player = useYouTubePlayer(playing?.youtube_id);
  const { ready, currentMs, seek } = player;

  useEffect(() => {
    usePageHeader.getState().set("例句庫", "點播放就會一直循環，適合塞著耳機重複聽");
  }, []);

  const reload = useCallback(async () => {
    try {
      setClips(await api.get<Clip[]>("/clips"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 播放器就緒 → 跳到 A 點
  useEffect(() => {
    if (ready && playing) seek(playing.start_ms);
  }, [ready, playing, seek]);

  // 播過 B 點就跳回 A，形成無限循環，直到使用者按停止
  useEffect(() => {
    if (!playing || !ready) return;
    if (currentMs >= playing.end_ms || currentMs < playing.start_ms - 800) seek(playing.start_ms);
  }, [currentMs, playing, ready, seek]);

  function togglePlay(clip: Clip) {
    setPlaying((prev) => (prev?.id === clip.id ? null : clip));
  }

  async function reveal(clip: Clip) {
    // 已經翻好就直接掀開；沒翻過才呼叫 LLM
    if (clip.translation) {
      setRevealed((prev) => new Set(prev).add(clip.id));
      return;
    }
    setTranslating(clip.id);
    try {
      const updated = await api.post<Clip>(`/clips/${clip.id}/translate`);
      setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, ...updated } : c)));
      setRevealed((prev) => new Set(prev).add(clip.id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTranslating(null);
    }
  }

  function hide(clipId: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.delete(clipId);
      return next;
    });
  }

  async function remove(clip: Clip) {
    if (!window.confirm("確定刪除這個例句？練習紀錄也會一起刪掉。")) return;
    try {
      await api.del(`/clips/${clip.id}`);
      if (playing?.id === clip.id) setPlaying(null);
      toast.success("已刪除");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12 text-muted-foreground">
        <Loader2 className="animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <Card className="animate-fade-up">
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          還沒有例句。到
          <Link to="/videos" className="px-1 text-primary underline-offset-4 hover:underline">
            影片庫
          </Link>
          挑一支影片，用 A / B 框出想練的段落存起來。
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* 正在播放的迷你播放器：手機上必須看得到播放器，瀏覽器才肯播 */}
      {playing && (
        <Card className="animate-fade-up sticky top-0 z-10">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-xl bg-black/80 sm:w-32">
              <div ref={player.containerRef} className="h-full w-full" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="teal" className="gap-1">
                  <Repeat className="h-3 w-3" strokeWidth={1.75} />
                  循環中
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatTime(playing.start_ms)} – {formatTime(playing.end_ms)}
                </span>
              </div>
              <p className="truncate pt-1 text-sm">{playing.text}</p>
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setPlaying(null)}>
              <Square strokeWidth={1.75} />
              停止
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <SearchBox value={query} onChange={setQuery} placeholder="搜尋例句原文、中文或影片標題…" />

        {filtered.length === 0 && (
          <Card className="animate-fade-up">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              找不到符合「{query}」的例句。
            </CardContent>
          </Card>
        )}

        {paged.map((clip) => {
          const isPlaying = playing?.id === clip.id;
          const isRevealed = revealed.has(clip.id);

          return (
            <Card key={clip.id} className="animate-fade-up">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  {/* 主要動作：循環聆聽 */}
                  <Button
                    variant={isPlaying ? "secondary" : "gradient"}
                    size="icon"
                    className="mt-0.5 shrink-0"
                    onClick={() => togglePlay(clip)}
                    title={isPlaying ? "停止" : "循環播放"}
                  >
                    {isPlaying ? (
                      <Square strokeWidth={1.75} />
                    ) : (
                      <Headphones strokeWidth={1.75} />
                    )}
                  </Button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm leading-relaxed">{clip.text || "（沒有對應的文字稿）"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {clip.video_title} · {formatTime(clip.start_ms)}
                      {clip.review_count > 0 && ` · 練習 ${clip.review_count} 次`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {/* 次要動作：進聽寫練習 */}
                    <Link to={`/clips/${clip.id}`}>
                      <Button variant="ghost" size="icon" title="聽寫練習">
                        <PenLine className="h-4 w-4" strokeWidth={1.75} />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" title="刪除" onClick={() => remove(clip)}>
                      <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
                    </Button>
                  </div>
                </div>

                {/* 中文對照：預設打霧，點了才看 */}
                {clip.text && (
                  <div
                    className="glass-soft relative cursor-pointer rounded-xl px-3 py-2"
                    onClick={() => (isRevealed ? hide(clip.id) : reveal(clip))}
                  >
                    {translating === clip.id ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                        翻譯中…
                      </p>
                    ) : (
                      <>
                        <p
                          className={cn(
                            "text-sm transition-all",
                            !isRevealed && "select-none blur-[5px]",
                          )}
                        >
                          {clip.translation ?? "點一下顯示中文對照"}
                        </p>
                        {!isRevealed && (
                          <span className="absolute inset-0 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
                            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                            點一下看中文
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Pagination page={page} pageCount={pageCount} total={total} onChange={setPage} />
      </div>
    </>
  );
}
