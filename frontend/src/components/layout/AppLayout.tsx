import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { FloatingChat } from "@/components/assistant/FloatingChat";
import { SelectionToolbar } from "@/components/assistant/SelectionToolbar";
import { cn } from "@/lib/utils";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const COLLAPSED_KEY = "yt-learn-sidebar-collapsed";

// 學習頁是「播放器 + 文字稿」雙欄，3xl 太窄，這幾條路由放寬
const WIDE_ROUTES = [/^\/videos\/\d+/];

// 版面骨架（frontend-style-aurora-glass.md §7）：
// 外層 h-screen overflow-hidden，只有 main 捲動。
//
// 手機（< lg）：側邊欄改成抽屜，平常收起來，由 Header 的漢堡鈕打開。
// 桌機（≥ lg）：側邊欄固定在左邊，可折疊、可拖曳調寬。
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "1",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const wide = WIDE_ROUTES.some((r) => r.test(pathname));

  // 換頁就把抽屜收起來，不然點完導覽還擋著畫面
  useEffect(() => setDrawerOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      return !c;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 桌機：常駐側邊欄 */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* 手機：抽屜 + 半透明遮罩 */}
      {drawerOpen && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="animate-fade-up fixed inset-y-0 left-0 z-50">
            <Sidebar collapsed={false} mobile />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main className="nice-scroll flex-1 overflow-auto p-4 sm:p-6">
          <div className={cn("mx-auto space-y-6", wide ? "max-w-6xl" : "max-w-3xl")}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* 全站共用：懸浮問答 + 反白工具列 */}
      <SelectionToolbar />
      <FloatingChat />
    </div>
  );
}
