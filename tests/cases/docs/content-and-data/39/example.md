>> In the published module
/exe @alice(msg, ctx) = template "alice.att"
/exe @bob(msg, ctx) = template "bob.att"
/export { @alice, @bob }

>> Import and use
/import { @alice, @bob } from @author/templates
/show @alice(@msg, @ctx)