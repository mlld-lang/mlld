# Trust Levels Tests

This tests different trust levels: always, verify, never.

@import trust always { trusted } from "./trusted.mld"
@import trust verify { unverified } from "./unverified.mld"
@import trust never { blocked } from "./blocked.mld"

@run trust always [echo "Always trusted command"]
@run trust verify [echo "Needs verification"]
@run trust never [echo "Never executed"]

@exec trust always safeCommand() = @run [echo "Safe execution"]
@run @safeCommand()

@exec trust verify checkCommand() = @run [echo "Check before run"]
@run @checkCommand()

@path trust always safePath = "./safe"
@add @safePath