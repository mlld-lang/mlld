>> In the published module
/exe @alice(msg, mx) = template "alice.att"
/exe @bob(msg, mx) = template "bob.att"
/export { @alice, @bob }

>> Import and use
/import { @alice, @bob } from @author/templates
/show @alice(@msg, @mx)