'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CaseTemplateItem = sequelize.define('CaseTemplateItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    case_template_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'case_templates',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'items',
        key: 'id'
      },
      onDelete: 'CASCADE'
    }
  }, {
    timestamps: false,
    underscored: true,
    tableName: 'case_template_items',
    indexes: [
      {
        unique: true,
        fields: ['case_template_id', 'item_id']
      }
    ]
  });

  CaseTemplateItem.associate = (models) => {
    // Associations can be defined here if needed
  };

  return CaseTemplateItem;
};
