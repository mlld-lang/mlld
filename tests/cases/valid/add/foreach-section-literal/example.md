@data files = [
  {"path": "file.md", "name": "First File"},
  {"path": "file.md", "name": "Second File"}
]
@add foreach [@files.path # Section Title] as [[### {{files.name}}]]