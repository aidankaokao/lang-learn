import { KeyRound, Loader2, Plus, Trash2, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuth, type User } from "@/stores/auth";
import { usePageHeader } from "@/stores/pageHeader";

export function AdminUsersPage() {
  const me = useAuth((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    usePageHeader.getState().set("帳號管理", "建立、停用或刪除使用者");
  }, []);

  const reload = useCallback(async () => {
    try {
      setUsers(await api.get<User[]>("/admin/users"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createUser() {
    setCreating(true);
    try {
      await api.post("/admin/users", { username: newUsername, password: newPassword });
      toast.success(`已建立帳號 ${newUsername}`);
      setNewUsername("");
      setNewPassword("");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(u: User) {
    try {
      await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active });
      toast.success(`${u.username} 已${u.is_active ? "停用" : "啟用"}`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function resetPassword(u: User) {
    const pw = window.prompt(`將 ${u.username} 的密碼重設為：`);
    if (!pw) return;
    try {
      await api.post(`/admin/users/${u.id}/password`, { new_password: pw });
      toast.success(`已重設 ${u.username} 的密碼`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function removeUser(u: User) {
    // 刪帳號會連同該使用者的影片 / 片語 / 例句一起刪掉，要求輸入 DELETE 二次確認
    const answer = window.prompt(
      `刪除 ${u.username} 會一併刪除他的所有影片、片語與例句，且無法復原。\n確定請輸入 DELETE：`,
    );
    if (answer !== "DELETE") return;
    try {
      await api.del(`/admin/users/${u.id}`);
      toast.success(`已刪除 ${u.username}`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>新增帳號</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem] flex-1 space-y-1.5">
            <Label htmlFor="new-username">帳號</Label>
            <Input
              id="new-username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="使用者名稱"
            />
          </div>
          <div className="min-w-[10rem] flex-1 space-y-1.5">
            <Label htmlFor="new-password">密碼</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 4 個字元"
            />
          </div>
          <Button
            variant="gradient"
            onClick={createUser}
            disabled={creating || !newUsername || newPassword.length < 4}
          >
            {creating ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : <Plus strokeWidth={1.75} />}
            新增
          </Button>
        </CardContent>
      </Card>

      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle>所有帳號（{users.length}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex justify-center p-6 text-muted-foreground">
              <Loader2 className="animate-spin" strokeWidth={1.75} />
            </div>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="glass-soft flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{u.username}</p>
                  <p className="text-xs text-muted-foreground">
                    建立於 {new Date(u.created_at).toLocaleDateString("zh-TW")}
                  </p>
                </div>

                <Badge variant={u.role === "admin" ? "indigo" : "muted"}>
                  {u.role === "admin" ? "管理員" : "一般"}
                </Badge>
                <Badge variant={u.is_active ? "green" : "amber"}>
                  {u.is_active ? "啟用中" : "已停用"}
                </Badge>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={u.is_active ? "停用" : "啟用"}
                    onClick={() => toggleActive(u)}
                    disabled={u.id === me?.id}
                  >
                    {u.is_active ? (
                      <UserX className="h-4 w-4" strokeWidth={1.75} />
                    ) : (
                      <UserCheck className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" title="重設密碼" onClick={() => resetPassword(u)}>
                    <KeyRound className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="刪除帳號"
                    onClick={() => removeUser(u)}
                    disabled={u.id === me?.id}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
