# Use Case: Automated Code Review Pipeline

## The Challenge

Code reviews are critical but time-consuming. Human reviewers might miss security issues, overlook performance problems, or apply standards inconsistently. How can we augment human review with AI while maintaining quality and team standards?

## The Mlld Solution

```mld
@import { 
  securityPatterns, 
  performanceAntipatterns,
  styleGuide 
} from @company/engineering-standards

@import { 
  findVulnerabilities,
  suggestOptimizations,
  checkNamingConventions 
} from @mlld/code-analysis

# Get the PR diff
@text diff = @run [(gh pr diff)]
@text files = @run [(gh pr view --json files -q '.files[].path' | tr '\n' ' ')]

# Define specialized reviewers
@exec securityReview(code) = @run @claude([[
  You are a security expert. Review this code for vulnerabilities.
  
  Known patterns to check:
  {{securityPatterns}}
  
  Code to review:
  {{code}}
]])

@exec performanceReview(code) = @run @claude([[
  You are a performance engineer. Review this code for efficiency.
  
  Known antipatterns:
  {{performanceAntipatterns}}
  
  Code to review:
  {{code}}
]])

@exec styleReview(code) = @run @claude([[
  Check this code against our style guide.
  
  Style guide:
  {{styleGuide}}
  
  Code to review:
  {{code}}
]])

# Run reviews in parallel
@data reviews = @map @reviewer(@reviewTypes) where:
  @data reviewTypes = [
    { name: "Security", fn: @securityReview },
    { name: "Performance", fn: @performanceReview },
    { name: "Style", fn: @styleReview }
  ]
  @exec reviewer(type) = @run @type.fn(@diff)

# Synthesize into actionable feedback
@text synthesis = @run @claude([[
  Synthesize these code reviews into a helpful PR comment:
  {{reviews}}
  
  Format as:
  - Must fix (blocking issues)
  - Should fix (important but not blocking)  
  - Consider (nice to have)
  
  Be constructive and specific. Include code snippets for fixes.
]]) with {
  pipeline: [
    @validateAllIssuesAddressed,
    @ensureConstructiveTone,
    @addCodeExamples
  ]
}

# Post to PR
@run [(gh pr comment --body @synthesis)]

# Also generate a summary for the team dashboard
@text summary = @run @claude([[
  Summarize the key findings in 2-3 sentences for the team dashboard:
  {{synthesis}}
]])

@add [[## Automated Review Complete

{{summary}}

Full review posted to PR.]]
```

## Key Benefits

1. **Consistent Standards** - Every PR gets the same thorough review
2. **Parallel Analysis** - Multiple perspectives analyzed simultaneously  
3. **Institutional Knowledge** - Company patterns encoded in modules
4. **Human-Friendly Output** - Synthesized into actionable feedback
5. **Audit Trail** - All reviews versioned and trackable

## Extending the Pipeline

Teams can add their own review stages:

```mld
@import { checkAccessibility } from @ui/standards
@import { validateAPIDesign } from @backend/standards
@import { reviewDatabaseQueries } from @data/standards

# Add domain-specific reviews
@data domainReviews = @when {
  @hasUIChanges => @checkAccessibility(@diff)
  @hasAPIChanges => @validateAPIDesign(@diff)
  @hasSQLChanges => @reviewDatabaseQueries(@diff)
}
```

## Integration Points

- **CI/CD Pipeline** - Run on every PR automatically
- **Git Hooks** - Pre-commit reviews for immediate feedback
- **IDE Integration** - Real-time review as you code
- **Slack/Teams** - Summary notifications for team awareness

## Measuring Success

Track metrics through the pipeline:

```mld
@import { trackMetrics } from @company/analytics

@run @trackMetrics({
  event: "code_review_completed",
  properties: {
    issuesFound: @synthesis.issues.length,
    reviewTime: @endTime - @startTime,
    prSize: @diff.lines,
    reviewTypes: @reviewTypes.length
  }
})
```

## Potential Benefits

This automated review approach could help teams:
- Apply coding standards more consistently
- Catch security and performance issues earlier
- Reduce time spent on routine review tasks
- Ensure all PRs receive thorough review
- Build institutional knowledge into the review process