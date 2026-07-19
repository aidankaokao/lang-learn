import {
  Check,
  KeyRound,
  Loader2,
  Palette,
  Pencil,
  Plug,
  Plus,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { applyTheme, loadTheme, THEMES, type ThemeId } from "@/lib/themes";
import { getVoice, setVoice, speak, type Voice } from "@/lib/tts";
import { usePageHeader } from "@/stores/pageHeader";

type Provider = {
  id: number;
  name: string;
  provider: "openai" | "ollama";
  base_url: string;
  model: string;
  temperature: number;
  is_active: boolean;
  api_key_masked: string;
  has_api_key: boolean;
};

type FormState = {
  name: string;
  provider: "openai" | "ollama";
  model: string;
  base_url: string;
  api_key: string;
  temperature: number;
};

const DEFAULT_BASE_URL: Record<FormState["provider"], string> = {
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434",
};

const EMPTY_FORM: FormState = {
  name: "",
  provider: "openai",
  model: "gpt-4o-mini",
  base_url: DEFAULT_BASE_URL.openai,
  api_key: "",
  temperature: 0,
};

export function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeId>("aurora-glass");

  useEffect(() => {
    usePageHeader.getState().set("設定", "LLM provider、外觀主題與密碼");
    setTheme(loadTheme());
  }, []);

  const reload = useCallback(async () => {
    try {
      setProviders(await api.get<Provider[]>("/settings/llm-providers"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  }

  function startEdit(p: Provider) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      provider: p.provider,
      model: p.model,
      base_url: p.base_url,
      api_key: "", // 留空代表不更動已存的 key
      temperature: p.temperature,
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      if (editingId === null) await api.post("/settings/llm-providers", form);
      else await api.put(`/settings/llm-providers/${editingId}`, form);
      toast.success(editingId === null ? "已新增設定" : "已更新設定");
      setForm(null);
      setEditingId(null);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function activate(p: Provider) {
    try {
      await api.put(`/settings/llm-providers/${p.id}/active`);
      toast.success(`已改用「${p.name}」`);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function test(p: Provider) {
    setTestingId(p.id);
    try {
      const res = await api.post<{ ok: boolean; reply: string }>(
        `/settings/llm-providers/${p.id}/test`,
      );
      toast.success(`連線正常，模型回覆：${res.reply}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingId(null);
    }
  }

  async function remove(p: Provider) {
    if (!window.confirm(`確定刪除「${p.name}」這組設定？`)) return;
    try {
      await api.del(`/settings/llm-providers/${p.id}`);
      toast.success("已刪除");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function pickTheme(id: ThemeId) {
    applyTheme(id);
    setTheme(id);
  }

  return (
    <>
      {/* ── LLM provider ── */}
      <Card className="animate-fade-up">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>LLM Provider</CardTitle>
            <CardDescription>
              可註冊多組，啟用中的那組會用在片語萃取、批改與問答。API key 加密存放，不會回傳明文。
            </CardDescription>
          </div>
          {form === null && (
            <Button variant="gradient" size="sm" onClick={startCreate}>
              <Plus strokeWidth={1.75} />
              新增
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center p-6 text-muted-foreground">
              <Loader2 className="animate-spin" strokeWidth={1.75} />
            </div>
          ) : providers.length === 0 && form === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              還沒有任何設定，先新增一組吧。
            </p>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="glass-soft flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{p.name}</p>
                    {p.is_active && <Badge variant="green">使用中</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.provider} · {p.model} · {p.base_url}
                    {p.has_api_key && ` · key ${p.api_key_masked}`}
                  </p>
                </div>

                <div className="flex gap-1">
                  {!p.is_active && (
                    <Button variant="ghost" size="icon" title="設為使用中" onClick={() => activate(p)}>
                      <Check className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="測試連線"
                    onClick={() => test(p)}
                    disabled={testingId === p.id}
                  >
                    {testingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Plug className="h-4 w-4" strokeWidth={1.75} />
                    )}
                  </Button>
                  <Button variant="ghost" size="icon" title="編輯" onClick={() => startEdit(p)}>
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  </Button>
                  <Button variant="ghost" size="icon" title="刪除" onClick={() => remove(p)}>
                    <Trash2 className="h-4 w-4 text-destructive" strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            ))
          )}

          {form && (
            <div className="glass-soft space-y-4 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{editingId === null ? "新增設定" : "編輯設定"}</p>
                <Button variant="ghost" size="icon" onClick={() => setForm(null)} title="取消">
                  <X className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>顯示名稱</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例：我的 OpenAI"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>類型</Label>
                  <Select
                    value={form.provider}
                    onChange={(e) => {
                      const provider = e.target.value as FormState["provider"];
                      // 換類型時把 base_url 一起換成該類型的預設，避免留著上一個的網址
                      setForm({ ...form, provider, base_url: DEFAULT_BASE_URL[provider] });
                    }}
                  >
                    <option value="openai">OpenAI（或相容 API / 本地 vLLM）</option>
                    <option value="ollama">Ollama（本地）</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>模型</Label>
                  <Input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder={form.provider === "openai" ? "gpt-4o-mini" : "qwen2.5:7b"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>base_url</Label>
                  <Input
                    value={form.base_url}
                    onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                    placeholder={editingId === null ? "sk-..." : "留空 = 不更動原本的 key"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>temperature</Label>
                  <Input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={form.temperature}
                    onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setForm(null)}>
                  取消
                </Button>
                <Button variant="gradient" onClick={save} disabled={saving || !form.name || !form.model}>
                  {saving && <Loader2 className="animate-spin" strokeWidth={1.75} />}
                  儲存
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 外觀主題 ── */}
      <Card className="animate-fade-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" strokeWidth={1.75} />
            外觀主題
          </CardTitle>
          <CardDescription>只換配色，玻璃質感與版面不變。設定存在這台瀏覽器。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => pickTheme(t.id)}
              className={`glass-soft flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-all hover:bg-white/50 ${
                theme === t.id ? "ring-2 ring-ring" : ""
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${t.from}, ${t.to})` }}
              />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <VoiceCard />
      <ChangePasswordCard />
    </>
  );
}

/** 朗讀語音（微軟 Edge Neural，預設英國腔） */
function VoiceCard() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selected, setSelected] = useState(getVoice());
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    api
      .get<{ voices: Voice[] }>("/tts/voices")
      .then((res) => setVoices(res.voices))
      .catch((e) => toast.error((e as Error).message));
  }, []);

  function pick(id: string) {
    setSelected(id);
    setVoice(id);
  }

  async function preview() {
    setTrying(true);
    try {
      await speak("This is how I sound. Let's practise together.", {
        onEnd: () => setTrying(false),
      });
    } catch {
      setTrying(false);
      toast.error("語音服務連不上，請確認後端能連外網");
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-primary" strokeWidth={1.75} />
          朗讀語音
        </CardTitle>
        <CardDescription>
          片語與例句的朗讀聲音，用的是微軟 Edge 的 Neural 語音（免費、不需金鑰）。設定存在這台瀏覽器。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label>語音</Label>
          <Select value={selected} onChange={(e) => pick(e.target.value)}>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={preview} disabled={trying}>
          {trying ? <Loader2 className="animate-spin" strokeWidth={1.75} /> : <Volume2 strokeWidth={1.75} />}
          試聽
        </Button>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      toast.success("密碼已更新");
      setOld("");
      setNew("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" strokeWidth={1.75} />
          修改密碼
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <Label htmlFor="old-pw">舊密碼</Label>
          <Input id="old-pw" type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
        </div>
        <div className="min-w-[10rem] flex-1 space-y-1.5">
          <Label htmlFor="new-pw">新密碼</Label>
          <Input
            id="new-pw"
            type="password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            placeholder="至少 4 個字元"
          />
        </div>
        <Button onClick={submit} disabled={busy || !oldPassword || newPassword.length < 4}>
          {busy && <Loader2 className="animate-spin" strokeWidth={1.75} />}
          更新密碼
        </Button>
      </CardContent>
    </Card>
  );
}
