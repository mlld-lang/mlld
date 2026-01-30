/exe @buildRequest(foo, bar) = `[{ "foo": @foo, "bar": @bar }]` | @json

/exe @noop(req) = when [
  * => [
    show "req[0].foo: @req[0].foo"
    => @req
  ]
]

/var @req = @buildRequest("1", "2") | @noop | @noop
/show @req[0].foo
