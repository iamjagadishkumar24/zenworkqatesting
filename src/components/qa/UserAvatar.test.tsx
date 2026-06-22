import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const createSignedUrl = vi.fn(async (path: string) => ({
  data: { signedUrl: `https://signed/${path}` },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

import { UserAvatar, gradientFor } from "./UserAvatar";

describe("UserAvatar", () => {
  it("falls back to initials when no avatar URL", () => {
    render(<UserAvatar name="Jane Doe" email="j@x.com" />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("uses email prefix when name is missing", () => {
    render(<UserAvatar email="ab@x.com" />);
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("passes through absolute https URLs without signing", async () => {
    render(<UserAvatar name="X" avatarUrl="https://cdn.example.com/a.png" />);
    const img = await waitFor(() => screen.getByRole("img"));
    expect(img).toHaveAttribute("src", "https://cdn.example.com/a.png");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("resolves storage paths via signed URL", async () => {
    render(<UserAvatar name="X" avatarUrl="users/1.png" />);
    const img = await waitFor(() => screen.getByRole("img"));
    expect(img).toHaveAttribute("src", "https://signed/users/1.png");
  });

  it("gradientFor is deterministic for the same seed", () => {
    expect(gradientFor("a@x.com")).toBe(gradientFor("a@x.com"));
    expect(gradientFor("a")).toMatch(/^linear-gradient/);
  });
});