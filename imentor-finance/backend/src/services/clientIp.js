// NBG wants the customer's IPv4 on every call (X-Fapi-Customer-Ip-Address). Behind Railway's proxy the browser's
// IP can arrive as IPv6 or as ::ffff:1.2.3.4, so look through the whole forwarded chain for an IPv4.
const V4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const clean = ip => String(ip || '').trim().replace(/^::ffff:/i, '');

function pickIpv4(...candidates) {
  for (const c of candidates.flat()) { const ip = clean(c); if (V4.test(ip)) return ip; }
  return '';
}

const clientIp = req => pickIpv4(req.ips || [], req.ip, (req.headers?.['x-forwarded-for'] || '').split(','));

module.exports = { pickIpv4, clientIp };
