// SPDX-License-Identifier: GPL-3.0-or-later

// Keep the optional native-host WebSocket active during Node-only fixture waits.
// These control frames never reach Playwright's page/game protocol. They do not
// add a liveness deadline or change who closes a failed connection.
export function keepAcceptanceTransportAlive(socket) {
  const stop = () => {
    clearInterval(timer);
    socket.off('close', stop);
    socket.off('error', stop);
  };
  const timer = setInterval(() => {
    if (socket.readyState !== socket.OPEN) return stop();
    socket.ping(error => { if (error) stop(); });
  }, 5000);
  timer.unref();
  socket.once('close', stop);
  socket.once('error', stop);
  return stop;
}
