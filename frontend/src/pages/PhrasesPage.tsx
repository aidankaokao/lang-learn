import {
  Check,
  ChevronDown,
  Loader2,
  PencilLine,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Pagination } from "@/components/Pagination";
import { SearchBox } from "@/components/SearchBox";
import { SpeakButton } from "@/components/SpeakButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePagination } from "@/hooks/usePagination";
import { api } from "@/lib/api";
import type { Phrase, PhrasePractice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePageHeader } from "@/stores/pageHeader";

const DIFFICULTY_VARIANT: Record<string, "green" | "amber" | "teal"> = {
  easy: "green",
  medium: "teal",
  hard: "amber",
};

export function PhrasesPage() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  // 片語、中文語意、用法解析都能搜
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return phrases;
    return phrases.filter((p) =>
      [p.text, p.meaning, p.explanation].some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [phrases, query]);

  const { page, setPage, pageCount, paged, total } = usePagination(filtered);

  useEffect(() => {
    usePageHeader.getState().set("片語庫", "解析、例句、換句話說與造句練習");
  }, []);

  const reload = useCallback(async () => {
    try {
      setPhrases(await api.get<Phrase[]>("/phrases"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function remove(phrase: Phrase) {
    if (!window.confirm(`確定刪除「${phrase.text}」？練習紀錄也會一起刪掉。`)) return;
    try {
      await api.del(`/phrases/${phrase.id}`);
      toast.success("已刪除");
      await reload();
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

  if (phrases.length === 0) {
    return (
      <Card className="animate-fade-up">
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          還沒有片語。到
          <Link to="/videos" className="px-1 text-primary underline-offset-4 hover:underline">
            影片庫
          </Link>
          開一支影片，用「AI 萃取片語」或反白文字稿收藏。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <SearchBox value={query} onChange={setQuery} placeholder="搜尋片語、語意或用法解析…" />

      {filtered.length === 0 && (
        <Card className="animate-fade-up">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            找不到符合「{query}」的片語。
          </CardContent>
        </Card>
      )}

      {paged.map((phrase) => (
        <PhraseCard
          key={phrase.id}
          phrase={phrase}
          open={openId === phrase.id}
          onToggle={() => setOpenId(openId === phrase.id ? null : phrase.id)}
          onDelete={() => remove(phrase)}
          onUpdated={(next) => setPhrases((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
        />
      ))}

      <Pagination page={page} pageCount={pageCount} total={total} onChange={setPage} />
    </div>
  );
}

function PhraseCard({
  phrase,
  open,
  onToggle,
  onDelete,
  onUpdated,
}: {
  phrase: Phrase;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdated: (phrase: Phrase) => void;
}) {
  const [explaining, setExplaining] = useState(false);

  async function reexplain() {
    setExplaining(true);
    try {
      onUpdated(await api.post<Phrase>(`/phrases/${phrase.id}/explain`));
      toast.success("已重新解析");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExplaining(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <SpeakButton text={phrase.text} />
          <button onClick={onToggle} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{phrase.text}</span>
              {phrase.difficulty && (
                <Badge variant={DIFFICULTY_VARIANT[phrase.difficulty] ?? "muted"}>
                  {phrase.difficulty}
                </Badge>
              )}
              {phrase.review_count > 0 && (
                <Badge variant="muted">練習 {phrase.review_count} 次</Badge>
              )}
            </div>
            {phrase.meaning && (
              <p className="pt-1 text-sm text-muted-foreground">{phrase.meaning}</p>
            )}
          </button>

          <div className="flex gap-1">
            <Button variant="ghost" size="icon" title="重新解析" onClick={reexplain} disabled={explaining}>
              {explaining ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
              )}
            </Button>
            <Button variant="ghost" size="icon" title="刪除" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
            </Button>
            <Button variant="ghost" size="icon" title={open ? "收合" : "展開"} onClick={onToggle}>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
                strokeWidth={1.75}
              />
            </Button>
          </div>
        </div>

        {open && (
          <div className="space-y-4 border-t border-white/40 pt-4">
            {phrase.explanation && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  用法解析
                </p>
                <p className="text-sm leading-relaxed">{phrase.explanation}</p>
              </div>
            )}

            {!!phrase.examples_json?.length && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  例句
                </p>
                <ul className="space-y-1">
                  {phrase.examples_json.map((example, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="bg-brand-gradient mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1 pt-0.5">{example}</span>
                      <SpeakButton text={example} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!phrase.paraphrases_json?.length && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  換句話說
                </p>
                <ul className="space-y-1">
                  {phrase.paraphrases_json.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="bg-brand-gradient mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1 pt-0.5">{item}</span>
                      <SpeakButton text={item} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <PracticeBox phrase={phrase} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 造樣造句 + AI 批改 */
function PracticeBox({ phrase }: { phrase: Phrase }) {
  const [sentence, setSentence] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<PhrasePractice | null>(null);
  const [history, setHistory] = useState<PhrasePractice[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  async function submit() {
    setGrading(true);
    try {
      const res = await api.post<PhrasePractice>(`/phrases/${phrase.id}/practice`, { sentence });
      setResult(res);
      setSentence("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  async function loadHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    try {
      setHistory(await api.get<PhrasePractice[]>(`/phrases/${phrase.id}/practices`));
      setShowHistory(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="glass-soft space-y-3 rounded-2xl p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <PencilLine className="h-4 w-4 text-primary" strokeWidth={1.75} />
        造樣造句
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-0 flex-1 sm:min-w-[14rem]"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sentence && !grading && void submit()}
          placeholder={`用「${phrase.text}」造一個英文句子`}
        />
        <Button variant="gradient" onClick={submit} disabled={grading || !sentence.trim()}>
          {grading ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : <Sparkles strokeWidth={1.75} />}
          批改
        </Button>
      </div>

      {result && (
        <div className="space-y-2 rounded-xl bg-white/50 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {result.is_correct ? (
              <>
                <Check className="h-4 w-4 text-green-600" strokeWidth={1.75} />
                <span className="text-green-700">用對了</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4 text-destructive" strokeWidth={1.75} />
                <span className="text-destructive">需要修正</span>
              </>
            )}
          </p>
          {result.correction && (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1">
                <span className="text-muted-foreground">修正：</span>
                {result.correction}
              </p>
              <SpeakButton text={result.correction} />
            </div>
          )}
          {result.feedback && <p className="leading-relaxed">{result.feedback}</p>}
        </div>
      )}

      <Button variant="link" size="sm" className="px-0" onClick={loadHistory}>
        {showHistory ? "收起練習紀錄" : "看過去的練習紀錄"}
      </Button>

      {showHistory && (
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">還沒有紀錄。</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="rounded-xl bg-white/40 p-3 text-sm">
                <p className="flex items-center gap-2">
                  {item.is_correct ? (
                    <Check className="h-3.5 w-3.5 text-green-600" strokeWidth={1.75} />
                  ) : (
                    <X className="h-3.5 w-3.5 text-destructive" strokeWidth={1.75} />
                  )}
                  {item.user_sentence}
                </p>
                {item.feedback && (
                  <p className="pt-1 text-xs text-muted-foreground">{item.feedback}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
