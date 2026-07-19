import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { GlassBackground } from "@/components/GlassBackground";
import { AppLayout } from "@/components/layout/AppLayout";
import { loadTheme } from "@/lib/themes";
import { AdminUsersPage } from "@/pages/AdminUsersPage";
import { ClipPracticePage } from "@/pages/ClipPracticePage";
import { ClipsPage } from "@/pages/ClipsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { PhrasesPage } from "@/pages/PhrasesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StudyPage } from "@/pages/StudyPage";
import { VideosPage } from "@/pages/VideosPage";
import { useAuth } from "@/stores/auth";

/** 未登入導回登入頁；還在還原 token 時先顯示 loading，避免閃一下登入頁。 */
function RequireAuth({ adminOnly = false }: { adminOnly?: boolean }) {
  const { token, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  const restore = useAuth((s) => s.restore);

  useEffect(() => {
    loadTheme();
    void restore();
  }, [restore]);

  return (
    // basename 支援 /<APP_ROUTE>/ 子路徑部署（見 frontend-backend-integration.md §6）
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <GlassBackground />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="videos" element={<VideosPage />} />
            <Route path="videos/:videoId" element={<StudyPage />} />
            <Route path="clips" element={<ClipsPage />} />
            <Route path="clips/:clipId" element={<ClipPracticePage />} />
            <Route path="phrases" element={<PhrasesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth adminOnly />}>
          <Route element={<AppLayout />}>
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster position="bottom-right" richColors toastOptions={{ className: "glass-strong" }} />
    </BrowserRouter>
  );
}
