/exe llm @process(path, model) = js {
  globalThis.__fixtureResumeFuzzyCounter = (globalThis.__fixtureResumeFuzzyCounter || 0) + 1;
  const rawPath = path && typeof path === "object" && "value" in path ? path.value : path;
  const rawModel = model && typeof model === "object" && "value" in model ? model.value : model;
  return "proc:" + rawPath + ":" + rawModel;
}

/var @files = ["aa.ts", "bb.ts", "cc.ts"]
/var @results = for parallel(2) @file in @files => @process(@file, "sonnet")

/for @item in @results [
  show @item
]
