/exec @getItems() = js {
JSON.stringify([
  { id: 1, name: 'Item 1' },
  { id: 2, name: 'Item 2' }
  ])
}

/exec @showData(x) = js {
  // Handle both string and PipelineInput objects
let str;
if (typeof x === 'string') {
str = x;
  } else if (x && x.text && x.type) {
    // This is a PipelineInput object - use the text
str = x.text;
  } else {
    // Other objects
str = JSON.stringify(x);
  }
return str.substring(0, 100);
}

# Direct call (should work)
/data @direct = @showData(@getItems())
/add [[Direct: {{direct}}]]

# Pipeline (should now also work)  
/data @piped = @getItems() | @showData
/add [[Piped: {{piped}}]]