import type { Environment } from '@interpreter/env/Environment';
import { MlldInterpreterError } from '@core/errors';
import { isValidProjectName } from '@core/utils/project-name';

export function enforceKeychainAccess(env: Environment): void {
  const projectName = env.getProjectConfig()?.getProjectName();
  if (!projectName || !isValidProjectName(projectName)) {
    throw new MlldInterpreterError(
      'Keychain access requires projectname in mlld-config.json. Run mlld init or add projectname: "value" to mlld-config.json.',
      { code: 'PROJECT_NAME_REQUIRED' }
    );
  }

}
