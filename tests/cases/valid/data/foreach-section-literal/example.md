@data files = [
  {"path": "file.md", "name": "Test File"},
  {"path": "file.md", "name": "Another File"}
]
@data sections = foreach [@files.path # Section Title] as [[### {{files.name}}]]
@add @sections