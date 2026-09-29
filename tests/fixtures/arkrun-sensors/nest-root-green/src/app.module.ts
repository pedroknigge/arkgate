import { Module } from '@nestjs/common';
import { ArkModule } from 'arkgate/nestjs';

@Module({ imports: [ArkModule.forRoot()] })
export class AppModule {}
