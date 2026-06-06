export type ChecklistStatus = "pass" | "partial" | "missing";

export interface ChecklistStatusPresentation {
  label: string;
  symbol: string;
  ariaLabel: string;
}

export function getChecklistStatusPresentation(
  status: ChecklistStatus,
): ChecklistStatusPresentation {
  switch (status) {
    case "pass":
      return {
        ariaLabel: "Status: pass",
        label: "Pass",
        symbol: "[x]",
      };
    case "partial":
      return {
        ariaLabel: "Status: partial",
        label: "Partial",
        symbol: "[-]",
      };
    case "missing":
      return {
        ariaLabel: "Status: missing",
        label: "Missing",
        symbol: "[!]",
      };
  }
}
