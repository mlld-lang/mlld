/var @files = [
  {"path": "file.md", "name": "First File"},
  {"path": "file.md", "name": "Second File"}
]
/show foreach [@files.path # Section Title] as ::### {{files.name}}::