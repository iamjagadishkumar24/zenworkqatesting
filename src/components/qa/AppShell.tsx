import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard, FileText, Globe, FileSpreadsheet, Plug, MessageSquare,
  Cpu, Sparkles, Bell as BellIcon,
  BarChart3, Settings, ChevronLeft, ChevronRight, LogOut, Search, ListChecks, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NotificationsBell } from "./NotificationsBell";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean };
const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/forms", label: "Forms", icon: FileText },
  { to: "/online-1099", label: "1099 Online Forms", icon: Globe },
  { to: "/2290-forms", label: "2290 Forms", icon: FileSpreadsheet },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/chatbot-testing", label: "Chatbot Testing", icon: MessageSquare },
  { to: "/functionality-testing", label: "Functionality Testing", icon: Cpu },
  { to: "/tax1099-features", label: "Tax1099 Features", icon: Sparkles },
  { to: "/my-reported-errors", label: "My Reported Errors", icon: ListChecks },
  { to: "/retest", label: "Retest Assignments", icon: ClipboardCheck },
  { to: "/reports", label: "Reports", icon: BarChart3, adminOnly: true },
  { to: "/notifications", label: "Notifications", icon: BellIcon },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, logout } = useQA();
  const { env, setEnv } = useEnvironment();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState("");
  const isAdmin = currentUser?.role === "admin";
  const visibleNav = nav.filter((n) => !n.adminOnly || isAdmin);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate({ to: "/my-reported-errors", search: { q: q.trim() } as never });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 h-screen shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar transition-all",
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
              <span className="font-semibold text-sidebar-foreground">Zenwork Testing</span>
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
          {visibleNav.map((item) => {
            const active = path === item.to || path.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
                style={active ? { background: "var(--gradient-primary)" } : undefined}
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
          <h1 className="text-lg font-semibold tracking-tight">Zenwork Testing Portal</h1>
          {env && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "ml-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset transition-colors",
                    env === "Production"
                      ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 hover:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-amber-500/10 text-amber-700 ring-amber-500/30 hover:bg-amber-500/15 dark:text-amber-300",
                  )}
                  aria-label={`Environment: ${env}. Click to switch.`}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", env === "Production" ? "bg-emerald-500" : "bg-amber-500")} />
                  {env}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Switch environment</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEnv("Production")}>Production</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEnv("Stage")}>Stage</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setEnv(null); navigate({ to: "/select-environment" }); }}>
                  Change environment…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <form onSubmit={onSearch} className="relative ml-auto hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search defects, forms, agents…"
              className="w-72 pl-9"
            />
          </form>
          <NotificationsBell />
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
