import { createStrictArkKernel } from '@arkgate/runtime';
const ark = createStrictArkKernel();
ark.subscribe('Domain.Order.Placed');
export { ark };
