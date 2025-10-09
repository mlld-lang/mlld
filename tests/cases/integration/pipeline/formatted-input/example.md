# Test pipeline with different formats

/exe @getData() = {echo '[{"name":"Alice","age":30},{"name":"Bob","age":25}]'}
/exe @getCSV() = {printf 'name,age\nAlice,30\nBob,25'}

>> JSON format (default)
/exe @processJSON(input) = js {
  let data;
  if (Array.isArray(input)) {
    data = input;
  } else if (input && typeof input === 'object' && !Array.isArray(input)) {
    if ('type' in input && 'text' in input) {
      data = input.type === 'json' ? input.data : JSON.parse(input.text);
    } else {
      data = input;
    }
  } else if (typeof input === 'string') {
    data = JSON.parse(input);
  } else {
    data = [];
  }

  return data.map(p => p.name).join(', ');
}


/var @names = @getData() | @processJSON
/show :::JSON Names: {{names}}:::

>> CSV format
/exe @processCSV(input) = js {
  const rows = Array.isArray(input)
    ? input
    : (input && typeof input === 'object' && 'csv' in input ? input.csv : input?.data);
  if (!Array.isArray(rows)) throw new Error('Expected CSV rows array');
  return rows.slice(1).map(row => row[0]).join(', ');
}

/var @csvNames = @getCSV() with { format: "csv", pipeline: [@processCSV] }
/show :::CSV Names: {{csvNames}}:::

>> Format conversion
/exe @csvToJSON(input) = js {
  const rows = Array.isArray(input)
    ? input
    : (input && typeof input === 'object' && 'csv' in input ? input.csv : input?.data);
  if (!Array.isArray(rows)) throw new Error('Expected CSV rows array');
  const [headers, ...rest] = rows;
  const objects = rest.map(row =>
    Object.fromEntries(headers.map((h, i) => [h.trim().toLowerCase(), row[i]]))
  );
  return JSON.stringify(objects);
}

/var @records = @getCSV() with { format: "csv", pipeline: [@csvToJSON] }
/var @converted = @records | @processJSON
/show :::Converted: {{converted}}:::

>> Text format (no parsing)
/exe @processText(input) = js {
  const text = typeof input === 'string'
    ? input
    : (input && typeof input === 'object' && 'text' in input ? input.text : String(input ?? ''));
  return 'Text length: ' + text.trim().length;
}

/var @textResult = @getData() with { format: "text", pipeline: [@processText] }
/show :::Text Result: {{textResult}}:::
