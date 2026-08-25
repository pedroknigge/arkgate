import { createStrictArkKernel } from '@arkgate/runtime';
const ark = createStrictArkKernel();
ark.publisher('Domain.Order.Placed');
export { ark };
