# Basic Pipeline Test

@exec validate_json(data) = @run [
  node -e 'try { JSON.parse(`@data`); console.log(`@data`); } catch { }'
]

@exec extract_field(data, field) = @run [
  node -e 'const d = JSON.parse(`@data`); console.log(JSON.stringify(d["@field"]))'
]

@text api_response = @run [echo '{"users": ["alice", "bob"], "count": 2}']

@text users = @run [echo "@api_response"] with {
  pipeline: [
    @validate_json(@input),
    @extract_field(@input, "users")
  ]
}

@add @users