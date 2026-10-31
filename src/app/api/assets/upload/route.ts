import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { assertSameOrigin, requireOwner } from "@/lib/server/auth";
import { authorizeUpload, MAX_UPLOAD_BYTES } from "@/lib/server/assets";
import { handle, json, readJson } from "@/lib/server/http";
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await readJson(request)) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        assertSameOrigin(request);
        const ownerId = await requireOwner(request);
        await authorizeUpload(ownerId, pathname);
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + 15 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return json(result);
  });
}
