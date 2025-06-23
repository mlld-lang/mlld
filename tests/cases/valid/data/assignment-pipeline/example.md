# Test data pipeline with arrays and objects

/data @items = [
  { "id": 1, "name": "Item 1" },
  { "id": 2, "name": "Item 2" }
]

/exec @process(data) = js {
  >> Handle both direct invocation (string) and pipeline (PipelineInput)
if (typeof data === 'string') {
    >> Direct invocation - parse the JSON string
const items = JSON.parse(data);
return items.map(p => p.name).join(', ');
  } else {
    >> Pipeline invocation - use the PipelineInput object
console.log('Type:', data.type);
console.log('Text length:', data.text.length);
const items = data.data;
return items.map(p => p.name).join(', ');
  }
}

# Direct invocation works
/data @direct = @process(@items)
/add [[Direct: {{direct}}]]

# Pipeline should also work
/data @piped = @items | @process
/add [[Piped: {{piped}}]]

# With explicit format
/data @formatted = @items with { format: "json", pipeline: [@process] }
/add [[Formatted: {{formatted}}]]