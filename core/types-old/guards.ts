import type { 
  MeldVariable, 
  TextVariable, 
  DataVariable, 
  IPathVariable, 
  CommandVariable, 
  IFilesystemPathState 
} from './variables';
import { VariableType } from './index'; // Assuming VariableType is exported from index

export const isTextVariable = (variable: MeldVariable | undefined): variable is TextVariable =>
  variable?.type === VariableType.TEXT;

export const isDataVariable = (variable: MeldVariable | undefined): variable is DataVariable =>
  variable?.type === VariableType.DATA;

export const isPathVariable = (variable: MeldVariable | undefined): variable is IPathVariable =>
  variable?.type === VariableType.PATH;

export const isCommandVariable = (variable: MeldVariable | undefined): variable is CommandVariable =>
  variable?.type === VariableType.COMMAND;
  
// Note: isFilesystemPath checks the *value* type within a path variable
export const isFilesystemPath = (variable: IPathVariable | undefined): variable is IPathVariable & { value: IFilesystemPathState } =>
  variable?.type === VariableType.PATH && 
  variable.value?.contentType === 'filesystem'; // Assuming contentType property exists based on spec 