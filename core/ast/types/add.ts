import { TextAssignment2DirectiveNode } from './text-assignment2';
import { TextTemplate3DirectiveNode } from './text-template3';
import { TextTemplateMultiline3DirectiveNode } from './text-template-multiline3';


/**
 * Union type for all add directive nodes
 */
export type AddDirectiveNode = 
  | TextAssignment2DirectiveNode
  | TextTemplate3DirectiveNode
  | TextTemplateMultiline3DirectiveNode
