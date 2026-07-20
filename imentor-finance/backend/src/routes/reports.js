const router = require('express').Router();
const { Op, fn, col, literal, QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const Income = require('../models/Income');
const Expense = require('../models/Expense');

// Build Sequelize WHERE for a date field supporting single or multi year/month
function dateWhere(query, field) {
  const yearList = (query.years || query.year || '').toString().split(',').map(s => s.trim()).filter(Boolean);
  const monthList = (query.months || query.month || '').toString().split(',').map(s => s.trim()).filter(Boolean);
  if (!yearList.length) return {};
  const ranges = [];
  for (const y of yearList) {
    if (monthList.length) {
      for (const m of monthList) {
        const mm = m.padStart(2, '0');
        const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
        ranges.push({ [field]: { [Op.between]: [`${y}-${mm}-01`, `${y}-${mm}-${String(lastDay).padStart(2,'0')}`] } });
      }
    } else {
      ranges.push({ [field]: { [Op.between]: [`${y}-01-01`, `${y}-12-31`] } });
    }
  }
  return ranges.length === 1 ? ranges[0] : { [Op.or]: ranges };
}

// Build SQL snippet for raw queries
function sqlDateCond(query, field) {
  const yearList = (query.years || query.year || '').toString().split(',').map(s => s.trim()).filter(Boolean);
  const monthList = (query.months || query.month || '').toString().split(',').map(s => s.trim()).filter(Boolean);
  if (!yearList.length) return { condition: '1=1', replacements: {} };
  const parts = [], rep = {};
  let idx = 0;
  for (const y of yearList) {
    if (monthList.length) {
      for (const m of monthList) {
        const mm = m.padStart(2, '0');
        const [sk, ek] = [`start${idx}`, `end${idx}`];
        parts.push(`${field} BETWEEN :${sk} AND :${ek}`);
        const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
        rep[sk] = `${y}-${mm}-01`; rep[ek] = `${y}-${mm}-${String(lastDay).padStart(2,'0')}`;
        idx++;
      }
    } else {
      const [sk, ek] = [`start${idx}`, `end${idx}`];
      parts.push(`${field} BETWEEN :${sk} AND :${ek}`);
      rep[sk] = `${y}-01-01`; rep[ek] = `${y}-12-31`;
      idx++;
    }
  }
  return { condition: `(${parts.join(' OR ')})`, replacements: rep };
}

// Summary: total income, expenses, profit for a period
router.get('/summary', async (req, res) => {
  try {
    const incomeWhere = dateWhere(req.query, 'sale_date');
    const expenseWhere = dateWhere(req.query, 'date');

    const [incomeResult] = await Income.findAll({
      where: incomeWhere,
      attributes: [[fn('SUM', col('amount_collected')), 'total'], [fn('COUNT', col('id')), 'count']],
      raw: true
    });
    const [expenseResult] = await Expense.findAll({
      where: expenseWhere,
      attributes: [[fn('SUM', col('amount')), 'total'], [fn('COUNT', col('id')), 'count']],
      raw: true
    });

    const income = parseFloat(incomeResult?.total || 0);
    const expenses = parseFloat(expenseResult?.total || 0);
    const profit = income - expenses;
    const profitPct = income > 0 ? (profit / income) * 100 : 0;

    res.json({
      income, expenses, profit, profit_pct: profitPct,
      income_count: parseInt(incomeResult?.count || 0),
      expense_count: parseInt(expenseResult?.count || 0)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Monthly breakdown for a year (uses first selected year)
router.get('/monthly', async (req, res) => {
  try {
    const year = (req.query.years || req.query.year || '').toString().split(',')[0].trim();
    if (!year) return res.status(400).json({ error: 'Απαιτείται year' });

    const incomeRows = await sequelize.query(`
      SELECT TO_CHAR(sale_date, 'MM') as month,
             SUM(amount_collected) as income,
             COUNT(*) as count
      FROM income
      WHERE sale_date BETWEEN :start AND :end
        AND amount_collected IS NOT NULL
      GROUP BY month ORDER BY month
    `, { replacements: { start: `${year}-01-01`, end: `${year}-12-31` }, type: QueryTypes.SELECT });

    const expenseRows = await sequelize.query(`
      SELECT TO_CHAR(date, 'MM') as month,
             SUM(amount) as expenses
      FROM expenses
      WHERE date BETWEEN :start AND :end
        AND amount IS NOT NULL
      GROUP BY month ORDER BY month
    `, { replacements: { start: `${year}-01-01`, end: `${year}-12-31` }, type: QueryTypes.SELECT });

    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthNames = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];

    const data = months.map((m, i) => {
      const inc = incomeRows.find(r => r.month === m);
      const exp = expenseRows.find(r => r.month === m);
      const income = parseFloat(inc?.income || 0);
      const expenses = parseFloat(exp?.expenses || 0);
      const profit = income - expenses;
      return {
        month: m, month_name: monthNames[i],
        income, expenses, profit,
        profit_pct: income > 0 ? (profit / income) * 100 : 0,
        count: parseInt(inc?.count || 0)
      };
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// By service type
router.get('/by-service', async (req, res) => {
  try {
    const where = dateWhere(req.query, 'sale_date');

    const rows = await Income.findAll({
      where,
      attributes: [
        'service_type',
        [fn('SUM', col('amount_collected')), 'income'],
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['service_type'],
      order: [[fn('SUM', col('amount_collected')), 'DESC']],
      raw: true
    });

    res.json(rows.map(r => ({
      service_type: r.service_type || 'Άγνωστο',
      income: parseFloat(r.income || 0),
      count: parseInt(r.count || 0)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// By agent
router.get('/by-agent', async (req, res) => {
  try {
    const where = dateWhere(req.query, 'sale_date');

    const rows = await Income.findAll({
      where,
      attributes: [
        'sales_agent',
        [fn('SUM', col('amount_collected')), 'income'],
        [fn('SUM', col('bonus')), 'bonus'],
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['sales_agent'],
      order: [[fn('SUM', col('amount_collected')), 'DESC']],
      raw: true
    });

    res.json(rows.map(r => ({
      agent: r.sales_agent || 'Άγνωστος',
      income: parseFloat(r.income || 0),
      bonus: parseFloat(r.bonus || 0),
      count: parseInt(r.count || 0)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bonus report by agent per month
router.get('/bonus', async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'Απαιτείται year' });

    const rows = await sequelize.query(`
      SELECT
        sales_agent,
        TO_CHAR(sale_date, 'MM') as month,
        SUM(bonus) as bonus,
        SUM(amount_application) as amount_application,
        COUNT(*) as count
      FROM income
      WHERE sale_date BETWEEN :start AND :end
        AND sales_agent IS NOT NULL
      GROUP BY sales_agent, month
      ORDER BY sales_agent, month
    `, { replacements: { start: `${year}-01-01`, end: `${year}-12-31` }, type: QueryTypes.SELECT });

    const agents = [...new Set(rows.map(r => r.sales_agent))];
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

    const data = agents.map(agent => {
      const agentRows = rows.filter(r => r.sales_agent === agent);
      const monthly = months.map((m, i) => {
        const r = agentRows.find(x => x.month === m);
        return { month: m, month_name: monthNames[i], bonus: parseFloat(r?.bonus || 0), count: parseInt(r?.count || 0) };
      });
      const total = monthly.reduce((s, m) => s + m.bonus, 0);
      return { agent, monthly, total };
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Payroll report: expenses with category ΜΙΣΘΟΔΟΣΙΑ-ΕΡΓΑΤΙΚΑ grouped by supplier per month
router.get('/payroll', async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'Απαιτείται year' });

    const rows = await sequelize.query(`
      SELECT
        TRIM(supplier) AS employee,
        TO_CHAR(date, 'MM') AS month,
        COALESCE(SUM(amount), 0) AS amount,
        COUNT(*) AS count
      FROM expenses
      WHERE date BETWEEN :start AND :end
        AND UPPER(TRIM(category)) = 'ΜΙΣΘΟΔΟΣΙΑ-ΕΡΓΑΤΙΚΑ'
        AND supplier IS NOT NULL AND TRIM(supplier) <> ''
      GROUP BY TRIM(supplier), month
      ORDER BY TRIM(supplier), month
    `, { replacements: { start: `${year}-01-01`, end: `${year}-12-31` }, type: QueryTypes.SELECT });

    const employees = [...new Set(rows.map(r => r.employee))].sort((a, b) => a.localeCompare(b, 'el'));
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

    const data = employees.map(employee => {
      const empRows = rows.filter(r => r.employee === employee);
      const monthly = months.map((m, i) => {
        const r = empRows.find(x => x.month === m);
        return { month: m, month_name: monthNames[i], amount: parseFloat(r?.amount || 0), count: parseInt(r?.count || 0) };
      });
      const total = monthly.reduce((s, m) => s + m.amount, 0);
      return { agent: employee, monthly, total };
    });

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Expense breakdown by category
router.get('/expenses-by-category', async (req, res) => {
  try {
    const where = dateWhere(req.query, 'date');

    const rows = await Expense.findAll({
      where,
      attributes: ['category', [fn('SUM', col('amount')), 'total'], [fn('COUNT', col('id')), 'count']],
      group: ['category'],
      order: [[fn('SUM', col('amount')), 'DESC']],
      raw: true
    });

    res.json(rows.map(r => ({
      category: r.category || 'Άγνωστο',
      total: parseFloat(r.total || 0),
      count: parseInt(r.count || 0)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/by-customer', async (req, res) => {
  try {
    const { condition: dateCondition, replacements } = sqlDateCond(req.query, 'sale_date');

    const rows = await sequelize.query(`
      SELECT
        customer_name,
        vat_number,
        COALESCE(SUM(amount_collected), 0) as income,
        COUNT(*) as count,
        COUNT(DISTINCT service_type) as service_count,
        STRING_AGG(DISTINCT service_type, ', ' ORDER BY service_type) as services
      FROM income
      WHERE ${dateCondition}
      GROUP BY customer_name, vat_number
      HAVING COALESCE(SUM(amount_collected), 0) > 0
      ORDER BY income DESC
    `, { replacements, type: QueryTypes.SELECT });

    res.json(rows.map(r => ({
      customer_name: r.customer_name,
      vat_number: r.vat_number || '—',
      income: parseFloat(r.income || 0),
      count: parseInt(r.count || 0),
      services: r.services || '—'
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Income grouped by accountant (for email-style report)
router.get('/by-accountant', async (req, res) => {
  try {
    const where = dateWhere(req.query, 'sale_date');

    const rows = await Income.findAll({
      where,
      order: [['accountant', 'ASC'], ['sale_date', 'DESC']],
      raw: true
    });

    const grouped = {};
    for (const r of rows) {
      const key = r.accountant || 'Χωρίς Λογιστή';
      if (!grouped[key]) grouped[key] = { accountant: key, email: r.accountant_email, records: [] };
      grouped[key].records.push(r);
    }

    res.json(Object.values(grouped).map(g => ({
      ...g,
      total: g.records.reduce((s, r) => s + parseFloat(r.amount_collected || 0), 0)
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/open-cases', async (req, res) => {
  try {
    const { year } = req.query;
    if (!year) return res.status(400).json({ error: 'Απαιτείται year' });
    const ServiceAgreement = require('../models/ServiceAgreement');

    const rows = await sequelize.query(`
      SELECT
        TO_CHAR(created_at, 'MM') as month,
        sales_agent,
        COUNT(*) FILTER (WHERE status = 'ΕΝ ΕΞΕΛΙΞΕΙ') as open_count,
        COUNT(*) FILTER (WHERE status = 'ΠΑΓΩΜΕΝΕΣ') as frozen_count,
        COUNT(*) FILTER (WHERE status = 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΕΠΙΤΥΧΩΣ') as completed_ok,
        COUNT(*) FILTER (WHERE status = 'ΟΛΟΚΛΗΡΩΜΕΝΕΣ FAIL') as completed_fail,
        COUNT(*) as total
      FROM service_agreements
      WHERE created_at BETWEEN :start AND :end
      GROUP BY month, sales_agent
      ORDER BY month, sales_agent
    `, {
      replacements: { start: `${year}-01-01`, end: `${year}-12-31 23:59:59` },
      type: QueryTypes.SELECT
    });

    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthNames = ['Ιαν','Φεβ','Μαρ','Απρ','Μαι','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

    const data = months.map((m, i) => {
      const monthRows = rows.filter(r => r.month === m);
      const agents = monthRows.reduce((acc, r) => {
        if (r.sales_agent) acc.push({
          agent: r.sales_agent,
          open: parseInt(r.open_count || 0),
          frozen: parseInt(r.frozen_count || 0),
          completed_ok: parseInt(r.completed_ok || 0),
          completed_fail: parseInt(r.completed_fail || 0),
          total: parseInt(r.total || 0)
        });
        return acc;
      }, []);
      const totals = monthRows.reduce((acc, r) => ({
        open: acc.open + parseInt(r.open_count || 0),
        frozen: acc.frozen + parseInt(r.frozen_count || 0),
        completed_ok: acc.completed_ok + parseInt(r.completed_ok || 0),
        completed_fail: acc.completed_fail + parseInt(r.completed_fail || 0),
        total: acc.total + parseInt(r.total || 0)
      }), { open: 0, frozen: 0, completed_ok: 0, completed_fail: 0, total: 0 });
      return { month: m, month_name: monthNames[i], ...totals, agents };
    });

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/available-years', async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM sale_date)::int AS year
       FROM income
       WHERE sale_date IS NOT NULL
       ORDER BY year DESC`,
      { type: QueryTypes.SELECT }
    );
    res.json(rows.map(r => r.year).filter(Boolean));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/available-case-years', async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS year
       FROM service_agreements
       WHERE created_at IS NOT NULL
       ORDER BY year DESC`,
      { type: QueryTypes.SELECT }
    );
    res.json(rows.map(r => r.year).filter(Boolean));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/service-trend', async (req, res) => {
  try {
    const { service_type, year } = req.query;
    if (!service_type) {
      // Return distinct service types when called without parameters
      const types = await sequelize.query(
        `SELECT DISTINCT service_type FROM income WHERE service_type IS NOT NULL ORDER BY service_type`,
        { type: QueryTypes.SELECT }
      );
      return res.json(types.map(r => r.service_type));
    }
    const whereYear = year ? `AND EXTRACT(YEAR FROM sale_date) = ${parseInt(year)}` : '';
    const rows = await sequelize.query(`
      SELECT
        EXTRACT(YEAR FROM sale_date)::int AS year,
        EXTRACT(MONTH FROM sale_date)::int AS month,
        TO_CHAR(DATE_TRUNC('month', sale_date), 'YYYY-MM') AS period,
        COUNT(*) AS count,
        COALESCE(SUM(amount_collected), 0) AS total,
        COALESCE(SUM(amount_application), 0) AS total_application,
        COALESCE(SUM(amount_implementation), 0) AS total_implementation
      FROM income
      WHERE service_type = :service_type ${whereYear}
      GROUP BY year, month, period
      ORDER BY year, month
    `, { replacements: { service_type }, type: QueryTypes.SELECT });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
