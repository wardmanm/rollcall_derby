import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { APP_NAME, SERVER_HELLO_EVENT, ServerHelloSchema } from '@obs-producer/shared';

// Socket.IO shares the HTTP server's port (ADR-0004). Rooms and live state arrive with Live Mode.
export function attachRealtime(httpServer: HttpServer, { version }: { version: string }): Server {
  const io = new Server(httpServer, { serveClient: false });
  const hello = ServerHelloSchema.parse({ name: APP_NAME, version });
  io.on('connection', (socket) => {
    socket.emit(SERVER_HELLO_EVENT, hello);
  });
  return io;
}
