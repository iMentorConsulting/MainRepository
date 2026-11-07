const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ServiceAgreement = sequelize.define('ServiceAgreement', {
  id:                    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customer_id:           { type: DataTypes.INTEGER },
  customer_name:         { type: DataTypes.STRING },
  vat_number:            { type: DataTypes.STRING },
  service_type:          { type: DataTypes.STRING },
  status:                { type: DataTypes.STRING, defaultValue: 'ΕΝΕΡΓΟ' },
  amount_application:    { type: DataTypes.DECIMAL(12,2) },
  amount_implementation: { type: DataTypes.DECIMAL(12,2) },
  amount_collected_total:{ type: DataTypes.DECIMAL(12,2), defaultValue: 0 },
  approval_date:         { type: DataTypes.DATEONLY },
  completion_deadline:   { type: DataTypes.DATEONLY },
  investment_height:     { type: DataTypes.DECIMAL(12,2) },
  total_debts:           { type: DataTypes.DECIMAL(12,2) },
  sales_agent:           { type: DataTypes.STRING },
  folder_agent:          { type: DataTypes.STRING },
  source_referral:       { type: DataTypes.STRING },
  targeting_category:    { type: DataTypes.STRING },
  description:           { type: DataTypes.TEXT }
}, {
  tableName: 'service_agreements',
  timestamps: true
});

module.exports = ServiceAgreement;
