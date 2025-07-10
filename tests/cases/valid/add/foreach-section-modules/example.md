/var @files = [
  {"path": "foreach-section-modules-file.md", "frontmatter": {"name": "Core Utils"}, "name": "core-utils.mld"},
  {"path": "foreach-section-modules-file.md", "frontmatter": {"name": "HTTP Client"}, "name": "http-client.mld"}
]

## Modules
/show foreach <@files.path # Section Title> as "### [@files.frontmatter.name](./@files.name)"