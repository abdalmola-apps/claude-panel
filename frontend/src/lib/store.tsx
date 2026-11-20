import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import type { Meta, Scope, Settings } from "./types";

type ToastKind = "ok" | "err" | "info";
interface Toast { id: number; kind: ToastKind; msg: string; }

interface Ctx {
  meta: Meta | null;
  scopes: Scope[];
  scope: string;                    // "" = global user settings; else a settings file path
  setScope: (path: string) => void;
  settings: Settings | null;        // live draft (for the current scope)
  original: Settings | null;        // last-saved baseline
  dirty: boolean;
  loading: boolean;
  error: string | null;
  patch: (fn: (s: Settings) => void) => void;   // mutate a draft clone
  reload: () => Promise<void>;
  save: () => Promise<void>;
  revert: () => void;
  toast: (msg: string, kind?: ToastKind) => void;
  toasts: Toast[];
  theme: "dark" | "light";
  toggleTheme: () => void;
  rtl: boolean;
  toggleRtl: () => void;
  autoApply: boolean;
  toggleAutoApply: () => void;
}

const StoreCtx = createContext<Ctx>(null as any);
export const useStore = () => useContext(StoreCtx);

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export function Store({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [scope, setScope] = useState<string>("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [original, setOriginal] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("cc.theme") as any) || "dark"
  );
  const [rtl, setRtl] = useState<boolean>(() => localStorage.getItem("cc.rtl") === "1");
  const [autoApply, setAutoApply] = useState<boolean>(
    () => (localStorage.getItem("cc.autoApply") ?? "1") === "1"
  );
  const autoTimer = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("cc.theme", theme); } catch { /**/ }
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
    try { localStorage.setItem("cc.rtl", rtl ? "1" : "0"); } catch { /**/ }
  }, [rtl]);
  useEffect(() => {
    try { localStorage.setItem("cc.autoApply", autoApply ? "1" : "0"); } catch { /**/ }
  }, [autoApply]);

  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, sc, s] = await Promise.all([
        api.meta(),
        api.scopes(),
        api.getSettings(scope || undefined),
      ]);
      setMeta(m);
      setScopes(sc.scopes);
      setSettings(clone(s.data));
      setOriginal(clone(s.data));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { reload(); }, [reload]);

  const patch = useCallback((fn: (s: Settings) => void) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = clone(prev);
      fn(next);
      return next;
    });
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(original),
    [settings, original]
  );

  const save = useCallback(async (silent = false) => {
    if (!settings) return;
    try {
      const r = await api.saveSettings(settings, scope || undefined);
      setOriginal(clone(settings));
      if (!silent) toast("Saved " + (scope ? "project settings" : "settings") + (r.backup ? " · backup written" : ""), "ok");
    } catch (e: any) {
      toast("Save failed: " + (e.message || e), "err");
      throw e;
    }
  }, [settings, scope, toast]);

  // Auto-apply: when enabled, persist the draft to disk 1s after the last edit.
  useEffect(() => {
    if (!autoApply || !dirty) return;
    if (autoTimer.current) window.clearTimeout(autoTimer.current);
    autoTimer.current = window.setTimeout(() => { save(true).catch(() => {}); }, 1000);
    return () => { if (autoTimer.current) window.clearTimeout(autoTimer.current); };
  }, [autoApply, dirty, settings, save]);

  const revert = useCallback(() => {
    if (original) setSettings(clone(original));
    toast("Reverted to last-saved", "info");
  }, [original, toast]);

  const value: Ctx = {
    meta, scopes, scope, setScope, settings, original, dirty, loading, error,
    patch, reload, save, revert, toast, toasts,
    theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    rtl, toggleRtl: () => setRtl((r) => !r),
    autoApply, toggleAutoApply: () => setAutoApply((a) => !a),
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
