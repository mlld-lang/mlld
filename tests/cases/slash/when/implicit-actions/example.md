# Implicit When Actions Test

Test implicit actions within `/when` blocks - simplified syntax without directive prefixes.

## Function calls
/when @initialized => @setupDatabase()
/when @ready => @startServer(8080)

## Function calls (continued)
/when @processing => @transform(@input)
/when @configured => @getConfig(@environment)

## Multi-line content
/when @showBanner => :: 
Welcome to the application!
Version: @version
::

/when @runCode => js {
  console.log("Running initialization code");
  return "initialized";
}
