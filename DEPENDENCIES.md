# Dependencies

This file records outbound consumer → provider relationships for this repository. Entries can be reverse-looked-up across repositories when planning changes to a provider API, service, package, or contract.

## Provider index

| Provider | Dependency kind | Consumer |
| --- | --- | --- |
| [Inventory service](https://github.com/augment-solutions/cross-repo-demo-inventory-service) | Runtime HTTP API | `services/api-gateway` |
| `http-proxy-middleware` | Runtime library | `services/api-gateway` |

## Runtime dependencies

### Inventory service: product listing and stock updates

- **Stable identity:** `cross-repo-demo-core` → runtime HTTP API → `augment-solutions/cross-repo-demo-inventory-service` → `GET /api/v1/products` and `PUT /api/v1/inventory/{product_id}`.
- **Provider:** Inventory service, [augment-solutions/cross-repo-demo-inventory-service](https://github.com/augment-solutions/cross-repo-demo-inventory-service).
- **Purpose/category:** Runtime dependency used by the API gateway to expose inventory-backed product listing and administrative stock updates.
- **Introduced by:** [cross-repo-demo-core PR #1](https://github.com/augment-solutions/cross-repo-demo-core/pull/1), analyzed at source head [`b10740aa5d326d841760dc11f6f0350039bbb045`](https://github.com/augment-solutions/cross-repo-demo-core/commit/b10740aa5d326d841760dc11f6f0350039bbb045).
- **Consumer evidence:** `routes` maps `/api/v1/inventory/products` to the inventory service and rewrites it to `/api/v1/products`, while `/api/v1/inventory` is forwarded unchanged ([`services/api-gateway/src/config.ts` lines 76–77](https://github.com/augment-solutions/cross-repo-demo-core/blob/b10740aa5d326d841760dc11f6f0350039bbb045/services/api-gateway/src/config.ts#L76-L77)). Integration tests pin pagination forwarding and JSON stock-update behavior ([`services/api-gateway/test/inventory.test.js` lines 46–68](https://github.com/augment-solutions/cross-repo-demo-core/blob/b10740aa5d326d841760dc11f6f0350039bbb045/services/api-gateway/test/inventory.test.js#L46-L68)).
- **Consumed contract:** `GET /api/v1/products` accepts optional integer query parameters `limit` (default `10`) and `offset` (default `0`) and returns `200` JSON product records. `PUT /api/v1/inventory/{product_id}` requires a UUID path value and JSON `{ "quantity": integer }`, with `quantity >= 0`; success returns `200` JSON inventory state. The gateway preserves query parameters, request JSON, upstream status, and response body.
- **Provider evidence:** The provider registers both routes ([`src/api/mod.rs` lines 5–13](https://github.com/augment-solutions/cross-repo-demo-inventory-service/blob/d480a395060d35e5f199c00b8ad98f66e61269a1/services/inventory-service/src/api/mod.rs#L5-L13)), parses `limit` and `offset` ([`src/api/handlers.rs` lines 94–111](https://github.com/augment-solutions/cross-repo-demo-inventory-service/blob/d480a395060d35e5f199c00b8ad98f66e61269a1/services/inventory-service/src/api/handlers.rs#L94-L111)), and validates the stock-update request ([`src/models/mod.rs` lines 130–134](https://github.com/augment-solutions/cross-repo-demo-inventory-service/blob/d480a395060d35e5f199c00b8ad98f66e61269a1/services/inventory-service/src/models/mod.rs#L130-L134)) at provider revision `d480a395060d35e5f199c00b8ad98f66e61269a1`.
- **Breakage risk:** Changes to either method/path, UUID parsing, pagination names/defaults, the `quantity` field or nonnegative validation, response status/JSON shape, or transparent proxying can break this consumer. Coordinate route or schema migrations with the gateway aliases before deploying provider changes.
- **Validation/migration guidance:** Run `npm test -- --runInBand` and `npm run type-check` in `services/api-gateway`; update `inventory.test.js` together with any intentional contract migration.

### `http-proxy-middleware`: `fixRequestBody`

- **Stable identity:** `cross-repo-demo-core` → runtime library → `http-proxy-middleware` → exported symbol `fixRequestBody`.
- **Provider:** npm package `http-proxy-middleware` with declared constraint `^2.0.6`; provider repository unknown.
- **Purpose/category:** Runtime dependency used after `express.json()` consumes an incoming stream so parsed JSON bodies are serialized into upstream proxy requests.
- **Introduced by:** [cross-repo-demo-core PR #1](https://github.com/augment-solutions/cross-repo-demo-core/pull/1), analyzed at source head [`b10740aa5d326d841760dc11f6f0350039bbb045`](https://github.com/augment-solutions/cross-repo-demo-core/commit/b10740aa5d326d841760dc11f6f0350039bbb045).
- **Consumer evidence:** `createServiceProxy` newly imports and calls `fixRequestBody(proxyReq, req)` after setting forwarding headers ([`services/api-gateway/src/proxy/proxyHandler.ts` lines 1 and 34–38](https://github.com/augment-solutions/cross-repo-demo-core/blob/b10740aa5d326d841760dc11f6f0350039bbb045/services/api-gateway/src/proxy/proxyHandler.ts#L34-L38)); the existing version constraint is declared in [`services/api-gateway/package.json` line 24](https://github.com/augment-solutions/cross-repo-demo-core/blob/b10740aa5d326d841760dc11f6f0350039bbb045/services/api-gateway/package.json#L24).
- **Consumed contract:** The package must export `fixRequestBody` and accept the proxy request plus parsed Express request, preserving JSON bodies including `quantity: 0` while producing a valid upstream request body.
- **Breakage risk:** Removing/renaming the export or changing its serialization, content-length, content-type, or call-order behavior can silently drop or corrupt proxied JSON updates.
- **Validation/migration guidance:** Keep the call after gateway headers are set and run `npm test -- --runInBand` plus `npm run type-check` in `services/api-gateway` when changing or upgrading the package.
