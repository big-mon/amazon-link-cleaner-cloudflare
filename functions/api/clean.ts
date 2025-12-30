export interface Env {}

type CleanResult = {
  input_url: string;
  expanded_url: string;
  cleaned_url: string;
  asin?: string;
  removed_params: Array<{ key: string; value: string }>;
  redirect_hops: number;
};

type ErrorResult = {
  error: string;
};

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8000;

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
];

const AMAZON_HOST_SUFFIXES = [
  "amazon.com",
  "amazon.co.jp",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.ca",
  "amazon.com.mx",
  "amazon.com.br",
  "amazon.com.au",
  "amazon.in",
  "amazon.nl",
  "amazon.se",
  "amazon.sg",
  "amazon.ae",
  "amazon.sa",
  "amazon.pl",
  "amazon.com.tr",
];

const REMOVE_PARAMS = [
  "tag",
  "linkCode",
  "ascsubtag",
  "ref",
  "ref_",
  "referrer",
  "creative",
  "creativeASIN",
  "camp",
  "encoding",
  "smid",
  "sprefix",
  "keywords",
  "crid",
  "qid",
  "sr",
  "th",
  "psc",
];

function isSameOriginRequest(request: Request): boolean {
  const reqUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) {
    return origin === reqUrl.origin;
  }
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin === reqUrl.origin;
    } catch {
      return false;
    }
  }
  const secFetchSite = request.headers.get("Sec-Fetch-Site");
  if (secFetchSite) {
    return secFetchSite === "same-origin";
  }
  return false;
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTS.includes(host)) {
    return true;
  }
  if (host.endsWith(".localhost")) {
    return true;
  }
  if (host.startsWith("127.")) {
    return true;
  }
  return false;
}

function isAmazonHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return AMAZON_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function extractAsin(pathname: string): string | undefined {
  const dpMatch = pathname.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i);
  if (dpMatch) {
    return dpMatch[1].toUpperCase();
  }
  const gpMatch = pathname.match(/\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i);
  if (gpMatch) {
    return gpMatch[1].toUpperCase();
  }
  return undefined;
}

function cleanAmazonUrl(
  expanded: URL
): { cleaned: URL; asin?: string; removedParams: Array<{ key: string; value: string }> } {
  const removedParams: Array<{ key: string; value: string }> = [];
  const asin = extractAsin(expanded.pathname);

  const keysToRemove = new Set<string>();
  for (const [key, value] of expanded.searchParams) {
    // ASINが取れないページでは機能に影響するクエリもあるため、
    // 既知のアフィリエイト/リファラ/追跡系のみ除去する。
    // `pd_rd_` はAmazon内部の配置/リダイレクト由来の追跡パラメータ。
    if (REMOVE_PARAMS.includes(key) || key.startsWith("pd_rd_")) {
      removedParams.push({ key, value });
      keysToRemove.add(key);
    }
  }

  let cleaned: URL;
  if (asin) {
    cleaned = new URL(`https://${expanded.host}/dp/${asin}`);
  } else {
    cleaned = new URL(expanded.toString());
    for (const key of keysToRemove) {
      cleaned.searchParams.delete(key);
    }
    cleaned.hash = "";
  }

  if (asin) {
    return { cleaned, asin, removedParams };
  }

  return { cleaned, removedParams };
}

async function expandRedirects(input: URL): Promise<{ finalUrl: URL; hops: number }> {
  let current = input;
  let hops = 0;

  while (hops < MAX_REDIRECTS) {
    if (!isHttpUrl(current)) {
      throw new Error("URL scheme must be http or https.");
    }
    if (isBlockedHost(current.hostname)) {
      throw new Error("Blocked hostname.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      throw new Error("Failed to fetch URL.");
    }
    clearTimeout(timeoutId);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect without location header.");
      }
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, current);
      } catch {
        throw new Error("Invalid redirect URL.");
      }
      if (!isHttpUrl(nextUrl)) {
        throw new Error("Redirected to unsupported scheme.");
      }
      if (isBlockedHost(nextUrl.hostname)) {
        throw new Error("Redirected to blocked hostname.");
      }
      current = nextUrl;
      hops += 1;
      continue;
    }

    return { finalUrl: current, hops };
  }

  throw new Error("Too many redirects.");
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  if (!isSameOriginRequest(request)) {
    return new Response(JSON.stringify({ error: "Forbidden." } satisfies ErrorResult), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const input = url.searchParams.get("url");

  if (!input) {
    return new Response(JSON.stringify({ error: "Missing url parameter." } satisfies ErrorResult), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL." } satisfies ErrorResult), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!isHttpUrl(parsed)) {
    return new Response(JSON.stringify({ error: "Only http/https URLs are allowed." } satisfies ErrorResult), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { finalUrl, hops } = await expandRedirects(parsed);

    if (!isAmazonHost(finalUrl.hostname)) {
      return new Response(
        JSON.stringify({ error: "Final URL is not an Amazon domain." } satisfies ErrorResult),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const { cleaned, asin, removedParams } = cleanAmazonUrl(finalUrl);

    const result: CleanResult = {
      input_url: input,
      expanded_url: finalUrl.toString(),
      cleaned_url: cleaned.toString(),
      asin,
      removed_params: removedParams,
      redirect_hops: hops,
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return new Response(JSON.stringify({ error: message } satisfies ErrorResult), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
};
