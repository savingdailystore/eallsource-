// Thin wrapper around Apify's REST API for running actors synchronously and
// reading back their dataset items in one call — used by retailer plugins
// instead of maintaining our own scraping/proxy/anti-bot stack per site.

export async function runApifyActor<T = unknown>(actorId: string, input: object): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not set');

  const url = `https://api.apify.com/v2/acts/${actorId.replace('/', '~')}/run-sync-get-dataset-items?token=${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    throw new Error(`Apify actor ${actorId} failed: HTTP ${res.status} ${await res.text()}`);
  }

  return res.json();
}
