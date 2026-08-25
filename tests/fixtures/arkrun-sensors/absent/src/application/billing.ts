import { OrderService } from '../domain/order-service';
import { EventEmitter } from 'events';
export const billing = new OrderService();
export const bus = new EventEmitter();
