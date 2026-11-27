import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { touchRecentFolder } from "@/features/folder/lib/folderPreferences";
import { job } from "@/test/fixtures";
import { installMockBackend } from "@/test/mockBackend";
import { renderWithProviders } from "@/test/renderWithProviders";
import { SettingsDialog } from "./SettingsDialog";

let backend: ReturnType<typeof installMockBackend>;

beforeEach(() => {
  backend = installMockBackend();
});

async function openSection(section: string) {
  const user = userEvent.setup();
  renderWithProviders(<SettingsDialog onClose={vi.fn<() => void>()} />);
  await screen.findByRole("textbox", { name: "Server URL", hidden: true });
  await user.click(screen.getByRole("tab", { name: new RegExp(`^${section}`) }));
  return user;
}

const groupNamed = (name: string) => screen.getByRole("region", { name });

describe("SettingsDialog sections", () => {
  it("tests the typed address and key, then offers the reported models", async () => {
    const user = await openSection("Vision model");
    const connection = groupNamed("Connection");

    await user.type(within(connection).getByLabelText("API key"), "sk-typed");
    await user.click(within(connection).getByRole("button", { name: "Test connection" }));

    expect(await within(connection).findByRole("status")).toHaveTextContent(
      "Reachable, 2 models: gemma4, qwen38",
    );
    const [[, init]] = backend.requestsTo("/api/settings/probe", "POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      service: "vision",
      base_url: "http://127.0.0.1:8888/v1",
      api_key: "sk-typed",
    });
    const model = within(connection).getByRole("combobox", { name: "Model" });
    const options = [...(model as HTMLInputElement).list!.options].map((option) => option.value);
    expect(options).toEqual(["gemma4", "qwen38"]);
  });

  it("drops a test result once its address changes", async () => {
    const user = await openSection("Integrations");
    const comfy = groupNamed("ComfyUI");

    await user.click(within(comfy).getByRole("button", { name: "Test connection" }));
    expect(await within(comfy).findByRole("status")).toHaveTextContent("Reachable");

    await user.type(within(comfy).getByRole("textbox", { name: "ComfyUI URL" }), "0");

    expect(within(comfy).queryByRole("status")).not.toBeInTheDocument();
  });

  it("never shows a saved key, and says whether one is set", async () => {
    await backend.fetchMock.getMockImplementation()!("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ vision_api_key: "sk-saved" }),
    });
    await openSection("Vision model");

    const key = screen.getByLabelText("API key");
    expect(key).toHaveValue("");
    expect(key).toHaveAttribute("type", "password");
    expect(key).toHaveAttribute("placeholder", "Saved key is hidden");
    expect(key).toHaveAccessibleDescription("Saved Overrides the default");
  });

  it("puts the two sampling modes side by side, as numbers within their range", async () => {
    const user = await openSection("Vision model");
    await user.click(screen.getByRole("tab", { name: "Sampling" }));

    const reasoning = within(groupNamed("Reasoning")).getByRole("spinbutton", {
      name: "Temperature",
    });
    expect(reasoning).toHaveValue(1);
    expect(reasoning).toHaveAttribute("min", "0");
    expect(reasoning).toHaveAttribute("max", "2");
    expect(reasoning).toHaveAttribute("step", "0.05");
    expect(
      within(groupNamed("Instruct")).getByRole("spinbutton", { name: "Temperature" }),
    ).toHaveValue(0.7);
  });

  it("clears each kind of remembered data and says so", async () => {
    touchRecentFolder("C:\\Photos\\Lakes");
    const user = await openSection("Data");
    const remembered = groupNamed("Remembered data");
    const row = (label: string) => within(remembered).getByText(label).closest("li")!;

    await within(remembered).findByText("3 folders");
    expect(within(row("Recent folders")).getByText("1 folder")).toBeInTheDocument();

    await user.click(within(row("Recent folders")).getByRole("button", { name: "Clear" }));
    await user.click(within(row("Job options per folder")).getByRole("button", { name: "Clear" }));

    expect(await screen.findByText("Job options per folder cleared.")).toBeInTheDocument();
    expect(within(row("Recent folders")).getByText("0 folders")).toBeInTheDocument();
    expect(within(row("Job options per folder")).getByText("0 folders")).toBeInTheDocument();
    expect(within(row("Display and sort per folder")).getByText("2 folders")).toBeInTheDocument();
    expect(localStorage.getItem("gallery-recent-folders")).toBe("[]");
  });

  it("deletes every job record after a confirmation that warns about running jobs", async () => {
    backend = installMockBackend({
      jobs: [job({ id: "done", status: "completed" }), job({ id: "busy", status: "running" })],
    });
    const user = await openSection("Data");
    const deleteAll = within(groupNamed("History")).getByRole("button", {
      name: "Delete all jobs",
    });

    await waitFor(() => expect(deleteAll).toBeEnabled());
    await user.click(deleteAll);
    const confirm = screen.getByRole("alertdialog", { name: "Delete all job records?" });
    expect(confirm).toHaveTextContent("removes all 2 job records from history");
    expect(confirm).toHaveTextContent("Running jobs will be cancelled first.");
    await user.click(within(confirm).getByRole("button", { name: "Delete all" }));

    expect(await screen.findByText("Deleted 2 job records.")).toBeInTheDocument();
    expect(confirm).not.toBeInTheDocument();
    expect(backend.requestsTo("/api/jobs", "DELETE")).toHaveLength(1);
    // The count is re-read, so there is nothing left to delete.
    await waitFor(() => expect(deleteAll).toBeDisabled());
  });

  it("shows the machine's live usage and details on About's Performance tab", async () => {
    const user = await openSection("About");
    expect(backend.requestsTo("/api/system/performance")).toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: "Performance" }));

    const tiles = await screen.findByRole("region", { name: "Live usage" });
    expect(within(tiles).getByRole("group", { name: "CPU" })).toHaveTextContent("20%");
    expect(within(tiles).getByRole("group", { name: "VRAM" })).toHaveTextContent("4 / 10 GB");
    expect(within(groupNamed("Processor")).getByText("Base clock")).toBeInTheDocument();
    expect(within(groupNamed("Graphics")).getByText("580.12 · PCIe 4.0 ×16")).toBeInTheDocument();
    expect(within(groupNamed("Storage")).getByRole("meter", { name: "C: used" })).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
  });

  it("describes the installation and copies diagnostics without the key", async () => {
    const user = await openSection("About");
    const installation = groupNamed("Installation");

    expect(await within(installation).findByText("DataForge 0.1.0")).toBeInTheDocument();
    expect(
      within(installation).getByText("C:\\ffmpeg\\bin\\ffmpeg.exe (from PATH)"),
    ).toBeInTheDocument();

    await user.click(within(installation).getByRole("button", { name: "Copy diagnostics" }));

    await waitFor(() =>
      expect(within(installation).getByRole("button", { name: "Copied!" })).toHaveClass(
        "button--copied",
      ),
    );
    const text = await navigator.clipboard.readText();
    expect(text).toContain("DataForge 0.1.0");
    expect(text).toContain("CPU: Intel Core i7-12700K 12-Core Processor (16 threads)");
    expect(text).toContain("RAM: 32.0 GB (8.0 GB in use)");
    expect(text).toContain("key not set");
    expect(text).toContain("Tagging models: C:\\DataForge\\backend\\data\\models");

    const locations = groupNamed("Locations");
    expect(
      within(locations).getByText("C:\\DataForge\\backend\\data\\tag_vocabulary.txt"),
    ).toBeInTheDocument();
    expect(text).not.toContain("sk-");
  });
});
