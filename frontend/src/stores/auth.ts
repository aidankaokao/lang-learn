import { create } from "zustand";

import { api, setAuthToken, setUnauthorizedHandler } from "@/lib/api";

export type User = {
  id: number;
  username: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
};

type LoginResponse = { access_token: string; user: User };

type AuthState = {
  token: string | null;
  user: User | null;
  /** 首次進站還在驗證既有 token 時為 true，避免畫面閃一下登入頁 */
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
};

const TOKEN_KEY = "yt-learn-token";

export const useAuth = create<AuthState>((set) => {
  function accept({ access_token, user }: LoginResponse) {
    localStorage.setItem(TOKEN_KEY, access_token);
    setAuthToken(access_token);
    set({ token: access_token, user, loading: false });
  }

  function clear() {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    set({ token: null, user: null, loading: false });
  }

  // token 失效時（任何 API 回 401）自動登出
  setUnauthorizedHandler(clear);

  return {
    token: null,
    user: null,
    loading: true,

    login: async (username, password) => {
      accept(await api.post<LoginResponse>("/auth/login", { username, password }));
    },

    register: async (username, password) => {
      accept(await api.post<LoginResponse>("/auth/register", { username, password }));
    },

    logout: clear,

    restore: async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        set({ loading: false });
        return;
      }
      setAuthToken(token);
      try {
        const user = await api.get<User>("/auth/me");
        set({ token, user, loading: false });
      } catch {
        clear(); // token 過期或後端重啟換了 secret
      }
    },
  };
});
