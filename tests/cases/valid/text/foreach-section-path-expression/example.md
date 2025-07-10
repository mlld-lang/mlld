/path @baseDir = "./modules"
/var @modules = [
  {"name": "core", "file": "core.md", "section": "exports"},
  {"name": "utils", "file": "utils.md", "section": "api"},
  {"name": "types", "file": "types.md", "section": "interfaces"}
]
/var @moduleExports = foreach <@baseDir/{{modules.file}} # @modules.section> as ::**{{modules.name}}**:
::
/show @moduleExports