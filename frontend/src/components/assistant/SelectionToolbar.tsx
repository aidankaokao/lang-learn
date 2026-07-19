import { BookmarkPlus, Loader2, MessageCircleQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAssistant } from "@/stores/assistant";

type Selection = { text: string; x: number; y: number };

const MAX_LENGTH = 500;

/** 反白任何文字後，就地浮出「問 AI／收藏片語」。 */
export function SelectionToolbar() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [saving, setSaving] = useState(false);
  const { setOpen, setContext, savePhrase } = useAssistant();

  useEffect(() => {
    function capture() {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";

      // 在助理面板裡反白（例如要複製回答）不該又跳出工具列
      const inPanel = sel?.anchorNode?.parentElement?.closest("[data-assistant-panel]");
      if (!text || text.length > MAX_LENGTH || inPanel) {
        setSelection(null);
        return;
      }

      const rect = sel!.getRangeAt(0).getBoundingClientRect();
      setSelection({ text, x: rect.left + rect.width / 2, y: rect.top });
    }

    function clear(e: MouseEvent) {
      // 點在工具列上不要清掉，否則按鈕還沒觸發就消失了
      if ((e.target as HTMLElement).closest("[data-selection-toolbar]")) return;
      setSelection(null);
    }

    document.addEventListener("mouseup", capture);
    document.addEventListener("touchend", capture);
    document.addEventListener("mousedown", clear);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("touchend", capture);
      document.removeEventListener("mousedown", clear);
    };
  }, []);

  if (!selection) return null;

  function ask() {
    setContext(selection!.text);
    setOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  async function save() {
    if (!savePhrase) return;
    setSaving(true);
    try {
      await savePhrase(selection!.text);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-selection-toolbar
      className="glass-strong fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-2xl p-1"
      style={{ left: selection.x, top: selection.y - 8 }}
    >
      <button
        onClick={ask}
        className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/60"
      >
        <MessageCircleQuestion className="h-4 w-4 text-primary" strokeWidth={1.75} />
        問 AI
      </button>

      {/* 只有學習頁註冊了收藏行為，這顆才會出現 */}
      {savePhrase && (
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/60 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <BookmarkPlus className="h-4 w-4 text-primary" strokeWidth={1.75} />
          )}
          收藏片語
        </button>
      )}
    </div>
  );
}
