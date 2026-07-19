import { ClipboardPaste, Loader2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Pagination } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  // 手動貼字幕（雲端 IP 被 YouTube 擋時的退路）
  const [pastingFor, setPastingFor] = useState<number | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);

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

  async function importVideo() {
    setImporting(true);
    try {
      await api.post("/videos", { url });
      toast.success("已加入，接著按「貼上字幕」匯入轉錄稿");
      setUrl("");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function saveManualTranscript(v: Video) {
    setSavingTranscript(true);
    try {
      await api.post(`/videos/${v.id}/transcript`, { text: pastedText });
      toast.success("字幕已匯入，可以開始學習了");
      setPastingFor(null);
      setPastedText("");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingTranscript(false);
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
            貼上網址加入後，再用卡片上的<b>「貼上字幕」</b>把 YouTube 的轉錄稿貼進來。
            （YouTube 封鎖雲端主機的 IP，沒辦法自動抓。）
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
            <Card key={v.id} className="animate-fade-up">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                {v.thumbnail_url && (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="h-16 w-28 shrink-0 rounded-xl object-cover"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{v.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{v.channel}</p>
                </div>

                <div className="flex items-center gap-1">
                  {v.transcript_status === "ready" ? (
                    <Link to={`/videos/${v.id}`}>
                      <Button variant="gradient" size="sm">
                        開始學習
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="gradient"
                      size="sm"
                      onClick={() => {
                        setPastingFor(pastingFor === v.id ? null : v.id);
                        setPastedText("");
                      }}
                    >
                      <ClipboardPaste strokeWidth={1.75} />
                      貼上字幕
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" title="刪除" onClick={() => remove(v)}>
                    <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
                  </Button>
                </div>
              </CardContent>

              {/* 手動貼字幕：雲端主機 IP 被 YouTube 擋時的免費解法 */}
              {pastingFor === v.id && (
                <CardContent className="space-y-3 border-t border-white/40 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2 text-sm">
                      <p className="font-medium">手動貼上字幕</p>
                      <ol className="space-y-1 text-xs text-muted-foreground">
                        <li className="flex gap-2">
                          <span className="bg-brand-gradient mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                          <span>
                            另開分頁到這支 YouTube 影片
                            <a
                              href={`https://www.youtube.com/watch?v=${v.youtube_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-1 text-primary underline-offset-4 hover:underline"
                            >
                              （點這裡開啟）
                            </a>
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <span className="bg-brand-gradient mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                          <span>影片說明欄下方點「⋯更多」→「顯示轉錄稿」</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="bg-brand-gradient mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                          <span>全選轉錄稿面板的內容，複製後貼到下面的框</span>
                        </li>
                      </ol>
                      <p className="text-xs text-muted-foreground">
                        SRT / VTT 檔的內容也可以。<b>內容必須含時間</b>（像 <code>0:05</code>），
                        沒有時間軸就無法做 AB 擷取與聽寫。
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setPastingFor(null)} title="取消">
                      <X className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                  </div>

                  <Textarea
                    className="min-h-[10rem] font-mono text-xs"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={"0:00\nHello everyone, welcome back.\n0:04\nToday we're going to..."}
                  />

                  <div className="flex justify-end">
                    <Button
                      variant="gradient"
                      onClick={() => saveManualTranscript(v)}
                      disabled={savingTranscript || !pastedText.trim()}
                    >
                      {savingTranscript && <Loader2 className="animate-spin" strokeWidth={1.75} />}
                      匯入字幕
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          <Pagination page={page} pageCount={pageCount} total={total} onChange={setPage} />
        </div>
      )}
    </>
  );
}
