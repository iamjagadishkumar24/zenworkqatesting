import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { seedUsers, seedForms, seedDefects } from "./seed";
import type { Defect, FormItem, User, Role } from "./types";

type State = {
  users: User[];
  forms: FormItem[];
  defects: Defect[];
  currentUser: User | null;
};

type Ctx = State & {
  login: (email: string, password: string) => { ok: boolean; error?: string };
  signup: (name: string, email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  addDefect: (d: Omit<Defect, "id" | "createdAt" | "updatedAt" | "updatedBy" | "createdBy" | "comments">) => void;
  updateDefect: (id: string, patch: Partial<Defect>) => void;
  deleteDefect: (id: string) => void;
  addComment: (id: string, text: string) => void;
  addUser: (u: Omit<User, "id">) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
  removeUser: (id: string) => void;
  updateForm: (id: string, patch: Partial<FormItem>) => void;
  addForm: (f: Omit<FormItem, "id">) => void;
};

const LS_KEY = "zenwork-qa-state-v1";
const LS_PWD = "zenwork-qa-pwd-v1";
const LS_SESSION = "zenwork-qa-session-v1";

function loadState(): State {
  if (typeof window === "undefined")
    return { users: seedUsers, forms: seedForms, defects: seedDefects, currentUser: null };
  try {
    const raw = localStorage.getItem(LS_KEY);
    const session = localStorage.getItem(LS_SESSION);
    if (raw) {
      const parsed = JSON.parse(raw) as Omit<State, "currentUser">;
      const currentUser = session ? (JSON.parse(session) as User) : null;
      return { ...parsed, currentUser };
    }
  } catch {}
  return { users: seedUsers, forms: seedForms, defects: seedDefects, currentUser: null };
}

function savePwd(map: Record<string, string>) {
  localStorage.setItem(LS_PWD, JSON.stringify(map));
}
function loadPwd(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_PWD) || "{}");
  } catch {
    return {};
  }
}

const Context = createContext<Ctx | null>(null);

export function QAProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => loadState());

  useEffect(() => {
    const { currentUser, ...persist } = state;
    localStorage.setItem(LS_KEY, JSON.stringify(persist));
    if (currentUser) localStorage.setItem(LS_SESSION, JSON.stringify(currentUser));
    else localStorage.removeItem(LS_SESSION);
  }, [state]);

  const now = () => new Date().toISOString();

  const ctx: Ctx = {
    ...state,
    login: (email, password) => {
      const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) return { ok: false, error: "User not found" };
      if (!user.active) return { ok: false, error: "Account is deactivated" };
      const pwds = loadPwd();
      const stored = pwds[user.email.toLowerCase()];
      // Allow seed users with default password "demo1234"
      const expected = stored ?? "demo1234";
      if (password !== expected) return { ok: false, error: "Invalid password" };
      setState((s) => ({ ...s, currentUser: user }));
      return { ok: true };
    },
    signup: (name, email, password) => {
      const exists = state.users.some((u) => u.email.toLowerCase() === email.toLowerCase());
      if (exists) return { ok: false, error: "Email already registered" };
      const role: Role = state.users.length === 0 ? "admin" : "agent";
      const user: User = { id: `u-${Date.now()}`, name, email, role, active: true };
      const pwds = loadPwd();
      pwds[email.toLowerCase()] = password;
      savePwd(pwds);
      setState((s) => ({ ...s, users: [...s.users, user], currentUser: user }));
      return { ok: true };
    },
    logout: () => setState((s) => ({ ...s, currentUser: null })),
    addDefect: (d) =>
      setState((s) => {
        const nextNum = 1000 + s.defects.length + 1;
        const author = s.currentUser?.name ?? "System";
        const defect: Defect = {
          ...d,
          id: `DEF-${nextNum}`,
          createdAt: now(),
          updatedAt: now(),
          createdBy: author,
          updatedBy: author,
          comments: [],
        };
        return { ...s, defects: [defect, ...s.defects] };
      }),
    updateDefect: (id, patch) =>
      setState((s) => ({
        ...s,
        defects: s.defects.map((d) =>
          d.id === id
            ? { ...d, ...patch, updatedAt: now(), updatedBy: s.currentUser?.name ?? d.updatedBy }
            : d,
        ),
      })),
    deleteDefect: (id) =>
      setState((s) => ({ ...s, defects: s.defects.filter((d) => d.id !== id) })),
    addComment: (id, text) =>
      setState((s) => ({
        ...s,
        defects: s.defects.map((d) =>
          d.id === id
            ? {
                ...d,
                comments: [
                  ...d.comments,
                  {
                    id: `c-${Date.now()}`,
                    author: s.currentUser?.name ?? "Agent",
                    text,
                    createdAt: now(),
                  },
                ],
                updatedAt: now(),
              }
            : d,
        ),
      })),
    addUser: (u) =>
      setState((s) => ({ ...s, users: [...s.users, { ...u, id: `u-${Date.now()}` }] })),
    updateUser: (id, patch) =>
      setState((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),
    removeUser: (id) =>
      setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) })),
    updateForm: (id, patch) =>
      setState((s) => ({ ...s, forms: s.forms.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
    addForm: (f) =>
      setState((s) => ({ ...s, forms: [...s.forms, { ...f, id: `F-${Date.now()}` }] })),
  };

  return <Context.Provider value={ctx}>{children}</Context.Provider>;
}

export function useQA() {
  const c = useContext(Context);
  if (!c) throw new Error("useQA must be used within QAProvider");
  return c;
}
