>> Filter JSON array from command
/var @json = run {./mkjson.sh}
/exe @filterHigh(entries) = js {
  return entries.filter(e => e.finding.startsWith("High"));
}
/var @result = @filterHigh(@json.data)

>> Process API response
/var @response = run {curl -s api.example.com/data}
/exe @getActive(data) = js {
  return data.users.filter(u => u.active);
}
/var @active = @getActive(@response.data)