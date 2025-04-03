interface BaseEmbedDirective {
    // Common properties for all embed types
    type: 'EmbedDirective';
    subtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
    
    // Location info needed for transformation tracking
    location: {
      start: { line: number; column: number; };
      end: { line: number; column: number; };
      source?: string;
    };
    
    // State management properties
    stateInfo: {
      createsChildState: boolean;
      inheritVariables: boolean;
      parentStateId?: string;
    };
    
    // Transformation tracking
    transformationInfo: {
      isTransformed: boolean;
      originalNodeId?: string;
      transformedContent?: string;
    };
  }
  
  // Specific embed types extend the base
  interface EmbedPathDirective extends BaseEmbedDirective {
    subtype: 'embedPath';
    path: string;
    resolvedPath?: string;
  }
  
  interface EmbedVariableDirective extends BaseEmbedDirective {
    subtype: 'embedVariable';
    variable: {
      name: string;
      fieldPath?: string;
      valueType: 'text' | 'data';
    };
  }
  
  interface EmbedTemplateDirective extends BaseEmbedDirective {
    subtype: 'embedTemplate';
    template: string;
    variableReferences: string[];
  }