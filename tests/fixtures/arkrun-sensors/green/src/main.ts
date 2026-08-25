import { createStrictArkKernel } from '@arkgate/runtime';

export const ark = createStrictArkKernel();

const declared = {
  uses: ['OrderService'],
  reactsTo: ['Domain.Order.Placed'],
  raises: ['Application.Billed'],
  sends: [],
};

ark.publisher('Application.Billed');
ark.subscribe('Domain.Order.Placed');
ark.resolve('OrderService');
void declared;
