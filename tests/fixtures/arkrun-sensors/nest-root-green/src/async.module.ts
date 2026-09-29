import { Module } from '@nestjs/common';
import { ArkModule as Ark } from 'arkgate/nestjs';

@Module({
  imports: [Ark.forRootAsync({ useFactory: (kernel: never) => kernel, inject: ['KERNEL'] })],
})
export class AsyncAppModule {}
