const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ServiceDepartmentMap = sequelize.define('ServiceDepartmentMap', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  service_name: { type: DataTypes.STRING, allowNull: false, unique: true },
  department:   { type: DataTypes.STRING, allowNull: false },
}, { tableName: 'service_department_maps', timestamps: true });

module.exports = ServiceDepartmentMap;
