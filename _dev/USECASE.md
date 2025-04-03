
Committee facilitates a structured, iterative process for designing through simulated multi-stakeholder feedback.

We are using the specific case of the Mlld type specification design process, but once we complete this use case, this could be used to manage any multi-phase design process. That said, this is just a prototype built _specifically_ to facilitate the mlld type spec design process needs, so while we want to keep things abstract, those needs will come first if it becomes easier to handle a problem or set of functionality based on this use case.

The system is intended to automate collection and synthesis of service-specific requirements, creates design specifications, gathers feedback, and produces refined type definitions.

Key objectives:
- Automate the collection and synthesis of type requirements across multiple services
- Enforce architectural consistency through structured review processes
- Generate high-quality type specifications through iterative refinement
- Enable human review at critical decision points
- Produce a cohesive type system with clear migration paths
- Create detailed implementation plans tailored to each service

tl;dr:
- Surgically compose contexts 
- Create LLM prompt templates
- Coordinate sending those in parallel

In order to enable rapid highly technically informed evolution of complex codebases, we want to engage in multiple rounds of:

- collection of narrow-scoped expertise (driven by surgically assembled context)
- synthesis of the analyses and creation of plan by high level experts
- further review of the big-picture plan by narrow scoped experts
- further synthesis

Example:
- A large codebase is refactoring the types and interfaces handled by services
- Establish expert "dev team leads" for each service (established by providing LLMs a framing prompt, docs, and relevant code)
- Establish architect role in a similar manner but focused on the high level system design and architecture and pragmatic interest in balancing needs of all parts of the system without overserving one aspect, overcomplicating the goals, 
- Architect reviese input from dev team leads and creates a draft spec, noting the contributions from various dev team leads and how the solution balances the needs / requests
- Draft spec is reviewed by dev team leads, who provide feedback in the context of understanding how their input has shaped the bigger picture as well as how others' input has shaped it
- Architect reviews input and finalizes spec
- Dev team leads are given the spec and asked for plans to implement changes
- Architect reviews all plans and creates a coordinated development roadmap