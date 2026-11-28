// npm run nbg:banks  → asks NBG which banks you can connect to and prints their BICs.
// Use it to check the default BICs (nbg/alpha/piraeus/eurobank); override with NBG_BANK_BICS if one differs.
require('dotenv').config();
const nbg = require('../src/services/bankProviders/nbgAggregator');
(async () => {
  if (!nbg.isConfigured()) throw new Error('Set NBG_CLIENT_ID, NBG_CLIENT_SECRET (and NBG_SANDBOX_ID for the sandbox) first.');
  const banks = await nbg.listBanks();
  console.table(banks.map(b => ({ displayName: b.displayName, bankBIC: b.bankBIC, country: b.country, accounts: b.capabilities?.['AIS-Bank-Account-Transactions'] })));
  console.log('Defaults in use:', nbg._internals.bics());
})().catch(e => { console.error(e.message); process.exit(1); });
