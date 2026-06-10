import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard, FileText, ClipboardList, Link2, Globe, Bug,
  BarChart3, Settings, Bell, ChevronLeft, ChevronRight, LogOut, Search, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQA } from "@/lib/qa/store";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/forms-1099", label: "1099 Forms", icon: FileText },
  { to: "/forms-990", label: "990 Forms", icon: ClipboardList },
  { to: "/integrations", label: "Integrations", icon: Link2 },
  { to: "/online-1099", label: "1099 Online", icon: Globe },
  { to: "/defects", label: "Defects", icon: Bug },
  { to: "/my-errors", label: "My Errors", icon: ListChecks },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, logout, defects } = useQA();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState("");

  const openDefects = defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length;

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate({ to: "/defects", search: { q: q.trim() } as never });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-all",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div
                className="grid h-8 w-8 place-items-center rounded-lg text-primary-foreground font-bold"
                style={{ background: "var(--gradient-primary)" }}
              >
                Z
              </div>
              <span className="font-semibold text-sidebar-foreground">Zenwork QA</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-8 w-8 place-items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = path === item.to || path.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card/80 px-6 backdrop-blur">
          <h1 className="text-lg font-semibold tracking-tight">Zenwork QA Portal</h1>
          <form onSubmit={onSearch} className="relative ml-auto hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search defects, forms, agents…"
              className="w-72 pl-9"
            />
          </form>
          <button className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-accent">
            <Bell className="h-4 w-4" />
            {openDefects > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {openDefects}
              </span>
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-accent">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                  {currentUser?.name?.[0] ?? "U"}
                </div>
                <span className="hidden text-sm font-medium sm:inline">{currentUser?.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="font-medium">{currentUser?.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{currentUser?.role}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>Settings</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  navigate({ to: "/login" });
                }}
              >
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
