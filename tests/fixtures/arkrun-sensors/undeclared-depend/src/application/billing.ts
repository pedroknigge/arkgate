import { createStrictArkKernel } from '@arkgate/runtime';
const ark = createStrictArkKernel();
ark.resolve('OrderService');
export { ark };
