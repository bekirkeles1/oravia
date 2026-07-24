import { NextResponse } from "next/server.js";
import securityHeaders from "./src/ops/securityHeaders.js";

export function proxy(request) {
  const response = NextResponse.next();
  securityHeaders.applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
