import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  Loader2,
  Pause,
  Play,
  Repeat,
  ScrollText,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { Clip, PhraseCandidate, Segment, Video } from "@/lib/types";
import { PLAYBACK_RATES } from "@/lib/youtube";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/stores/assistant";
import { usePageHeader } from "@/stores/pageHeader";

export function StudyPage() {
  const { videoId } = useParams();
  const id = Number(videoId);

  const [video, setVideo] = useState<Video | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);

  // AB 循環
  const [pointA, setPointA] = useState<number | null>(null);
  const [pointB, setPointB] = useState<number | null>(null);
  const [looping, setLooping] = useState(true);
  const [rate, setRateState] = useState(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [saving, setSaving] = useState(false);

  // 字幕時間軸微調：YouTube 自動字幕本來就可能與實際語音差幾秒，
  // 這裡讓使用者自己校正，每支影片各自記在瀏覽器。
  const [offsetMs, setOffsetMs] = useState(0);

  // 片語萃取
  const [candidates, setCandidates] = useState<PhraseCandidate[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [savedPhrases, setSavedPhrases] = useState<Set<string>>(new Set());
  const [savingPhrase, setSavingPhrase] = useState<string | null>(null);
  const [resegmenting, setResegmenting] = useState(false);

  // 手機版把「例句」「片語萃取」預設收起來，免得把文字稿擠到很下面；
  // 桌機不受影響（內容一律 lg:block）。
  const [clipsOpen, setClipsOpen] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);

  const player = useYouTubePlayer(video?.youtube_id);
  const { currentMs, seek, play, pause, playing, setRate } = player;
  const segmentRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ── 載入資料 ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [v, s, c] = await Promise.all([
          api.get<Video>(`/videos/${id}`),
          api.get<Segment[]>(`/videos/${id}/segments`),
          api.get<Clip[]>(`/clips?video_id=${id}`),
        ]);
        if (cancelled) return;
        setVideo(v);
        setSegments(s);
        setClips(c);
        usePageHeader.getState().set(v.title ?? "學習", v.channel ?? undefined);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── 字幕偏移：讀取 / 儲存 ──
  useEffect(() => {
    setOffsetMs(Number(localStorage.getItem(`yt-learn-offset-${id}`)) || 0);
  }, [id]);

  function changeOffset(deltaMs: number) {
    setOffsetMs((prev) => {
      const next = Math.max(-10_000, Math.min(10_000, prev + deltaMs));
      localStorage.setItem(`yt-learn-offset-${id}`, String(next));
      return next;
    });
  }

  /** 套用偏移後的文字稿，畫面與擷取一律用這份，避免顯示與存檔不一致。 */
  const timedSegments = useMemo(
    () =>
      segments.map((s) => ({
        ...s,
        start_ms: Math.max(0, s.start_ms + offsetMs),
        end_ms: Math.max(0, s.end_ms + offsetMs),
      })),
    [segments, offsetMs],
  );

  // ── AB 循環：播過 B 點就跳回 A ──
  useEffect(() => {
    if (!looping || pointA === null || pointB === null) return;
    if (currentMs >= pointB) seek(pointA);
  }, [looping, pointA, pointB, currentMs, seek]);

  // ── 目前播到第幾句 ──
  // 取「開始時間在目前播放點之前」的最後一段。
  // 不能用 findIndex 找「包含目前時間的第一段」—— 段落時間可能重疊（自動字幕尤其明顯），
  // 那樣會一直挑中上一段，直到上一段的結束時間過了才跳過來。
  const currentIdx = useMemo(() => {
    let found = -1;
    for (let i = 0; i < timedSegments.length; i++) {
      if (timedSegments[i].start_ms > currentMs) break;
      found = i;
    }
    return found;
  }, [timedSegments, currentMs]);

  useEffect(() => {
    if (!autoScroll || currentIdx < 0) return;
    segmentRefs.current[currentIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIdx, autoScroll]);

  // ── 操作 ──
  const selectSegment = useCallback(
    (segment: Segment) => {
      // 點一句 = 把 AB 直接設成那一句，這是最常用的擷取方式
      setPointA(segment.start_ms);
      setPointB(segment.end_ms);
      seek(segment.start_ms);
    },
    [seek],
  );

  function changeRate(value: number) {
    setRateState(value);
    setRate(value);
  }

  function playRange(start: number, end: number) {
    setPointA(start);
    setPointB(end);
    setLooping(true);
    seek(start);
  }

  const rangeValid = pointA !== null && pointB !== null && pointB > pointA;

  async function saveClip() {
    if (!rangeValid) return;
    setSaving(true);
    try {
      // 文字快照在前端算：後端不知道使用者調過偏移，讓它自己抓會抓到沒校正的句子。
      // 只有「重疊夠多」的段落才算數 —— 段落時間可能互相重疊個幾百毫秒，
      // 用單純的 overlap > 0 會把上一段的尾巴也抓進來。
      const snapshot = timedSegments
        .filter((s) => {
          const overlap = Math.min(s.end_ms, pointB!) - Math.max(s.start_ms, pointA!);
          const duration = Math.max(1, s.end_ms - s.start_ms);
          return overlap >= Math.min(500, duration * 0.5);
        })
        .map((s) => s.text)
        .join(" ")
        .trim();

      const clip = await api.post<Clip>("/clips", {
        video_id: id,
        start_ms: pointA,
        end_ms: pointB,
        text: snapshot || undefined,
      });
      setClips((prev) => [clip, ...prev]);
      toast.success("已存成例句");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function resegment() {
    if (
      !window.confirm(
        "讓 AI 補上標點並重新斷句？\n" +
          "已存的例句與片語不受影響，但文字稿的分段會整份換掉。",
      )
    )
      return;

    setResegmenting(true);
    try {
      await api.post(`/videos/${id}/resegment`);
      setSegments(await api.get<Segment[]>(`/videos/${id}/segments`));
      toast.success("已重新斷句");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResegmenting(false);
    }
  }

  async function extractPhrases() {
    setExtracting(true);
    try {
      const result = await api.post<PhraseCandidate[]>("/phrases/extract", { video_id: id });
      setCandidates(result);
      toast.success(result.length ? `找到 ${result.length} 個候選片語` : "沒有找到新的片語");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  async function savePhrase(text: string, meaning?: string, difficulty?: string) {
    setSavingPhrase(text);
    try {
      await api.post("/phrases", { text, video_id: id, meaning, difficulty });
      setSavedPhrases((prev) => new Set(prev).add(text));
      toast.success(`已收藏「${text}」`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPhrase(null);
    }
  }

  // 把「收藏片語」註冊給全域的反白工具列：只有在學習頁反白時才會出現這顆按鈕
  const setSavePhraseHandler = useAssistant((s) => s.setSavePhrase);
  useEffect(() => {
    setSavePhraseHandler((text: string) => savePhrase(text));
    return () => setSavePhraseHandler(null);
  }, [setSavePhraseHandler, id]);

  async function removeClip(clip: Clip) {
    try {
      await api.del(`/clips/${clip.id}`);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      toast.success("已刪除");
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

  if (!video) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          找不到這支影片。
          <Link to="/videos" className="pl-1 text-primary underline-offset-4 hover:underline">
            回影片庫
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Link to="/videos">
        <Button variant="ghost" size="sm">
          <ArrowLeft strokeWidth={1.75} />
          回影片庫
        </Button>
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ── 左：播放器 + AB 控制 ── */}
        <div className="space-y-6">
          <Card className="animate-fade-up overflow-hidden">
            <div className="aspect-video w-full bg-black/80">
              {/* useYouTubePlayer 會把這個 div 換成 iframe */}
              <div ref={player.containerRef} className="h-full w-full" />
            </div>

            {player.error && (
              <p className="px-6 pt-4 text-sm text-destructive">{player.error}</p>
            )}

            <CardContent className="space-y-4 p-6">
              {/* 時間軸資訊 */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono">{formatTime(currentMs)}</span>
                <span className="text-muted-foreground">{formatTime(player.durationMs)}</span>
              </div>

              {/* AB 設定 */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPointA(currentMs)}>
                  設 A
                </Button>
                <Badge variant={pointA === null ? "muted" : "teal"} className="font-mono">
                  A {pointA === null ? "--:--" : formatTime(pointA)}
                </Badge>

                <Button variant="secondary" size="sm" onClick={() => setPointB(currentMs)}>
                  設 B
                </Button>
                <Badge variant={pointB === null ? "muted" : "indigo"} className="font-mono">
                  B {pointB === null ? "--:--" : formatTime(pointB)}
                </Badge>

                {(pointA !== null || pointB !== null) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="清除 AB"
                    onClick={() => {
                      setPointA(null);
                      setPointB(null);
                    }}
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                )}
              </div>

              {/* 播放控制 */}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="icon" onClick={() => (playing ? pause() : play())}>
                  {playing ? (
                    <Pause className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Play className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </Button>

                <Button
                  variant={looping ? "gradient" : "secondary"}
                  size="sm"
                  onClick={() => setLooping((v) => !v)}
                  title="在 A 與 B 之間重複播放"
                >
                  <Repeat strokeWidth={1.75} />
                  循環{looping ? "中" : "關"}
                </Button>

                <div className="flex overflow-hidden rounded-xl">
                  {PLAYBACK_RATES.map((r) => (
                    <button
                      key={r}
                      onClick={() => changeRate(r)}
                      className={cn(
                        "px-3 py-1.5 text-sm transition-colors",
                        rate === r ? "bg-white text-primary shadow-sm" : "glass-soft text-muted-foreground hover:bg-white/50",
                      )}
                    >
                      {r}x
                    </button>
                  ))}
                </div>

                <Button
                  variant="gradient"
                  size="sm"
                  className="ml-auto"
                  onClick={saveClip}
                  disabled={!rangeValid || saving}
                  title={rangeValid ? "把這段存成例句" : "先設定 A 與 B（B 要在 A 之後）"}
                >
                  {saving ? (
                    <Loader2 className="animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Bookmark strokeWidth={1.75} />
                  )}
                  存成例句
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── 已擷取的例句 ── */}
          <Card className="animate-fade-up">
            <CardHeader
              className="flex-row items-center justify-between space-y-0 lg:cursor-default"
              onClick={() => setClipsOpen((v) => !v)}
            >
              <CardTitle>這支影片的例句（{clips.length}）</CardTitle>
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform lg:hidden",
                  clipsOpen && "rotate-180",
                )}
                strokeWidth={1.75}
              />
            </CardHeader>
            <CardContent className={cn("space-y-2", !clipsOpen && "hidden lg:block")}>
              {clips.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  還沒有例句。設好 A、B 後按「存成例句」，或直接點右邊的句子快速框選。
                </p>
              ) : (
                clips.map((clip) => (
                  <div key={clip.id} className="glass-soft flex items-start gap-3 rounded-2xl px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="循環播放這段"
                      onClick={() => playRange(clip.start_ms, clip.end_ms)}
                    >
                      <Play className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatTime(clip.start_ms)} – {formatTime(clip.end_ms)}
                      </p>
                      <p className="text-sm">{clip.text || "（沒有對應的文字稿）"}</p>
                    </div>
                    <Link to={`/clips/${clip.id}`}>
                      <Button variant="secondary" size="sm">
                        練習
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" title="刪除" onClick={() => removeClip(clip)}>
                      <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          {/* ── AI 片語萃取 ── */}
          <Card className="animate-fade-up">
            <CardHeader
              className="flex-row items-center justify-between space-y-0 lg:cursor-default"
              onClick={() => setPhrasesOpen((v) => !v)}
            >
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.75} />
                片語萃取
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation(); // 別讓萃取按鈕順手把卡片收合
                    setPhrasesOpen(true);
                    extractPhrases();
                  }}
                  disabled={extracting}
                >
                  {extracting ? (
                    <Loader2 className="animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Sparkles strokeWidth={1.75} />
                  )}
                  {candidates ? "重新萃取" : "AI 萃取片語"}
                </Button>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform lg:hidden",
                    phrasesOpen && "rotate-180",
                  )}
                  strokeWidth={1.75}
                />
              </div>
            </CardHeader>
            <CardContent className={cn("space-y-2", !phrasesOpen && "hidden lg:block")}>
              {extracting && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  正在讀整份文字稿挑片語，長影片可能要十幾秒…
                </p>
              )}

              {!extracting && candidates === null && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  按上面的按鈕，讓 AI 從這支影片的文字稿挑出值得學的片語（已收藏過的會自動排除）。
                </p>
              )}

              {!extracting && candidates?.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  沒有找到新的片語，可能都已經收藏過了。
                </p>
              )}

              {!extracting &&
                candidates?.map((candidate) => {
                  const saved = savedPhrases.has(candidate.text);
                  return (
                    <div
                      key={candidate.text}
                      className="glass-soft flex items-center gap-3 rounded-2xl px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{candidate.text}</span>
                          <Badge variant="muted">{candidate.difficulty}</Badge>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{candidate.meaning}</p>
                      </div>
                      <Button
                        variant={saved ? "ghost" : "secondary"}
                        size="sm"
                        disabled={saved || savingPhrase === candidate.text}
                        onClick={() =>
                          savePhrase(candidate.text, candidate.meaning, candidate.difficulty)
                        }
                      >
                        {savingPhrase === candidate.text ? (
                          <Loader2 className="animate-spin" strokeWidth={1.75} />
                        ) : saved ? (
                          <Check strokeWidth={1.75} />
                        ) : (
                          <BookmarkPlus strokeWidth={1.75} />
                        )}
                        {saved ? "已收藏" : "收藏"}
                      </Button>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>

        {/* ── 右：文字稿 ── */}
        {/* 手機上文字稿在播放器下方，給 75vh（至少 28rem）才讀得順；桌機才貼齊視窗高度並固定 */}
        <Card className="animate-fade-up flex h-[75vh] min-h-[28rem] flex-col lg:sticky lg:top-0 lg:h-[calc(100vh-10rem)] lg:min-h-0">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" strokeWidth={1.75} />
              文字稿
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={resegment}
                disabled={resegmenting}
                title="自動字幕沒有標點，讓 AI 補標點並重組成完整句子"
              >
                {resegmenting ? (
                  <Loader2 className="animate-spin" strokeWidth={1.75} />
                ) : (
                  <Sparkles strokeWidth={1.75} />
                )}
                重新斷句
              </Button>
              <Button
                variant={autoScroll ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setAutoScroll((v) => !v)}
                title="自動捲動到目前播放的句子"
              >
                自動捲動{autoScroll ? "開" : "關"}
              </Button>
            </div>
          </CardHeader>

          {/* 字幕時間軸與語音真的對不齊時才用（先試「重試」重抓文字稿） */}
          <div className="flex flex-wrap items-center gap-2 px-6 pb-3 text-xs">
            <span className="text-muted-foreground">時間軸校正</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => changeOffset(-500)}
              title="字幕比語音慢：把整份文字稿的時間往前挪 0.5 秒"
            >
              字幕慢了
            </Button>
            <Badge variant={offsetMs === 0 ? "muted" : "teal"} className="font-mono">
              {offsetMs > 0 ? "+" : ""}
              {(offsetMs / 1000).toFixed(1)}s
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => changeOffset(500)}
              title="字幕比語音快：把整份文字稿的時間往後挪 0.5 秒"
            >
              字幕快了
            </Button>
            {offsetMs !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => changeOffset(-offsetMs)}>
                歸零
              </Button>
            )}
          </div>

          <CardContent className="nice-scroll flex-1 space-y-1 overflow-y-auto">
            {timedSegments.map((segment, i) => (
              <div
                key={segment.id}
                ref={(el) => (segmentRefs.current[i] = el)}
                onClick={() => {
                  // 反白文字時不要順便跳播放位置
                  if (window.getSelection()?.toString().trim()) return;
                  selectSegment(segment);
                }}
                className={cn(
                  "flex w-full cursor-pointer gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  i === currentIdx ? "bg-white text-foreground shadow-sm" : "hover:bg-white/50",
                )}
              >
                <span className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                  {formatTime(segment.start_ms)}
                </span>
                <span className="min-w-0">{segment.text}</span>
              </div>
            ))}
          </CardContent>

        </Card>
      </div>
    </>
  );
}
