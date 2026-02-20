/var @config = null
/var @run = {
  config: @config ? @config : { batch_size: 5 }
}
/show @run
