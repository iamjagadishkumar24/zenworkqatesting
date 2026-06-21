import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Environment } from "./types";

const KEY = "zenwork.env";

function readStoredEnv(): Environment | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "Production" || v === "Stage") return v;
  } catch {
    /* ignore */
  }
  return null;
}

type Ctx = {
  env: Environment | null;
  ready: boolean;
  setEnv: (e: Environment | null) => void;
};

const EnvCtx = createContext<Ctx | null>(null);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage synchronously on the client so the
  // first render already has the persisted value and the redirect to
  // /select-environment never fires for users who have picked one before.
  const [env, setEnvState] = useState<Environment | null>(() => readStoredEnv());
  const [ready, setReady] = useState<boolean>(() => typeof window !== "undefined");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Re-sync after hydration in case SSR rendered with null.
    const stored = readStoredEnv();
    setEnvState((prev) => prev ?? stored);
    setReady(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      if (e.newValue === "Production" || e.newValue === "Stage") setEnvState(e.newValue);
      else if (e.newValue === null) setEnvState(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnv = useCallback((e: Environment | null) => {
    setEnvState(e);
    if (typeof window === "undefined") return;
    try {
      if (e) window.localStorage.setItem(KEY, e);
      else window.localStorage.removeItem(KEY);
    } catch {
      /* ignore quota / privacy mode errors */
    }
  }, []);

  return <EnvCtx.Provider value={{ env, ready, setEnv }}>{children}</EnvCtx.Provider>;
}

export function useEnvironment() {
  const c = useContext(EnvCtx);
  if (!c) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return c;
}
