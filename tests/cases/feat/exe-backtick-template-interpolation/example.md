/var @name = "world"
/exe @greet(@msg) = cmd { echo @msg }
/show @greet(`hello @name`)
