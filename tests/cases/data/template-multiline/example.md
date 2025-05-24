@text projectName = "MeldProject"
@text version = "2.0.0"
@data report = {
  timestamp: @run [echo "2024-01-15T10:30:00Z"],
  status: "Success"
}
@add [[
## Build Summary
Project: {{projectName}}
Version: {{version}}
Status: {{report.status}}
]]