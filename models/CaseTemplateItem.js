'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CaseTemplateItem = sequelize.define('CaseTemplateItem', {
    case_template_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'case_templates',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'items',
        key: 'id'
      },
      onDelete: 'CASCADE'
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'case_template_items'
  });

  CaseTemplateItem.associate = (models) => {
    // Associations can be defined here if needed
  };

  return CaseTemplateItem;
};
