import { BaseMeldNode, NodeMetadata, SourceLocation, VariableMetadata, VariableOrigin, VariableChange } from '@core/types/base';
import { JsonValue } from '@core/types/common';
import { VariableType } from '@core/types/variables';

export interface Variable extends BaseMeldNode {
  // Core fields (always present)
  type: 'Variable';
  name: string;
  valueType: VariableType;
  
  // Parsing fields (present during/after parsing)
  location?: SourceLocation;
  raw?: string;
  
  // Resolution phase fields
  resolvedValue?: JsonValue;
  dependencies?: string[];
  
  // Runtime phase fields
  value?: any;
  metadata?: VariableMetadata;
  origin?: VariableOrigin;
  history?: VariableChange[];
}

export interface VariableReference extends BaseMeldNode {
  type: 'VariableReference';
  identifier: string;
  valueType: VariableType;
  isVariableReference: true;
  
  // Optional runtime fields
  resolvedValue?: any;
  fields?: Field[];
  format?: string;
}

export interface Field {
  type: 'property' | 'index';
  raw: string;
  parsed: string | number;
  isQuoted?: boolean;
}

// Type guards for different stages
export function isParsedVariable(v: Variable): v is Variable & Required<Pick<Variable, 'location' | 'raw'>> {
  return v.location !== undefined && v.raw !== undefined;
}

export function isResolvedVariable(v: Variable): v is Variable & Required<Pick<Variable, 'resolvedValue'>> {
  return v.resolvedValue !== undefined;
}

export function isRuntimeVariable(v: Variable): v is Variable & Required<Pick<Variable, 'value' | 'metadata'>> {
  return v.value !== undefined && v.metadata !== undefined;
}