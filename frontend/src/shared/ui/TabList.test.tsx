import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it } from "vitest";
import { useTabList } from "@/shared/hooks/useTabList";
import { TabList, type TabItem } from "./TabList";

type Page = "general" | "advanced";

const PAGES: readonly Page[] = ["general", "advanced"];

function Harness({ items }: { items: Record<Page, TabItem> }) {
  const [active, setActive] = useState<Page>("general");
  const tabs = useTabList(PAGES, active, setActive);
  return (
    <>
      <TabList tabs={tabs} item={(id) => items[id]} label="Settings pages" />
      {PAGES.map((id) => (
        <div key={id} {...tabs.panelProps(id)}>
          {items[id].label} page
        </div>
      ))}
    </>
  );
}

const ITEMS: Record<Page, TabItem> = {
  general: { label: "General" },
  advanced: { label: "Advanced" },
};

describe("TabList", () => {
  it("selects with arrow keys and shows the selected tab's panel", async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Harness items={ITEMS} />
      </StrictMode>,
    );

    expect(screen.getByRole("tablist", { name: "Settings pages" })).toBeInTheDocument();
    screen.getByRole("tab", { name: "General" }).focus();
    await user.keyboard("{ArrowRight}");

    const advanced = screen.getByRole("tab", { name: "Advanced" });
    expect(advanced).toHaveFocus();
    expect(advanced).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Advanced" })).toHaveTextContent("Advanced page");
  });

  it("reads a marked tab's state out with its name", () => {
    render(<Harness items={{ ...ITEMS, advanced: { ...ITEMS.advanced, mark: "unsaved" } }} />);

    expect(screen.getByRole("tab", { name: "Advanced, unsaved" })).toBeInTheDocument();
  });
});
