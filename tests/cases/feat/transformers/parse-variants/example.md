# @parse variants

/var @strictPayload = '{"project":"mlld","version":"rc82"}'
/var @strictParsed = @strictPayload | @parse.strict
/show @strictParsed

/var @loosePayload = "{items: [1,2,3,], note: 'ok'}"
/var @looseParsed = @loosePayload | @parse.loose
/show @looseParsed

/var @llmResponse = `Result:
\`\`\`json
{"name":"Ada","role":"Engineer"}
\`\`\``
/var @llmParsed = @llmResponse | @parse.llm
/show @llmParsed

/var @list = `
alpha
beta
gamma
`
/var @fromList = @list | @parse.fromlist
/show @fromList
