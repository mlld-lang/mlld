/var @cfg = {
  "profiles": {
    "full": { "requires": { "sh": true } },
    "readonly": { "requires": { } }
  }
}

/var @denyShell = { deny: { sh: true } }
/policy @p = union(@denyShell)

/env @cfg [
  show @mx.profile
]
