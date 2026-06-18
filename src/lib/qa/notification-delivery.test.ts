import { describe, it, expect, vi } from "vitest";
import { shouldNotify } from "./notificationRouting";

/**
 * Notification delivery verification.
 *
 * Mirrors the server-side fan-out: for a given actor + recipient list, only
 * recipients other than the actor get notified. Tests are run against each
 * sink (in-app store, email transport, webhook POST) using the same gating
 * helper, so all three channels behave consistently.
 */

type Event = {
  actorId: string;
  recipients: string[];
  title: string;
  body: string;
};

function fanOut(ev: Event, sink: (recipientId: string, ev: Event) => void) {
  for (const r of ev.recipients) {
    if (shouldNotify(ev.actorId, r)) sink(r, ev);
  }
}

describe("notification delivery", () => {
  const ev: Event = {
    actorId: "u-actor",
    recipients: ["u-actor", "u-alice", "u-bob"],
    title: "Defect ZEN-2026-01 updated",
    body: "Status changed to Fixed",
  };

  it("in-app sink delivers to others and skips the actor", () => {
    const inbox: Record<string, Event[]> = {};
    fanOut(ev, (rid, e) => {
      (inbox[rid] ||= []).push(e);
    });
    expect(inbox["u-actor"]).toBeUndefined();
    expect(inbox["u-alice"]).toHaveLength(1);
    expect(inbox["u-bob"]).toHaveLength(1);
    expect(inbox["u-alice"][0].title).toContain("ZEN-2026-01");
  });

  it("email sink is invoked once per non-actor recipient", () => {
    const sendEmail = vi.fn();
    fanOut(ev, (rid, e) => sendEmail({ to: rid, subject: e.title }));
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const tos = sendEmail.mock.calls.map((c) => c[0].to);
    expect(tos).toEqual(expect.arrayContaining(["u-alice", "u-bob"]));
    expect(tos).not.toContain("u-actor");
  });

  it("webhook sink POSTs once per non-actor recipient", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: { method: string; body: string }) =>
        new Response("ok", { status: 200 }),
    );
    fanOut(ev, (rid, e) => {
      void fetchMock("https://hook.example/notify", {
        method: "POST",
        body: JSON.stringify({ to: rid, title: e.title, body: e.body }),
      });
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies.find((b) => b.to === "u-actor")).toBeUndefined();
    expect(bodies.find((b) => b.to === "u-alice")).toBeTruthy();
    expect(bodies.find((b) => b.to === "u-bob")).toBeTruthy();
  });

  it("no recipients → no sink calls (no duplicate / empty fan-out)", () => {
    const sink = vi.fn();
    fanOut({ ...ev, recipients: [] }, sink);
    expect(sink).not.toHaveBeenCalled();
  });

  it("actor-only audience → silent (prevents self-notifications)", () => {
    const sink = vi.fn();
    fanOut({ ...ev, recipients: ["u-actor", "u-actor"] }, sink);
    expect(sink).not.toHaveBeenCalled();
  });

  it("missing actor id never produces a notification", () => {
    const sink = vi.fn();
    fanOut({ ...ev, actorId: "" }, sink);
    expect(sink).not.toHaveBeenCalled();
  });
});