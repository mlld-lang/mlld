/var @testResult = { passed: true, output: "ok" }
/var @verifyResult = { status: @testResult.passed ? "pass" : "fail", output: @testResult.output }
/show `Verify: @verifyResult.status`
/show @verifyResult
