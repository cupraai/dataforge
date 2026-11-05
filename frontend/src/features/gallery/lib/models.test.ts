import { describe, expect, it } from "vitest";
import { HOME_PATH, mediaItem } from "@/test/fixtures";
import { processModels, splitModels, type ModelQuery } from "./models";

const NO_QUERY: ModelQuery = {
  searchQuery: "",
  searchRegex: false,
  searchNames: true,
  sort: "name-asc",
};

function model(name: string, modifiedAt: string) {
  return mediaItem(name, HOME_PATH, { modified_at: modifiedAt });
}

const MODELS = [
  model("subject_b.safetensors", "2026-03-20T10:00:00.000Z"),
  model("Style.safetensors", "2026-03-01T10:00:00.000Z"),
  model("subject_a.safetensors", "2026-03-10T10:00:00.000Z"),
];

function names(query: Partial<ModelQuery>): string[] {
  return processModels(MODELS, { ...NO_QUERY, ...query }).map((item) => item.name);
}

describe("splitModels", () => {
  it("takes model files out of the media", () => {
    const image = mediaItem("photo.png", HOME_PATH);
    const { media, models } = splitModels([image, ...MODELS]);

    expect(media).toEqual([image]);
    expect(models).toEqual(MODELS);
  });
});

describe("processModels", () => {
  it("sorts by the gallery's order", () => {
    expect(names({ sort: "name-asc" })).toEqual([
      "Style.safetensors",
      "subject_a.safetensors",
      "subject_b.safetensors",
    ]);
    expect(names({ sort: "date-desc" })).toEqual([
      "subject_b.safetensors",
      "subject_a.safetensors",
      "Style.safetensors",
    ]);
  });

  it("falls back to name order for a sort models have no value for", () => {
    expect(names({ sort: "megapixels-desc" })).toEqual(names({ sort: "name-asc" }));
  });

  it("matches the search against names, plain or regex", () => {
    expect(names({ searchQuery: "SUBJECT" })).toEqual([
      "subject_a.safetensors",
      "subject_b.safetensors",
    ]);
    expect(names({ searchQuery: "^style", searchRegex: true })).toEqual(["Style.safetensors"]);
  });

  it("is left whole by a search over captions only", () => {
    expect(names({ searchQuery: "subject", searchNames: false })).toHaveLength(3);
  });
});
