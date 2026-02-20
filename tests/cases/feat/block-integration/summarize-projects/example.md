/exe @summarize(projects) = [
  let @out = []
  let @errors = []

  for @project in @projects [
    let @rows = for @task in @project.tasks => when [
      (@task.state == "done") => { id: @task.id, pts: @task.points }
      none => skip
    ]

    let @projectErrors = for @task in @project.tasks => when [
      (@task.state == "blocked") => { id: @task.id, reason: @task.blocker }
      none => skip
    ]
    let @errors += @projectErrors

    let @out += {
      name: @project.name,
      total: @rows.length,
      tasks: @rows
    }
  ]

  show "Projects: @out.length, errors: @errors.length"
  => { results: @out, errors: @errors }
]

/var @projects = [
  { name: "Alpha", tasks: [
      { id: "A1", points: 3, state: "done" },
      { id: "A2", points: 2, state: "blocked", blocker: "env" }
    ]
  },
  { name: "Beta", tasks: [
      { id: "B1", points: 5, state: "done" }
    ]
  }
]

/show @summarize(@projects) | @json
