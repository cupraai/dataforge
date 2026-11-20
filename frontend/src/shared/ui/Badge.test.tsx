import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { iconLoader2 } from "@/shared/icons";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("reads as its text and keeps a caller's attributes", () => {
    render(
      <Badge id="state" title="From the environment" tone="accent" uppercase={false}>
        .env
      </Badge>,
    );

    const badge = screen.getByText(".env");
    expect(badge).toHaveAttribute("id", "state");
    expect(badge).toHaveAttribute("title", "From the environment");
    expect(badge).toHaveClass("badge", "badge--accent", "badge--plain");
  });

  it("puts a decorative icon before the label, spinning while work runs", () => {
    const { container } = render(
      <Badge icon={iconLoader2} spin>
        Running
      </Badge>,
    );

    expect(screen.getByText("Running")).toHaveClass("badge__label");
    const icon = container.querySelector(".badge__icon");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveClass("app-icon--spin");
  });
});
