import { AlertCircle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Pagination } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePagination } from "@/hooks/usePagination";
import { api } from "@/lib/api";
import type { Video } from "@/lib/types";
import { usePageHeader } from "@/stores/pageHeader";

export function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const { page, setPage, pageCount, paged, total } = usePagination(videos);

  useEffect(() => {
    usePageHeader.getState().set("影片庫", "貼上 YouTube 網址，抓取文字稿後開始練習");
  }, []);

  const reload = useCallback(async () => {
    try {
      setVideos(await api.get<Video[]>("/videos"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 有影片還在抓文字稿就每 3 秒輪詢一次，抓完自動停
  useEffect(() => {
    if (!videos.some((v) => v.transcript_status === "pending")) return;
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [videos, reload]);

  async function importVideo() {
    setImporting(true);
    try {
      await api.post("/videos", { url });
      toast.success("已加入，正在抓取文字稿…");
      setUrl("");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function retry(v: Video) {
    try {
      await api.post(`/videos/${v.id}/retry`);
      toast.success("重新抓取中…");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(v: Video) {
    const answer = window.prompt(
      `刪除「${v.title}」會一併刪掉它的文字稿、例句與片語，無法復原。\n確定請輸入 DELETE：`,
    );
    if (answer !== "DELETE") return;
    try {
      await api.del(`/videos/${v.id}`);
      toast.success("已刪除");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>加入影片</CardTitle>
          <CardDescription>
            會先抓 YouTube 英文字幕；沒有字幕才用 Whisper 轉錄（需要啟用 OpenAI provider）。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input
            className="min-w-0 flex-1 sm:min-w-[16rem]"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && url && !importing && void importVideo()}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          <Button variant="gradient" onClick={importVideo} disabled={importing || !url}>
            {importing ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : <Plus strokeWidth={1.75} />}
            加入
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center p-6 text-muted-foreground">
          <Loader2 className="animate-spin" strokeWidth={1.75} />
        </div>
      ) : videos.length === 0 ? (
        <Card className="animate-fade-up">
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            還沒有影片，貼一個 YouTube 網址開始吧。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {paged.map((v) => (
            <Card key={v.id} className="animate-fade-up transition-transform hover:-translate-y-0.5">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                {v.thumbnail_url && (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="h-16 w-28 shrink-0 rounded-xl object-cover"
                  />
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium">{v.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{v.channel}</p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {v.transcript_status === "pending" && (
                      <Badge variant="amber" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.75} />
                        抓取文字稿中
                      </Badge>
                    )}
                    {v.transcript_status === "ready" && (
                      <>
                        <Badge variant="green">
                          {v.transcript_source === "whisper" ? "Whisper 轉錄" : "YouTube 字幕"}
                        </Badge>
                        <Badge variant="muted">{v.segment_count} 句</Badge>
                        {!!v.clip_count && <Badge variant="teal">{v.clip_count} 個例句</Badge>}
                      </>
                    )}
                    {v.transcript_status === "failed" && (
                      <Badge variant="amber" className="gap-1">
                        <AlertCircle className="h-3 w-3" strokeWidth={1.75} />
                        擷取失敗
                      </Badge>
                    )}
                  </div>

                  {v.transcript_status === "failed" && v.error_message && (
                    <p className="pt-1 text-xs text-muted-foreground">{v.error_message}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {v.transcript_status === "ready" && (
                    <Link to={`/videos/${v.id}`}>
                      <Button variant="gradient" size="sm">
                        開始學習
                      </Button>
                    </Link>
                  )}
                  {v.transcript_status === "failed" && (
                    <Button variant="secondary" size="sm" onClick={() => retry(v)}>
                      <RefreshCw strokeWidth={1.75} />
                      重試
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" title="刪除" onClick={() => remove(v)}>
                    <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <Pagination page={page} pageCount={pageCount} total={total} onChange={setPage} />
        </div>
      )}
    </>
  );
}
