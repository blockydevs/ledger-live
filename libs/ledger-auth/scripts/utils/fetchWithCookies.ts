import { WalletAuthHttpError } from "../../src/errors";

/**
 * Follows redirects manually while propagating cookies across hops.
 */
export async function fetchWithCookies(
  req: RequestInfo | URL,
  init?: RequestInit,
  maxRedirects = 10,
  cookieJar = "",
): Promise<Response> {
  const res = await fetch(req, {
    ...init,
    headers: { ...init?.headers, Cookie: cookieJar },
    redirect: "manual",
  });

  const location = res.headers.get("location");
  const isRedirect = res.status >= 300 && res.status < 400 && location !== null;
  if (!isRedirect) {
    return res;
  }

  if (maxRedirects <= 0) {
    throw new WalletAuthHttpError(`Too many redirects when fetching ${reqToString(req)}`);
  }
  return fetchWithCookies(
    new URL(location, reqToString(req)),
    init,
    maxRedirects - 1,
    mergeCookies(cookieJar, res.headers.getSetCookie()),
  );
}

function reqToString(req: RequestInfo | URL): string {
  if (typeof req === "string") return req;
  if ("url" in req) return req.url;
  return req.toString();
}

function mergeCookies(cookieJar: string, setCookieHeader: string[]): string {
  const cookieMap = new Map(
    [cookieJar, ...setCookieHeader]
      .flatMap(cookie => cookie.split(";"))
      .flatMap(pair => {
        const separator = pair.indexOf("=");
        return separator > 0 ? [[pair.slice(0, separator).trim(), pair.slice(separator + 1)]] : [];
      }),
  );
  return Array.from(cookieMap)
    .map(([name, value]) => `${name}=${value}`)
    .join(";");
}
