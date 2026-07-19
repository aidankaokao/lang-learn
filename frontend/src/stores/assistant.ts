import { create } from "zustand";

/**
 * 懸浮 AI 助理的共享狀態。
 *
 * savePhrase 由學習頁在掛載時註冊：有註冊時，反白工具列才會多出「收藏片語」，
 * 這樣工具列本身不必知道自己在哪個頁面。
 */
type AssistantState = {
  open: boolean;
  setOpen: (open: boolean) => void;

  /** 反白後要帶進對話的上下文 */
  context: string;
  setContext: (context: string) => void;

  savePhrase: ((text: string) => Promise<void>) | null;
  setSavePhrase: (handler: ((text: string) => Promise<void>) | null) => void;
};

export const useAssistant = create<AssistantState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),

  context: "",
  setContext: (context) => set({ context }),

  savePhrase: null,
  setSavePhrase: (savePhrase) => set({ savePhrase }),
}));
