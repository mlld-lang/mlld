import { TextAssignment1DirectiveNode } from './text-assignment1';
import { TextTemplate1DirectiveNode } from './text-template1';
import { TextTemplate2DirectiveNode } from './text-template2';
import { TextTemplateMultiline1DirectiveNode } from './text-template-multiline1';
import { TextTemplateMultiline2DirectiveNode } from './text-template-multiline2';


/**
 * Union type for all text directive nodes
 */
export type TextDirectiveNode = 
  | TextAssignment1DirectiveNode
  | TextTemplate1DirectiveNode
  | TextTemplate2DirectiveNode
  | TextTemplateMultiline1DirectiveNode
  | TextTemplateMultiline2DirectiveNode
