const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Income = sequelize.define('Income', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_name:           { type: DataTypes.STRING },
  work_status:             { type: DataTypes.STRING },
  email:                   { type: DataTypes.STRING },
  phone:                   { type: DataTypes.STRING },
  city:                    { type: DataTypes.STRING },
  postal_code:             { type: DataTypes.STRING },
  address:                 { type: DataTypes.STRING },
  vat_number:              { type: DataTypes.STRING },
  business_activity:       { type: DataTypes.STRING },
  accountant:              { type: DataTypes.STRING },
  accountant_email:        { type: DataTypes.STRING },
  amount_application:      { type: DataTypes.DECIMAL(12,2) },
  amount_implementation:   { type: DataTypes.DECIMAL(12,2) },
  approval_date:           { type: DataTypes.DATEONLY },
  completion_deadline:     { type: DataTypes.DATEONLY },
  investment_height:       { type: DataTypes.DECIMAL(12,2) },
  total_debts:             { type: DataTypes.DECIMAL(12,2) },
  source_referral:         { type: DataTypes.STRING },
  sales_agent:             { type: DataTypes.STRING },
  bonus:                   { type: DataTypes.DECIMAL(12,2) },
  folder_agent:            { type: DataTypes.STRING },
  amount_collected:        { type: DataTypes.DECIMAL(12,2) },
  vat_amount:              { type: DataTypes.DECIMAL(12,2) },
  service_type:            { type: DataTypes.STRING },
  targeting_category:      { type: DataTypes.STRING },
  sale_date:               { type: DataTypes.DATEONLY },
  description:             { type: DataTypes.TEXT },
  invoice_number:          { type: DataTypes.STRING },
  unsubscribe:             { type: DataTypes.BOOLEAN, defaultValue: false },
  elorus_invoice_id:       { type: DataTypes.STRING },
  accountant_notified:     { type: DataTypes.BOOLEAN, defaultValue: false },
  accountant_notified_at:  { type: DataTypes.DATE }
}, {
  tableName: 'income',
  timestamps: true
});

module.exports = Income;
