import { ArrowLeft, Ear, Eye, EyeOff, Loader2, Mic, Play, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { DiffView } from "@/components/DiffView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { Clip, ClipPractice, Video } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PLAYBACK_RATES } from "@/lib/youtube";
import { usePageHeader } from "@/stores/pageHeader";

type Mode = "dictation" | "shadowing";

const QUALITIES: { value: string; label: string }[] = [
  { value: "again", label: "還不行" },
  { value: "hard", label: "有點難" },
  { value: "good", label: "還可以" },
  { value: "easy", label: "很輕鬆" },
];

export function ClipPracticePage() {
  const { clipId } = useParams();
  const id = Number(clipId);

  const [clip, setClip] = useState<Clip | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("dictation");
  const [showText, setShowText] = useState(false);
  const [input, setInput] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<ClipPractice | null>(null);
  const [history, setHistory] = useState<ClipPractice[]>([]);
  const [rate, setRateState] = useState(1);

  const player = useYouTubePlayer(video?.youtube_id);
  const { currentMs, seek, setRate } = player;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const c = await api.get<Clip>(`/clips/${id}`);
        const v = await api.get<Video>(`/videos/${c.video_id}`);
        if (cancelled) return;
        setClip(c);
        setVideo(v);
        usePageHeader.getState().set("聽力練習", v.title ?? undefined);
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

  // 播放器一就緒就跳到 A 點，之後播過 B 點就跳回，維持整段循環
  useEffect(() => {
    if (!player.ready || !clip) return;
    seek(clip.start_ms);
  }, [player.ready, clip, seek]);

  useEffect(() => {
    if (!clip || !player.ready) return;
    if (currentMs >= clip.end_ms || currentMs < clip.start_ms - 500) seek(clip.start_ms);
  }, [currentMs, clip, player.ready, seek]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.get<ClipPractice[]>(`/clips/${id}/practices`));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function changeRate(value: number) {
    setRateState(value);
    setRate(value);
  }

  async function submitDictation() {
    setGrading(true);
    try {
      const res = await api.post<ClipPractice>(`/clips/${id}/dictation`, { input_text: input });
      setResult(res);
      setShowText(true);
      await loadHistory();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  async function selfRate(quality: string) {
    try {
      await api.post(`/clips/${id}/review`, { quality });
      toast.success("已記錄，下次複習時間更新了");
      await loadHistory();
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

  if (!clip || !video) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          找不到這個例句。
          <Link to="/clips" className="pl-1 text-primary underline-offset-4 hover:underline">
            回例句庫
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Link to="/clips">
        <Button variant="ghost" size="sm">
          <ArrowLeft strokeWidth={1.75} />
          回例句庫
        </Button>
      </Link>

      <Card className="animate-fade-up overflow-hidden">
        {/* 聽寫時把畫面遮起來，避免看嘴型或字幕作弊 */}
        <div className="relative aspect-video w-full bg-black/80">
          <div ref={player.containerRef} className="h-full w-full" />
          {mode === "dictation" && !showText && (
            <div className="glass-strong absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Ear className="h-8 w-8 text-primary" strokeWidth={1.75} />
              <p className="text-sm font-medium">聽寫模式：畫面已遮蔽</p>
              <p className="text-xs text-muted-foreground">只用耳朵聽，打完再對答案</p>
            </div>
          )}
        </div>

        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted" className="font-mono">
              {formatTime(clip.start_ms)} – {formatTime(clip.end_ms)}
            </Badge>
            <Badge variant="teal">循環播放中</Badge>
            {clip.review_count > 0 && <Badge variant="muted">練習 {clip.review_count} 次</Badge>}

            <div className="ml-auto flex overflow-hidden rounded-xl">
              {PLAYBACK_RATES.map((r) => (
                <button
                  key={r}
                  onClick={() => changeRate(r)}
                  className={cn(
                    "px-3 py-1.5 text-sm transition-colors",
                    rate === r
                      ? "bg-white text-primary shadow-sm"
                      : "glass-soft text-muted-foreground hover:bg-white/50",
                  )}
                >
                  {r}x
                </button>
              ))}
            </div>

            <Button variant="secondary" size="sm" onClick={() => seek(clip.start_ms)}>
              <Play strokeWidth={1.75} />
              從頭聽
            </Button>
          </div>

          {/* 模式切換 */}
          <div className="flex gap-2">
            <Button
              variant={mode === "dictation" ? "gradient" : "secondary"}
              size="sm"
              onClick={() => {
                setMode("dictation");
                setShowText(false);
              }}
            >
              <Ear strokeWidth={1.75} />
              盲聽聽寫
            </Button>
            <Button
              variant={mode === "shadowing" ? "gradient" : "secondary"}
              size="sm"
              onClick={() => {
                setMode("shadowing");
                setShowText(true);
              }}
            >
              <Mic strokeWidth={1.75} />
              跟讀
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowText((v) => !v)}>
              {showText ? <EyeOff strokeWidth={1.75} /> : <Eye strokeWidth={1.75} />}
              {showText ? "隱藏原文" : "顯示原文"}
            </Button>
          </div>

          {showText && (
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                原文
              </p>
              <p className="pt-1 leading-relaxed">{clip.text || "（沒有文字稿）"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 聽寫 ── */}
      {mode === "dictation" && (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>把你聽到的打出來</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="不確定的地方就先空著或猜一個，批改時會告訴你為什麼聽錯"
            />
            <div className="flex justify-end">
              <Button variant="gradient" onClick={submitDictation} disabled={grading || !input.trim()}>
                {grading ? (
                  <Loader2 className="animate-spin" strokeWidth={1.75} />
                ) : (
                  <Sparkles strokeWidth={1.75} />
                )}
                批改
              </Button>
            </div>

            {result && (
              <div className="glass-soft space-y-4 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">
                    {Math.round((result.accuracy ?? 0) * 100)}%
                  </span>
                  <span className="text-sm text-muted-foreground">正確率</span>
                </div>

                {result.diff_json && <DiffView ops={result.diff_json} />}

                {result.feedback && (
                  <div className="space-y-1 border-t border-white/40 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      為什麼會聽錯
                    </p>
                    <p className="text-sm leading-relaxed">{result.feedback}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 跟讀自評 ── */}
      {mode === "shadowing" && (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>跟著唸幾次，然後自評</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {QUALITIES.map((q) => (
              <Button key={q.value} variant="secondary" onClick={() => selfRate(q.value)}>
                {q.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── 練習紀錄 ── */}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>練習紀錄（{history.length}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">還沒有紀錄。</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="glass-soft rounded-2xl px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={item.mode === "dictation" ? "indigo" : "teal"}>
                    {item.mode === "dictation" ? "聽寫" : "跟讀"}
                  </Badge>
                  {item.accuracy !== null && (
                    <span className="font-medium">{Math.round(item.accuracy * 100)}%</span>
                  )}
                  {item.created_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString("zh-TW")}
                    </span>
                  )}
                </div>
                {item.input_text && <p className="pt-1">{item.input_text}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
