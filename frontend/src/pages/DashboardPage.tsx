import { ListVideo, Repeat2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/stores/auth";
import { usePageHeader } from "@/stores/pageHeader";

const ENTRY_POINTS = [
  {
    icon: ListVideo,
    to: "/videos",
    title: "影片庫",
    desc: "貼上 YouTube 網址抓文字稿，進學習頁邊看邊圈重點",
  },
  {
    icon: Repeat2,
    to: "/clips",
    title: "例句庫",
    desc: "AB 擷取的段落，可盲聽聽寫或跟讀，聽錯了會告訴你為什麼",
  },
  {
    icon: Sparkles,
    to: "/phrases",
    title: "片語庫",
    desc: "解析、例句、換句話說，還能造樣造句讓 AI 批改",
  },
];

export function DashboardPage() {
  const user = useAuth((s) => s.user);

  useEffect(() => {
    usePageHeader.getState().set("總覽", "目前進度與接下來的功能");
  }, []);

  return (
    <>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>
            哈囉，<span className="text-gradient">{user?.username}</span>
          </CardTitle>
          <CardDescription>
            從影片庫貼一支 YouTube 網址開始。AI 功能需要先到「設定」註冊一組 LLM provider。
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Link 預設是 inline 的 <a>，吃不到 space-y 的垂直 margin，所以要 block */}
      <div className="space-y-3">
        {ENTRY_POINTS.map(({ icon: Icon, to, title, desc }, i) => (
          <Link key={to} to={to} className="block">
            <Card
              className="animate-fade-up transition-transform hover:-translate-y-0.5"
              style={{ animationDelay: `${(i + 1) * 60}ms` }}
            >
              <CardContent className="flex items-start gap-4 p-6">
                <div className="bg-brand-tint flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
