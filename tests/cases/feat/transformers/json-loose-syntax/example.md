# Test: Loose JSON Parsing

>> Default @json should accept relaxed JSON syntax (single quotes, trailing commas, comments)

/var @singleQuote = "{'name': 'Alice', 'age': 30, 'active': true}"
/var @parsedSingle = @singleQuote | @json
/show @parsedSingle

/var @looseMulti = `{
  // trailing comma on object and array entries
  items: [
    { id: 1, },
    { id: 2, },
  ],
  meta: {
    owner: 'mlld',
  },
}`
/var @parsedMulti = run { cat } with { stdin: @looseMulti, pipeline: [@json] }
/show @parsedMulti
