const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { addClient } = require('../services/notifier');

// SSE stream — auth via ?token= query param (EventSource doesn't support headers)
router.get('/stream', (req, res) => {
  try {
    jwt.verify(req.query.token || '', process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Μη έγκυρο token' });
  }
  const cleanup = addClient(res);
  req.on('close', cleanup);
});

module.exports = router;
