/**
 * NestJS adapter for ArkGate.
 *
 * ```ts
 * import { ArkModule, InjectArk } from 'arkgate/nestjs';
 * import type { ArkKernel } from 'arkgate/runtime';
 *
 * @Module({ imports: [ArkModule.forRoot()] })
 * export class AppModule {}
 *
 * @Injectable()
 * export class PlaceOrderService {
 *   constructor(@InjectArk() private readonly ark: ArkKernel) {}
 * }
 * ```
 *
 * `@nestjs/common` is an optional peer dependency: this entry point is only
 * loaded when you import `arkgate/nestjs`.
 */
import { Inject, Module } from '@nestjs/common';
import type {
  DynamicModule,
  InjectionToken,
  OptionalFactoryDependency,
} from '@nestjs/common';
import { createArkKernel } from '../kernel/runtime/createArkKernel';
import type { ArkKernel } from '../kernel/runtime/types';
import type { CreateArkKernelOptions } from '../kernel/runtime/types';

/** Injection token for the Ark kernel instance. */
export const ARK_KERNEL = Symbol('ARK_KERNEL');

/** Constructor-parameter decorator that injects the Ark kernel. */
export const InjectArk = (): ParameterDecorator => Inject(ARK_KERNEL);

export interface ArkModuleAsyncOptions {
  /** Factory that builds (or resolves) the kernel; supports Nest DI via `inject`. */
  useFactory: (...deps: never[]) => ArkKernel | Promise<ArkKernel>;
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
}

@Module({})
export class ArkModule {
  /**
   * Registers a global Ark kernel. Pass an existing kernel to share one across
   * processes/tests, or options to create a fresh strict kernel.
   */
  static forRoot(kernelOrOptions?: ArkKernel | CreateArkKernelOptions): DynamicModule {
    const kernel =
      kernelOrOptions && 'registry' in kernelOrOptions
        ? kernelOrOptions
        : createArkKernel(kernelOrOptions);
    return {
      module: ArkModule,
      global: true,
      providers: [{ provide: ARK_KERNEL, useValue: kernel }],
      exports: [ARK_KERNEL],
    };
  }

  static forRootAsync(options: ArkModuleAsyncOptions): DynamicModule {
    return {
      module: ArkModule,
      global: true,
      providers: [
        {
          provide: ARK_KERNEL,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
      ],
      exports: [ARK_KERNEL],
    };
  }
}

export type { ArkKernel, CreateArkKernelOptions };
