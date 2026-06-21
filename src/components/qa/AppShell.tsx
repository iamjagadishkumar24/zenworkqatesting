import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Globe,
  FileSpreadsheet,
  Plug,
  MessageSquare,
  Cpu,
  Sparkles,
  FileUp,
  CreditCard,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  ListChecks,
  ClipboardCheck,
  UserCog,
  ScrollText,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useTaxYear } from "@/lib/qa/taxYear";
import { TAX_YEARS } from "@/lib/qa/constants";
import { usePrefs } from "@/lib/qa/prefs";
import { UserAvatar } from "./UserAvatar";
import { BrandLogo } from "./BrandLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NotificationsBell } from "./NotificationsBell";
import { toast } from "sonner";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};
const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/forms", label: "Forms", icon: FileText },
  { to: "/online-1099", label: "1099 Online Forms", icon: Globe },
  { to: "/990-forms", label: "990 Forms", icon: FileText },
  { to: "/2290-forms", label: "2290 Forms", icon: FileSpreadsheet },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/chatbot-testing", label: "Chatbot", icon: MessageSquare },
  { to: "/excel-import-testing", label: "Excel Import", icon: FileUp },
  { to: "/functionality-testing", label: "Functionality", icon: Cpu },
  { to: "/tax1099-features", label: "Tax1099 Features", icon: Sparkles },
  { to: "/zenwork-payments", label: "Zenwork Payments", icon: CreditCard },
  { to: "/my-reported-errors", label: "Reported Errors", icon: ListChecks },
  { to: "/retest", label: "Task Assignments", icon: ClipboardCheck },
  { to: "/notes", label: "Quick Notes", icon: StickyNote },
  { to: "/agents", label: "Agent Management", icon: UserCog, adminOnly: true },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText, adminOnly: true },
  { to: "/reports", label: "Reports", icon: BarChart3, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, logout } = useQA();
  const { env, setEnv } = useEnvironment();
  const { taxYear, setTaxYear } = useTaxYear();
  // Apply user theme/accent/density globally on every page.
  usePrefs();
  // Apply environment theme globally so all pages, modals, tables, etc.
  // pick up the Production/Stage palette automatically.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (env) root.dataset.env = env;
    else delete root.dataset.env;
    return () => {
      /* keep across pages */
    };
  }, [env]);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const routeSearch = useRouterState({ select: (s) => s.location.search as { q?: string } });
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState("");
  const isAdmin = currentUser?.role === "admin";
  const visibleNav = nav.filter((n) => !n.adminOnly || isAdmin);

  // Keep header input in sync with the reported-errors URL `?q=`,
  // and clear it when navigating to any other page so old text never lingers.
  useEffect(() => {
    if (path === "/my-reported-errors") {
      setQ(routeSearch?.q ?? "");
    } else {
      setQ("");
    }
  }, [path, routeSearch?.q]);

  const pushSearch = (value: string) => {
    const trimmed = value.trim();
    navigate({
      to: "/my-reported-errors",
      search: trimmed ? { q: trimmed } : ({} as never),
      replace: path === "/my-reported-errors",
    });
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    pushSearch(q);
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 h-screen shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar transition-all",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border",
            collapsed ? "flex-col justify-center gap-1 px-2 py-2" : "justify-between px-4",
          )}
        >
          {!collapsed ? (
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogo className="h-8 w-8" />
              <span className="truncate font-semibold text-sidebar-foreground">
                Zenwork Testing
              </span>
            </div>
          ) : (
            <BrandLogo className="h-7 w-7" />
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "grid place-items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent",
              collapsed ? "h-5 w-5" : "h-8 w-8",
            )}
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-4 w-4" />}
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
          <div className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7" />
            <h1 className="text-lg font-semibold tracking-tight">Zenwork Testing</h1>
          </div>
          {env && (
            <div className="ml-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = env === "Production" ? "Stage" : "Production";
                  setEnv(next);
                  if (next === "Production") {
                    toast.success("Switched to Production", {
                      description: "Dashboard now showing live data.",
                    });
                  } else {
                    toast.warning("Switched to Stage", {
                      description: "Dashboard now showing pre-release data.",
                    });
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset transition-colors",
                  env === "Production"
                    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 hover:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-amber-500/10 text-amber-700 ring-amber-500/30 hover:bg-amber-500/15 dark:text-amber-300",
                )}
                title={`Click to switch to ${env === "Production" ? "Stage" : "Production"}`}
                aria-label={`Environment: ${env}. Click to switch to ${env === "Production" ? "Stage" : "Production"}.`}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    env === "Production" ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
                {env}
              </button>
              <Switch
                checked={env === "Production"}
                onCheckedChange={(checked) => {
                  const next = checked ? "Production" : "Stage";
                  if (next === env) return;
                  setEnv(next);
                  if (next === "Production") {
                    toast.success("Switched to Production", {
                      description: "Dashboard now showing live data.",
                    });
                  } else {
                    toast.warning("Switched to Stage", {
                      description: "Dashboard now showing pre-release data.",
                    });
                  }
                }}
                aria-label="Toggle environment"
                title={`Switch to ${env === "Production" ? "Stage" : "Production"}`}
              />
            </div>
          )}
          <div className="ml-2 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:inline">
              Tax Year
            </span>
            <Select
              value={taxYear}
              onValueChange={(v) => {
                setTaxYear(v as typeof taxYear);
                if (v === "all") toast.info("Showing all tax years");
                else toast.success(`Filtered to Tax Year ${v}`);
              }}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Tax Year filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {TAX_YEARS.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <form onSubmit={onSearch} className="relative ml-auto hidden md:block">
            <label htmlFor="qa-header-search" className="sr-only">
              Search errors, forms, and agents
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="qa-header-search"
              type="search"
              value={q}
              onChange={(e) => {
                const next = e.target.value;
                setQ(next);
                // When user clears the header search while on the reported-errors page,
                // remove `?q=` from the URL so no stale filter remains.
                if (path === "/my-reported-errors" && next.trim() === "") {
                  navigate({ to: "/my-reported-errors", search: {} as never, replace: true });
                }
              }}
              placeholder="Search errors, forms, agents…"
              className="w-72 pl-9"
            />
          </form>
          <NotificationsBell />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={
                  currentUser?.name
                    ? `Open account menu for ${currentUser.name}`
                    : "Open account menu"
                }
                className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <UserAvatar
                  name={currentUser?.name}
                  email={currentUser?.email}
                  avatarUrl={currentUser?.avatarUrl}
                  size="md"
                />
                <span className="hidden text-sm font-medium sm:inline">{currentUser?.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="font-medium">{currentUser?.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{currentUser?.role}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
                Settings
              </DropdownMenuItem>
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
