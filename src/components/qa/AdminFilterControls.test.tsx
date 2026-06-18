import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminDefectFilterControls, AdminAuditFilterControls } from "./AdminFilterControls";

const defectProps = {
  agents: ["Alice", "Bob"],
  reporters: ["Carol"],
  years: ["2026"],
  values: { agent: "all", reporter: "all", sev: "all", year: "all", hasComments: "any" as const, hasAttach: "any" as const, retest: "any" as const },
  onChange: { agent: vi.fn(), reporter: vi.fn(), sev: vi.fn(), year: vi.fn(), hasComments: vi.fn(), hasAttach: vi.fn(), retest: vi.fn() },
};

const auditProps = {
  actors: ["Alice", "Bob"],
  values: { actor: "all", recordKind: "any" as const, actionKind: "any" as const },
  onChange: { actor: vi.fn(), recordKind: vi.fn(), actionKind: vi.fn() },
};

const ADMIN_DEFECT_LABELS = ["Assigned", "Reported by", "Severity", "Tax year", "Comments", "Attachments", "Retest"];
const ADMIN_AUDIT_LABELS = ["Actor", "Record type", "Action"];

describe("AdminDefectFilterControls visibility", () => {
  it("renders all cross-agent filters for admins", () => {
    render(<AdminDefectFilterControls isAdmin={true} {...defectProps} />);
    expect(screen.getByTestId("admin-defect-filters")).toBeInTheDocument();
    for (const label of ADMIN_DEFECT_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
      expect(screen.getByLabelText(label)).not.toBeDisabled();
    }
  });

  it("hides every cross-agent filter for QA agents", () => {
    const { container } = render(<AdminDefectFilterControls isAdmin={false} {...defectProps} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("admin-defect-filters")).toBeNull();
    for (const label of ADMIN_DEFECT_LABELS) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("agent view still allows a safe single-agent (own) view — no cross-agent controls leak", () => {
    // The agent never receives admin filter UI even when defect data is present.
    render(<AdminDefectFilterControls isAdmin={false} {...defectProps} />);
    expect(screen.queryByLabelText("Assigned")).toBeNull();
    expect(screen.queryByLabelText("Reported by")).toBeNull();
  });
});

describe("AdminAuditFilterControls visibility", () => {
  it("renders Actor / Record type / Action filters for admins", () => {
    render(<AdminAuditFilterControls isAdmin={true} {...auditProps} />);
    expect(screen.getByTestId("admin-audit-filters")).toBeInTheDocument();
    for (const label of ADMIN_AUDIT_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
      expect(screen.getByLabelText(label)).not.toBeDisabled();
    }
  });

  it("hides Actor / Record type / Action filters for QA agents", () => {
    const { container } = render(<AdminAuditFilterControls isAdmin={false} {...auditProps} />);
    expect(container).toBeEmptyDOMElement();
    for (const label of ADMIN_AUDIT_LABELS) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("null role is treated the same as agent (no admin UI)", () => {
    const { container } = render(
      <AdminAuditFilterControls isAdmin={null as unknown as boolean} {...auditProps} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});