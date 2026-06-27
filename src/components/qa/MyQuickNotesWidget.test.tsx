import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  listNotes: vi.fn(),
}));

type LinkProps = { children?: ReactNode; href?: string; to?: string } & Record<string, unknown>;
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: LinkProps) => <a {...(rest as Record<string, unknown>)}>{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <F,>(fn: F): F => fn,
}));
vi.mock("@/lib/qa/notes.functions", () => ({
  listNotes: (...a: unknown[]) => h.listNotes(...a),
}));

import { MyQuickNotesWidget } from "./MyQuickNotesWidget";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("MyQuickNotesWidget", () => {
  it("shows empty hint when no notes exist", async () => {
    h.listNotes.mockResolvedValue([]);
    wrap(<MyQuickNotesWidget />);
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();
  });

  it("renders Active/Archived counts and at most 3 recent notes", async () => {
    h.listNotes.mockImplementation(({ data }: { data: { archived?: boolean } }) =>
      Promise.resolve(
        data.archived
          ? [{ id: "a1" }, { id: "a2" }]
          : [1, 2, 3, 4, 5].map((i) => ({
              id: "n" + i,
              title: "Note " + i,
              content_text: "",
              color: "yellow",
              updated_at: new Date(Date.now() - i * 60_000).toISOString(),
            })),
      ),
    );
    wrap(<MyQuickNotesWidget />);
    await waitFor(() => expect(screen.getByText("Note 1")).toBeInTheDocument());
    expect(screen.getByText("Note 3")).toBeInTheDocument();
    expect(screen.queryByText("Note 4")).not.toBeInTheDocument();
    // Total = 5 active + 2 archived
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("falls back to Untitled when title and content are empty", async () => {
    h.listNotes.mockImplementation(({ data }: { data: { archived?: boolean } }) =>
      Promise.resolve(
        data.archived
          ? []
          : [
              {
                id: "x",
                title: "",
                content_text: "",
                color: "blue",
                updated_at: new Date().toISOString(),
              },
            ],
      ),
    );
    wrap(<MyQuickNotesWidget />);
    expect(await screen.findByText("Untitled")).toBeInTheDocument();
  });
});
