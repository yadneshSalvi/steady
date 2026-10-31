import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth";
import { failure } from "@/lib/server/http";
export async function GET(request: Request) {
  try {
    return await toNextJsHandler(getAuth()).GET(request);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    return await toNextJsHandler(getAuth()).POST(request);
  } catch (error) {
    return failure(error);
  }
}
