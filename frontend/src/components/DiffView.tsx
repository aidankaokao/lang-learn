import type { DiffOp } from "@/lib/types";

/**
 * 聽寫比對結果的視覺化。
 * 綠色＝原文（你沒打到或打錯的正確版本），紅色刪除線＝你打的內容。
 */
export function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          原文正確內容
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          你打的（錯誤或多打）
        </span>
      </p>

      <p className="leading-loose">
        {ops.map((op, i) => {
          if (op.op === "equal") {
            return <span key={i}>{op.expected.join(" ")} </span>;
          }
          if (op.op === "missing") {
            return (
              <span key={i} className="rounded bg-green-500/15 px-1 font-medium text-green-700">
                {op.expected.join(" ")}{" "}
              </span>
            );
          }
          if (op.op === "extra") {
            return (
              <span key={i} className="rounded bg-destructive/10 px-1 text-destructive line-through">
                {op.actual.join(" ")}{" "}
              </span>
            );
          }
          // wrong：先劃掉你打的，再標出正確的
          return (
            <span key={i}>
              <span className="rounded bg-destructive/10 px-1 text-destructive line-through">
                {op.actual.join(" ")}
              </span>{" "}
              <span className="rounded bg-green-500/15 px-1 font-medium text-green-700">
                {op.expected.join(" ")}
              </span>{" "}
            </span>
          );
        })}
      </p>
    </div>
  );
}
