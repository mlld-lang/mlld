/exe @helper() = js { return "I am helper"; }
/exe @user() = js { return helper() + " and I work"; }
/exe @js = { helper, user }
/var @result = @user()
/show @result
