import { syntaxTree } from "@codemirror/language";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";

export type YamlScalarKind = "bool" | "int" | "float" | "null" | "string";

// PyYAML's implicit resolvers (YAML 1.1), because the backend reads these files with
// yaml.safe_load: `yes`/`off` are booleans and a float needs a dot, so `1e5` is a string.
const BOOL = /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
const FLOAT =
  /^(?:[-+]?[0-9][0-9_]*\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
const INT =
  /^(?:[-+]?0b[01_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;
const NULL = /^(?:~|null|Null|NULL)$/;

/** The type an unquoted YAML value loads as. */
export function resolveYamlScalar(text: string): YamlScalarKind {
  if (BOOL.test(text)) return "bool";
  if (FLOAT.test(text)) return "float";
  if (INT.test(text)) return "int";
  if (NULL.test(text)) return "null";
  return "string";
}

function buildScalarDecorations(
  view: EditorView,
  marks: Record<YamlScalarKind, Decoration>,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  let lastTo = -1;
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === "Key") return false;
        if (node.from < lastTo) return;
        if (node.name === "BlockLiteralContent") {
          builder.add(node.from, node.to, marks.string);
          lastTo = node.to;
        } else if (node.name === "Literal") {
          const kind = resolveYamlScalar(view.state.doc.sliceString(node.from, node.to));
          builder.add(node.from, node.to, marks[kind]);
          lastTo = node.to;
        }
      },
    });
  }
  return builder.finish();
}

/**
 * The YAML grammar tags every unquoted value as plain content, so this marks values by the type
 * they load as. Keys and quoted strings keep the grammar's own highlighting.
 */
export function yamlScalarHighlight(classes: Record<YamlScalarKind, string>): Extension {
  const marks = {} as Record<YamlScalarKind, Decoration>;
  for (const kind of Object.keys(classes) as YamlScalarKind[]) {
    marks[kind] = Decoration.mark({ class: classes[kind] });
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildScalarDecorations(view, marks);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.decorations = buildScalarDecorations(update.view, marks);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
}
