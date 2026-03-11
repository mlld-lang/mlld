resume: auto

/exe llm @writeOutput() = sh {
  printf "hello" > output.txt
  printf "wrote"
}

/hook @telemetry after @writeOutput = [
  output `hit:@mx.checkpoint.hit` to "state://telemetry"
]

/var @ws = box [
  file "seed.txt" = "seed"
  let @status = @writeOutput()
]

---

/show <@ws/output.txt>
