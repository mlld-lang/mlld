# Implicit When Actions Test

Test implicit actions within `/when` blocks - simplified syntax without directive prefixes.

## Variable assignments
/when @prod => @config = "production"
/when @dev => @setup = { host: "localhost", port: 3000 }

## Function calls
/when @initialized => @setupDatabase()
/when @ready => @startServer(8080)

## Exec assignments
/when @processing => @transform() = @processData(@input)
/when @configured => @getConfig() = { env: @environment }

## Multi-line content
/when @showBanner => :: 
Welcome to the application!
Version: @version
::

/when @runCode => js {
  console.log("Running initialization code");
  return "initialized";
}

## Mixed implicit and explicit (should work together)
/when @mixed => [
  @value = "implicit assignment"
  /var @explicit = "explicit assignment"  
  @process()
  /run @explicitRun()
]