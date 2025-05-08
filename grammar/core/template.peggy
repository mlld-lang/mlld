// TEMPLATE CORE
// Core content handler for template-based content with variable interpolation

/* 
# Template Content Core

This file provides core template content handling that can be used by:
- @text directive (primary variable definition through templates)
- Potentially @add if a template variant is added

Templates can contain:
- Plain text
- Variable interpolation with {{var}}
- Formatting patterns for variables
*/


// -------------------------------------------------------------
// TEMPLATE CORE - Standard template with interpolation
// -------------------------------------------------------------

TemplateCore
  = template:WrappedTemplateContent {
      helpers.debug('TemplateCore matched template', { template });
    
      // Structure for outputting a template
      return {
        type: 'template',
        subtype: 'standardTemplate',
        values: { 
          content: template.parts 
        },
        raw: { 
          content: template.raw 
        },
        meta: {
          hasVariables: template.parts.some(part => 
            part && part.type === NodeType.VariableReference
          )
        }
      };
    }

// -------------------------------------------------------------
// RICH TEMPLATE CORE - Template with additional formatting options
// -------------------------------------------------------------

RichTemplateCore
  = template:WrappedTemplateContent options:TemplateOptions? {
      helpers.debug('RichTemplateCore matched rich template', { template, options });
    
      // Structure for outputting a rich template with options
      return {
        type: 'template',
        subtype: 'richTemplate',
        values: { 
          content: template.parts,
          ...(options ? { options } : {})
        },
        raw: { 
          content: template.raw,
          ...(options ? { options: options.raw } : {})
        },
        meta: {
          hasVariables: template.parts.some(part => 
            part && part.type === NodeType.VariableReference
          ),
          hasOptions: !!options
        }
      };
    }

// -------------------------------------------------------------
// TEMPLATE OPTIONS - Optional settings for templates
// -------------------------------------------------------------

TemplateOptions
  = ":" _ options:TemplateOptionsList {
      return options;
    }

TemplateOptionsList
  = first:TemplateOption rest:(_ "," _ option:TemplateOption { return option; })* {
      const allOptions = [first, ...rest];
      const optionsObj = allOptions.reduce((acc, opt) => {
        acc[opt.key] = opt.value;
        return acc;
      }, {});
      
      return {
        options: optionsObj,
        raw: allOptions.map(opt => `${opt.key}=${opt.value}`).join(',')
      };
    }

TemplateOption
  = key:BaseIdentifier _ "=" _ value:StringLiteral {
      return { key, value };
    }