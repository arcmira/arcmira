# JSR release preparation

[API docs](https://arcmira.com/docs) · [SDK guide](README.md) · [JSR publishing rules](https://jsr.io/docs/publishing-packages)

This is an unpublished distribution candidate for `@arcmira/sdk`. It does not establish scope ownership, register a package or publish a version. The candidate uses the version in the npm package metadata; do not change the npm version solely to run these checks.

## Validate locally

Use the repository's Node/npm toolchain, Python 3.9 or later, and an already-installed Deno. This candidate was tested with Node 22.22.3, Python 3.14.7 and Deno 2.8.3 on Apple Silicon macOS. Deno 2.8.3 was released June 11, 2026. Verify the seven-day release-age requirement before installing a different toolchain. The scripts do not install or upgrade Deno.

```sh
./scripts/ci.sh
```

The script runs the existing npm build/tests, type checks and generation tests, four packaging-boundary checks, then the JSR checks. JSR checks stage source in a new temporary directory outside the checkout, run the full publish dry-run and ten tests, compare all SDK entry points and remove their temporary files. Only loopback network access is permitted during the tests. No Arcmira credentials, live research or model calls are needed.

To keep a candidate for review after building the npm package:

```sh
npm run build
python3 scripts/prepare-jsr.py /tmp/arcmira-jsr-review
python3 scripts/check-jsr-exports.py /tmp/arcmira-jsr-review
cd /tmp/arcmira-jsr-review
deno publish --dry-run --config jsr.json
deno test --allow-net=127.0.0.1 candidate_test.ts
```

Use a new output path each time. Preparation refuses an existing output directory or a location inside the repository. It verifies that `src/version.ts` matches `package.json` and derives every SDK export from the npm ESM entry points. The npm metadata subpath and CLI are outside this SDK-only package.

## Review the staged changes

The SDK source and generator remain unchanged in the checkout. The distribution stage applies these reviewed compatibility adjustments:

- Relative `.js` imports resolve to existing `.ts` source files. For SDK 0.4.3, this changes 576 imports in 184 files.
- The browser `window.document` and React Native `navigator.product` checks first test property existence so Deno can type-check them.
- `ArcmiraError.cause` has an explicit `override` modifier.
- The root additionally exports the existing `BearerAuthProvider` class. This resolves a Deno public-declaration omission involving its merged namespace. It deliberately adds one public runtime export to the JSR package; npm exports do not change.

The three text patches and root-export adjustment fail when the expected source changes. Review and update the staging transform when regenerating the SDK; do not disable declaration checks or silently ignore a failed patch. The full publish dry-run uses no `--no-check`, `--allow-slow-types` or `--allow-dirty` flags.

The parity check compares every npm SDK subpath and runtime export against the locally built npm ESM modules. It permits only the explicit root `BearerAuthProvider` addition. Publication checks type-check all entry points. This does not claim identical type declarations across runtimes or support beyond the tested environment.

The ten tests cover auth/query construction, source/timestamp/coverage preservation, empty responses and structured refusals. Seven exercise actual local HTTP. Refusal checks configure `maxRetries: 0` and preserve status, body, request ID and Retry-After. They do not claim that retries are disabled by default.

## Before any publication

1. Review this candidate and integrate the packaging changes in the public SDK repository under the signed `zealous1` identity.
2. Recheck the released npm version, source commit and intended JSR version. Confirm branded scope ownership, package availability and repository provenance linkage through the approved publisher flow.
3. Run the full local checks on the exact release source. Keep the source commit, Deno version and artifact hashes with the release evidence. `validation-manifest.json` records deterministic candidate file hashes; it, the tests and parity script are excluded from the publishing file list.
4. Obtain the normal publication approval and upload only the reviewed, validated source. If adding release automation, use a publication job for the prevalidated artifact with hash/source checks. Do not add GitHub build or test workflows.
5. Verify the registry page, generated reference docs, clean installation and API-docs links before removing the unpublished notice.

No publisher workflow, credential configuration or registry upload is included here.
