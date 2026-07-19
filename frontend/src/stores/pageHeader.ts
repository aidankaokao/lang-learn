import { create } from "zustand";

// 集中式頁面標題：各頁 set，Header 讀取顯示。
// 見 reference/frontend/frontend-backend-integration.md §7。
type State = {
  title: string;
  subtitle?: string;
  set: (title: string, subtitle?: string) => void;
};

export const usePageHeader = create<State>((set) => ({
  title: "",
  set: (title, subtitle) => set({ title, subtitle }),
}));
