import { NavLink } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth";

import { NAV_SECTIONS } from "./Sidebar";

/**
 * 手機（< lg）的導覽：從 Header 下方往下展開的選單，而不是左側抽屜。
 * 由 Header 的漢堡鈕開關；點遮罩或換頁（AppLayout 監聽 pathname）自動收起。
 * 版面固定在 Header 正下方（top-14 = Header 高度 h-14）。
 */
export function MobileMenu({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const role = user?.role;

  return (
    <div className="lg:hidden">
      <div
        className="fixed inset-x-0 bottom-0 top-14 z-40 bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <nav className="glass-strong fixed inset-x-0 top-14 z-50 max-h-[calc(100dvh-3.5rem)] space-y-4 overflow-y-auto border-b px-4 pb-4 pt-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Header 在手機上把帳號 chip 藏起來了，改放在選單頂端 */}
        {user && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            目前登入
            <Badge variant={role === "admin" ? "indigo" : "muted"}>
              {user.username}
              {role === "admin" && "（管理員）"}
            </Badge>
          </div>
        )}

        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((i) => !i.adminOnly || role === "admin");
          if (items.length === 0) return null;
          return (
            <div key={section.title} className="space-y-1">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  // 點目前這頁時 pathname 不會變，AppLayout 收不到換頁，這裡自己關
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-white text-primary shadow-sm"
                        : "text-muted-foreground hover:bg-white/50",
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
