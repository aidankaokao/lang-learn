import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/stores/auth";
import { usePageHeader } from "@/stores/pageHeader";

export function Header({
  collapsed,
  onToggle,
  onOpenDrawer,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenDrawer: () => void;
}) {
  const { title, subtitle } = usePageHeader();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <header className="glass flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
      {/* 手機：開抽屜 */}
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenDrawer} title="開啟選單">
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </Button>

      {/* 桌機：折疊側邊欄 */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={onToggle}
        title={collapsed ? "展開側邊欄" : "收合側邊欄"}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
        )}
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      {user && (
        <div className="flex shrink-0 items-center gap-2">
          {/* 帳號 chip 在手機上太佔位，收起來 */}
          <Badge variant={user.role === "admin" ? "indigo" : "muted"} className="hidden sm:inline-flex">
            {user.username}
            {user.role === "admin" && "（管理員）"}
          </Badge>
          <Button variant="ghost" size="icon" onClick={logout} title="登出">
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
      )}
    </header>
  );
}
