// A small stand-in for the firmware's HTTP API, so the real built page can be tested without hardware.
// It tests the app, not the C++ routes.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
const ACTIONS = ['/api/start', '/api/stop', '/api/set', '/api/press', '/api/reset'];

export const COFFEES = [
  { id: 1, name: 'Colombia Huila', roaster: 'Third Place', roasted: '', week: true },
  { id: 2, name: 'Kenya AA', roaster: '', roasted: '', week: false },
];

export async function startFake() {
  const fake = {
    status: { state: 'idle', elapsed: 0, limit: 30, auto: true, reason: '', presses: 0, storage: true, last: [] },
    coffees: structuredClone(COFFEES),
    brews: [],
    failCoffeeLoad: false,
    log: [],
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake');
    const path = url.pathname;
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };
      const fail = (code) => {
        res.statusCode = code;
        res.end();
      };
      if (path === '/') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(readFileSync(join(dist, 'index.html')));
      }
      if (path !== '/api/status') fake.log.push(`${req.method} ${req.url}`);
      if (path === '/api/status') return json(fake.status);
      if (path === '/api/brews') {
        if (req.method === 'POST') fake.brews.push(JSON.parse(body));
        return json(req.method === 'POST' ? { ok: true } : fake.brews);
      }
      if (path === '/api/coffees') {
        if (req.method === 'POST') {
          fake.coffees = JSON.parse(body);
          return json({ ok: true });
        }
        return fake.failCoffeeLoad ? fail(500) : json(fake.coffees);
      }
      if (ACTIONS.includes(path)) {
        if (req.method !== 'POST') return fail(404); // like the firmware's POST-only routes
        if (path === '/api/start') fake.status.state = 'brewing';
        if (path === '/api/stop') fake.status.state = 'done';
        if (path === '/api/reset') fake.status.state = 'idle';
        if (path === '/api/press') fake.status.presses++;
        if (url.searchParams.has('limit')) fake.status.limit = Number(url.searchParams.get('limit'));
        return json(fake.status);
      }
      fail(404);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${server.address().port}`;
  fake.close = () => new Promise((resolve) => server.close(resolve));
  return fake;
}
