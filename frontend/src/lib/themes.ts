// 主題盤清單（對應 index.css 的 [data-theme] 區塊）。
export type ThemeId =
  | "aurora-glass"
  | "sunset-coral"
  | "rose-quartz"
  | "mint-meadow"
  | "lavender-mist"
  | "ocean-deep"
  | "golden-hour"
  | "graphite-frost";

export const THEMES: { id: ThemeId; label: string; from: string; to: string }[] = [
  { id: "aurora-glass", label: "極光琉璃", from: "#14B8A6", to: "#6366F1" },
  { id: "sunset-coral", label: "珊瑚晚霞", from: "#FB7185", to: "#F59E0B" },
  { id: "rose-quartz", label: "玫瑰石英", from: "#F472B6", to: "#A855F7" },
  { id: "mint-meadow", label: "薄荷草原", from: "#34D399", to: "#06B6D4" },
  { id: "lavender-mist", label: "薰衣草霧", from: "#818CF8", to: "#C084FC" },
  { id: "ocean-deep", label: "深海潮", from: "#3B82F6", to: "#22D3EE" },
  { id: "golden-hour", label: "蜜金時光", from: "#FBBF24", to: "#FB7185" },
  { id: "graphite-frost", label: "石墨霜", from: "#64748B", to: "#94A3B8" },
];

const STORAGE_KEY = "yt-learn-theme";

export function applyTheme(id: ThemeId) {
  // 預設盤不需要 data-theme（值就寫在 :root）
  if (id === "aurora-glass") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", id);
  localStorage.setItem(STORAGE_KEY, id);
}

export function loadTheme(): ThemeId {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
  const id = saved && THEMES.some((t) => t.id === saved) ? saved : "aurora-glass";
  applyTheme(id);
  return id;
}
