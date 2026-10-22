# Environments

Keep each environment isolated. In particular, never run automated or manual tests against production.

| Environment | API and database | Stripe | Deployment |
| --- | --- | --- | --- |
| Development | Local API using a local development database. | Stripe test keys only. | No deployment: start the API and customer app locally with their development commands. |
| Staging | The separately deployed staging API and its dedicated PostgreSQL database. Cloudflare Pages must set the `API_ORIGIN` environment variable to that staging API's HTTPS origin. | Stripe test keys only. | Build/package the Pages app with `npx -y pnpm@10 --filter @workspace/ciao-rental run package:pages-staging`, then deploy the resulting staging bundle to the staging Pages project. Deploy the staging API with its staging database configuration. |
| Production | The production API and its dedicated production PostgreSQL database. | Stripe live keys only. | After review, passing CI, and staging UAT, deploy the API to the production API service and the customer site to the production web project with only production configuration. Production must use its own hostname and configuration. |

## Staging safety gate

The Pages staging worker refuses to proxy API traffic unless `API_ORIGIN` is configured, and it rejects `https://car-fleet-manager.replit.app`, the production API origin. Configure `API_ORIGIN` only in the Cloudflare Pages staging project; do not put it in source code or a client-side build variable.

Before a staging release, run:

```sh
npx -y pnpm@10 --filter @workspace/ciao-rental run verify:pages-staging
```

This checks that missing and production API origins are rejected, that a safe configured origin proxies correctly, and that all staging responses retain `X-Robots-Tag: noindex, nofollow`.

The staging API must be provisioned with its own PostgreSQL database and Stripe test keys before it is connected to Pages. Seed it using the R0-10 seed command. Do not point staging at the production API, database, Stripe account/keys, or hostname.
