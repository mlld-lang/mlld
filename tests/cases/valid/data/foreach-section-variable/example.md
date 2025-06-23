/var @docs = [
  {"path": "file.md", "section": "Section Title", "title": "Documentation"},
  {"path": "file.md", "section": "Original Title", "title": "Original Doc"}
]
/var @results = foreach [@docs.path # @docs.section] as [[## {{docs.title}}]]