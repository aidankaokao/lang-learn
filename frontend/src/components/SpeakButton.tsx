import { Loader2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { speak, stopSpeaking } from "@/lib/tts";

/** 朗讀一段英文（微軟 Neural 語音，語音種類在設定頁選）。 */
export function SpeakButton({ text, rate }: { text: string; rate?: number }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  useEffect(() => () => stopSpeaking(), []);

  async function toggle() {
    if (state !== "idle") {
      stopSpeaking();
      setState("idle");
      return;
    }

    setState("loading");
    try {
      await speak(text, { rate, onEnd: () => setState("idle") });
      setState("playing");
    } catch (e) {
      setState("idle");
      // 顯示後端傳回的真正原因，才有辦法判斷是套件、網路還是微軟端的問題
      toast.error(`${(e as Error).message}（暫時改用瀏覽器語音）`, { duration: 8000 });
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={toggle}
      title={state === "idle" ? "朗讀" : "停止朗讀"}
    >
      {state === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
      ) : state === "playing" ? (
        <VolumeX className="h-4 w-4 text-primary" strokeWidth={1.75} />
      ) : (
        <Volume2 className="h-4 w-4" strokeWidth={1.75} />
      )}
    </Button>
  );
}
