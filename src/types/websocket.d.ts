// @types/sockjs-client doesn't build because 'WebSocket' isn't found.
// The library probably assumes it's running on a browser where WebSocket is present. On nodeJS we need import from "ws".
type WebSocket = any;
