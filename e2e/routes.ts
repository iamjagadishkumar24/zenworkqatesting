/**
 * Definitive list of authenticated routes that Playwright crawls after login
 * to verify no realtime status text or toast surfaces in the UI.
 *
 * `roles` controls which logged-in role(s) the route is exercised under.
 * Admin-only routes are skipped when the active context is an agent.
 */
export type PostLoginRoute = {
  path: string;
  name: string;
  roles: Array<"admin" | "agent">;
};

export const POST_LOGIN_ROUTES: PostLoginRoute[] = [
  { path: "/dashboard", name: "Dashboard", roles: ["admin", "agent"] },
  { path: "/select-environment", name: "Select environment", roles: ["admin", "agent"] },
  { path: "/defects", name: "Defects list", roles: ["admin", "agent"] },
  { path: "/my-errors", name: "My errors", roles: ["admin", "agent"] },
  { path: "/my-reported-errors", name: "My reported errors", roles: ["admin", "agent"] },
  { path: "/notifications", name: "Notifications", roles: ["admin", "agent"] },
  { path: "/notes", name: "Notes", roles: ["admin", "agent"] },
  { path: "/reports", name: "Reports", roles: ["admin", "agent"] },
  { path: "/retest", name: "Retest", roles: ["admin", "agent"] },
  { path: "/forms", name: "Forms", roles: ["admin", "agent"] },
  { path: "/990-forms", name: "990 forms", roles: ["admin", "agent"] },
  { path: "/2290-forms", name: "2290 forms", roles: ["admin", "agent"] },
  { path: "/functionality-testing", name: "Functionality testing", roles: ["admin", "agent"] },
  { path: "/integrations", name: "Integrations", roles: ["admin", "agent"] },
  { path: "/excel-import-testing", name: "Excel import testing", roles: ["admin", "agent"] },
  { path: "/chatbot-testing", name: "Chatbot testing", roles: ["admin", "agent"] },
  { path: "/online-1099", name: "Online 1099", roles: ["admin", "agent"] },
  { path: "/tax1099-features", name: "Tax1099 features", roles: ["admin", "agent"] },
  { path: "/zenwork-payments", name: "Zenwork payments", roles: ["admin", "agent"] },
  { path: "/settings", name: "Settings", roles: ["admin", "agent"] },
  // Admin-only routes
  { path: "/agents", name: "Agents (admin)", roles: ["admin"] },
  { path: "/audit-log", name: "Audit log (admin)", roles: ["admin"] },
  { path: "/auth-events", name: "Auth events (admin)", roles: ["admin"] },
  { path: "/realtime-debug", name: "Realtime debug (admin)", roles: ["admin"] },
];

/**
 * Strings that, if rendered visibly, would prove a realtime indicator
 * leaked into the UI. Matched case-insensitively against on-screen text.
 */
export const FORBIDDEN_REALTIME_PHRASES = [
  /realtime (connected|reconnected|disconnected|reconnecting)/i,
  /\blive updates? (active|unavailable|paused|on|off)\b/i,
  /\bchannel error\b/i,
  /\blive\s*(•|·)?\s*(connected|reconnecting)\b/i,
];
