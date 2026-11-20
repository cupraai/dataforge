import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { formatBadgeCount } from "@/shared/lib/badgeCount";
import { CountBadge } from "./CountBadge";

describe("formatBadgeCount", () => {
  it("shows counts up to 99 as they are and caps anything above", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(1234)).toBe("99+");
  });
});

describe("CountBadge", () => {
  it("renders nothing without a count", () => {
    const { container } = render(<CountBadge count={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("caps the visible count and stays out of the accessibility tree", () => {
    const { container } = render(<CountBadge count={150} tone="danger" />);
    const badge = container.querySelector(".count-badge");

    expect(badge).toHaveTextContent("99+");
    expect(badge).toHaveClass("count-badge--danger");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });
});
