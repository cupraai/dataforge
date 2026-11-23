import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { SearchSelect } from "./SearchSelect";

const OPTIONS = [
  { value: "a/one.safetensors", label: "one", detail: "a" },
  { value: "b/two.safetensors", label: "two", detail: "b" },
  { value: "b/three.safetensors", label: "three", detail: "b" },
];

function setup() {
  const onPick = vi.fn<(value: string) => void>();
  render(
    <SearchSelect
      label="LoRAs"
      options={OPTIONS}
      selected={["b/two.safetensors"]}
      onPick={onPick}
      triggerLabel="Choose"
      emptyText="No LoRA by that name."
    />,
  );
  return { onPick, user: userEvent.setup() };
}

describe("SearchSelect", () => {
  it("searches labels and details, and gives the focus back after picking", async () => {
    const { onPick, user } = setup();
    const trigger = screen.getByRole("button", { name: "Choose" });

    await user.click(trigger);
    expect(screen.getByRole("searchbox", { name: "Search loras" })).toHaveFocus();
    expect(screen.getByRole("option", { name: /^two/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("b{ArrowDown}{ArrowDown}{Enter}");

    expect(onPick).toHaveBeenCalledExactlyOnceWith("b/three.safetensors");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("says when nothing matches, and starts over on the next opening", async () => {
    const { onPick, user } = setup();
    const trigger = screen.getByRole("button", { name: "Choose" });

    await user.click(trigger);
    await user.keyboard("zzz");
    expect(screen.getByText("No LoRA by that name.")).toBeInTheDocument();
    await user.keyboard("{Enter}{Escape}");
    expect(onPick).not.toHaveBeenCalled();

    await user.click(trigger);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});
