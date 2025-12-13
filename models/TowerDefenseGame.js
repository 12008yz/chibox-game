module.exports = (sequelize, DataTypes) => {
   const TowerDefenseGame = sequelize.define('TowerDefenseGame', {
     id: {
       type: DataTypes.UUID,
       defaultValue: DataTypes.UUIDV4,
       primaryKey: true
     },
     user_id: {
       type: DataTypes.UUID,
       allowNull: false,
       references: {
         model: 'users',
         key: 'id'
       }
     },
     waves_completed: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     total_waves: {
       type: DataTypes.INTEGER,
       defaultValue: 10,
       allowNull: false
     },
     enemies_killed: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     towers_built: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     score: {
       type: DataTypes.INTEGER,
       defaultValue: 0,
       allowNull: false
     },
     result: {
       type: DataTypes.ENUM('win', 'lose', 'in_progress'),
       defaultValue: 'in_progress',
       allowNull: false
     },
    reward_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: true
    },
    bet_item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'items',
        key: 'id'
      },
      comment: "ID предмета, поставленного на кон"
    },
    bet_inventory_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'user_inventory',
        key: 'id'
      },
      comment: "ID записи инвентаря с предметом ставки"
    },
    reward_item_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'items',
        key: 'id'
      },
      comment: "ID предмета-награды за победу"
    },
    game_data: {
      type: DataTypes.JSONB,
      allowNull: true
    },
     completed_at: {
       type: DataTypes.DATE,
       allowNull: true
     }
   }, {
     tableName: 'tower_defense_games',
     underscored: true,
     timestamps: true,
     createdAt: 'created_at',
     updatedAt: 'updated_at'
   });

   TowerDefenseGame.associate = (models) => {
     TowerDefenseGame.belongsTo(models.Item, {
       foreignKey: 'bet_item_id',
       as: 'bet_item'
     });
     TowerDefenseGame.belongsTo(models.Item, {
       foreignKey: 'reward_item_id',
       as: 'reward_item'
     });
     TowerDefenseGame.belongsTo(models.UserInventory, {
       foreignKey: 'bet_inventory_id',
       as: 'bet_inventory'
     });
   };
   
     return TowerDefenseGame;
   };
   