import { describe, expect, it } from "vitest";
import type { ModelInfoResponse } from "@/shared/types";
import {
  formatParameterCount,
  metadataAsJson,
  metadataEntries,
  modelBadges,
  modelFacts,
  modelStem,
} from "./modelInfo";

function info(overrides: Partial<ModelInfoResponse> = {}): ModelInfoResponse {
  return {
    path: "adapter.safetensors",
    metadata: {},
    tensor_count: 480,
    parameter_count: 18_874_368,
    precision: "BF16",
    trigger_words: [],
    ...overrides,
  };
}

describe("formatParameterCount", () => {
  it("quotes sizes the way model cards do", () => {
    expect(formatParameterCount(950)).toBe("950");
    expect(formatParameterCount(16_384)).toBe("16.4K");
    expect(formatParameterCount(18_874_368)).toBe("18.9M");
    expect(formatParameterCount(340_000_000)).toBe("340M");
    expect(formatParameterCount(12_000_000_000)).toBe("12B");
  });
});

describe("modelBadges", () => {
  it("names the kind, the architecture and the main precision", () => {
    expect(modelBadges(info({ rank: 16, architecture: "qwen_image" }))).toEqual([
      "LoRA",
      "qwen_image",
      "BF16",
    ]);
    expect(modelBadges(info({ precision: "INT8 ConvRot" }))).toEqual(["Weights", "INT8 ConvRot"]);
    expect(modelBadges(info({ precision: null }))).toEqual(["Weights"]);
  });
});

describe("modelFacts", () => {
  it("leaves out what the header does not record", () => {
    expect(modelFacts(info()).map((fact) => fact.label)).toEqual(["Parameters", "Tensors"]);
  });

  it("orders training facts before the weights", () => {
    const facts = modelFacts(info({ step: 1500, epoch: 3, rank: 16, software: "ai-toolkit" }));

    expect(facts.map((fact) => [fact.label, fact.value])).toEqual([
      ["Step", "1,500"],
      ["Epoch", "3"],
      ["Rank", "16"],
      ["Parameters", "18.9M"],
      ["Tensors", "480"],
      ["Trained with", "ai-toolkit"],
    ]);
    expect(facts[3].title).toBe("18,874,368 parameters");
  });
});

describe("metadataEntries", () => {
  it("sorts keys and collapses JSON values to a summary", () => {
    const entries = metadataEntries({
      training_info: '{"step": 1500, "epoch": 3}',
      config: '{"a": 1, "b": 2, "c": 3, "d": 4}',
      format: "pt",
      broken: "{not json",
      list: "[1, 2]",
    });

    expect(entries.map((entry) => [entry.key, entry.summary])).toEqual([
      ["broken", "{not json"],
      ["config", "{ a, b, c, +1 }"],
      ["format", "pt"],
      ["list", "[ 2 items ]"],
      ["training_info", "{ step, epoch }"],
    ]);
    expect(entries.find((entry) => entry.key === "format")?.json).toBeNull();
    expect(entries.find((entry) => entry.key === "training_info")?.json).toContain('"step": 1500');
  });

  it("copies as one JSON document with embedded JSON unpacked", () => {
    const copied = metadataAsJson({ format: "pt", training_info: '{"step": 1500}' });

    expect(JSON.parse(copied)).toEqual({ format: "pt", training_info: { step: 1500 } });
  });
});

describe("modelStem", () => {
  it("drops the extension the header falls back to", () => {
    expect(modelStem("subject_lora_000001500.safetensors")).toBe("subject_lora_000001500");
  });
});
