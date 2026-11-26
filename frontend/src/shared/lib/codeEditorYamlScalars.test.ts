import { yaml } from "@codemirror/lang-yaml";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { getCodeEditorHighlightExtension } from "./codeEditorTheme";
import { resolveYamlScalar, yamlScalarHighlight } from "./codeEditorYamlScalars";

vi.unmock("@codemirror/state");
vi.unmock("@codemirror/view");
vi.unmock("@codemirror/lang-yaml");
vi.unmock("@/shared/lib/codeEditorTheme");

const CLASSES = {
  bool: "t-bool",
  int: "t-int",
  float: "t-float",
  null: "t-null",
  string: "t-string",
};

const RULES = [
  "words:",
  "  min: 60",
  "repeated_phrases: 4",
  "test: true",
  "empty: ~",
  'quoted: "kept"',
  "flag:",
  "  - match: [float*, in the air]",
  "    note: check the accuracy",
  "block: |",
  "  line one",
].join("\n");

let view: EditorView | null = null;

function mount(doc: string, highlight = yamlScalarHighlight(CLASSES)): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [yaml(), highlight] }),
    parent: document.body,
  });
  return view;
}

function textsWithClass(className: string): string[] {
  return Array.from(view!.dom.querySelectorAll(`.${className}`), (node) => node.textContent ?? "");
}

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("resolveYamlScalar", () => {
  it.each([
    ["60", "int"],
    ["-3", "int"],
    ["0x1F", "int"],
    ["1_000", "int"],
    ["1.5", "float"],
    ["-.inf", "float"],
    ["1e5", "string"],
    ["true", "bool"],
    ["Yes", "bool"],
    ["off", "bool"],
    ["~", "null"],
    ["null", "null"],
    ["float*", "string"],
    ["in the air", "string"],
  ])("reads %s as %s", (text, kind) => {
    expect(resolveYamlScalar(text)).toBe(kind);
  });
});

describe("yamlScalarHighlight", () => {
  it("marks unquoted values by type and leaves keys alone", () => {
    mount(RULES);

    expect(textsWithClass("t-int")).toEqual(["60", "4"]);
    expect(textsWithClass("t-bool")).toEqual(["true"]);
    expect(textsWithClass("t-null")).toEqual(["~"]);
    expect(textsWithClass("t-string")).toEqual([
      "float*",
      "in the air",
      "check the accuracy",
      "  line one",
    ]);
  });

  it("re-marks a value after an edit", () => {
    mount("count: 60");

    view!.dispatch({ changes: { from: 7, to: 9, insert: "many" } });

    expect(textsWithClass("t-int")).toEqual([]);
    expect(textsWithClass("t-string")).toEqual(["many"]);
  });

  it("is part of the YAML editor highlighting", () => {
    mount("count: 60\nflag: true", getCodeEditorHighlightExtension("yaml"));

    const value = view!.dom.querySelector(".cm-line")!.lastElementChild!;
    const flag = view!.dom.querySelectorAll(".cm-line")[1].lastElementChild!;
    expect(value.textContent).toBe("60");
    expect(value.className).not.toBe("");
    expect(flag.textContent).toBe("true");
    expect(flag.className).not.toBe(value.className);
  });
});
