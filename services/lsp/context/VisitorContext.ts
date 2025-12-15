export interface VisitorContext {
  templateType?: 'backtick' | 'doubleColon' | 'tripleColon' | null;
  inCommand?: boolean;
  commandLanguage?: string;
  interpolationAllowed?: boolean;
  variableStyle?: '@var' | '{{var}}';
  inSingleQuotes?: boolean;
  wrapperType?: 'doubleQuote' | 'singleQuote' | 'backtick' | 'doubleColon' | 'tripleColon';
}

export class ContextStack {
  private stack: VisitorContext[] = [{}];
  
  get current(): VisitorContext {
    return this.stack[this.stack.length - 1];
  }
  
  push(context: Partial<VisitorContext>): void {
    this.stack.push({
      ...this.current,
      ...context
    });
  }
  
  pop(): void {
    if (this.stack.length > 1) {
      this.stack.pop();
    }
  }
  
  clear(): void {
    this.stack = [{}];
  }
}