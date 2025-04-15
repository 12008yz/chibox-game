const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PromoCodeUser = sequelize.define('PromoCodeUser', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    promo_code_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'promo_codes',
        key: 'id'
      },
      comment: "ID промокода"
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: "ID пользователя, которому доступен промокод"
    },
    is_used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Использовал ли пользователь этот промокод"
    },
    expiry_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Дата истечения доступа к промокоду для этого пользователя"
    },
    notification_sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Было ли отправлено уведомление пользователю о промокоде"
    },
    assigned_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "ID администратора, который назначил промокод пользователю"
    },
    granted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "Дата и время предоставления доступа к промокоду"
    }
  }, {
    timestamps: true,
    underscored: true,
    tableName: 'promo_code_users',
    indexes: [
      {
        fields: ['promo_code_id', 'user_id'],
        unique: true
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['promo_code_id']
      },
      {
        fields: ['is_used']
      },
      {
        fields: ['expiry_date']
      }
    ]
  });

  // Ассоциации
  PromoCodeUser.associate = (models) => {
    PromoCodeUser.belongsTo(models.PromoCode, {
      foreignKey: 'promo_code_id',
      as: 'promo_code'
    });
    
    PromoCodeUser.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return PromoCodeUser;
};