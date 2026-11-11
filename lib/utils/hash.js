import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
export async function hashFile(file,signal) { const hash=createHash('sha256');for await(const chunk of createReadStream(file,{signal})){signal?.throwIfAborted();hash.update(chunk);}return hash.digest('hex'); }
export function hashBytes(value) { return createHash('sha256').update(value).digest('hex'); }
