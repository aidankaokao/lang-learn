import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { FloatingChat } from "@/components/assistant/FloatingChat";
import { SelectionToolbar } from "@/components/assistant/SelectionToolbar";
import { cn } from "@/lib/utils";

import { Header } from "./Header";
import { MobileMenu } from "./MobileMenu";
import { Sidebar } from "./Sidebar";

const COLLAPSED_KEY = "yt-learn-sidebar-collapsed";

// 學習頁是「播放器 + 文字稿」雙欄，3xl 太窄，這幾條路由放寬
const WIDE_ROUTES = [/^\/videos\/\d+/];

// 版面骨架（frontend-style-aurora-glass.md §7）：
// 外層 h-screen overflow-hidden，只有 main 捲動。
//
// 手機（< lg）：沒有側邊欄，改成 Header 漢堡鈕往下展開的選單（MobileMenu）。
// 桌機（≥ lg）：側邊欄固定在左邊，可折疊、可拖曳調寬。
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "1",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const wide = WIDE_ROUTES.some((r) => r.test(pathname));

  // 換頁就把選單收起來，不然點完導覽還擋著畫面
  useEffect(() => setMenuOpen(false), [pathname]);

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

      {/* 手機：Header 下方的下拉選單 + 半透明遮罩 */}
      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((open) => !open)}
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
