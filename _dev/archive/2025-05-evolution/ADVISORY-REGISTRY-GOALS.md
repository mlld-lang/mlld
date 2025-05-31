# Advisory Registry Goals & Principles

## Vision

Create a sustainable, community-driven security advisory system for the LLM tooling ecosystem that scales from zero resources to global impact.

## Core Goals

### 1. Real Security Impact
- Identify and document actual vulnerabilities that could harm users
- Prioritize findings by real-world exploitability and impact
- Focus on actionable advisories that lead to fixes

### 2. Open Source Security Model
- All advisories publicly accessible (like Node Security Project → npm audit)
- Transparent process for submission, review, and publication
- Community ownership of security knowledge
- No gatekeeping of critical security information

### 3. Sustainable Scaling
- Must work with minimal resources at launch
- Design for growth without fundamental restructuring
- Incentive model that grows with ecosystem adoption
- Self-reinforcing quality as participation increases

### 4. Ecosystem Coverage
- Comprehensive review of mlld modules
- MCP server security assessments
- Future: Any LLM-integrated tool or framework
- Cross-tool advisory applicability

### 5. Defensible Value Creation
- Build competitive moat through community and quality
- Create value that can't be trivially copied
- Protect contributor efforts from exploitation
- Enable sustainable business model without compromising openness
- Maintain incentive alignment between contributors and registry

## Guiding Principles

### 1. Fairness to Contributors
- Clear, objective criteria for contribution value
- Transparent reward/recognition distribution
- No favoritism or insider advantage
- Equal opportunity for new researchers
- Recognition scales with impact, not relationships

### 2. Quality Over Quantity
- Reward depth of analysis over volume
- Incentivize thorough vulnerability research
- Discourage low-effort, high-volume submissions
- Value novel attack vectors and systemic issues

### 3. Simplicity in Design
- Easy to understand participation rules
- Clear submission and review process
- Minimal bureaucracy
- Fast turnaround from submission to decision
- Simple criteria for advisory severity/impact

### 4. Community Trust
- Independent verification of findings
- Public accountability for decisions
- Appeals process for disputes
- Consistent application of standards
- Protection for good-faith researchers

### 5. Collaborative Competition
- Researchers compete for rewards but share knowledge
- Findings benefit entire ecosystem
- Encourage building on others' work
- Reward both finders and fixers

## Challenges & Constraints

### 1. Human Verification Requirements
- Cannot rely solely on automated scanning
- Need skilled reviewers to validate findings
- Must verify exploitability claims
- Reproducibility of vulnerabilities

### 2. Independent Judging
- Avoid conflicts of interest
- Need trusted, knowledgeable judges
- Scaling judging capacity with submissions
- Maintaining consistency across judges
- Handling appeals and disputes

### 3. Information Processing
- Avoiding researcher overwhelm with too many targets
- Preventing duplicate work/submissions
- Efficient triage of incoming reports
- Clear communication of what's in/out of scope
- Managing advisory updates and lifecycle

### 4. Quality Control
- Preventing gaming of the system
- Avoiding security theater submissions
- Maintaining high signal-to-noise ratio
- Dealing with edge cases and gray areas
- Evolving standards as ecosystem matures

### 5. Resource Constraints
- Must function with zero budget initially
- Cannot depend on single funding source
- Need to attract talent without guaranteed rewards
- Building reputation before monetary incentives
- Bootstrapping trust and participation

### 6. Ecosystem Dynamics
- Rapid evolution of LLM tools and capabilities
- New attack vectors emerging regularly
- Varying security maturity across projects
- Different risk tolerances among users
- Coordination with upstream projects

### 7. Intellectual Property & Competitive Moat
- Preventing wholesale copying by commercial competitors (e.g., Snyk scenario)
- Protecting contributor work from unauthorized commercialization
- Maintaining open access while preventing competitive exploitation
- Balancing public good with sustainability needs
- Attribution and ownership complexity with many contributors
- Legal framework that scales globally
- Enforcement challenges with limited resources

## Success Metrics

### Impact Metrics
- Number of vulnerabilities fixed
- Severity of issues discovered
- Time from discovery to fix
- Adoption of advisories by tools

### Participation Metrics
- Active researcher count
- Submission quality trends
- Geographic/demographic diversity
- Retention of top contributors

### Ecosystem Metrics
- Coverage of popular modules/servers
- Cross-tool advisory applicability
- Industry adoption of registry
- Security posture improvement over time

## Non-Negotiables

1. **Public Good**: Advisories must remain freely accessible
2. **Researcher Safety**: Legal protection for good-faith research
3. **Vendor Coordination**: Responsible disclosure processes
4. **Quality Standards**: No compromise on advisory accuracy
5. **Community Governance**: Decisions made transparently
6. **Contributor Rights**: Researchers retain rights to their work

## Design Constraints

1. **Start Small**: Must be launchable by small team
2. **Technology Agnostic**: Work across different LLM tools
3. **Legally Sound**: Comply with security research laws
4. **Globally Accessible**: No geographic restrictions
5. **Future-Proof**: Adaptable to new threat models

## Questions for Model Design

When evaluating any incentive model, it should answer:

1. How does it maintain quality at scale?
2. What prevents gaming or exploitation?
3. How does it handle disputes fairly?
4. Can it survive funding changes?
5. Does it encourage the right behaviors?
6. How does it build on existing communities?
7. What makes researchers choose this over alternatives?
8. How does it create lasting value?
9. How does it protect against competitive copying?
10. What legal structure protects contributors and the registry?
11. How does licensing enable openness while preventing abuse?
12. Can contributors benefit from their work beyond the registry?

---

*This document defines the goals and principles for the advisory registry. Specific implementation models (bounties, competitions, equity, revenue sharing, etc.) should be evaluated against these criteria.*