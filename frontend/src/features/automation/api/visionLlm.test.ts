import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchVisionLlmInfo, visionModelLabel } from "./visionLlm";

const requestJsonMock = vi.fn<(...args: unknown[]) => unknown>();

vi.mock("@/shared/api/http", () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
}));

describe("fetchVisionLlmInfo", () => {
  afterEach(() => {
    requestJsonMock.mockReset();
  });

  it("reads the configured and served model with its levels", async () => {
    requestJsonMock.mockResolvedValue({
      model: "qwen38",
      base_url: "http://127.0.0.1:8888/v1",
      served_model: "Qwen3.8-27B",
      reasoning_efforts: ["low", "medium", "xhigh"],
    });

    await expect(fetchVisionLlmInfo()).resolves.toEqual({
      model: "qwen38",
      baseUrl: "http://127.0.0.1:8888/v1",
      servedModel: "Qwen3.8-27B",
      reasoningEfforts: ["low", "medium", "xhigh"],
      detail: null,
      reachable: true,
    });
    expect(requestJsonMock).toHaveBeenCalledWith("/api/system/vision-llm");
  });

  it("keeps a model without levels apart from one whose levels are unknown", async () => {
    requestJsonMock.mockResolvedValueOnce({ model: "gemma", reasoning_efforts: [] });
    requestJsonMock.mockResolvedValueOnce({
      model: "qwen38",
      detail: "The server did not answer",
      reachable: false,
    });

    await expect(fetchVisionLlmInfo()).resolves.toMatchObject({ reasoningEfforts: [] });
    await expect(fetchVisionLlmInfo()).resolves.toMatchObject({
      model: "qwen38",
      servedModel: null,
      reasoningEfforts: null,
      detail: "The server did not answer",
      reachable: false,
    });
  });
});

describe("visionModelLabel", () => {
  it("names the served model, else the configured id", () => {
    const info = {
      model: "qwen38",
      baseUrl: "",
      servedModel: null,
      reasoningEfforts: null,
      detail: null,
      reachable: true,
    };

    expect(visionModelLabel(info)).toBe("qwen38");
    expect(visionModelLabel({ ...info, servedModel: "unsloth/Qwen3.8-27B-GGUF:Q4_K_XL" })).toBe(
      "unsloth/Qwen3.8-27B-GGUF:Q4_K_XL",
    );
  });

  it("shortens a GGUF file path to the file name", () => {
    const info = {
      model: "qwen38",
      baseUrl: "",
      reasoningEfforts: null,
      detail: null,
      reachable: true,
    };

    expect(visionModelLabel({ ...info, servedModel: "C:\\models\\Qwen3.8-27B-Q4_K_XL.gguf" })).toBe(
      "Qwen3.8-27B-Q4_K_XL",
    );
    expect(visionModelLabel({ ...info, servedModel: "/models/gemma-4-31B.GGUF" })).toBe(
      "gemma-4-31B",
    );
  });
});
