# Use Case: Organizational Knowledge Synthesis

## The Challenge

Organizations have knowledge scattered across documents, wikis, Slack conversations, emails, and people's heads. How can we synthesize this into accessible, actionable intelligence?

## The Mlld Solution

```mld
@import { 
  searchSlack, 
  searchConfluence, 
  searchGithub,
  searchEmail 
} from @company/knowledge-sources

@import { synthesize, extractInsights, findPatterns } from @mlld/intelligence

# Define the research question
@text question = "How do we handle customer authentication across our services?"

# Gather knowledge from all sources
@data sources = [
  { name: "Slack", search: @searchSlack },
  { name: "Confluence", search: @searchConfluence },
  { name: "GitHub", search: @searchGithub },
  { name: "Email", search: @searchEmail }
]

@exec gatherKnowledge(source) = @run @source.search(@question, {
  timeframe: "last 2 years",
  relevanceThreshold: 0.7
})

@data knowledge = @map @gatherKnowledge(@sources)

# Synthesize into cohesive understanding
@text synthesis = @run @claude([[
  Synthesize this organizational knowledge about: {{question}}
  
  Sources:
  {{knowledge}}
  
  Create a comprehensive answer that:
  - Identifies current approaches
  - Highlights inconsistencies
  - Suggests best practices
  - Notes knowledge gaps
]]) with {
  pipeline: [
    @validateAgainstDocs,
    @checkForContradictions,
    @addImplementationDetails,
    @structureAsDecisionRecord
  ]
}

@add @synthesis
```

## Advanced: Living Knowledge Base

Create a self-updating knowledge system:

```mld
@import { topics, updateSchedule } from @company/knowledge-config

# Run this on schedule for each topic
@foreach topic in @topics {
  # Gather latest information
  @data latestInfo = @map @gatherKnowledge(@sources, @topic)
  
  # Compare with existing knowledge
  @text existingDoc = @path [knowledge-base/@topic.id.md]
  @data changes = @run @findChanges(@existingDoc, @latestInfo)
  
  @when @changes.hasSignificantUpdates {
    # Update the knowledge base
    @text updated = @run @synthesize(@existingDoc, @latestInfo) with {
      pipeline: [
        @preserveVerifiedInfo,
        @highlightChanges,
        @addTimestamps,
        @notifyExperts
      ]
    }
    
    @write { file: "knowledge-base/@topic.id.md", content: @updated }
    
    # Notify relevant teams
    @run @notifyTeams(@topic.subscribers, @changes.summary)
  }
}
```

## Pattern Recognition Across Organization

```mld
# Identify recurring issues or questions
@data conversations = @run @searchSlack("*", { 
  timeframe: "last 30 days",
  channels: ["#help", "#engineering", "#support"]
})

@text patterns = @run @claude([[
  Analyze these conversations for patterns:
  {{conversations}}
  
  Identify:
  - Recurring questions (FAQ candidates)
  - Common problems (documentation gaps)
  - Repeated solutions (automation opportunities)
  - Knowledge silos (cross-team communication needs)
]]) with {
  pipeline: [@categorizeByTeam, @prioritizeByFrequency, @suggestActions]
}

# Generate actionable insights
@foreach pattern in @patterns {
  @when @pattern.frequency > 5 {
    @text action = @run @generateAction(@pattern)
    @run @createJiraTicket(@action)
  }
}
```

## Expert Network Mapping

```mld
# Find who knows what in the organization
@data contributions = {
  code: @run @analyzeGitHistory(),
  docs: @run @analyzeConfluenceAuthors(),
  discussions: @run @analyzeSlackParticipants()
}

@text expertMap = @run @claude([[
  Create an expertise map from these contributions:
  {{contributions}}
  
  For each topic area:
  - Primary experts (most contributions)
  - Secondary experts (significant contributions)
  - Rising experts (recent increased activity)
]]) with {
  pipeline: [@validateExpertise, @addContactInfo, @formatAsDirectory]
}

# Auto-route questions to experts
@exec routeQuestion(question) = @run @claude([[
  Based on this expert map: {{expertMap}}
  Who should answer: {{question}}
  
  Return top 3 experts with reasoning.
]])
```

## Decision Intelligence System

```mld
# Capture decisions as they're made
@text recentDecisions = @run @extractDecisions(@sources, {
  keywords: ["decided", "going with", "chose", "will use"],
  confidence: 0.8
})

# Build decision history
@foreach decision in @recentDecisions {
  @text record = [[
# Decision: {{decision.title}}
Date: {{decision.date}}
Participants: {{decision.participants}}
Context: {{decision.context}}
Choice: {{decision.choice}}
Rationale: {{decision.rationale}}
Alternatives Considered: {{decision.alternatives}}
  ]]
  
  @write { 
    file: "decisions/@decision.date-@decision.id.md", 
    content: @record 
  }
}

# Learn from past decisions
@text analysis = @run @claude([[
  Analyze our decision history:
  {{decisions}}
  
  Identify:
  - Decision patterns
  - Success/failure correlations  
  - Common blind spots
  - Improvement opportunities
]]) with {
  pipeline: [@quantifyOutcomes, @identifyBiases, @suggestProcessImprovements]
}
```

## Benefits

1. **Unified Knowledge** - All sources synthesized into single truth
2. **Self-Updating** - Knowledge base stays current automatically
3. **Pattern Detection** - Spot trends and issues early
4. **Expert Location** - Know who knows what
5. **Decision Memory** - Learn from past choices

## Potential Applications

This knowledge synthesis approach could help organizations:
- Consolidate information from multiple sources
- Keep documentation up-to-date automatically
- Identify knowledge gaps and communication patterns
- Build expertise directories
- Create traceable decision records