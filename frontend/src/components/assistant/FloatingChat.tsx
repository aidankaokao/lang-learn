import { ArrowLeft, Eraser, Loader2, MessageCircleQuestion, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMediaQuery, useVisualViewport } from "@/hooks/useViewport";
import { api } from "@/lib/api";
import { resolveThread } from "@/lib/thread";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/stores/assistant";

/**
 * 全站懸浮問答。
 *
 * 桌機（≥ sm）：右下角浮動視窗。
 * 手機（< sm）：全螢幕面板（一般手機聊天 App 的做法），並處理三個手機才有的問題：
 *   - 開啟時**不自動聚焦**，否則一點開鍵盤就彈出來擋住紀錄；
 *     只有從反白「問 AI」進來（帶 context，本來就是要打字）才聚焦。
 *   - 輸入框字級 16px：iOS 遇到 < 16px 的輸入框會在聚焦時自動放大整頁。
 *   - 高度跟著 visualViewport：鍵盤彈出時整個面板縮到鍵盤上方，標題列不會被推出畫面。
 */
export function FloatingChat() {
  const { pathname } = useLocation();
  const { threadId, videoId, label } = resolveThread(pathname);

  const { open, setOpen, context, setContext } = useAssistant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const isMobile = useMediaQuery("(max-width: 639px)");
  const viewport = useVisualViewport(open && isMobile);

  // 換頁 = 換對話串，重新載入該串的紀錄
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    api
      .get<ChatMessage[]>(`/chat?thread_id=${encodeURIComponent(threadId)}`)
      .then((history) => !cancelled && setMessages(history))
      .catch(() => {
        /* 沒紀錄或載入失敗都不擋畫面 */
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // 捲訊息區本身，不用 scrollIntoView：後者在手機上會連帶捲動整頁
  useEffect(() => {
    const list = listRef.current;
    if (open && list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, open, asking]);

  // 鍵盤彈出（可見高度變小）時，維持看得到最新一則
  useEffect(() => {
    const list = listRef.current;
    if (open && isMobile && list) list.scrollTop = list.scrollHeight;
  }, [open, isMobile, viewport.height]);

  // 手機全螢幕時鎖住背後的頁面，避免手指滑動捲到後面去
  useEffect(() => {
    if (!open || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, isMobile]);

  async function ask() {
    const asked = question.trim();
    if (!asked) return;

    setAsking(true);
    // 先把問題放上去，答案回來再補，避免等待期間畫面沒反應
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: asked, created_at: "" }]);
    setQuestion("");

    try {
      const res = await api.post<{ answer: string }>("/chat", {
        thread_id: threadId,
        question: asked,
        video_id: videoId,
        context: context || undefined,
      });
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: res.answer, created_at: "" },
      ]);
      setContext("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  async function clearThread() {
    if (!window.confirm(`清空「${label}」的問答紀錄？無法復原。`)) return;
    try {
      await api.del(`/chat?thread_id=${encodeURIComponent(threadId)}`);
      setMessages([]);
      setContext("");
      toast.success("已清空");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // ── 收合時只有一顆圓鈕 ──
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="問 AI"
        className="bg-brand-gradient fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
      >
        <MessageCircleQuestion className="h-6 w-6" strokeWidth={1.75} />
        {context && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-white ring-2 ring-primary" />
        )}
      </button>
    );
  }

  return (
    <div
      data-assistant-panel
      className={cn(
        "glass-strong fixed flex flex-col",
        isMobile
          ? "inset-x-0 top-0 z-50 rounded-none border-0 bg-white/85"
          : "bottom-4 right-6 z-40 w-[24rem] rounded-3xl",
      )}
      style={
        isMobile
          ? { height: viewport.height, transform: `translateY(${viewport.offsetTop}px)` }
          : { height: "min(32rem, calc(100vh - 6rem))" }
      }
    >
      <div className="flex items-center gap-2 border-b border-white/40 px-4 py-3">
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 shrink-0"
            onClick={() => setOpen(false)}
            title="返回"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        ) : (
          <MessageCircleQuestion className="h-5 w-5 text-primary" strokeWidth={1.75} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">問 AI</p>
          <p className="truncate text-xs text-muted-foreground">目前對話：{label}</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" onClick={clearThread} title="清空問答">
            <Eraser className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        )}
        {!isMobile && (
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} title="收起">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        )}
      </div>

      <div
        ref={listRef}
        className="nice-scroll flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
        {messages.length === 0 ? (
          <p className="pt-4 text-center text-sm text-muted-foreground">
            反白畫面上任何文字再按「問 AI」，或直接在下面發問。
            <br />
            在影片頁發問時，它查得到那支影片的文字稿。
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                message.role === "user"
                  ? "bg-brand-tint ml-6"
                  : "glass-soft mr-6 whitespace-pre-wrap",
              )}
            >
              {message.content}
            </div>
          ))
        )}

        {asking && (
          <div className="glass-soft mr-6 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
            思考中…
          </div>
        )}
      </div>

      {context && (
        <div className="glass-soft mx-4 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs">
          <span className="shrink-0 text-muted-foreground">針對這段：</span>
          <span className="min-w-0 flex-1 truncate">{context}</span>
          <button onClick={() => setContext("")} title="清除">
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <div className="flex gap-2 border-t border-white/40 p-3">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !asking && void ask()}
          placeholder="想問什麼？"
          className="text-base sm:text-sm"
          autoFocus={!isMobile || !!context}
          enterKeyHint="send"
        />
        <Button variant="gradient" size="icon" onClick={ask} disabled={asking || !question.trim()}>
          {asking ? (
            <Loader2 className="animate-spin" strokeWidth={1.75} />
          ) : (
            <Send strokeWidth={1.75} />
          )}
        </Button>
      </div>
    </div>
  );
}
