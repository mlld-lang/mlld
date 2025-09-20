# Test data pipeline with arrays and objects

/var @items = [
  { "id": 1, "name": "Item 1" },
  { "id": 2, "name": "Item 2" }
]

/exe @process(data) = js {
  // Handle both direct invocation (string) and pipeline (PipelineInput)
  if (typeof data === 'string') {
    // Direct invocation - parse the JSON string
    const items = JSON.parse(data);
    return items.map(p => p.name).join(', ');
  } else {
    // Pipeline invocation - use the PipelineInput object
    const items = data.data;
    return items.map(p => p.name).join(', ');
  }
}

# Direct invocation works
/var @direct = @process(@items)
/show :::Direct: {{direct}}:::

# Pipeline should also work
/var @piped = @items | @process
/show :::Piped: {{piped}}:::

# With explicit format
/var @formatted = @items with { format: "json", pipeline: [@process] }
/show :::Formatted: {{formatted}}:::