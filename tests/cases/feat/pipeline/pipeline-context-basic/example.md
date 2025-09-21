# Pipeline Context Basic Access Test

/exe @testStage(input) = `@input at stage @pipeline.stage`

# Test basic pipeline context access
/var @result = "data"|@testStage

/show @result