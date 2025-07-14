// Обновленная конфигурация предметов CS2 для поддержания 20% рентабельности
// Актуальные предметы Counter-Strike 2 (2025) с правильными ссылками Steam Market
// Распределение: 70% дешевых (1-50₽), 25% средних (50-500₽), 5% дорогих (500₽+)

const COMPLETE_ITEMS_URLS = {
  "subscription": {
    "consumer": [
      // Белые скины (1-50₽) - основная масса для рентабельности
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Boreal%20Forest%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20VariCamo%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Sand%20Dune%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Forest%20Leaves%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/P2000%20%7C%20Grassland%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/P250%20%7C%20Sand%20Dune%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Five-SeveN%20%7C%20Forest%20Night%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Tec-9%20%7C%20Groundwater%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Mudder%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Dual%20Berettas%20%7C%20Colony%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/R8%20Revolver%20%7C%20Bone%20Mask%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/MAC-10%20%7C%20Candy%20Apple%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/MP9%20%7C%20Storm%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/P90%20%7C%20Sand%20Spray%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/PP-Bizon%20%7C%20Forest%20Leaves%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/XM1014%20%7C%20Jungle%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Nova%20%7C%20Forest%20Leaves%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Sawed-Off%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/MAG-7%20%7C%20Sand%20Dune%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/M249%20%7C%20Contrast%20Spray%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Negev%20%7C%20Army%20Sheen%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Galil%20AR%20%7C%20Urban%20Rubble%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Colony%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/AUG%20%7C%20Colony%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/SG%20553%20%7C%20Waves%20Perforated%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/SSG%2008%20%7C%20Forest%20DDPAT%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/G3SG1%20%7C%20Safari%20Mesh%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/SCAR-20%20%7C%20Sand%20Mesh%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/CZ75-Auto%20%7C%20Green%20Plaid%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/P2000%20%7C%20Granite%20Marbleized%20%28Well-Worn%29",
      "https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Death%20Rattle%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/P250%20%7C%20Metallic%20DDPAT%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Five-SeveN%20%7C%20Orange%20Peel%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Tec-9%20%7C%20Army%20Mesh%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Mainframe%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Phantom%20Disruptor%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Capillary%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/UMP-45%20%7C%20Facility%20Dark%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/P90%20%7C%20Facility%20Draft%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/MP7%20%7C%20Vault%20Heist%20%28Battle-Scarred%29",
      "https://steamcommunity.com/market/listings/730/Nova%20%7C%20Walnut%20%28Battle-Scarred%29"
    ],
    "industrial": [
      // Голубые скины (30-150₽) - умеренное количество
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Blue%20Laminate%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Faded%20Zebra%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Basilisk%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Worm%20God%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Blue%20Fissure%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Night%20Ops%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/P2000%20%7C%20Pulse%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/P250%20%7C%20Steel%20Disruption%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Five-SeveN%20%7C%20Case%20Hardened%20%28Well-Worn%29",
      "https://steamcommunity.com/market/listings/730/Tec-9%20%7C%20Blue%20Titanium%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Night%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/MAC-10%20%7C%20Silver%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/MP9%20%7C%20Storm%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/UMP-45%20%7C%20Labyrinth%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/P90%20%7C%20Leather%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Galil%20AR%20%7C%20Blue%20Titanium%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Blue%20Spraypaint%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/AUG%20%7C%20Wings%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/SG%20553%20%7C%20Ultraviolet%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/SSG%2008%20%7C%20Dark%20Water%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/G3SG1%20%7C%20Polar%20Camo%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/SCAR-20%20%7C%20Grotto%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Nova%20%7C%20Candy%20Apple%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/XM1014%20%7C%20Blue%20Steel%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Sawed-Off%20%7C%20Blue%20Spraypaint%20%28Factory%20New%29"
    ],
    "milspec": [
      // Синие скины (100-800₽) - ограниченное количество
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Elite%20Build%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Royal%20Paladin%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Guardian%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Pink%20DDPAT%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Water%20Elemental%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Orion%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/P2000%20%7C%20Handgun%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/P250%20%7C%20Muertos%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Five-SeveN%20%7C%20Monkey%20Business%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/Tec-9%20%7C%20Isaac%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Conspiracy%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/CZ75-Auto%20%7C%20The%20Fuschia%20Is%20Now%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/MAC-10%20%7C%20Neon%20Rider%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/MP9%20%7C%20Dart%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/MP7%20%7C%20Nemesis%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/UMP-45%20%7C%20Delusion%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/P90%20%7C%20Module%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Galil%20AR%20%7C%20Eco%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Sergeant%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/AUG%20%7C%20Condemned%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/SG%20553%20%7C%20Atlas%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/SSG%2008%20%7C%20Slashed%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/G3SG1%20%7C%20Demeter%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/SCAR-20%20%7C%20Crimson%20Web%20%28Field-Tested%29"
    ],
    "restricted": [
      // Фиолетовые скины (500-3000₽) - очень ограниченное количество
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Redline%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Asiimov%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Hyper%20Beast%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Asiimov%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Twilight%20Galaxy%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Kill%20Confirmed%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/P250%20%7C%20Asiimov%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Blaze%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/MAC-10%20%7C%20Stalker%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/P90%20%7C%20Asiimov%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/UMP-45%20%7C%20Primal%20Saber%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Galil%20AR%20%7C%20Chatterbox%20%28Well-Worn%29",
      "https://steamcommunity.com/market/listings/730/FAMAS%20%7C%20Roll%20Cage%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/SSG%2008%20%7C%20Blood%20in%20the%20Water%20%28Field-Tested%29"
    ],
    "classified": [
      // Розовые скины (2000-15000₽) - редкие
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Vulcan%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Howl%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Hot%20Rod%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Lightning%20Strike%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Glock-18%20%7C%20Fade%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/USP-S%20%7C%20Neo-Noir%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Printstream%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/P90%20%7C%20Death%20by%20Kitty%20%28Factory%20New%29"
    ],
    "covert": [
      // Красные скины (10000₽+) - очень редкие
      "https://steamcommunity.com/market/listings/730/AK-47%20%7C%20Fire%20Serpent%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/AWP%20%7C%20Dragon%20Lore%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/M4A4%20%7C%20Poseidon%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/Desert%20Eagle%20%7C%20Emerald%20Jörmungandr%20%28Factory%20New%29"
    ],
    "extraordinary": [
      // Золотые ножи (20000₽+) - крайне редкие
      "https://steamcommunity.com/market/listings/730/%E2%98%85%20Karambit%20%7C%20Doppler%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/%E2%98%85%20Butterfly%20Knife%20%7C%20Tiger%20Tooth%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/%E2%98%85%20M9%20Bayonet%20%7C%20Fade%20%28Factory%20New%29",
      "https://steamcommunity.com/market/listings/730/%E2%98%85%20Bayonet%20%7C%20Doppler%20%28Factory%20New%29"
    ],
    "exotic": [
      // Перчатки (15000₽+) - крайне редкие
      "https://steamcommunity.com/market/listings/730/%E2%98%85%20Sport%20Gloves%20%7C%20Pandora%27s%20Box%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/%E2%98%85%20Specialist%20Gloves%20%7C%20Crimson%20Kimono%20%28Field-Tested%29",
      "https://steamcommunity.com/market/listings/730/%E2%98%85%20Driver%20Gloves%20%7C%20Racing%20Green%20%28Field-Tested%29"
    ]
  }
};

module.exports = COMPLETE_ITEMS_URLS;