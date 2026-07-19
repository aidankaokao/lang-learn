import {
  GraduationCap,
  LayoutDashboard,
  ListVideo,
  Repeat2,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

const WIDTH_KEY = "yt-learn-sidebar-w";
const MIN_W = 180;
const MAX_W = 480;
const COLLAPSED_W = 64;

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "學習",
    items: [
      { to: "/", label: "總覽", icon: LayoutDashboard },
      { to: "/videos", label: "影片庫", icon: ListVideo },
      { to: "/clips", label: "例句庫", icon: Repeat2 },
      { to: "/phrases", label: "片語庫", icon: Sparkles },
    ],
  },
  {
    title: "系統",
    items: [
      { to: "/settings", label: "設定", icon: Settings2 },
      { to: "/admin/users", label: "帳號管理", icon: Users, adminOnly: true },
    ],
  },
];

/**
 * mobile=true 時是手機版抽屜：固定寬度、不可折疊、不可拖曳。
 * 桌機版才有折疊與拖曳調寬。
 */
export function Sidebar({ collapsed, mobile = false }: { collapsed: boolean; mobile?: boolean }) {
  const role = useAuth((s) => s.user?.role);
  const [width, setWidth] = useState(() => Number(localStorage.getItem(WIDTH_KEY)) || 240);
  const dragging = useRef(false);

  const isCollapsed = collapsed && !mobile;

  // 拖曳改寬度：監聽掛在 window，滑鼠移出感應區也不會斷
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      setWidth(Math.min(MAX_W, Math.max(MIN_W, e.clientX)));
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      localStorage.setItem(WIDTH_KEY, String(width));
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  return (
    <aside
      className="glass relative flex h-full shrink-0 flex-col border-r transition-[width] duration-200"
      style={{ width: mobile ? 264 : isCollapsed ? COLLAPSED_W : width }}
    >
      {/* 品牌區 */}
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="bg-brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
          <GraduationCap className="h-5 w-5" strokeWidth={1.75} />
        </div>
        {!isCollapsed && (
          <span className="text-gradient truncate text-lg font-bold tracking-tight">yt-learn</span>
        )}
      </div>

      <nav className="nice-scroll flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.adminOnly || role === "admin");
          if (items.length === 0) return null;
          return (
            <div key={section.title} className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  title={isCollapsed ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      isCollapsed && "justify-center px-0",
                      isActive
                        ? "bg-white text-primary shadow-sm"
                        : "text-muted-foreground hover:bg-white/50",
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                  {!isCollapsed && <span className="truncate">{label}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* 拖曳感應區：隱形直條，hover / 拖曳中才顯色（手機沒有滑鼠，不提供） */}
      {!isCollapsed && !mobile && (
        <div
          onMouseDown={() => {
            dragging.current = true;
            document.body.style.userSelect = "none";
          }}
          className="absolute right-0 top-0 h-full w-[5px] cursor-col-resize bg-transparent transition-colors hover:bg-[hsl(var(--primary)/.4)]"
        />
      )}
    </aside>
  );
}
