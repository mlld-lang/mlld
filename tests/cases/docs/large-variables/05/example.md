>> Good pattern for large data
/exe @process(content) = sh {
  echo "$content" | jq '.items[]'
}

>> Load many files
/var @configs = <**/*.json>
/show @process(@configs)