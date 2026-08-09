export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');

export interface NotifyRequest {
  entryId: string;
  phone: string;
  plateNumber: string;
  slotId: string;
  channels: Array<'whatsapp' | 'sms' | 'app'>;
}

export interface NotificationSender {
  notify(request: NotifyRequest): Promise<void>;
}
