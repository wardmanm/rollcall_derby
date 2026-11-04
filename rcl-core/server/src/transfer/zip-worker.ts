import { parentPort, workerData } from 'node:worker_threads';
import { buffersOf, owned, packZip, readZip, TransferError, type ZipJob, type ZipReply } from './zip.ts';

// A worker thread that packs or reads one export file (zip.ts), so the server's main thread stays free meanwhile. It
// hands its result's bytes back without copying them, and sends a refusal back as its parts.

if (!parentPort) throw new Error('zip-worker.ts runs only as a worker');
const port = parentPort;
const job: ZipJob = workerData;

const reply = (message: ZipReply, buffers: ArrayBuffer[] = []) => port.postMessage(message, buffers);

try {
  if (job.job === 'pack') {
    const packed = owned(packZip(job.manifest, job.media));
    reply({ packed }, buffersOf([packed]));
  } else {
    const read = readZip(job.zip, job.limits);
    const media = new Map([...read.media].map(([path, bytes]) => [path, owned(bytes)]));
    reply({ read: { ...read, media } }, buffersOf(media.values()));
  }
} catch (error) {
  if (!(error instanceof TransferError)) throw error;
  reply({ refusal: { status: error.status, code: error.code, message: error.message } });
}
