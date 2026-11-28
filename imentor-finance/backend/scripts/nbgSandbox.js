// npm run nbg:sandbox  → creates the sandbox named by NBG_SANDBOX_ID (sandbox environment only).
// If NBG rejects the minimal body, create the sandbox with "Try it" in the portal instead (step 8 of its guide).
require('dotenv').config();
const nbg = require('../src/services/bankProviders/nbgAggregator');
(async () => {
  if (process.env.NBG_ENV === 'production') throw new Error('Sandboxes exist only in the sandbox environment.');
  console.log(JSON.stringify(await nbg.createSandbox(), null, 2));
})().catch(e => { console.error(e.message); process.exit(1); });
