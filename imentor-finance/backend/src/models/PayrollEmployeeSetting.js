const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PayrollEmployeeSetting = sequelize.define('PayrollEmployeeSetting', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employee_name: { type: DataTypes.STRING, allowNull: false, unique: true },
  visible:       { type: DataTypes.BOOLEAN, defaultValue: true },
  target_type:   { type: DataTypes.ENUM('multiplier', 'fixed'), defaultValue: 'multiplier' },
  target_value:      { type: DataTypes.DECIMAL(10, 2), defaultValue: 4.2 },
  monthly_overrides:    { type: DataTypes.JSONB, defaultValue: {} },
  overachievement_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 10.00 }, // % e.g. 10 = 10%
}, {
  tableName: 'payroll_employee_settings',
  timestamps: true
});

module.exports = PayrollEmployeeSetting;
