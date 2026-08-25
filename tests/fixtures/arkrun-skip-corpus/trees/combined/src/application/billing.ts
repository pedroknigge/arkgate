import { OrderService } from './order-service';
import { EventEmitter } from 'events';
export const billing = new OrderService();
export const bus = new EventEmitter();
