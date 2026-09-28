const router = require('express').Router();

// Viber sends all events (messages, subscriptions, etc.) here.
// We log the sender's unique Viber ID so the admin can copy it
// and set it as VIBER_RECEIVER_ID in Railway.
router.post('/', (req, res) => {
  const event = req.body || {};
  const senderId = event.sender?.id || event.user?.id || null;
  const senderName = event.sender?.name || event.user?.name || '';

  if (senderId) {
    console.log(`[viber-webhook] event=${event.event} sender="${senderName}" id=${senderId}`);
    console.log(`[viber-webhook] >>> SET VIBER_RECEIVER_ID=${senderId} in Railway env vars <<<`);
  } else {
    console.log('[viber-webhook] received (no sender id):', JSON.stringify(event).slice(0, 300));
  }

  // Viber requires a 200 OK with status 0
  res.json({ status: 0 });
});

module.exports = router;
