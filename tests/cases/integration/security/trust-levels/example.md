# Trust Levels Tests

This tests different trust levels: always, verify, never.

/import trust always { trusted } from "./trusted.mld"
/import trust verify { unverified } from "./unverified.mld"
/import trust never { blocked } from "./blocked.mld"

/run trust always {echo "Always trusted command"}
/run trust verify {echo "Needs verification"}
/run trust never {echo "Never executed"}

/exe trust always @safeCommand() = {echo "Safe execution"}
/run @safeCommand()

/exe trust verify @checkCommand() = {echo "Check before run"}
/run @checkCommand()

/path trust always safePath = "./safe"
/show @safePath