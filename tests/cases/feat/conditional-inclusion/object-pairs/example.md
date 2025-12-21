/var @condName = "Ada"
/var @condTitle = ""
/var @condAge = 0
/var @condRole = "false"
/var @condTags = ["a", "b"]
/var @condEmptyTags = []
/var @condMeta = { active: true }
/var @condEmptyMeta = {}

/var @condObj = {
  name: @condName,
  title?: @condTitle,
  age?: @condAge,
  role?: @condRole,
  tags?: @condTags,
  emptyTags?: @condEmptyTags,
  meta?: @condMeta,
  emptyMeta?: @condEmptyMeta,
  missing?: @condMissing
}

/show @condObj
