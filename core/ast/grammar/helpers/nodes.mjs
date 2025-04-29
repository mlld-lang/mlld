const NodeType = {
  Text: "Text",
  Comment: "Comment",
  CodeFence: "CodeFence",
  VariableReference: "VariableReference",
  Directive: "Directive",
  PathSeparator: "PathSeparator",
  DotSeparator: "DotSeparator",
  Literal: "Literal",
  SectionMarker: "SectionMarker",
  Error: "Error",
  Newline: "Newline"
};
const DirectiveKind = {
  run: "run",
  import: "import",
  define: "define",
  data: "data",
  var: "var",
  path: "path",
  embed: "embed"
};
const DEBUG = true;
const helpers = {
  debug(msg, ...args) {
    if (DEBUG) {
      let outputArgs = "";
      if ((msg === "CreateVAR" || msg === "RawStringVAR") && args.length > 0 && typeof args[0] === "object") {
        const details = args[0];
        const node = details.node || (args.length > 1 && typeof args[1] === "object" ? args[1] : null);
        const varId = details.varId || (node ? node.identifier : "unknown");
        const valueType = details.valueType || (node ? node.valueType : "unknown");
        const rule = details.rule || "";
        outputArgs = `${rule ? `rule=${rule} ` : ""}varId=${varId} valueType=${valueType}`;
      } else {
        outputArgs = args.map((arg) => {
          try {
            const seen = /* @__PURE__ */ new Set();
            return typeof arg === "string" ? arg : JSON.stringify(arg, (key, value) => {
              if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
              }
              return value;
            }, 2);
          } catch (e) {
            if (e instanceof TypeError && e.message.includes("circular structure")) {
              return "[Circular]";
            } else if (e instanceof TypeError && e.message.includes("BigInt")) {
              return "[BigInt]";
            }
            return "[Unserializable]";
          }
        }).join(" ");
      }
      process.stdout.write(`[DEBUG GRAMMAR] ${msg} ${outputArgs}
`);
    }
  },
  isLogicalLineStart(input, pos) {
    if (pos === 0) return true;
    let i = pos - 1;
    while (i >= 0 && (input[i] === " " || input[i] === "	" || input[i] === "\r")) {
      i--;
    }
    return i < 0 || input[i] === "\n";
  },
  createNode(type, properties = {}) {
    const baseNode = {
      type,
      nodeId: "placeholder-id",
      location: location()
    };
    for (const key in properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        baseNode[key] = properties[key];
      }
    }
    Object.freeze(baseNode);
    return baseNode;
  },
  createDirective(kind, data, loc) {
    return helpers.createNode(NodeType.Directive, { directive: { kind, ...data } }, loc);
  },
  createVariableReferenceNode(valueType, data, loc) {
    const node = helpers.createNode(
      NodeType.VariableReference,
      { valueType, isVariableReference: true, ...data },
      loc
    );
    return node;
  },
  normalizePathVar(id) {
    switch (id) {
      case "~":
        return "HOMEPATH";
      case ".":
        return "PROJECTPATH";
      default:
        return id;
    }
  },
  validateRunContent: () => true,
  // ADDED STUB
  validateDefineContent: () => true,
  // ADDED STUB
  validatePath(pathParts, directiveKind) {
    const raw = helpers.reconstructRawString(pathParts).trim();
    let isAbsolute = false;
    let isRelativeToCwd = true;
    let hasVariables = false;
    let hasTextVariables = false;
    let hasPathVariables = false;
    let variable_warning = false;
    if (pathParts && pathParts.length > 0) {
      const firstPart = pathParts[0];
      if (firstPart.type === NodeType.PathSeparator && firstPart.value === "/") {
        isAbsolute = true;
        isRelativeToCwd = false;
      }
      helpers.debug("VALIDATE_PATH_PARTS", "Checking path parts:", JSON.stringify(pathParts));
      for (const node of pathParts) {
        if (node.type === NodeType.VariableReference) {
          hasVariables = true;
          helpers.debug("VALIDATE_PATH_NODE", "Found variable:", JSON.stringify(node));
          if (node.valueType === "text") {
            hasTextVariables = true;
            variable_warning = true;
            helpers.debug("VALIDATE_PATH_NODE", "Found text variable:", JSON.stringify(node));
          } else if (node.valueType === "path") {
            hasPathVariables = true;
            if (directiveKind === DirectiveKind.embed) {
              isRelativeToCwd = false;
            }
            helpers.debug("VALIDATE_PATH_NODE", "Found path variable:", JSON.stringify(node));
          }
        }
      }
    }
    variable_warning = hasTextVariables;
    const finalFlags = {
      isAbsolute,
      isRelativeToCwd,
      hasVariables,
      hasTextVariables,
      hasPathVariables,
      variable_warning
    };
    const result = {
      raw,
      // Use reconstructed raw string
      values: pathParts,
      // Use original pathParts array with locations
      ...finalFlags
      // Spread the calculated boolean flags
    };
    helpers.debug("PATH", "validatePath final result:", JSON.stringify(result, null, 2));
    return result;
  },
  // <<< END REFACTORED validatePath >>>
  // <<< PRESERVING getImportSubtype and trace >>>
  getImportSubtype(list) {
    if (!list) return "importAll";
    if (list.length === 0) return "importAll";
    if (list.length === 1 && list[0].name === "*") return "importAll";
    return "importStandard";
  },
  trace(pos, reason) {
  },
  reconstructRawString(nodes) {
    if (!Array.isArray(nodes)) {
      if (nodes && typeof nodes === "object") {
        if (nodes.type === NodeType.Text) return nodes.content || "";
        if (nodes.type === NodeType.VariableReference) {
          const varId = nodes.identifier;
          const valueType = nodes.valueType;
          return valueType === "path" ? `$${varId}` : `{{${varId}}}`;
        }
      }
      return String(nodes || "");
    }
    let raw = "";
    for (const node of nodes) {
      if (!node) continue;
      if (node.type === NodeType.Text) {
        raw += node.content || "";
      } else if (node.type === NodeType.VariableReference) {
        const varId = node.identifier;
        const valueType = node.valueType;
        raw += valueType === "path" ? `$${varId}` : `{{${varId}}}`;
      } else if (node.type === NodeType.PathSeparator) {
        raw += node.value || "";
      } else if (node.type === NodeType.SectionMarker) {
        raw += node.value || "";
      } else if (typeof node === "string") {
        raw += node;
      } else {
        raw += node.raw || node.content || node.value || "";
      }
    }
    return raw;
  }
};
export {
  DEBUG,
  DirectiveKind,
  NodeType,
  helpers
};
