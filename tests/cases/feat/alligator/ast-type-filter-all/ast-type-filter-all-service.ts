export const VERSION = '1.0.0';

export interface IService {
  run(): void;
}

export class Service {
  run() {}
}

export function helper() {
  return 'help';
}

export enum Status {
  Active
}

export type Id = string;
