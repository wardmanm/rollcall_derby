import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { FastifyBaseLogger } from 'fastify';
import type { Server as SocketIoServer } from 'socket.io';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@obs-producer/shared';
import { attachRealtime } from './realtime.ts';
import { openMemoryDatabase } from './db.ts';
import { createSession } from './auth/sessions.ts';
import { SESSION_COOKIE } from './auth/guard.ts';
import { addUser } from './testing.ts';

let httpServer: HttpServer | undefined;
let io: SocketIoServer | undefined;
let clients: Socket[] = [];

afterEach(async () => {
  for (const client of clients) client.close();
  clients = [];
  await io?.close();
  if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  io = httpServer = undefined;
});

// 'connected', or the reason the server refused the connection.
function outcome(socket: Socket): Promise<string> {
  return new Promise((resolve) => {
    socket.once('connect', () => resolve('connected'));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

describe('attachRealtime', () => {
  it('refuses the connection instead of crashing when the session check throws', async () => {
    const { db, sqlite } = openMemoryDatabase();
    const user = await addUser(db, 'admin', 'password123', 'admin');
    const { token } = createSession(db, user.id);
    sqlite.close(); // every query against `db` now throws

    const log = { error: vi.fn<(obj: { err: unknown }, msg: string) => void>() } as unknown as FastifyBaseLogger;
    httpServer = createServer();
    io = attachRealtime(httpServer, { version: '1.0.0', db, log });
    await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;

    const cookie = `${SESSION_COOKIE}=${token}`;
    const client = connect(url, { transports: ['websocket'], reconnection: false, extraHeaders: { cookie } });
    clients.push(client);
    expect(await outcome(client)).toBe('internal_error');
    expect(log.error).toHaveBeenCalledOnce();

    // The process and the server are still up: /overlay still works on the same server.
    const overlayClient = connect(`${url}/overlay`, { transports: ['websocket'], reconnection: false });
    clients.push(overlayClient);
    const hello = await new Promise((resolve) => overlayClient.once(SERVER_HELLO_EVENT, resolve));
    expect(ServerHelloSchema.parse(hello)).toEqual({ name: APP_NAME, version: '1.0.0' });
  });
});
