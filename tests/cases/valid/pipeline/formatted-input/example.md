# Test pipeline with different formats

/exec @getData() = {echo '[{"name":"Alice","age":30},{"name":"Bob","age":25}]'}
/exec @getCSV() = {echo 'name,age\nAlice,30\nBob,25'}

>> JSON format (default)
/exec @processJSON(input) = js {
console.log('Type:', input.type);
console.log('Text length:', input.text.length);
  
  >> Handle both JSON format and CSV format containing JSON text
let data;
if (input.type === 'json') {
console.log('Data:', input.data);
data = input.data;
  } else {
    >> For other formats, parse the JSON from text
data = JSON.parse(input.text);
console.log('Parsed data from text:', data);
  }
  
return data.map(p => p.name).join(', ');
}

/data @names = @getData() | @processJSON
/add [[JSON Names: {{names}}]]

>> CSV format
/exec @processCSV(input) = js {
console.log('Type:', input.type);
console.log('CSV rows:', input.csv.length);
return input.csv.slice(1).map(row => row[0]).join(', ');
}

/data @csvNames = @getCSV() with { format: "csv", pipeline: [@processCSV] }
/add [[CSV Names: {{csvNames}}]]

>> Format conversion
/exec @csvToJSON(input) = js {
if (input.type !== 'csv') throw new Error('Expected CSV input');
const [headers, ...rows] = input.csv;
return JSON.stringify(rows.map(row => 
Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  ));
}

/data @converted = @getCSV() with { format: "csv", pipeline: [@csvToJSON, @processJSON] }
/add [[Converted: {{converted}}]]

>> Text format (no parsing)
/exec @processText(input) = js {
console.log('Type:', input.type);
console.log('Data is text:', input.data === input.text);
return 'Text length: ' + input.text.length;
}

/data @textResult = @getData() with { format: "text", pipeline: [@processText] }
/add [[Text Result: {{textResult}}]]