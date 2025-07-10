/var @files = [
  {"path": "foreach-section-literal-file.md", "name": "First File"},
  {"path": "foreach-section-literal-file.md", "name": "Second File"}
]
/show foreach <@files.path # Section Title> as "### @files.name"