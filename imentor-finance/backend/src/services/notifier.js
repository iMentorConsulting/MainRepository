const clients = new Set();

function addClient(res) {
  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 25000);

  clients.add(res);
  console.log(`[notifier] client connected, total=${clients.size}`);

  return () => {
    clearInterval(heartbeat);
    clients.delete(res);
    console.log(`[notifier] client disconnected, total=${clients.size}`);
  };
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  console.log(`[notifier] broadcast ${event} → ${clients.size} client(s)`);
  for (const res of clients) {
    try { res.write(msg); } catch (_) { clients.delete(res); }
  }
}

module.exports = { addClient, broadcast };
