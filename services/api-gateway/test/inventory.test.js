const express = require('express');
const request = require('supertest');

jest.mock('../src/instrumentation', () => ({
  tracer: {},
  upstreamLatencyHistogram: { record: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}));

const { routes, config } = require('../src/config');
const { createServiceProxy } = require('../src/proxy/proxyHandler');

let upstream;
let app;

beforeAll(async () => {
  const service = express();
  service.use(express.json());
  service.use((req, res) => res.json({
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
  }));
  upstream = await new Promise((resolve) => {
    const server = service.listen(0, '127.0.0.1', () => resolve(server));
  });

  app = express();
  app.use(express.json());
  for (const route of routes.filter((route) => route.path.startsWith('/api/v1/inventory'))) {
    app.use(route.path, createServiceProxy({
      target: `http://127.0.0.1:${upstream.address().port}`,
      serviceName: 'inventory-service',
      pathRewrite: route.rewritePath ? { [`^${route.path}`]: route.rewritePath } : undefined,
    }));
  }
});

afterAll(async () => {
  await new Promise((resolve) => upstream.close(resolve));
});

test('inventory list alias rewrites the path and preserves pagination', async () => {
  const response = await request(app)
    .get('/api/v1/inventory/products?limit=20&offset=40')
    .expect(200);
  expect(response.body).toMatchObject({
    method: 'GET',
    path: '/api/v1/products',
    query: { limit: '20', offset: '40' },
  });
});

test.each([0, 150])('stock updates forward JSON quantity %i after body parsing', async (quantity) => {
  const productId = '123e4567-e89b-12d3-a456-426614174001';
  const response = await request(app)
    .put(`/api/v1/inventory/${productId}`)
    .send({ quantity })
    .timeout(2000)
    .expect(200);
  expect(response.body).toMatchObject({
    method: 'PUT',
    path: `/api/v1/inventory/${productId}`,
    body: { quantity },
  });
});

test('inventory routing does not redirect the catalog product list', () => {
  const catalog = routes.find((route) => route.path === '/api/v1/products');
  expect(catalog.target).toBe(config.services.catalogService);
  const inventoryRoutes = routes.filter((route) => route.path.startsWith('/api/v1/inventory'));
  expect(inventoryRoutes.map((route) => route.path)).toEqual([
    '/api/v1/inventory/products',
    '/api/v1/inventory',
  ]);
  expect(inventoryRoutes.every((route) => route.target === config.services.inventoryService)).toBe(true);
});
