>> Spaced pipeline for <file> after alligator
/exe @upper(text) = js { 
  const str = typeof text === 'string' ? text : JSON.stringify(text);
  return str.toUpperCase();
}
/var @data = <test-pipeline-data.json> | @upper
/show @data

