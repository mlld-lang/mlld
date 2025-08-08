// UNIFIED QUOTE AND TEMPLATE ADAPTER
// Compatibility layer that replaces TemplateStyleInterpolation
// Returns the same structure: { content: [...], wrapperType: '...' }

/* 
# Purpose

This file provides a unified pattern that replaces TemplateStyleInterpolation,
handling both quotes AND templates in one place for RHS contexts.

This is a transitional pattern - eventually we'll separate quotes and templates
more cleanly, but for now this maintains backward compatibility.
*/

// -------------------------------------------------------------
// MAIN COMPATIBILITY PATTERN
// -------------------------------------------------------------

// Direct replacement for TemplateStyleInterpolation
UnifiedQuoteOrTemplate "Unified quote or template pattern"
  = template:UnifiedTemplate {
      // UnifiedTemplate already returns { content, wrapperType, interpolationType }
      helpers.debug('UnifiedQuoteOrTemplate matched UnifiedTemplate', { template });
      return template;
    }
  / quote:UnifiedQuote {
      // UnifiedQuote already returns { content, wrapperType, hasInterpolation }
      // Just pass it through, it's already in the right format
      helpers.debug('UnifiedQuoteOrTemplate matched UnifiedQuote', { quote });
      return quote;
    }

// Direct alias - TemplateStyleInterpolation now points to UnifiedQuoteOrTemplate
TemplateStyleInterpolation = UnifiedQuoteOrTemplate