@data modules = [
  {"path": "file.md", "name": "Core Module"},
  {"path": "file.md", "name": "Utils Module"}
]
@text moduleList = foreach [@modules.path # Section Title] as [[- **{{modules.name}}**: ]]
@add @moduleList