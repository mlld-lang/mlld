/var @config = { foo: 1 }
/var @run = {
  config: @config ? @config : { batch_size: 5 }
}
/show @run
