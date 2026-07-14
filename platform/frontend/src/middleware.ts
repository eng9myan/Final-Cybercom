import { NextRequest, NextResponse } from "next/server";

/**
 * Maps each flagship product subdomain to its existing path-based route
 * under src/app/. One Next.js deployment serves all subdomains; this
 * middleware makes each subdomain look like its own standalone app by
 * rewriting "/" and deep links onto the matching route tree.
 *
 * "cymed" is deliberately NOT listed here. It's the CyMed suite's umbrella
 * subdomain (cymed.cy-com.com/hospital, /clinic, /pharmacy, /laboratory,
 * /imaging, /patient-portal, /provider-portal, /rcm, /population-health) --
 * those paths already exist 1:1 under src/app/, so it must fall through to
 * plain passthrough below rather than being rewritten onto one fixed path
 * the way the single-product subdomains are.
 */
const SUBDOMAIN_TO_PATH: Record<string, string> = {
  hospital: "/hospital",
  clinic: "/clinic",
  pharmacy: "/pharmacy",
  laboratory: "/laboratory",
  imaging: "/imaging",
  erp: "/erp",
};

const PASSTHROUGH_PREFIXES = ["/_next", "/api", "/static", "/favicon.ico"];

// Every real top-level route directory under src/app/ (`ls src/app`). Hospital,
// Clinic, etc. pages routinely deep-link across product boundaries -- e.g.
// hospital/doctor-workspace links to /provider-portal/orders for the full
// CPOE, patient billing links to /patient-portal/payments. A path whose first
// segment is one of these is a real, already-correct route and must pass
// through unrewritten, even under a single-product subdomain. /auth is
// included here for the same reason: every subdomain's "Sign in" link and
// Keycloac's PKCE redirect_uri both point at plain /auth with no product
// prefix -- without this, logging in from any product subdomain 404'd.
// Only a path that matches NONE of these (e.g. "/nursing" typed under
// hospital.cy-com.com, meaning "the hospital app's /nursing") should be
// rewritten onto the current subdomain's own base path.
const KNOWN_TOP_LEVEL_ROUTES = new Set([
  "admin", "api", "auth", "clinic", "cyanalytics", "dashboard", "erp",
  "health", "hospital", "imaging", "laboratory", "patient-portal",
  "pharmacy", "population-health", "provider-portal", "rcm",
]);

function resolveSubdomain(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0] ?? host;
  // production: hospital.cy-com.com ; local dev: hospital.localhost
  const candidate = hostname.split(".")[0] ?? "";
  return candidate in SUBDOMAIN_TO_PATH ? candidate : null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const firstSegment = pathname.split("/")[1] ?? "";
  if (KNOWN_TOP_LEVEL_ROUTES.has(firstSegment)) {
    return NextResponse.next();
  }

  const subdomain = resolveSubdomain(request.headers.get("host"));
  if (!subdomain) {
    return NextResponse.next();
  }

  const productBasePath = SUBDOMAIN_TO_PATH[subdomain];
  if (!productBasePath) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `${productBasePath}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
