// 前端唯一的 API 入口：一律打同源相對路徑 /api/...
// dev 由 Vite proxy 轉給 localhost:8000、prod 由 nginx 反代給 backend:8000（免 CORS）。
// 說明見 reference/frontend/frontend-backend-integration.md §5、§6。

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ""); // 支援 /<APP_ROUTE>/ 子路徑部署

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/** 註冊「token 失效」處理（由 auth store 掛上：清空登入狀態並導回登入頁）。 */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function buildHeaders(extra?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((extra as Record<string, string>) ?? {}),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

async function ensureOk(res: Response): Promise<void> {
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error("登入已過期，請重新登入");
  }
  if (!res.ok) {
    // 後端慣例：錯誤回 { detail: "..." }（FastAPI 預設）
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail[0]?.msg ?? msg; // pydantic 驗證錯誤
    } catch {
      /* 非 JSON，保留預設訊息 */
    }
    throw new Error(msg);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: buildHeaders(init?.headers) });
  await ensureOk(res);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** 取二進位回應（目前用於 TTS 的 mp3）。 */
async function requestBlob(path: string, body?: unknown): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  await ensureOk(res);
  return res.blob();
}

export const api = {
  get: <T>(p: string) => request<T>(`/api${p}`),
  post: <T>(p: string, body?: unknown) =>
    request<T>(`/api${p}`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(`/api${p}`, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(`/api${p}`, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(p: string) => request<T>(`/api${p}`, { method: "DELETE" }),
  blob: (p: string, body?: unknown) => requestBlob(`/api${p}`, body),
};
