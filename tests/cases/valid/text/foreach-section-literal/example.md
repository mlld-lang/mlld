/var @modules = [
  {"path": "file.md", "name": "Core Module"},
  {"path": "file.md", "name": "Utils Module"}
]
/var @moduleList = foreach [@modules.path # Section Title] as [[- **{{modules.name}}**: ]]
/show @moduleList