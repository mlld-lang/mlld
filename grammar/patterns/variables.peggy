// VARIABLE ACCESS PATTERNS - NOW USES UNIFIED CORE DIRECTLY
// This file defines patterns for variable references, NOT variable creation.
// - @var for direct references (in paths, commands, bracket contexts)
// - {{var}} for interpolation in templates (double brackets)

/* Import context predicates for @ disambiguation */

// Variable types - the root rule used by other directives (now uses unified core directly)
Variable = UnifiedVariable

// All variable patterns now handled by unified core directly
SpecialVariable = UnifiedSpecialVariable
SpecialVariableName = UnifiedSpecialVariableName
AtVar = UnifiedAtVar
InterpolationVar = UnifiedInterpolationVar
InterpolationSpecialVar = UnifiedInterpolationSpecialVar
InterpolationSimpleVar = UnifiedInterpolationSimpleVar
InterpolationDataVar = UnifiedInterpolationDataVar
VarFormat = UnifiedVarFormat
FrontmatterAccess = UnifiedFrontmatterAccess
VariableReferenceWithTail = UnifiedVariableReferenceWithTail
VariableWithPipes = UnifiedVariableWithPipes
TemplateVariableReference = UnifiedTemplateVariableReference
