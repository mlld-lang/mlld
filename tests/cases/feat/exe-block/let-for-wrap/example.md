/var @turnP = {
  "alice": { "message": "hi" },
  "bob": { "message": "bye" }
}

/exe @wrap(agent, turnP) = [
  let @turn = @turnP[@agent]
  => { name: @agent, turn: @turn }
]

/show @wrap("alice", @turnP) | @json

/var @results = for @a in ["alice"] [@wrap(@a, @turnP)]
/show @results | @json
