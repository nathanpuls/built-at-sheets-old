# Automatic sheet updates

Google Drive file-change webhooks notify a small Cloudflare Worker. A Durable Object broadcasts the notification over a persistent WebSocket to open sheet pages. The browser checks the sheet revision on a notification or reconnection and reloads only when the content changed. There is no periodic sheet polling. A short, bounded retry after an edit allows Google's CSV export to catch up with the edit.

The connection covers manual edits and API writes. Google's delivery and export propagation can introduce latency; zero-latency delivery is not guaranteed.

Only the two spreadsheet IDs explicitly listed in the Worker configuration and page handler are connected. The service broadcasts revision signals; it does not store sheet contents. Pages retain their opaque-origin sandbox. The public revision endpoint allows cross-origin requests because the rendered page has an opaque origin.

Google's file-watch subscriptions expire within one day. The Durable Object renews them before expiry while clients are connected; inactive subscriptions expire and are registered again on connection. This renewal is subscription maintenance, not polling for edits.

## Authorization and activation

The backend requires a Google OAuth credential capable of reading Drive metadata and registering file watches. It is stored only as the encrypted Cloudflare Worker secret `GOOGLE_AUTH`, containing `client_id`, `client_secret`, and `refresh_token`. These values must never be committed. The refresh request explicitly asks for `drive.metadata.readonly` and only configured sheets can be watched.

The existing local clasp credential has broader granted scopes, so transferring that credential to Cloudflare requires explicit user approval. A dedicated metadata-only OAuth credential is preferable if one is available. The transfer was blocked by automatic approval review and has not been performed.

The Worker is deployed at `https://built-at-sheets-live.natepuls.workers.dev`; its Google connection is not configured. The viewer changes remain on the feature branch until Google authorization and end-to-end checks are complete. No credentials have been added to the repository.

After authorization, set the Worker secret, activate the viewer change, and verify an ordinary edit to a scratch row causes an already-open page to update without a manual refresh. Restore the scratch row afterward. Verify both UI edits and API writes, and reconnect behavior.

## Checks

`node --test sheets-live/worker.test.mjs` validates the sheet allowlist, webhook authentication, ignoring subscription-sync events, broadcasting edit events, Google scope selection, and watch expiry renewal. Syntax-check the Worker and browser client too.
