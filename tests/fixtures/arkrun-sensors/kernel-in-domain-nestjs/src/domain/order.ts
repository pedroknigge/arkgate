import { InjectArk, type ArkKernel } from 'arkgate/nestjs';

export const inject = InjectArk;
export type Kernel = ArkKernel;
