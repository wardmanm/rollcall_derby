import { z } from 'zod';

// Sent by the server to every Socket.IO client as soon as it connects.
export const SERVER_HELLO_EVENT = 'server:hello';
export const ServerHelloSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
});
export type ServerHello = z.infer<typeof ServerHelloSchema>;
