/var @testResults = {
suites: [
    run {echo "unit: passed"},
    run {echo "integration: passed"},
    run {echo "e2e: passed"}
  ],
count: 3
}
/show [[Test Results:
{{testResults.suites[0]}}
{{testResults.suites[1]}}
{{testResults.suites[2]}}
Total: {{testResults.count}} suites]]