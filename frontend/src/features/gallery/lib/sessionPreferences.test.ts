import { afterEach, describe, expect, it } from "vitest";
import { cacheGallerySessionQuery, readGallerySessionQuery } from "./sessionPreferences";

const SESSION_QUERY_CACHE_KEY = "gallery-session-query";

describe("gallery session preferences", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("reads and writes the unified session query key", () => {
    cacheGallerySessionQuery({
      filter: "captioned",
      mediaTypeFilter: "image",
      searchQuery: "sunset",
      searchRegex: true,
      searchNames: false,
    });

    expect(window.sessionStorage.getItem(SESSION_QUERY_CACHE_KEY)).toBe(
      JSON.stringify({
        filter: "captioned",
        mediaTypeFilter: "image",
        fileFilter: "all",
        ranges: {},
        searchQuery: "sunset",
        searchRegex: true,
        searchNames: false,
      }),
    );
    expect(readGallerySessionQuery()).toEqual({
      filter: "captioned",
      mediaTypeFilter: "image",
      fileFilter: "all",
      ranges: {},
      searchQuery: "sunset",
      searchRegex: true,
      searchNames: false,
    });
  });

  it("merges partial updates with the current session query", () => {
    cacheGallerySessionQuery({
      filter: "uncaptioned",
      mediaTypeFilter: "all",
      // Left out of the second write below, so this also covers a non-default choice
      // surviving a partial merge rather than being read as absent.
      fileFilter: "duplicates",
      searchQuery: "lake",
      searchRegex: false,
      searchNames: true,
    });

    cacheGallerySessionQuery({ searchQuery: "mountain" });

    expect(readGallerySessionQuery()).toEqual({
      filter: "uncaptioned",
      mediaTypeFilter: "all",
      fileFilter: "duplicates",
      ranges: {},
      searchQuery: "mountain",
      searchRegex: false,
      searchNames: true,
    });
  });

  it("falls back safely when stored JSON is invalid", () => {
    window.sessionStorage.setItem(SESSION_QUERY_CACHE_KEY, "{not-json");

    expect(readGallerySessionQuery()).toEqual({
      filter: "all",
      mediaTypeFilter: "all",
      fileFilter: "all",
      ranges: {},
      searchQuery: "",
      searchRegex: false,
      searchNames: true,
    });
  });

  it("falls back when stored filter values are invalid", () => {
    window.sessionStorage.setItem(
      SESSION_QUERY_CACHE_KEY,
      JSON.stringify({
        filter: "bogus",
        mediaTypeFilter: "bogus",
        searchQuery: 42,
        searchRegex: "",
        searchNames: "yes",
      }),
    );

    expect(readGallerySessionQuery()).toEqual({
      filter: "all",
      mediaTypeFilter: "all",
      fileFilter: "all",
      ranges: {},
      searchQuery: "",
      searchRegex: false,
      searchNames: true,
    });
  });

  it("defaults searchNames to true when the stored key is missing", () => {
    window.sessionStorage.setItem(
      SESSION_QUERY_CACHE_KEY,
      JSON.stringify({
        filter: "all",
        mediaTypeFilter: "all",
        searchQuery: "",
        searchRegex: false,
      }),
    );

    expect(readGallerySessionQuery().searchNames).toBe(true);
  });

  it("keeps ranges across partial updates", () => {
    cacheGallerySessionQuery({ ranges: { duration: { min: 2, max: 4 } } });
    cacheGallerySessionQuery({ searchQuery: "river" });

    expect(readGallerySessionQuery().ranges).toEqual({ duration: { min: 2, max: 4 } });
  });

  it("drops stored ranges that are not numbers, empty or inverted", () => {
    window.sessionStorage.setItem(
      SESSION_QUERY_CACHE_KEY,
      JSON.stringify({
        ranges: {
          megapixels: { min: "1", max: null },
          duration: { min: 8, max: 2 },
          caption_length: { min: 400, max: null },
          unknown_axis: { min: 1 },
        },
      }),
    );

    expect(readGallerySessionQuery().ranges).toEqual({
      caption_length: { min: 400, max: null },
    });
  });

  it("reads and writes the file filter", () => {
    cacheGallerySessionQuery({ fileFilter: "candidates" });

    expect(readGallerySessionQuery().fileFilter).toBe("candidates");

    cacheGallerySessionQuery({ searchQuery: "river" });

    expect(readGallerySessionQuery().fileFilter).toBe("candidates");
  });
});
