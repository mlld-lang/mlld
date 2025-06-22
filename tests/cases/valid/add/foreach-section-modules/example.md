/data @files = [
  {"path": "file.md", "frontmatter": {"name": "Core Utils"}, "name": "core-utils.mld"},
  {"path": "file.md", "frontmatter": {"name": "HTTP Client"}, "name": "http-client.mld"}
]

## Modules
/add foreach [@files.path # Section Title] as [[### [{{files.frontmatter.name}}](./{{files.name}})]]