import { Injectable } from '@nestjs/common';
import { InjectArk, type ArkKernel } from 'arkgate/nestjs';

export const placeOrderDeclaration = {
  uses: [],
  reactsTo: [],
  raises: [],
  sends: ['Domain.Order.Placed'],
};

@Injectable()
export class PlaceOrderService {
  constructor(@InjectArk() private readonly ark: ArkKernel) {}

  async place(id: string): Promise<void> {
    const OrderPlaced = this.ark.registry.define('Domain.Order.Placed');
    await this.ark.send(OrderPlaced, { id }, { source: 'Application.PlaceOrder' });
  }
}
