# Composed policy - allow intersection lets common commands through

/var @team = {
  capabilities: {
    allow: ["cmd:echo:*", "cmd:git:*"]
  }
}
/policy @p1 = union(@team)

/var @project = {
  capabilities: {
    allow: ["cmd:echo:*", "cmd:node:*"]
  }
}
/policy @p2 = union(@project)

/run { echo "intersection-pass" }
