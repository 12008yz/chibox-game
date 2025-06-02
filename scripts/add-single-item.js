const CSMoneyService = require('../services/csmoneyService');

async function addSingleItem() {
  // The item JSON provided by the user
  const userItem = {
    id: 30767290,
    appId: 730,
    seller: {
      botId: null,
      delivery: {
        speed: "slow",
        medianTime: 23.93,
        successRate: 92.68
      }
    },
    asset: {
      id: 39363650496,
      names: {
        short: "MP9 | Sand Dashed",
        full: "MP9 | Sand Dashed (Well-Worn)",
        identifier: 12299
      },
      images: {
        screenshot: "https://screenshots.cs.money/csmoney2/a50b03a21ad4f8dc2940c3a95c8eab38_image.jpg",
        steam: "https://steamcommunity-a.akamaihd.net/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou6r8FBRw7OfJYTh9_9S5hpS0hPb6N4Tck29Y_cg_3OyTooitiwLhqEVkZWGnJteVIQQ4MFGB_lW7yOrt0ZG4v5jIyXZguT5iuyjLBoEOtg",
        preview: "https://screenshots.cs.money/csmoney2/a50b03a21ad4f8dc2940c3a95c8eab38_large_preview.png"
      },
      isSouvenir: false,
      isStatTrak: false,
      quality: "ww",
      rarity: "Consumer Grade",
      pattern: 871,
      type: 6,
      color: 7,
      collection: {
        name: "Dust 2",
        image: null
      },
      float: 0.3883078992366791,
      inspect: "7560497590821489182"
    },
    stickers: null,
    keychains: null,
    pricing: {
      default: 0.02,
      priceBeforeDiscount: 0.02,
      discount: 0,
      computed: 0.02,
      basePrice: 0.02,
      priceCoefficient: 1
    },
    links: {
      "3d": "https://3d.cs.money/item/a50b03a21ad4f8dc2940c3a95c8eab38",
      inspectLink: "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198027798109A39363650496D7560497590821489182"
    },
    isPartial: null,
    isMySellOrder: false
  };

  // Load config and create service instance
  const config = CSMoneyService.loadConfig();
  const csmoneyService = new CSMoneyService(config);

  // Transform userItem to expected format for importItemsToDb
  const itemToImport = {
    id: userItem.id,
    name: userItem.asset.names.full,
    price: userItem.pricing.computed || userItem.pricing.default || 0,
    float: userItem.asset.float,
    image: userItem.asset.images.steam || userItem.asset.images.screenshot || '',
    type: userItem.asset.type,
    rarity: userItem.asset.rarity.toLowerCase(),
    exterior: (() => {
      const fullName = userItem.asset.names.full;
      if (fullName.includes('Factory New')) return 'Factory New';
      if (fullName.includes('Minimal Wear')) return 'Minimal Wear';
      if (fullName.includes('Field-Tested')) return 'Field-Tested';
      if (fullName.includes('Well-Worn')) return 'Well-Worn';
      if (fullName.includes('Battle-Scarred')) return 'Battle-Scarred';
      return null;
    })(),
    pattern: userItem.asset.pattern,
    stickers: userItem.stickers,
    keychains: userItem.keychains,
    isStatTrak: userItem.asset.isStatTrak,
    isSouvenir: userItem.asset.isSouvenir,
    is_tradable: !userItem.isMySellOrder,
    in_stock: true,
    assetId: userItem.asset.id,
    sellerId: userItem.seller.botId,
    inspectLink: userItem.links.inspectLink
  };

  try {
    await csmoneyService.importItemsToDb([itemToImport]);
    console.log('Item imported successfully');
  } catch (error) {
    console.error('Error importing item:', error);
  }
}

if (require.main === module) {
  addSingleItem();
}

module.exports = { addSingleItem };
