import { describe, expect, it } from "vite-plus/test";
import { passList, supportsComfyWorkflow } from "./comfyWorkflow";

describe("supportsComfyWorkflow", () => {
  it("accepts PNG and the MP4 family, which is where ComfyUI writes the workflow", () => {
    const paths = [
      "C:\\Photos\\render.png",
      "C:\\Photos\\clip.mp4",
      "C:\\Photos\\clip.mov",
      "C:\\Photos\\clip.m4v",
      "C:\\Photos\\RENDER.PNG",
    ];

    expect(paths.filter((path) => !supportsComfyWorkflow(path))).toEqual([]);
  });

  it("rejects formats that carry no workflow metadata", () => {
    const paths = [
      "C:\\Photos\\photo.jpg",
      "C:\\Photos\\photo.webp",
      "C:\\Photos\\photo.bmp",
      "C:\\Photos\\loop.gif",
      "C:\\Photos\\clip.mkv",
      "C:\\Photos\\clip.avi",
      "C:\\Photos\\no-extension",
    ];

    expect(paths.filter((path) => supportsComfyWorkflow(path))).toEqual([]);
  });
});

describe("passList", () => {
  it("names one pass, lists two and collapses longer runs", () => {
    expect([[2], [1, 2], [3, 4, 5, 6], [1, 2, 4, 6, 7, 8]].map(passList)).toEqual([
      "Pass 2",
      "Passes 1, 2",
      "Passes 3–6",
      "Passes 1, 2, 4, 6–8",
    ]);
  });
});
