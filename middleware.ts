import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // Add cache-related headers to API responses
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // Get response
    const response = NextResponse.next()

    // Add cache control headers
    response.headers.set("Cache-Control", "no-store, must-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")

    return response
  }

  // For non-API routes, continue without modification
  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ["/api/:path*"],
}

