/data @modules = [
  {"path": "file.md", "section": "Section Title", "name": "Main Module"},
  {"path": "file.md", "section": "Original Title", "name": "Legacy Module"}
]
/add foreach [@modules.path # @modules.section] as [[### [{{modules.name}}]]]