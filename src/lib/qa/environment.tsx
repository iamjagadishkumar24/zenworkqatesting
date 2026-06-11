import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Environment } from "./types";

const KEY = "zenwork.env";

type Ctx = {
  env: Environment | null;
  ready: boolean;
  setEnv: (e: Environment | null) => void;
};

const EnvCtx = createContext<Ctx | null>(null);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [env, setEnvState] = useState<Environment | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(KEY);
    if (v === "Production" || v === "Stage") setEnvState(v);
    setReady(true);
  }, []);

  const setEnv = useCallback((e: Environment | null) => {
    setEnvState(e);
    if (typeof window === "undefined") return;
    if (e) localStorage.setItem(KEY, e);
    else localStorage.removeItem(KEY);
  }, []);

  return <EnvCtx.Provider value={{ env, ready, setEnv }}>{children}</EnvCtx.Provider>;
}

export function useEnvironment() {
  const c = useContext(EnvCtx);
  if (!c) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return c;
}