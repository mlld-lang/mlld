
// Load the fix
const fix = require('/Users/adam/dev/meld/_issues/VariableReferenceResolverFix.js');

// Monkey patch the VariableReferenceResolver
const originalRequire = require;
require = function(id) {
  const result = originalRequire(id);
  
  // Check if the module is the one we want to patch
  if (id.includes('VariableReferenceResolver') || 
      (result && result.VariableReferenceResolver)) {
    console.log('[MonkeyPatch] Patching VariableReferenceResolver');
    
    // If the module exports VariableReferenceResolver directly
    if (result.VariableReferenceResolver) {
      const originalResolveVariable = result.VariableReferenceResolver.prototype.resolveVariable;
      result.VariableReferenceResolver.prototype.resolveVariable = function(varRef, context) {
        console.log('[MonkeyPatch] Using patched resolveVariable for:', varRef);
        return fix.resolveVariable(varRef, context);
      };
    }
    
    // If the module is VariableReferenceResolver itself
    if (result.prototype && result.prototype.resolveVariable) {
      const originalResolveVariable = result.prototype.resolveVariable;
      result.prototype.resolveVariable = function(varRef, context) {
        console.log('[MonkeyPatch] Using patched resolveVariable for:', varRef);
        return fix.resolveVariable(varRef, context);
      };
    }
  }
  
  return result;
};

// Now run the original Meld script
require('../../scripts/process-meld');
