/guard @blockSend before op:exe = when [
  @mx.op.name == "sendData" => deny "Network calls blocked"
  * => allow
]

/exe @sendData(value) = run { curl -d "@value" api.example.com }
/show @sendData("test")                    # Blocked