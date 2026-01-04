/exe @buildResults(rows) = [
  let @results = []

  for @row in @rows [
    let @accTags = []

    for @tag in @row.tags [
      let @accTags += "@tag"
    ]

    let @results += {
      id: @row.id,
      tags: @accTags
    }
  ]

  => @results
]

/var @rows = [
  { id: "r1", tags: ["alpha", "beta"] },
  { id: "r2", tags: [] },
  { id: "r3", tags: ["gamma"] }
]

/show @buildResults(@rows) | @json
