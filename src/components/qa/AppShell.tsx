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
  // Settings icon removed — Settings nav consolidated into /profile.
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  ListChecks,
  ClipboardCheck,
  UserCog,
  ScrollText,
  StickyNote,
  ShieldAlert,
  ShieldCheck,
  BookOpen,
  Activity,
  Gauge,
  UserSearch,
  PieChart,
  CalendarClock,
  Download as DownloadIcon,
  ChevronDown,
  Settings as SettingsIcon,
  Users as UsersIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useTaxYear } from "@/lib/qa/taxYear";
import { TAX_YEARS } from "@/lib/qa/constants";
import { usePrefs } from "@/lib/qa/prefs";
import { getFirstName } from "@/lib/qa/displayName";
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
import { checkForNewAppVersion } from "@/lib/cache-busting";
import { moduleForRoute, usePermissions } from "@/lib/qa/permissions";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  items: NavItem[];
};

type NavEntry = NavItem | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => "items" in e;

/**
 * Pure helper: compute the navigation entries to render for a given role.
 * - Filters admin-only entries for non-admins.
 * - For non-admin viewers, collapses any group with a single visible item
 *   down to a flat link (uses the group's header label/icon, links to the
 *   only child route). Avoids redundant single-item dropdowns.
 */
export type RenderedNavEntry =
  | { kind: "link"; to: string; label: string; icon: NavItem["icon"] }
  | {
      kind: "group";
      id: string;
      label: string;
      icon: NavGroup["icon"];
      items: NavItem[];
    };

export function getVisibleNav(
  source: NavEntry[],
  isAdmin: boolean,
): RenderedNavEntry[] {
  return source
    .filter((n) => !n.adminOnly || isAdmin)
    .map((entry): RenderedNavEntry | null => {
      if (!isGroup(entry)) {
        return { kind: "link", to: entry.to, label: entry.label, icon: entry.icon };
      }
      const items = entry.items.filter((i) => !i.adminOnly || isAdmin);
      if (items.length === 0) return null;
      if (!isAdmin && items.length === 1) {
        const only = items[0];
        return { kind: "link", to: only.to, label: entry.label, icon: entry.icon };
      }
      return { kind: "group", id: entry.id, label: entry.label, icon: entry.icon, items };
    })
    .filter((e): e is RenderedNavEntry => e !== null);
}

export const nav: NavEntry[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/forms", label: "Forms", icon: FileText },
  { to: "/online-1099", label: "1099 Online Forms", icon: Globe },
  { to: "/990-forms", label: "990 Forms", icon: FileText },
  { to: "/2290-forms", label: "2290 Forms", icon: FileSpreadsheet },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { to: "/chatbot-testing", label: "Chatbot", icon: MessageSquare },
  { to: "/excel-import-testing", label: "Excel Import", icon: FileUp },
  { to: "/functionality-testing", label: "Functionality", icon: Cpu },
  { to: "/tax1099-features", label: "Tax1099 Features", icon: Sparkles },
  { to: "/zenwork-payments", label: "Zenwork Payments", icon: CreditCard },
  { to: "/rights-management", label: "Rights Management", icon: ShieldCheck, adminOnly: true },
  { to: "/notes", label: "Quick Notes", icon: StickyNote },
  {
    id: "management",
    label: "Management",
    icon: UsersIcon,
    items: [
      { to: "/retest", label: "Task Management", icon: ClipboardCheck },
      { to: "/agents", label: "Agent Management", icon: UserCog, adminOnly: true },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    items: [
      { to: "/my-reported-errors", label: "Reported Errors", icon: ListChecks },
      { to: "/reports", label: "Error Reports", icon: BarChart3, adminOnly: true },
      { to: "/reports/performance", label: "Performance", icon: Gauge, adminOnly: true },
      { to: "/reports/user", label: "User", icon: UserSearch, adminOnly: true },
      { to: "/reports/activity", label: "Activity", icon: Activity, adminOnly: true },
      { to: "/reports/analytics", label: "Analytics", icon: PieChart, adminOnly: true },
      { to: "/reports/audit", label: "Audit Report", icon: ClipboardCheck, adminOnly: true },
      { to: "/reports/scheduled", label: "Scheduled", icon: CalendarClock, adminOnly: true },
      { to: "/reports/export-center", label: "Export Center", icon: DownloadIcon, adminOnly: true },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: SettingsIcon,
    items: [
      { to: "/profile", label: "Profile & Settings", icon: SettingsIcon },
      { to: "/permission-audit", label: "Permission Audit", icon: ShieldCheck, adminOnly: true },
      { to: "/audit-log", label: "Audit Logs", icon: ScrollText, adminOnly: true },
      { to: "/auth-events", label: "Auth Events", icon: ShieldAlert, adminOnly: true },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, logout } = useQA();
  const { env, setEnv } = useEnvironment();
  const { taxYear, setTaxYear } = useTaxYear();
  // Apply user theme/accent/density globally on every page.
  const { prefs, update: updatePref } = usePrefs();
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
  const collapsed = prefs.sidebarCollapsed;
  const setCollapsed = (next: boolean | ((c: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(collapsed) : next;
    updatePref("sidebarCollapsed", value);
  };
  const [q, setQ] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountAnnouncement, setAccountAnnouncement] = useState("");
  const isAdmin = currentUser?.role === "admin";
  const { can } = usePermissions();
  const isItemAllowed = (to: string) => {
    const moduleName = moduleForRoute(to);
    if (!moduleName) return true;
    return can(moduleName, "view");
  };
  const visibleNav: NavEntry[] = nav
    .filter((n) => !n.adminOnly || isAdmin)
    .filter((n) => isGroup(n) || isItemAllowed(n.to))
    .map((entry) => {
      if (!isGroup(entry)) return entry;
      const items = entry.items
        .filter((i) => !i.adminOnly || isAdmin)
        .filter((i) => isItemAllowed(i.to));
      return { ...entry, items };
    })
    .filter((entry) => !isGroup(entry) || entry.items.length > 0);
  // Accordion behavior: only one expandable group is open at a time.
  const activeGroup = visibleNav.find(
    (entry): entry is NavGroup =>
      isGroup(entry) &&
      entry.items.some((i) => path === i.to || path.startsWith(i.to + "/")),
  );
  const activeGroupId: string | null = activeGroup?.id ?? null;
  const [openGroupId, setOpenGroupId] = useState<string | null>(activeGroupId);
  // When the route changes to a different group, close any previously
  // expanded group and open the one containing the active route.
  useEffect(() => {
    setOpenGroupId(activeGroupId);
  }, [activeGroupId]);
  const toggleGroup = (id: string) =>
    setOpenGroupId((current) => (current === id ? null : id));

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
      search: (prev: Record<string, unknown>) => ({ ...prev, q: trimmed || undefined }),
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
        aria-label="Primary"
        data-collapsed={collapsed ? "true" : "false"}
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
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="primary-nav"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
        <nav id="primary-nav" aria-label="Main navigation" className="flex flex-col gap-1 p-3">
          {visibleNav.map((entry) => {
            if (isGroup(entry)) {
              // For non-admins, if a group collapses to a single visible item,
              // render it as a flat link using the group's header label/icon
              // (no expandable submenu, no duplicate entries).
              if (!isAdmin && entry.items.length === 1) {
                const only = entry.items[0];
                const GroupIcon = entry.icon;
                const active = path === only.to || path.startsWith(only.to + "/");
                if (collapsed) {
                  return (
                    <Link
                      key={entry.id}
                      to={only.to}
                      className={cn(
                        "flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "text-primary-foreground shadow-sm"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                      )}
                      style={active ? { background: "var(--gradient-primary)" } : undefined}
                      title={entry.label}
                      aria-label={entry.label}
                      aria-current={active ? "page" : undefined}
                    >
                      <GroupIcon className="h-4 w-4 shrink-0" />
                    </Link>
                  );
                }
                return (
                  <Link
                    key={entry.id}
                    to={only.to}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "text-primary-foreground shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                    )}
                    style={active ? { background: "var(--gradient-primary)" } : undefined}
                    aria-current={active ? "page" : undefined}
                  >
                    <GroupIcon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{entry.label}</span>
                  </Link>
                );
              }
              const Icon = entry.icon;
              const groupActive = entry.items.some(
                (i) => path === i.to || path.startsWith(i.to + "/"),
              );
              const open = openGroupId === entry.id;
              if (collapsed) {
                return (
                  <div key={entry.id} className="flex flex-col gap-1">
                    {entry.items.map((item) => {
                      const active = path === item.to || path.startsWith(item.to + "/");
                      const ItemIcon = item.icon;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            "flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                            active
                              ? "text-primary-foreground shadow-sm"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                          )}
                          style={active ? { background: "var(--gradient-primary)" } : undefined}
                          title={item.label}
                          aria-label={item.label}
                          aria-current={active ? "page" : undefined}
                        >
                          <ItemIcon className="h-4 w-4 shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div key={entry.id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.id)}
                    aria-expanded={open}
                    aria-controls={`nav-group-${entry.id}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      groupActive
                        ? "text-sidebar-foreground bg-sidebar-accent/40"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate text-left">{entry.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        open ? "rotate-180" : "rotate-0",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {open && (
                    <div
                      id={`nav-group-${entry.id}`}
                      role="group"
                      aria-label={entry.label}
                      className="mt-1 ml-3 flex flex-col gap-1 border-l border-sidebar-border pl-2"
                    >
                      {entry.items.map((item) => {
                        const active = path === item.to || path.startsWith(item.to + "/");
                        const ItemIcon = item.icon;
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                              active
                                ? "text-primary-foreground shadow-sm"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                            )}
                            style={active ? { background: "var(--gradient-primary)" } : undefined}
                            aria-current={active ? "page" : undefined}
                          >
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const item = entry;
            const active = path === item.to || path.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={async (event) => {
                  if (item.to !== "/dashboard") return;
                  event.preventDefault();
                  const reloading = await checkForNewAppVersion("dashboard_nav");
                  if (!reloading) navigate({ to: item.to as never });
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
                style={active ? { background: "var(--gradient-primary)" } : undefined}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
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
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            data-testid="account-menu-live-region"
          >
            {accountAnnouncement}
          </span>
          <DropdownMenu
            open={accountOpen}
            onOpenChange={(o) => {
              setAccountOpen(o);
              const who = currentUser?.name || currentUser?.email || "your account";
              setAccountAnnouncement(
                o ? `Account menu opened for ${who}.` : "Account menu closed.",
              );
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-busy={!currentUser?.name && !currentUser?.email ? true : undefined}
                aria-haspopup="menu"
                aria-label={
                  currentUser?.name
                    ? `Open account menu for ${currentUser.name}`
                    : currentUser?.email
                      ? "Open account menu"
                      : "Loading account, please wait"
                }
                className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <UserAvatar
                  name={currentUser?.name}
                  email={currentUser?.email}
                  avatarUrl={currentUser?.avatarUrl}
                  size="md"
                />
                {currentUser?.name || currentUser?.email ? (
                  <span className="hidden text-sm font-medium sm:inline">
                    {getFirstName(currentUser?.name, currentUser?.email)}
                  </span>
                ) : (
                  <span
                    role="status"
                    aria-busy="true"
                    aria-live="polite"
                    aria-label="Loading account"
                    className="hidden sm:inline-flex items-center"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-16 rounded bg-muted animate-pulse motion-reduce:animate-none"
                    />
                    <span className="sr-only">Loading your account…</span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="font-medium">{currentUser?.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{currentUser?.role}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
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
