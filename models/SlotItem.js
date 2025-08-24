module.exports = (sequelize, DataTypes) => {
   const SlotItem = sequelize.define('SlotItem', {
     id: {
       type: DataTypes.INTEGER,
       primaryKey: true,
       autoIncrement: true
     },
     name: {
       type: DataTypes.STRING(255),
       allowNull: false,
       comment: 'Название предмета'
     },
     image_url: {
       type: DataTypes.TEXT,
       allowNull: true,
       comment: 'URL изображения предмета Steam CDN'
     },
     price: {
       type: DataTypes.DECIMAL(10, 2),
       allowNull: false,
       defaultValue: 0.00,
       comment: 'Цена предмета в рублях'
     },
     rarity: {
       type: DataTypes.ENUM('consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'contraband', 'exotic'),
       allowNull: false,
       defaultValue: 'consumer',
       comment: 'Редкость предмета'
     },
     steam_market_hash_name: {
       type: DataTypes.STRING(255),
       allowNull: true,
       comment: 'Steam Market Hash Name для API запросов'
     },
     is_active: {
       type: DataTypes.BOOLEAN,
       allowNull: false,
       defaultValue: true,
       comment: 'Активен ли предмет в слот-игре'
     },
     drop_weight: {
       type: DataTypes.DECIMAL(8, 4),
       allowNull: false,
       defaultValue: 1.0000,
       comment: 'Вес выпадения в слот-игре'
     }
   }, {
     tableName: 'slot_items',
     timestamps: true,
     createdAt: 'created_at',
     updatedAt: 'updated_at',
     indexes: [
       {
         fields: ['rarity']
       },
       {
         fields: ['price']
       },
       {
         fields: ['is_active']
       },
       {
         fields: ['steam_market_hash_name'],
         unique: true
       }
     ]
   });
 
   return SlotItem;
 };
 