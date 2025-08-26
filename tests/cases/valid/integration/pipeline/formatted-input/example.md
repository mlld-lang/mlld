# Test pipeline with different formats

/exe @getData() = {echo '[{"name":"Alice","age":30},{"name":"Bob","age":25}]'}
/exe @getCSV() = {printf 'name,age\nAlice,30\nBob,25'}

>> JSON format (default)
/exe @processJSON(input) = js {
  // Handle both plain strings (no format) and PipelineInput objects
  let data;
  if (typeof input === 'string') {
    // No format specified - got plain string
    data = JSON.parse(input);
  } else {
    // Format specified - got PipelineInput object
    console.log('Type:', input.type);
    console.log('Text length:', input.text.length);
    
    if (input.type === 'json') {
      console.log('Data:', input.data);
      data = input.data;
    } else {
      // For other formats, parse the JSON from text
      data = JSON.parse(input.text);
      console.log('Parsed data from text:', data);
    }
  }
  
  return data.map(p => p.name).join(', ');
}

/var @names = @getData() | @processJSON
/show :::JSON Names: {{names}}:::

>> CSV format
/exe @processCSV(input) = js {
console.log('Type:', input.type);
console.log('CSV rows:', input.csv.length);
return input.csv.slice(1).map(row => row[0]).join(', ');
}

/var @csvNames = @getCSV() with { format: "csv", pipeline: [@processCSV] }
/show :::CSV Names: {{csvNames}}:::

>> Format conversion
/exe @csvToJSON(input) = js {
if (input.type !== 'csv') throw new Error('Expected CSV input');
const [headers, ...rows] = input.csv;
return JSON.stringify(rows.map(row => 
Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  ));
}

/var @converted = @getCSV() with { format: "csv", pipeline: [@csvToJSON, @processJSON] }
/show :::Converted: {{converted}}:::

>> Text format (no parsing)
/exe @processText(input) = js {
console.log('Type:', input.type);
console.log('Data is text:', input.data === input.text);
return 'Text length: ' + input.text.length;
}

/var @textResult = @getData() with { format: "text", pipeline: [@processText] }
/show :::Text Result: {{textResult}}:::