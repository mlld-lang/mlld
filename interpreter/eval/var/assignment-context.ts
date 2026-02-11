import { astLocationToSourceLocation } from '@core/types';
import type { DirectiveNode, SourceLocation, VariableNodeArray } from '@core/types';
import { makeSecurityDescriptor, type CapabilityKind, type DataLabel, type SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';

export interface VarOperationMetadata {
  kind: 'var';
  identifier: string;
  location: DirectiveNode['location'];
}

export interface VarAssignmentContext {
  identifier: string;
  baseDescriptor: SecurityDescriptor;
  securityLabels: DataLabel[] | undefined;
  capabilityKind: CapabilityKind;
  operationMetadata: VarOperationMetadata;
  sourceLocation: SourceLocation | undefined;
}

function extractVarIdentifier(directive: DirectiveNode): string {
  const identifierNodes = directive.values?.identifier as VariableNodeArray | undefined;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Var directive missing identifier');
  }

  const identifierNode = identifierNodes[0];
  if (!identifierNode || typeof identifierNode !== 'object' || !('identifier' in identifierNode)) {
    throw new Error('Invalid identifier node structure');
  }

  const identifier = identifierNode.identifier;
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Var directive identifier must be a simple variable name');
  }

  return identifier;
}

function resolveSecurityLabels(directive: DirectiveNode): DataLabel[] | undefined {
  return (directive.meta?.securityLabels ?? directive.values?.securityLabels) as
    | DataLabel[]
    | undefined;
}

function createBaseDescriptor(securityLabels: DataLabel[] | undefined): SecurityDescriptor {
  return makeSecurityDescriptor({ labels: securityLabels });
}

export function createVarAssignmentContext(
  directive: DirectiveNode,
  env: Environment
): VarAssignmentContext {
  const identifier = extractVarIdentifier(directive);
  const capabilityKind = directive.kind as CapabilityKind;
  const securityLabels = resolveSecurityLabels(directive);
  const baseDescriptor = createBaseDescriptor(securityLabels);
  const operationMetadata: VarOperationMetadata = {
    kind: 'var',
    identifier,
    location: directive.location
  };
  const sourceLocation = astLocationToSourceLocation(directive.location, env.getCurrentFilePath());

  return {
    identifier,
    baseDescriptor,
    securityLabels,
    capabilityKind,
    operationMetadata,
    sourceLocation
  };
}
