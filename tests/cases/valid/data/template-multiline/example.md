/var @projectName = "MlldProject"
/var @version = "2.0.0"
/var @report = {
timestamp: run {echo "2024-01-15T10:30:00Z"},
status: "Success"
}
/show [[
## Build Summary
Project: {{projectName}}
Version: {{version}}
Status: {{report.status}}
]]