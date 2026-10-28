// TypeScript, file: src/youtube/response.ts, target: Chromium 121+ MAIN world.
import {sanitizePlayerPayload} from './data';
const MAX_BYTES = 4_000_000;
export async function filterPlayerResponse(response: Response, active: () => boolean): Promise<Response> {
  if (!active() || !response.ok || !response.headers.get('content-type')?.includes('application/json')) return response;
  if (Number(response.headers.get('content-length')) > MAX_BYTES) return response;
  const copy = response.clone();
  const reader = copy.body?.getReader();
  if (!reader) return response;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (!active() || size > MAX_BYTES) {void reader.cancel().catch(() => {}); return response;}
      chunks.push(part.value);
    }
    if (!active()) return response;
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const next = sanitizePlayerPayload(data);
    if (next === data || !active()) return response;
    const headers = new Headers(response.headers);
    // Fetch delivers decoded bytes. These wire headers no longer describe this body.
    for (const name of ['content-length','content-encoding','etag','content-md5','digest']) headers.delete(name);
    const decorate = (item: Response): Response => {
      const clone = item.clone;
      Object.defineProperties(item, {
        url: {configurable:true, value:response.url},
        redirected: {configurable:true, value:response.redirected},
        type: {configurable:true, value:response.type},
        clone: {configurable:true, value:function(this: Response) {return decorate(clone.call(this));}}
      });
      return item;
    };
    return decorate(new Response(JSON.stringify(next), {status:response.status,statusText:response.statusText,headers}));
  } catch {
    // Original body is never consumed; parse/network failure preserves native response.
    void reader.cancel().catch(() => {});
    return response;
  } finally {reader.releaseLock();}
}
