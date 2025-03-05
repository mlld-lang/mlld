# REQUIRED READING:

=== KEY DOCS ====================
---------------------------------

@import[../docs/ARCHITECTURE.md]

@import[../docs/PIPELINE.md]

@import[../docs/STATEVIS.md]

=================================
=== EXISTING TEST/DEBUG TOOLS ===
Focus:
- Explore StateTrackingService, StateHistoryService, and StateVisualizationService implementations
- Understand current debug capabilities and interfaces
---------------------------------

@cmd[cpai ../tests/utils/debug --stdout]

=================================
=== ResolutionService ===========
Focus on:
- Review variable resolution implementation
- Identify key points for instrumentation
---------------------------------

=================================
=== DirectiveService handlers ===
Focus on:
- Examine ImportDirectiveHandler and EmbedDirectiveHandler
- Understand context boundary creation
---------------------------------

@cmd[cpai ../services/pipeline/DirectiveService/handlers/ --sdtout]

=================================
=== InterpreterService ==========
Focus on:
- Review node transformation logic
- Identify transformation tracking points
---------------------------------

@cmd[cpai ../services/pipeline/InterpreterService/ --stdout]

=================================