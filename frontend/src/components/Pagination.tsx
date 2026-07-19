import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
};

/** 頁碼視窗：頁數多的時候只顯示目前頁附近的幾個 */
function visiblePages(page: number, pageCount: number): number[] {
  const span = 2;
  const start = Math.max(1, Math.min(page - span, pageCount - span * 2));
  const end = Math.min(pageCount, Math.max(page + span, span * 2 + 1));
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function Pagination({ page, pageCount, total, onChange }: Props) {
  if (pageCount <= 1) return null;

  function go(next: number) {
    onChange(Math.min(pageCount, Math.max(1, next)));
    // 換頁後捲回頂端，不然會停在上一頁的捲動位置
    document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      <Button variant="ghost" size="icon" onClick={() => go(page - 1)} disabled={page === 1} title="上一頁">
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
      </Button>

      {visiblePages(page, pageCount).map((n) => (
        <button
          key={n}
          onClick={() => go(n)}
          className={cn(
            "h-9 min-w-9 rounded-xl px-3 text-sm transition-colors",
            n === page
              ? "bg-brand-gradient text-white shadow-lg shadow-primary/25"
              : "glass-soft text-muted-foreground hover:bg-white/50",
          )}
        >
          {n}
        </button>
      ))}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => go(page + 1)}
        disabled={page === pageCount}
        title="下一頁"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
      </Button>

      <span className="pl-2 text-xs text-muted-foreground">共 {total} 筆</span>
    </div>
  );
}
