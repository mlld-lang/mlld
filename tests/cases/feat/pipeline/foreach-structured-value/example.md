>> Foreach handles StructuredValue arrays from pipelines
/exe @echoUser(user) = js {
  return user
}
/exe @chunk(arr, sz) = js {
  return Array.from(
    { length: Math.ceil(arr.length / sz) },
    (_, i) => arr.slice(i * sz, i * sz + sz)
  );
}
/exe @sum(values) = js {
  return values.reduce((total, value) => total + value, 0);
}
/var @users = '[{"id":1},{"id":2}]' | @json
/var @echoed = foreach @echoUser(@users)
/show @echoed | @json
/var @numbers = '[1, 2, 3, 4]' | @json
/var @chunks = @numbers | @chunk(2)
/var @sums = foreach @sum(@chunks)
/show @chunks | @json
/show @sums | @json
