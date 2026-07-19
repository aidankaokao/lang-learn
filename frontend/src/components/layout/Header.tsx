import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/stores/auth";
import { usePageHeader } from "@/stores/pageHeader";

export function Header({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { title, subtitle } = usePageHeader();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <header className="glass flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <Button variant="ghost" size="icon" onClick={onToggle} title={collapsed ? "展開側邊欄" : "收合側邊欄"}>
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
        <div className="flex items-center gap-2">
          <Badge variant={user.role === "admin" ? "indigo" : "muted"}>
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
