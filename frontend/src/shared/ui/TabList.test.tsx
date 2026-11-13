import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import { describe, expect, it } from "vitest";
import { useTabList } from "@/shared/hooks/useTabList";
import { TabList, type TabItem } from "./TabList";

type Page = "general" | "advanced";

function Harness({ items }: { items: TabItem<Page>[] }) {
  const [active, setActive] = useState<Page>("general");
  const tabs = useTabList(
    items.map((item) => item.id),
    active,
    setActive,
  );
  return (
    <>
      <TabList tabs={tabs} items={items} label="Settings pages" />
      {items.map((item) => (
        <div key={item.id} {...tabs.panelProps(item.id)}>
          {item.label} page
        </div>
      ))}
    </>
  );
}

const ITEMS: TabItem<Page>[] = [
  { id: "general", label: "General" },
  { id: "advanced", label: "Advanced" },
];

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
    render(<Harness items={[ITEMS[0], { ...ITEMS[1], mark: "unsaved" }]} />);

    expect(screen.getByRole("tab", { name: "Advanced, unsaved" })).toBeInTheDocument();
  });
});
