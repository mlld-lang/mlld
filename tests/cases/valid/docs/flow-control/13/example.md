/var @data = run {echo '{"users":[{"name":"Alice"},{"name":"Bob"}]}'} | @json
/show @data.users[0].name