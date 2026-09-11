const axios = require('axios');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const PayrollEmployeeSetting = require('../models/PayrollEmployeeSetting');

const DEFAULT_MULTIPLIER = 4.2;
const MONTH_NAMES_EL = [
  'Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
  'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος',
];
const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

function normalizeKey(n) {
  if (!n) return '';
  return n.trim().toUpperCase()
    .replace(/Α/g,'A').replace(/Β/g,'B').replace(/Ε/g,'E').replace(/Ζ/g,'Z')
    .replace(/Η/g,'H').replace(/Ι/g,'I').replace(/Κ/g,'K').replace(/Μ/g,'M')
    .replace(/Ν/g,'N').replace(/Ο/g,'O').replace(/Ρ/g,'R').replace(/Τ/g,'T')
    .replace(/Υ/g,'Y').replace(/Χ/g,'X');
}

async function buildEmployeeTargets() {
  const now = new Date();
  const year = now.getFullYear().toString();
  const monthIdx = now.getMonth(); // 0-based
  const monthNum = monthIdx + 1;
  const month = MONTHS[monthIdx];
  const lastDay = new Date(parseInt(year), monthNum, 0).getDate();
  const monthStart = `${year}-${month}-01`;
  const monthEnd   = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;

  const [payrollRows, salesRows, allSettings] = await Promise.all([
    sequelize.query(`
      SELECT UPPER(TRIM(supplier)) AS employee, TO_CHAR(date, 'MM') AS month,
             COALESCE(SUM(amount), 0)                                                                        AS amount,
             COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)                                  AS gross_amount
      FROM expenses
      WHERE date BETWEEN :start AND :end
        AND UPPER(TRIM(category)) LIKE '%ΜΙΣΘΟΔΟΣΙΑ%ΕΡΓΑΤΙΚΑ%'
        AND supplier IS NOT NULL AND TRIM(supplier) <> ''
      GROUP BY UPPER(TRIM(supplier)), month
    `, { replacements: { start: `${year}-01-01`, end: `${year}-12-31` }, type: QueryTypes.SELECT }),

    sequelize.query(`
      SELECT UPPER(TRIM(sales_agent)) AS agent_key,
             COALESCE(SUM(COALESCE(amount_collected, 0)), 0) AS sales
      FROM income
      WHERE sale_date BETWEEN :monthStart AND :monthEnd
        AND sales_agent IS NOT NULL AND TRIM(sales_agent) <> ''
      GROUP BY UPPER(TRIM(sales_agent))
    `, { replacements: { monthStart, monthEnd }, type: QueryTypes.SELECT }),

    PayrollEmployeeSetting.findAll({ raw: true }),
  ]);

  const settingsMap = {};
  for (const s of allSettings) settingsMap[normalizeKey(s.employee_name)] = s;

  // Re-aggregate payroll by normalized key to handle encoding mismatches
  const payrollAgg = {};
  for (const r of payrollRows) {
    const key = normalizeKey(r.employee) + '|' + r.month;
    if (!payrollAgg[key]) payrollAgg[key] = { ...r, amount: 0, gross_amount: 0 };
    payrollAgg[key].amount    += parseFloat(r.amount || 0);
    payrollAgg[key].gross_amount += parseFloat(r.gross_amount || 0);
  }
  const mergedRows = Object.values(payrollAgg);

  // IKA pool per month
  const ikaMap = {};
  for (const r of mergedRows) {
    if (settingsMap[normalizeKey(r.employee)]?.is_ika_supplier)
      ikaMap[r.month] = (ikaMap[r.month] || 0) + parseFloat(r.amount || 0);
  }

  // Canonical employee list (visible only)
  const employees = [...new Set(
    mergedRows.map(r => {
      const s = settingsMap[normalizeKey(r.employee)];
      return s ? s.employee_name : r.employee;
    })
  )].sort((a, b) => a.localeCompare(b, 'el'));

  const employeeData = [];
  for (const employee of employees) {
    const normKey  = normalizeKey(employee);
    const settings = settingsMap[normKey];
    if (settings && !settings.visible) continue;

    const empRows = mergedRows.filter(r => normalizeKey(r.employee) === normKey);
    const ikaPct  = parseFloat(settings?.ika_percentage ?? 0);

    // Rolling 3-month average gross cost for prev_cost_multiplier target
    const rollingCosts = [];
    for (let back = 1; back <= 3; back++) {
      const pi = monthIdx - back;
      if (pi < 0) break;
      const pm    = MONTHS[pi];
      const pmPr  = empRows.find(r => r.month === pm);
      const pmGross = parseFloat(pmPr?.gross_amount || 0);
      const pmIka   = ikaPct > 0 ? parseFloat(((ikaMap[pm] || 0) * ikaPct / 100).toFixed(2)) : 0;
      const pmCost  = pmGross + pmIka;
      if (pmCost > 0) rollingCosts.push(pmCost);
    }
    const prevGrossCost = rollingCosts.length > 0
      ? parseFloat((rollingCosts.reduce((s, v) => s + v, 0) / rollingCosts.length).toFixed(2))
      : 0;

    // Current month net amount (for 'multiplier' type)
    const pr     = empRows.find(r => r.month === month);
    const amount = parseFloat(pr?.amount || 0);

    // Compute target
    let target = 0;
    const overrideKey = `${year}-${month}`;
    const override = settings?.monthly_overrides?.[overrideKey];
    if (override != null) {
      target = parseFloat(override);
    } else if (settings?.target_type === 'fixed') {
      target = parseFloat(settings.target_value || 0);
    } else if (settings?.target_type === 'prev_cost_multiplier') {
      const mult = parseFloat(settings.target_value || 3);
      target = prevGrossCost > 0 ? parseFloat((prevGrossCost * mult).toFixed(2)) : 0;
    } else {
      const mult = settings ? parseFloat(settings.target_value || DEFAULT_MULTIPLIER) : DEFAULT_MULTIPLIER;
      target = amount > 0 ? parseFloat((amount * mult).toFixed(2)) : 0;
    }

    const sr    = salesRows.find(r => normalizeKey(r.agent_key) === normKey);
    const sales = parseFloat(sr?.sales || 0);
    const achievement_pct = target > 0 ? parseFloat(((sales / target) * 100).toFixed(1)) : null;

    if (target === 0 && sales === 0) continue; // skip employees with no data this month

    employeeData.push({ name: employee, target, sales_to_date: sales, achievement_pct });
  }

  return {
    source:         'imentor-finance',
    sent_at:        now.toISOString(),
    year:           parseInt(year),
    month:          monthNum,
    month_name:     MONTH_NAMES_EL[monthIdx],
    days_elapsed:   now.getDate(),
    days_in_month:  lastDay,
    employees:      employeeData,
  };
}

async function pushToWebhook(systemName, url, apiKey, payload) {
  if (!url) return { system: systemName, skipped: true, reason: 'Webhook URL not configured' };
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  try {
    const res = await axios.post(url, payload, { headers, timeout: 15000 });
    return { system: systemName, ok: true, status: res.status };
  } catch (e) {
    const status = e.response?.status;
    const detail = e.response?.data || e.message;
    console.error(`[payroll-target-sync] Push to ${systemName} failed (${status}):`, detail);
    return { system: systemName, ok: false, status, error: String(detail).slice(0, 200) };
  }
}

async function runPayrollTargetSync() {
  const payload = await buildEmployeeTargets();
  const results = await Promise.all([
    pushToWebhook('exodikastikos',  process.env.EXODIKASTIKOS_WEBHOOK_URL, process.env.EXODIKASTIKOS_API_KEY,  payload),
    pushToWebhook('case_management', process.env.CASE_MGT_WEBHOOK_URL,     process.env.CASE_MGT_API_KEY,       payload),
  ]);
  return { ran_at: payload.sent_at, employee_count: payload.employees.length, results };
}

module.exports = { runPayrollTargetSync, buildEmployeeTargets };
