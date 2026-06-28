import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "@/lib/qa/store";
import { MODULE_OPTIONS } from "@/lib/qa/constants";

export type PermAction = "view" | "create" | "edit" | "delete";
export type PermissionMap = Record<string, Record<PermAction, boolean>>;

const ACTIONS: readonly PermAction[] = ["view", "create", "edit", "delete"];

/**
 * Map every routable surface to its canonical permission module.
 * Keys are pathname prefixes (longest match wins).
 * Modules without a corresponding route are still authorized via the same
 * matrix when invoked from a dialog/button.
 */
export const ROUTE_MODULE_MAP: Array<{ prefix: string; module: string }> = [
  { prefix: "/forms", module: "Forms" },
  { prefix: "/online-1099", module: "1099 Online Forms" },
  { prefix: "/990-forms", module: "990 Form Testing" },
  { prefix: "/2290-forms", module: "2290 Forms" },
  { prefix: "/integrations", module: "Integrations" },
  { prefix: "/chatbot-testing", module: "Chatbot Testing" },
  { prefix: "/excel-import-testing", module: "Excel Import Testing" },
  { prefix: "/functionality-testing", module: "Functionality Testing" },
  { prefix: "/tax1099-features", module: "Tax1099 Features" },
  { prefix: "/zenwork-payments", module: "Zenwork Payments" },
];

export function moduleForRoute(pathname: string): string | null {
  let match: { prefix: string; module: string } | null = null;
  for (const m of ROUTE_MODULE_MAP) {
    if (pathname === m.prefix || pathname.startsWith(`${m.prefix}/`)) {
      if (!match || m.prefix.length > match.prefix.length) match = m;
    }
  }
  return match ? match.module : null;
}

function defaultsForRole(role: "admin" | "agent" | string): PermissionMap {
  const m: PermissionMap = {};
  for (const mod of MODULE_OPTIONS) {
    m[mod] = {
      view: true,
      create: role === "admin",
      edit: role === "admin",
      delete: role === "admin",
    };
  }
  return m;
}

type Ctx = {
  permissions: PermissionMap;
  loading: boolean;
  can: (module: string, action: PermAction) => boolean;
  reload: () => void;
};

const PermissionsContext = createContext<Ctx | null>(null);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useQA();
  const userId = currentUser?.id ?? null;
  const role = currentUser?.role ?? "agent";
  const [overrides, setOverrides] = useState<Record<string, Record<PermAction, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const failureToasted = useRef(false);

  const load = useCallback(async () => {
    if (!userId) {
      setOverrides({});
      return;
    }
    setLoading(true);
    try {
      const mod = await import("./permissions.functions");
      const rows = await mod.listMyPermissionOverrides();
      const next: Record<string, Record<PermAction, boolean>> = {};
      for (const r of rows) {
        if (!next[r.module]) next[r.module] = {} as Record<PermAction, boolean>;
        next[r.module][r.action] = r.enabled;
      }
      setOverrides(next);
      failureToasted.current = false;
    } catch {
      if (!failureToasted.current) {
        failureToasted.current = true;
        toast.error("Couldn't load your permissions — using safe defaults");
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: refresh when the caller's overrides change anywhere.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user_permissions:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_permissions", filter: `user_id=eq.${userId}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const permissions: PermissionMap = useMemo(() => {
    const base = defaultsForRole(role);
    for (const [mod, perActions] of Object.entries(overrides)) {
      base[mod] = { ...(base[mod] ?? { view: false, create: false, edit: false, delete: false }), ...perActions };
    }
    return base;
  }, [overrides, role]);

  const can = useCallback(
    (moduleName: string, action: PermAction): boolean => {
      // Admins always retain access — last-resort safety net to avoid lockout.
      if (role === "admin") {
        const row = permissions[moduleName];
        if (row && row[action] === false) return false;
        return true;
      }
      const row = permissions[moduleName];
      if (!row) return action === "view";
      return !!row[action];
    },
    [permissions, role],
  );

  const value = useMemo<Ctx>(
    () => ({ permissions, loading, can, reload: () => void load() }),
    [permissions, loading, can, load],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): Ctx {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    // Fallback when provider isn't mounted (tests, isolated stories).
    return {
      permissions: {},
      loading: false,
      can: (_m, a) => a === "view",
      reload: () => undefined,
    };
  }
  return ctx;
}

export function useCan(moduleName: string | null | undefined, action: PermAction): boolean {
  const { can } = usePermissions();
  if (!moduleName) return true;
  return can(moduleName, action);
}

export { ACTIONS as PERMISSION_ACTIONS };
