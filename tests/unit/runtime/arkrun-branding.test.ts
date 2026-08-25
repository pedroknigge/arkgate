import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as runtime from '../../../src/index';
import * as gate from '../../../src/gate';

const root = process.cwd();

describe('RN09 ArkRun companion branding', () => {
  it('brands ArkRun on @arkgate/runtime README and keeps createStrictArkKernel as the factory', () => {
    const readme = fs.readFileSync(path.join(root, 'packages/runtime/README.md'), 'utf8');
    expect(readme).toMatch(/\*\*ArkRun\*\*/);
    expect(readme).toContain("import { createStrictArkKernel } from '@arkgate/runtime'");
    expect(readme).toMatch(/isolated instance/);
    expect(readme).toMatch(/no process-wide `getKernel\(\)` singleton/);
    expect(readme).toContain('getDependencyInformationPackage()');
    expect(readme).toMatch(/uses.*reactsTo.*raises.*sends/s);
    expect(readme).toMatch(/does not bundle this kernel/);
    expect(readme).toMatch(/not\*\* production durability/);
  });

  it('labels the companion package as the ArkRun kernel', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'packages/runtime/package.json'), 'utf8')
    ) as { name: string; description: string; version: string; publishConfig: { tag: string } };
    expect(pkg.name).toBe('@arkgate/runtime');
    expect(pkg.description).toMatch(/ArkRun/);
    expect(pkg.version).toMatch(/^0\./);
    expect(pkg.publishConfig.tag).toBe('experimental');
  });

  it('exports createStrictArkKernel from the kernel barrel and not from the gate root', () => {
    expect(typeof runtime.createStrictArkKernel).toBe('function');
    expect((runtime as { getKernel?: unknown }).getKernel).toBeUndefined();
    expect((gate as { createStrictArkKernel?: unknown }).createStrictArkKernel).toBeUndefined();
    expect((gate as { getKernel?: unknown }).getKernel).toBeUndefined();
  });
});
