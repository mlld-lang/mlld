/var @files = [
  {"path": "file.md", "name": "Test File"},
  {"path": "file.md", "name": "Another File"}
]
/var @sections = foreach @files.path # "Section Title" as [[### {{files.name}}]]
/show @sections