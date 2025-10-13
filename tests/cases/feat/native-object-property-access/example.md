/comment Test property access on native JS objects returned from js {( )}

/exe @makeRepo() = js {(
  {
    name: "mlld",
    owner: {
      login: "mlld-lang",
      id: 12345
    },
    stars: 42,
    topics: ["language", "llm", "scripting"]
  }
)}

/comment Test 1: Simple property access
/var @repo = @makeRepo()
/var @repoName = @repo.name
/show `Repository: @repoName`

/comment Test 2: Nested property access
/var @ownerLogin = @repo.owner.login
/show `Owner: @ownerLogin`

/comment Test 3: Numeric property
/var @stars = @repo.stars
/show `Stars: @stars`

/comment Test 4: Array property access
/var @topics = @repo.topics
/var @firstTopic = @topics.0
/show `First topic: @firstTopic`

/comment Test 5: Property access in template (baseline - this already works)
/show `Direct template access: @repo.name by @repo.owner.login`

/comment Test 6: Property access in function args (baseline - this already works)
/exe @upper(text) = js { return String(text).toUpperCase(); }
/var @upperName = @upper(@repo.name)
/show `Uppercase: @upperName`

/comment Test 7: Chained property access on array element
/var @nestedAccess = @repo.topics.0
/show `Nested: @nestedAccess`

/comment Test 8: Multiple objects
/exe @makeUser() = js {(
  {
    username: "developer",
    email: "dev@example.com",
    profile: {
      bio: "Building with mlld",
      location: "Remote"
    }
  }
)}

/var @user = @makeUser()
/var @username = @user.username
/var @bio = @user.profile.bio
/show `User: @username - @bio`
