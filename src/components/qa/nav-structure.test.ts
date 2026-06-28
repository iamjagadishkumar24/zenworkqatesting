import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { nav } from "./AppShell";

type Item = { to: string; label: string; icon: unknown; adminOnly?: boolean };
type Group = { id: string; label: string; icon: unknown; items: Item[]; adminOnly?: boolean };
const isGroup = (e: unknown): e is Group =>
  typeof e === "object" && e !== null && "items" in (e as Record<string, unknown>);

function flatten(): Item[] {
  const out: Item[] = [];
  for (const e of nav as Array<Item | Group>) {
    if (isGroup(e)) out.push(...e.items);
    else out.push(e);
  }
  return out;
}

/** Map a navigation `to` URL to the expected route file path. */
function routeFileFor(to: string): string {
  const clean = to.replace(/^\//, "");
  const segs = clean.split("/");
  // Admin-gated paths live under the _admin pathless layout.
  const adminPrefixes = new Set([
    "rights-management",
    "agents",
    "permission-audit",
    "audit-log",
    "auth-events",
    "reports",
    "realtime-debug",
  ]);
  const isAdmin = adminPrefixes.has(segs[0]);
  const prefix = isAdmin ? "_app._admin." : "_app.";
  const tail = segs.join(".");
  const base = `src/routes/${prefix}${tail}`;
  // Either a leaf file or an index file.
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.index.tsx`,
    `${base}.index.ts`,
  ];
  return candidates.find((p) => existsSync(resolve(process.cwd(), p))) ?? candidates[0];
}

describe("Admin sidebar navigation structure", () => {
  const items = flatten();

  it("matches snapshot for labels, routes and ordering", () => {
    const shape = (nav as Array<Item | Group>).map((e) =>
      isGroup(e)
        ? {
            group: e.label,
            id: e.id,
            items: e.items.map((i) => ({
              to: i.to,
              label: i.label,
              adminOnly: !!i.adminOnly,
            })),
          }
        : { to: e.to, label: e.label, adminOnly: !!e.adminOnly },
    );
    expect(shape).toMatchSnapshot();
  });

  it("has no duplicate top-level labels", () => {
    const labels = (nav as Array<Item | Group>).map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has no duplicate routes across the entire sidebar", () => {
    const tos = items.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it("has no duplicate labels within any single group", () => {
    for (const e of nav as Array<Item | Group>) {
      if (!isGroup(e)) continue;
      const labels = e.items.map((i) => i.label);
      expect(new Set(labels).size, `Group ${e.label} has duplicate labels`).toBe(labels.length);
    }
  });

  it("assigns a non-empty icon to every entry", () => {
    for (const e of nav as Array<Item | Group>) {
      expect(e.icon).toBeTruthy();
      if (isGroup(e)) for (const i of e.items) expect(i.icon).toBeTruthy();
    }
  });

  it("does not reuse the same icon component within a group", () => {
    for (const e of nav as Array<Item | Group>) {
      if (!isGroup(e)) continue;
      const icons = e.items.map((i) => i.icon);
      expect(new Set(icons).size, `Group ${e.label} has duplicate icons`).toBe(icons.length);
    }
  });

  it("routes every nav entry to an existing route file", () => {
    for (const i of items) {
      const file = routeFileFor(i.to);
      expect(existsSync(resolve(process.cwd(), file)), `${i.to} -> ${file}`).toBe(true);
    }
  });

  it("places Reported Errors only under the Reports group", () => {
    const group = (nav as Array<Item | Group>).find(
      (e) => isGroup(e) && e.id === "reports",
    ) as Group;
    expect(group.items.some((i) => i.to === "/my-reported-errors")).toBe(true);
    const top = (nav as Array<Item | Group>).filter((e) => !isGroup(e)) as Item[];
    expect(top.some((i) => i.to === "/my-reported-errors")).toBe(false);
  });

  it("keeps Settings group restricted to Profile, Permission Audit, Audit Logs, Auth Events", () => {
    const group = (nav as Array<Item | Group>).find(
      (e) => isGroup(e) && e.id === "settings",
    ) as Group;
    expect(group.items.map((i) => i.to)).toEqual([
      "/profile",
      "/permission-audit",
      "/audit-log",
      "/auth-events",
    ]);
  });
});
