const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const IncomingLead = sequelize.define('IncomingLead', {
  id:                    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  external_id:           { type: DataTypes.STRING, unique: true },
  source:                { type: DataTypes.STRING },           // 'case_management' | 'exodikastikos'
  status:                { type: DataTypes.STRING, defaultValue: 'pending' }, // pending | converted | dismissed

  // Customer
  customer_name:         { type: DataTypes.STRING },
  vat_number:            { type: DataTypes.STRING },
  phone:                 { type: DataTypes.STRING },
  email:                 { type: DataTypes.STRING },
  city:                  { type: DataTypes.STRING },
  address:               { type: DataTypes.STRING },
  postal_code:           { type: DataTypes.STRING },
  business_activity:     { type: DataTypes.STRING },

  // Service
  service_type:          { type: DataTypes.STRING },
  targeting_category:    { type: DataTypes.STRING },
  work_status:           { type: DataTypes.STRING },
  description:           { type: DataTypes.TEXT },
  source_referral:       { type: DataTypes.STRING },
  sales_agent:           { type: DataTypes.STRING },

  // Payment
  amount_collected:      { type: DataTypes.DECIMAL(12,2) },
  amount_application:    { type: DataTypes.DECIMAL(12,2) },
  amount_implementation: { type: DataTypes.DECIMAL(12,2) },
  sale_date:             { type: DataTypes.DATEONLY },
  invoice_type:          { type: DataTypes.STRING },           // ΤΙΜΟΛΟΓΙΟ | ΑΠΟΔΕΙΞΗ | ΑΝΕΥ
  organization:          { type: DataTypes.STRING },           // ΑΠΟΣΤΟΛΑΚΗΣ | I-MENTOR

  // Result
  income_id:             { type: DataTypes.INTEGER },          // set on convert
  converted_at:          { type: DataTypes.DATE },
  notes:                 { type: DataTypes.TEXT },
  raw_payload:           { type: DataTypes.JSON },             // full webhook body for debugging
}, {
  tableName: 'incoming_leads',
  timestamps: true
});

module.exports = IncomingLead;
