const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const CommissionLog = sequelize.define('CommissionLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  accountant_name:   { type: DataTypes.STRING },
  accountant_email:  { type: DataTypes.STRING },
  income_ids:        { type: DataTypes.JSONB, defaultValue: [] },
  total_amount:      { type: DataTypes.DECIMAL(12,2) },
  records_count:     { type: DataTypes.INTEGER },
  year:              { type: DataTypes.INTEGER },
  month:             { type: DataTypes.INTEGER },
  notes:             { type: DataTypes.TEXT }
}, {
  tableName: 'commission_logs',
  timestamps: true
});

module.exports = CommissionLog;
