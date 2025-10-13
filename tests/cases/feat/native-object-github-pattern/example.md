/comment Reproduces the exact pattern from todo-fix-property-access.md
/comment This mimics how @mlld/github module returns native objects

/exe @repoView(repo) = js {(
  {
    name: repo.split('/')[1],
    full_name: repo,
    owner: {
      login: repo.split('/')[0],
      id: 123
    },
    description: "Test repository",
    stargazers_count: 42
  }
)}

/comment The exact failing pattern from the TODO
/var @repo = @repoView("mlld-lang/registry")
/var @name = @repo.name
/show `Name: @name`

/comment Nested property access
/var @login = @repo.owner.login
/show `Login: @login`

/comment This should work (already works in templates)
/show `Template: @repo.name by @repo.owner.login`

/comment Array example like pr.files
/exe @prFiles(pr, repoName) = js {(
  [
    {
      filename: "src/index.ts",
      status: "modified",
      additions: 25,
      deletions: 10
    },
    {
      filename: "README.md",
      status: "modified",
      additions: 5,
      deletions: 2
    }
  ]
)}

/var @files = @prFiles(123, "mlld-lang/registry")
/var @firstFile = @files.0
/var @filename = @firstFile.filename
/show `First file: @filename`

/comment Mixed: array element property
/var @additions = @files.0.additions
/show `Additions: @additions`
