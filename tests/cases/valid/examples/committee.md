# Service Analysis Workflow in mlld
# This demonstrates how mlld with @when and foreach can replace complex YAML workflows

## Load Architecture Files
@path architectureDoc = [docs/ARCHITECTURE.md]
@path authConfigDoc = [docs/AUTH-CONFIG.md]
@text overallArchitecture = @path [docs/ARCHITECTURE.md]

## Define Services
@data services = {
  "auth": {
    "description": "Authentication and Authorization Service",
    "path": "services/auth",
    "config": "services/auth/config.yaml"
  },
  "payment": {
    "description": "Payment Processing Service", 
    "path": "services/payment",
    "config": "services/payment/config.yaml"
  },
  "user": {
    "description": "User Management Service",
    "path": "services/user", 
    "config": "services/user/config.yaml"
  }
}

## Service Health Checks
@exec service_healthy(name) = @run [(
  curl -s "http://localhost:8080/{{name}}/health" | grep -q "ok" && echo "true"
)]

@exec all_services_healthy() = @run [(
  # Check if all services return healthy
  healthy=true
  for service in auth payment user; do
    if ! curl -s "http://localhost:8080/$service/health" | grep -q "ok"; then
      healthy=false
      break
    fi
  done
  echo "$healthy"
)]

## Conditional Analysis Based on Health
@when @all_services_healthy() => @add "✅ All services healthy - proceeding with analysis"

## Analyze Each Service
@text serviceAnalysisPrompt = [[
Analyze the {{serviceName}} service:
- Description: {{serviceDescription}}
- Configuration: {{serviceConfig}}

In the context of our overall architecture:
{{overallArchitecture}}

Please provide:
1. Security assessment
2. Performance considerations
3. Integration points
4. Recommendations
]]

## Generate Analysis for Each Service
@when all: [
  foreach @analyze_service(@services)
]

@exec analyze_service(service) = @run [(
  echo "=== Analysis for {{service.name}} ==="
  echo "{{serviceAnalysisPrompt}}" | llm --model gpt-4
)]

## Conditional Deployment
@exec is_production() = @run [(test "$ENVIRONMENT" = "production" && echo "true")]
@exec tests_passing() = @run [(npm test 2>/dev/null && echo "true")]
@exec approved_for_deploy() = @run [(test -f .deploy-approved && echo "true")]

@when all: [
  @is_production()
  @tests_passing()
  @approved_for_deploy()
] => @run [(npm run deploy)]

## Generate Summary Report
@text summaryTemplate = [[
# Service Analysis Summary

Generated: {{TIME}}
Environment: {{env}}

## Services Analyzed:
foreach @services as service:
- **{{service.name}}**: {{service.description}}
  - Path: `{{service.path}}`
  - Config: `{{service.config}}`
endforeach

## Health Status:
@when @all_services_healthy() => @add "All services operational ✅"
@when any: [
  foreach @not_healthy(@services)
] => @add "⚠️ Some services require attention"

## Next Steps:
@when @is_production() => @add "- Monitor production metrics"
@when first: [
  @tests_passing() => @add "- Ready for deployment"
  @run [(echo "true")] => @add "- Fix failing tests before deployment"
]
]]

@add @summaryTemplate