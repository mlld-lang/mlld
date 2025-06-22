/data @docs = [
  {"file": "api.md", "section": "overview", "title": "API Documentation"},
  {"file": "api.md", "section": "authentication", "title": "Auth Guide"},
  {"file": "guide.md", "section": "getting-started", "title": "Quick Start"}
]
/text @docIndex = foreach [@docs.file # @docs.section] as [[## {{docs.title}}
]]
/add @docIndex