import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { job } from "@/test/fixtures";
import { CancelJobDialog } from "./CancelJobDialog";

function renderDialog(status: "queued" | "running", queuedCount = 0) {
  render(
    <CancelJobDialog
      job={job({ status, folder_name: "Photos" })}
      queuedCount={queuedCount}
      onConfirm={vi.fn<() => void>()}
      onCancel={vi.fn<() => void>()}
    />,
  );
}

describe("CancelJobDialog", () => {
  it("says the queue behind a running job is cancelled with it", () => {
    renderDialog("running", 2);

    expect(screen.getByText(/The 2 jobs queued after it are cancelled too\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep running" })).toBeInTheDocument();
  });

  it("says a queued job leaves the rest of the queue to run", () => {
    renderDialog("queued");

    expect(
      screen.getByText(/has not started\. Jobs queued after it still run\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep queued" })).toBeInTheDocument();
  });
});
