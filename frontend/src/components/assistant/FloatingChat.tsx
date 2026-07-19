import { Eraser, Loader2, MessageCircleQuestion, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { resolveThread } from "@/lib/thread";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/stores/assistant";

export function FloatingChat() {
  const { pathname } = useLocation();
  const { threadId, videoId, label } = resolveThread(pathname);

  const { open, setOpen, context, setContext } = useAssistant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, asking]);

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
      className="glass-strong fixed inset-x-4 bottom-4 z-40 flex flex-col rounded-3xl sm:inset-x-auto sm:right-6 sm:w-[24rem]"
      style={{ height: "min(32rem, calc(100vh - 6rem))" }}
    >
      <div className="flex items-center gap-2 border-b border-white/40 px-4 py-3">
        <MessageCircleQuestion className="h-5 w-5 text-primary" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">問 AI</p>
          <p className="truncate text-xs text-muted-foreground">目前對話：{label}</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" onClick={clearThread} title="清空問答">
            <Eraser className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} title="收起">
          <X className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </div>

      <div className="nice-scroll flex-1 space-y-3 overflow-y-auto p-4">
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
        <div ref={bottomRef} />
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
          autoFocus
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
