/**
 * Tuffs runtime configuration.
 * Values in TUFFS_CONFIG can be injected by the server (it rewrites this
 * file's defaults only when authentication is enabled) or left at defaults
 * for plain static hosting.
 */
window.TUFFS_CONFIG = {
  // Base path for game files and thumbnails (relative to the portal root).
  basePath: "",

  // Scramjet client asset paths (served by the Node backend).
  scramjet: {
    wasm: "/scram/scramjet.wasm.wasm",
    all: "/scram/scramjet.all.js",
    sync: "/scram/scramjet.sync.js"
  },

  // bare-mux worker and libcurl transport paths (served by the Node backend).
  baremuxWorker: "/baremux/worker.js",
  libcurlTransport: "/libcurl/index.mjs",

  // Wisp backend endpoint. Same origin as the portal by default.
  wispUrl: null, // null -> (https?wss)://<host>/wisp/

  // Status endpoint used to detect backend availability.
  statusEndpoint: "/api/status",

  // Whether the server requires authentication (filled in by backend).
  authRequired: false
};
