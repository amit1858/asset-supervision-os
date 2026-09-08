# Production Deployment

## Host and deployed commit

- Production host: `https://asset-supervision-os.vercel.app`
- Production deployment ID: `dpl_G9KgMoAk1ccjvQ1HAFUBsCd83NQZ`
- Deployed commit: `e4769bc2915178e9382d3f66985912bd2126bc47`
- Verified preview: `https://asset-supervision-lvh8tw6ud-amit1858s-projects.vercel.app`
- Repository: `amit1858/asset-supervision-os` (private).

## Runtime

- Next.js 14 App Router
- Node.js 24.x as declared by `package.json`
- Production configuration is built from the repository lockfile and does not require a local model.

## Environment posture

The public demonstration was deployed with:

```text
DATA_SOURCE=local
AI_PROVIDER=mock
```

No NVIDIA, Azure, DGX Spark, Snowflake, or browser-supplied credentials are configured for the
default public deployment. Environment values are server-side only and are never rendered into
the client. The public project alias responds without Vercel SSO protection; individual
deployment-specific URLs may remain protected by Vercel preview access controls.

## Rollback method

Use the Vercel deployment history to promote the last verified deployment back to the production
alias. If the alias cannot be promoted, disable the current deployment and restore the previous
verified deployment through the Vercel dashboard or CLI. Do not rebuild a different artifact while
rolling back.

## Smoke-test commands

```powershell
$env:QA_BASE_URL = "https://<verified-deployment>.vercel.app"
npm run qa:preview
```

The release smoke suite covers the V2 routes, persona journeys, K-201 Case Investigator,
non-K-201 isolation, deterministic fallback, responsive surfaces, and provider-call isolation.

## Known limitations

- All plant, equipment, sensor, cost, work, and recommendation records are synthetic.
- NVIDIA hosted inference is optional and not the guaranteed demonstration path.
- Azure live inference is unverified.
- DGX Spark local installation and live inference are pending.
- Snowflake, Fabric, historian, CMMS/EAM, ERP, and inventory integrations are not enabled.
- No operational mutation or write-back path is enabled.
- Realised value remains unavailable until a validated operational outcome is recorded.

## LLM-provider posture

Deterministic systems establish facts and calculations. Optional providers only narrate governed
evidence for an authorised persona. Provider output is citation-validated and rejected when it is
malformed, unsupported, ungrounded, or outside the persona scope. Rejected output falls back to
the deterministic governed narrator.

## Security and secrets

Credentials remain in deployment-secret storage or ignored local environment files. They are not
written to source, documentation, screenshots, static assets, client bundles, logs, or public
repositories. The public deployment does not require a paid provider credential.

## Operational write-back

No operational write-back is enabled. The application is a synthetic, read-only demonstration;
human approval and endorsement remain explicit boundaries rather than automated lifecycle actions.
