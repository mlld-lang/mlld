/var @projectVar = "MyProject"
/var @buildInfo = {
name: @projectVar,
version: "1.0.0",
build: 42,
stable: true,
status: run {echo "BUILD_SUCCESS"},
metadata: {
tags: ["release", "production"],
timestamp: run {echo "2024-01-15"}
  }
}
/show ::
Build {{buildInfo.name}} v{{buildInfo.version}} (#{{buildInfo.build}})
Status: {{buildInfo.status}}
Stable: {{buildInfo.stable}}
Date: {{buildInfo.metadata.timestamp}}
::