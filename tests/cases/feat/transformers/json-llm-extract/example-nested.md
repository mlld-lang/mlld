# Test: Extract nested JSON

/var @response = `\`\`\`
{
  "user": {
    "profile": {
      "name": "Diana",
      "settings": {"theme": "dark"}
    }
  }
}
\`\`\``

/var @data = @response | @json.llm
/show @data.user.profile.name
