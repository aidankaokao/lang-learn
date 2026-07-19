import { GraduationCap, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useAuth } from "@/stores/auth";

export function LoginPage() {
  const { token, login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(username, password);
      else await register(username, password);
      toast.success(mode === "login" ? "登入成功" : "註冊成功，已自動登入");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="animate-fade-up w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="bg-brand-gradient mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white">
            <GraduationCap className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <CardTitle className="pt-2 text-2xl">
            <span className="text-gradient">yt-learn</span>
          </CardTitle>
          <CardDescription>
            {mode === "login" ? "登入開始你的英文聽力訓練" : "建立帳號，開始累積你的片語庫"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">帳號</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="輸入帳號"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "輸入密碼" : "至少 4 個字元"}
                required
              />
            </div>

            <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" strokeWidth={1.75} />}
              {mode === "login" ? "登入" : "註冊並登入"}
            </Button>
          </form>

          <p className="pt-4 text-center text-sm text-muted-foreground">
            {mode === "login" ? "還沒有帳號？" : "已經有帳號了？"}
            <Button
              variant="link"
              className="px-1"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "註冊一個" : "回到登入"}
            </Button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
