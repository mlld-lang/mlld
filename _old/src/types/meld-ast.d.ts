declare module 'meld-ast' {
  export interface DirectiveNode {
    kind: string;
    data: any;
  }

  export function parse(content: string): any[];
  export function parseMeldContent(content: string): any[];
} 