/var @user = "alice"

/var @tStartAtAt = `@@literal`
/var @tMiddleAtAt = `user@@example.com`
/var @tAfterVarAtAt = `@user@@domain`
/var @tStartSlash = `\@literal`
/var @tMiddleSlash = `user\@example.com`
/var @tAfterVarSlash = `@user\@domain`

/show @tStartAtAt
/show @tMiddleAtAt
/show @tAfterVarAtAt
/show @tStartSlash
/show @tMiddleSlash
/show @tAfterVarSlash

/var @cStartAtAt = run cmd { echo @@literal }
/var @cMiddleAtAt = run cmd { echo user@@example.com }
/var @cAfterVarAtAt = run cmd { echo @user@@domain }
/var @cStartSlash = run cmd { echo \@literal }
/var @cMiddleSlash = run cmd { echo user\@example.com }
/var @cAfterVarSlash = run cmd { echo @user\@domain }

/show @cStartAtAt
/show @cMiddleAtAt
/show @cAfterVarAtAt
/show @cStartSlash
/show @cMiddleSlash
/show @cAfterVarSlash
