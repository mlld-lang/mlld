/for parallel(3) @task in @tasks [
  let @result = @runTask(@task)
  show `done:@task.id`
]
show `errors:@ctx.errors.length`