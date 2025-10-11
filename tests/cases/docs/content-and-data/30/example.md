>> Collect all module documentation
/var @modules = <modules/**/*.md>

>> Build README with metadata
/var @readme = `# Project Modules

Total modules: @modules.length
Last updated: @now

@modules

`

/output @readme to "README.md"