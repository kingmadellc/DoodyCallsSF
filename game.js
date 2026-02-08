const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ============================================
// POLYFILL: roundRect for older browsers
// ============================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
        let r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
        if (r > w / 2) r = w / 2;
        if (r > h / 2) r = h / 2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.arcTo(x + w, y, x + w, y + r, r);
        this.lineTo(x + w, y + h - r);
        this.arcTo(x + w, y + h, x + w - r, y + h, r);
        this.lineTo(x + r, y + h);
        this.arcTo(x, y + h, x, y + h - r, r);
        this.lineTo(x, y + r);
        this.arcTo(x, y, x + r, y, r);
        this.closePath();
        return this;
    };
}

// ============================================
// DEBUG MODE
// ============================================
const DEBUG_MODE = false;
function debugLog(...args) { if (DEBUG_MODE) console.log(...args); }

// Admin mode: bypass daily play limit via URL param ?admin=1
const IS_ADMIN = new URLSearchParams(window.location.search).has('admin');

// ============================================
// PERFORMANCE: ANIMATION CACHE
// ============================================
const animCache = {
    time: 0,
    sin2: 0, sin3: 0, sin4: 0, sin5: 0, sin6: 0, sin8: 0, sin10: 0,
    cos3: 0, cos4: 0, cos5: 0, cos6: 0, cos8: 0,

    update(t) {
        this.time = t;
        this.sin2 = Math.sin(t * 2);
        this.sin3 = Math.sin(t * 3);
        this.sin4 = Math.sin(t * 4);
        this.sin5 = Math.sin(t * 5);
        this.sin6 = Math.sin(t * 6);
        this.sin8 = Math.sin(t * 8);
        this.sin10 = Math.sin(t * 10);
        this.cos3 = Math.cos(t * 3);
        this.cos4 = Math.cos(t * 4);
        this.cos5 = Math.cos(t * 5);
        this.cos6 = Math.cos(t * 6);
        this.cos8 = Math.cos(t * 8);
    }
};

// ============================================
// PERFORMANCE: PARTICLE POOL
// ============================================
const ParticlePool = {
    pool: [],
    maxPoolSize: 300,

    get() {
        if (this.pool.length > 0) return this.pool.pop();
        return { x: 0, y: 0, vx: 0, vy: 0, size: 0, color: '', alpha: 1, lifetime: 0, age: 0, type: 'default' };
    },

    release(p) {
        if (this.pool.length < this.maxPoolSize) this.pool.push(p);
    },

    spawn(x, y, vx, vy, size, color, lifetime, type = 'default') {
        const p = this.get();
        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.size = size; p.color = color; p.alpha = 1;
        p.lifetime = lifetime; p.age = 0; p.type = type;
        return p;
    }
};

// ============================================
// DISPLAY SETTINGS
// ============================================
const displaySettings = {
    baseWidth: 640,
    baseHeight: 640,
    scale: 1,
    currentResolution: '640x640'
};

const RESOLUTIONS = {
    '640x640': { width: 640, height: 640, scale: 1, aspectRatio: '1:1' },
    '800x800': { width: 800, height: 800, scale: 1.25, aspectRatio: '1:1' },
    '960x960': { width: 960, height: 960, scale: 1.5, aspectRatio: '1:1' },
};

// ============================================
// VIEWPORT / CAMERA
// ============================================
const VIEWPORT_HEIGHT = 20;
const CAMERA_LERP_SPEED = 8;

function getViewportWidth() {
    const res = RESOLUTIONS[displaySettings.currentResolution] || RESOLUTIONS['640x640'];
    return Math.ceil(VIEWPORT_HEIGHT * (res.width / res.height));
}

function getTileSize() {
    const res = RESOLUTIONS[displaySettings.currentResolution] || RESOLUTIONS['640x640'];
    return Math.floor(res.height / VIEWPORT_HEIGHT);
}

let TILE_SIZE = 32;
let MAP_WIDTH = 24;
let MAP_HEIGHT = 24;

// ============================================
// TILE TYPES
// ============================================
const TILE = {
    SIDEWALK: 0,
    ROAD: 1,
    BUILDING: 2,
    BUILDING_DOOR: 3,
    PARK_GRASS: 4,
    CROSSWALK: 5,
    ALLEY: 6,
    COFFEE_SHOP: 7,
    HOTEL: 8,
    OFFICE: 9,
    CURB: 10,
    WATER: 11,
    PIER: 12,
    FOUNTAIN: 13,
    SHOP_FRONT: 14,
    MURAL_WALL: 15,
    PLAZA: 16,
    TREE: 17,
    GATE: 18,
};

// Mess types overlaid on tiles
const MESS = {
    NONE: 0,
    LITTER: 1,
    POOP: 2,
    NEEDLES: 3,
};

// Cleanliness state per tile
const CLEAN_STATE = {
    FILTHY: 0,
    DIRTY: 1,
    CLEAN: 2,
    SPARKLING: 3,
};

function isBlockingTile(tile) {
    return tile === TILE.BUILDING || tile === TILE.HOTEL || tile === TILE.OFFICE ||
           tile === TILE.WATER || tile === TILE.FOUNTAIN || tile === TILE.SHOP_FRONT ||
           tile === TILE.MURAL_WALL || tile === TILE.TREE;
}

function isCleanableTile(tile) {
    return tile === TILE.SIDEWALK || tile === TILE.ALLEY || tile === TILE.CROSSWALK ||
           tile === TILE.CURB || tile === TILE.PARK_GRASS || tile === TILE.PIER ||
           tile === TILE.PLAZA;
}

// ============================================
// COLORS
// ============================================
const COLORS = {
    // Sidewalk (warm dawn tint)
    sidewalkLight: '#c0b098',
    sidewalkDark: '#b0a088',
    sidewalkLine: '#d0c0a8',

    // Road (warm asphalt in early light)
    roadDark: '#3e3838',
    roadLight: '#484240',
    roadLine: '#e8d44d',
    crosswalk: '#e8e0d0',

    // Building (warm window light, people waking up)
    buildingWall: '#6b5b6a',
    buildingWallAlt: '#5b4b5a',
    buildingWindow: '#2a3050',
    buildingWindowLit: '#f0c848',
    buildingDoor: '#8b6b4b',

    // Hotel (The W)
    hotelWall: '#4a3a5a',
    hotelAccent: '#c0a0d0',
    hotelSign: '#e0d0f0',

    // Office building
    officeWall: '#3a4a5a',
    officeAccent: '#60a0c0',

    // Coffee shop
    coffeeWall: '#6b4a2a',
    coffeeAwning: '#d4a050',

    // Alley (slightly warmer for dawn light seeping in)
    alleyDark: '#504840',
    alleyLight: '#605848',

    // Park
    grassLight: '#5a8a3a',
    grassDark: '#4a7a2a',
    treeTrunk: '#6b4a2a',
    treeLeaf: '#3a7a2a',

    // Curb
    curbColor: '#9a9080',

    // Water (dawn reflections — warmer blues with orange tint)
    waterDeep: '#1a3858',
    waterLight: '#2a5878',
    waterFoam: '#a0c0d0',

    // Pier
    pierWood: '#8a6a3a',
    pierWoodAlt: '#7a5a2a',
    pierNail: '#4a4a4a',

    // Fountain
    fountainStone: '#9a9aaa',
    fountainWater: '#4a8ab0',

    // Shop front
    shopWall: '#6a5a4a',

    // Mural
    muralBase: '#8a7a6a',
    muralColors: ['#e04060', '#40a0e0', '#e0c040', '#40c080', '#c060e0'],

    // Plaza
    plazaBrick: '#b09070',
    plazaBrickAlt: '#a08060',

    // Tree
    treeTrunkDark: '#5a3a1a',
    treeLeafDark: '#2a6a1a',
    treeLeafLight: '#4a9a3a',

    // Gate
    gateRed: '#c02020',
    gateGold: '#e0c040',

    // City Hall
    civicStone: '#c0b8b0',
    civicColumn: '#d0c8c0',

    // Mess colors (brightened for sunrise visibility)
    litterColor: '#e8d8b0',
    poopColor: '#6b4226',
    poopHighlight: '#8b5e3c',
    needleColor: '#c0c0c8',
    needleTip: '#e84040',

    // UI
    uiBg: '#1a1a2e',
    uiBorder: '#e94560',
    uiText: '#ffffff',
    uiAccent: '#4ecdc4',
    uiWarning: '#ff6b6b',
    uiGold: '#ffe66d',
    uiClean: '#66ff88',

    // Player
    playerBody: '#f0a030',    // Orange hazmat suit
    playerVisor: '#40c0e0',
    playerBoots: '#3a3a3a',

    // Pigeon
    pigeonBody: '#8a8a9a',
    pigeonHead: '#6a7a6a',
    pigeonBeak: '#e0a040',

    // Sky gradient for sunrise effect
    skyNight: '#0a0a1e',
    skyDawn: '#2a1a3e',
    skySunrise: '#e06030',
    skyMorning: '#60a0e0',
};

// ============================================
// DISTRICT DATA
// ============================================
const DISTRICTS = [
    {
        id: 1, name: "Fisherman's Wharf", subtitle: "Tourist Trap",
        timer: 60, messCount: 20, pigeonCount: 2, hoboCount: 0,
        palette: { accent: '#4090c0', sky: '#2a3050', skyHorizon: '#d47040' }
    },
    {
        id: 2, name: "Union Square", subtitle: "Luxury Litter",
        timer: 60, messCount: 25, pigeonCount: 2, hoboCount: 1,
        palette: { accent: '#c0a040', sky: '#302848', skyHorizon: '#c06838' }
    },
    {
        id: 3, name: "SoMa", subtitle: "The Morning Commute",
        timer: 60, messCount: 30, pigeonCount: 3, hoboCount: 2,
        palette: { accent: '#a060c0', sky: '#282040', skyHorizon: '#b86048' }
    },
    {
        id: 4, name: "Russian Hill", subtitle: "The Scenic Route",
        timer: 60, messCount: 30, pigeonCount: 3, hoboCount: 1,
        palette: { accent: '#40a060', sky: '#283848', skyHorizon: '#d08050' }
    },
    {
        id: 5, name: "Haight-Ashbury", subtitle: "Vintage Refuse",
        timer: 60, messCount: 35, pigeonCount: 3, hoboCount: 2,
        palette: { accent: '#e04080', sky: '#302838', skyHorizon: '#c85848' }
    },
    {
        id: 6, name: "Mission District", subtitle: "Burrito Boulevard",
        timer: 60, messCount: 35, pigeonCount: 4, hoboCount: 2,
        palette: { accent: '#e08040', sky: '#302418', skyHorizon: '#d87838' }
    },
    {
        id: 7, name: "The Tenderloin", subtitle: "Danger Zone",
        timer: 60, messCount: 45, pigeonCount: 5, hoboCount: 4,
        palette: { accent: '#c04040', sky: '#1e1828', skyHorizon: '#a04830' }
    },
    {
        id: 8, name: "Golden Gate Park", subtitle: "Nature Fights Back",
        timer: 60, messCount: 40, pigeonCount: 5, hoboCount: 3,
        palette: { accent: '#40c060', sky: '#203828', skyHorizon: '#c89050' }
    },
    {
        id: 9, name: "Chinatown", subtitle: "Celebration Chaos",
        timer: 60, messCount: 40, pigeonCount: 4, hoboCount: 2,
        palette: { accent: '#e04040', sky: '#281820', skyHorizon: '#c05838' }
    },
    {
        id: 10, name: "City Hall", subtitle: "The Final Shift",
        timer: 60, messCount: 50, pigeonCount: 6, hoboCount: 5,
        palette: { accent: '#c0c0d0', sky: '#202030', skyHorizon: '#b06848' }
    },
];

// ============================================
// NEWS TICKER HEADLINES
// ============================================
const NEWS_HEADLINES = [
    "BREAKING: Local sanitation worker seen spraying pigeons with power washer",
    "Pleasanton resident describes SF commute as 'an adventure game'",
    "AI startup claims it can clean streets; demo crashes immediately",
    "Indie development team announces city cleanup simulator",
    "AI sweat shop produces game overnight, union files complaint",
    "Tech bro on electric scooter leaves trail of destruction, claims 'disrupting sanitation'",
    "Man counts 2 human situations on short walk to coffee shop",
    "Tourists report 'slightly less horrified' after visit to cleaned district",
    "Local man claims he 'used to walk here before it was dirty'",
    "Real estate prices somehow increase further despite everything",
    "City deploys experimental zamboni on Tenderloin sidewalks",
    "Pigeon flock organized, demands union representation",
    "Mime trapped behind invisible wall, sanitation worker walks around",
    "Hotel guest shocked by alley conditions at 7AM coffee run",
    "Tech worker spotted walking to office without hazmat suit",
    "Cable car derails into artisanal sourdough display, nobody injured",
    "SF ranked dirtiest city for 47th consecutive year",
    "Governor deploys one (1) additional broom to Tenderloin",
    "Food truck grease spill creates world's largest slip-n-slide on Market St",
    "Tech workers consider returning to office one day per week",
    "Sanitation worker reports mysterious brown deposits appearing faster than cleanup speed",
    "City installs public restrooms; locals continue to prefer alleyways",
    "Study finds SF sidewalks contain 'more biodiversity than Muir Woods'",
    "Local man in trenchcoat insists he was 'just resting' in alley",
    "Porta-potty startup raises $50M, deploys zero units",
    "EXCLUSIVE: Marty's Bavarian dev team ships game overnight, demands lederhosen as payment",
    "Local man in Pleasanton claims SF commute is 'basically Mad Max,' has not visited in 4 years",
    "REPORT: Man buys Super Bowl tickets on Affirm, describes it as 'an investment in his health'",
    "STUDY: Average Slack message length increases 400% when topic is 'the future of software'",
    "Fantasy GM trades back 47 times, claims 'absurd offers' are a strategy",
    "Group chat derails into 2-day discussion about anatomy, everyone pretends to be uncomfortable",
    "Former welder promoted to VP, still convinced he's 'just a welder'",
    "Man's 100% clean district ruined by pigeon at 1 second remaining, files formal complaint",
    "Tech worker describes AI as 'outrageously productive,' has deployed zero units to production",
    "European vacation shopper 'saves money' on clearance clothes, pays overweight bag fee",
    "Analyst measures group chat quality using 'peen per day' ratio, publishes findings",
    "Man at W Hotel counts two human situations on walk to coffee, considers it 'an adventure'",
    "Local dad justifies $6,586 sporting event as 'basically a vacation in Santa Clara'",
    "AI skeptic won over by one end-of-year review doc, now fully radicalized",
    "Man's wife demands Backstreet Boys concert ticket as payment for football game attendance",
    "Group chat member asks 'what is Claude,' receives 14 different explanations in 30 seconds",
    "Fantasy football league measures value of 6'7 tight end exclusively by height, signs immediately",
    "Non-coder builds game in 20 minutes, QA team is also AI, no humans were consulted",
    "Slack group invents new metric: 'trailing 2-day PPD currently at 1.000'",
    "Survey: Local men describe 0% APR as 'basically free money,' financial advisors weep",
    "City employee's wife calculates chore-to-game-attendance conversion rate at 4.7:1",
    "Seattle fan runs same team simulation 3 times, gets different result each time, posts all of them",
    "Breaking: Game developer's friend opens game on phone, can't turn, blames the developer",
    "Man casually walks through European police riot on way to Airbnb, calls it 'sightseeing'",
    "Tech exec claims AI will replace all software in 2 years, still can't get mobile controls working",
];

// Game over headlines (shown when timer runs out)
const GAME_OVER_HEADLINES = [
    "COMMUTERS HORRIFIED: Morning rush discovers uncleaned block",
    "VIRAL VIDEO: Tourist films dirty SF street, 10M views",
    "YOU'RE FIRED: Sanitation dept budget cut after public embarrassment",
    "BREAKING: City cleanup worker falls asleep on shift",
    "SF SHAMED: Morning commuters post photos of filthy streets",
    "CAREER OVER: One bad shift ends promising sanitation career",
    "TRENDING: #SFIsDirty goes viral after commuter walkthrough",
];

// ============================================
// CHARACTERS
// ============================================
const CHARACTERS = [
    {
        id: 'ryan-leaf', name: 'Ryan Leaf', desc: 'Failed QB turned street sweeper',
        color: '#e8d040', visorColor: '#60c0e0', bootsColor: '#f0f0f0', ability: 'speed',
        abilityDesc: '+20% move speed',
    },
    {
        id: 'idaho-bro-1', name: 'Idahoan Brother #1', desc: 'Bald, bearded, probably reading',
        color: '#608040', visorColor: '#a0d060', ability: 'bonus',
        abilityDesc: '+10% bonus time (lost in a good book)',
    },
    {
        id: 'idaho-bro-2', name: 'Idahoan Brother #2', desc: 'Brewing essential oil potions, not cleaning',
        color: '#406830', visorColor: '#80c040', ability: 'armor',
        abilityDesc: 'Immune to first earthquake (oil shield)',
    },
    {
        id: 'marty', name: 'Marty', desc: 'Coffee-powered, scared of alleys',
        color: '#d06030', visorColor: '#ff8040', ability: 'clean',
        abilityDesc: 'Auto-clean is faster (skip DIRTY state)',
    },
    {
        id: 'designer', name: 'The Designer', desc: 'Won\'t clean until the grid is aligned',
        color: '#c04060', visorColor: '#ff6090', ability: 'clean',
        abilityDesc: 'Auto-clean is faster (skip DIRTY state)',
    },
    {
        id: 'exec-producer', name: 'The Exec Producer', desc: 'Moshing by night, mopping by dawn',
        color: '#c0a020', visorColor: '#ffe060', ability: 'speed',
        abilityDesc: '+20% move speed',
    },
    {
        id: 'eyeglass', name: 'The Eyeglass Aficionado', desc: 'Spots every speck through premium lenses',
        color: '#a04080', visorColor: '#ff60c0', ability: 'clean',
        abilityDesc: 'Auto-clean is faster (eagle-eyed)',
    },
    {
        id: 'hr-lead', name: 'The HR Lead', desc: 'Will clean your street then poach your talent',
        color: '#806040', visorColor: '#c0a080', ability: 'efficiency',
        abilityDesc: 'Cleaning earns +15% score bonus (talent optimizer)',
    },
    {
        id: 'partner', name: 'The Partner', desc: 'Closing deals and closing dumpster lids',
        color: '#404040', visorColor: '#a0a0a0', ability: 'armor',
        abilityDesc: 'Immune to first earthquake',
    },
    {
        id: 'professor', name: 'The Professor', desc: 'Lectures pigeons on hygiene',
        color: '#705030', visorColor: '#c0a070', ability: 'scout',
        abilityDesc: '+30s time on first district (prep lecture)',
    },
    {
        id: 'saas-exec', name: 'The SaaS Exec', desc: 'Reconciles messes like line items',
        color: '#2080b0', visorColor: '#40c0ff', ability: 'efficiency',
        abilityDesc: 'Cleaning earns +15% score bonus',
    },
    {
        id: 'vp-bizdev', name: 'The VP of Biz Dev', desc: 'Oddly skilled with hammers',
        color: '#306080', visorColor: '#50a0c0', ability: 'armor',
        abilityDesc: 'Immune to first earthquake (built tough)',
    },
    {
        id: 'wealth-mgr', name: 'The Wealth Manager', desc: 'Diversifies his cleaning portfolio',
        color: '#3050a0', visorColor: '#6090e0', ability: 'bonus',
        abilityDesc: '+10% bonus time each district',
    },
];

// ============================================
// NEAR-MISS / CLUTCH HEADLINES
// ============================================
const NEAR_MISS_HEADLINES = [
    "SO CLOSE — Commuters Rate City 'Almost Tolerable'",
    "ONE SPOT LEFT — Sanitation Worker Breaks Down Crying",
    "99% CLEAN — Lone Pigeon Ruins Everything",
    "ALMOST PERFECT — City Awards 'Participation Trophy'",
    "HEARTBREAK — One mess away from perfection",
];

const CLUTCH_HEADLINES = [
    "BUZZER BEATER — Cleaned with seconds to spare!",
    "PHOTO FINISH — District saved at the last moment!",
    "CLUTCH CLEAN — Sanitation worker becomes local hero!",
    "MIRACLE SHIFT — Nobody believed it was possible!",
];

// ============================================
// HOBO WISDOM QUOTES
// ============================================
const HOBO_NAMES = [
    'Sidewalk Steve', 'Cardboard Carl', 'Blanket Bill', 'Shopping Cart Sally',
    'Tarp Tom', 'Freeway Phil', 'Underpass Ursula', 'Dumpster Dave',
    'Bench Press Betty', 'Pigeon Whisperer Pete', 'Two-Socks Tony', 'Moonbeam Marcy',
    'Tin Foil Ted', 'Raincoat Rita', 'Newspaper Nick', 'Alleyway Alice',
];

const HOBO_QUOTES = [
    "Elohim Earthprayer once told me the sidewalk is just a bed the city paved over out of jealousy.",
    "You clean these streets, but who cleans your soul? Elohim Earthprayer, that's who. For $5.",
    "Elohim Earthprayer says every pigeon carries the reincarnated spirit of a failed tech CEO.",
    "I used to have a 401k. Now I have a shopping cart and inner peace. Elohim Earthprayer showed me the way.",
    "Elohim Earthprayer whispered to me that recycling is just capitalism making you sort its trash.",
    "The universe provides. Today it provided half a burrito. Praise Elohim Earthprayer.",
    "Elohim Earthprayer says we're all just one bad Yelp review away from living under a bridge.",
    "I don't need a house. The Earth is my house. Elohim Earthprayer is my landlord and he never raises rent.",
    "Elohim Earthprayer teaches that the man who sleeps on concrete dreams harder than the man on a Casper mattress.",
    "Before I met Elohim Earthprayer, I was a VP of Product. Now I'm VP of This Bench. Much better title.",
    "Elohim Earthprayer once meditated so hard a Whole Foods opened across the street. Gentrification is spiritual warfare.",
    "You think YOU'RE cleaning up? Elohim Earthprayer has been cleaning up auras in this alley since 2019.",
    "Elohim Earthprayer says the real mess isn't on these streets. It's in your heart. But also on these streets.",
    "I traded my Tesla for enlightenment. Elohim Earthprayer said it was a fair deal. The Tesla had low mileage.",
    "Every morning I greet the sunrise. Then Elohim Earthprayer reminds me the sun is just God's ring light.",
    "Elohim Earthprayer once turned water into kombucha. Nobody asked him to. Nobody wanted it.",
    "The secret to happiness? Elohim Earthprayer says stop wanting things. Except socks. Always want socks.",
    "I've lived on this corner for 3 years. I've seen things. Elohim Earthprayer has seen more things. Different things.",
    "Elohim Earthprayer says if you stare at a parking meter long enough, time itself becomes meaningless. Also you get a ticket.",
    "They say money can't buy happiness. Elohim Earthprayer says neither can no money. But the parking is free.",
    "Elohim Earthprayer held a TED talk on this corner once. No microphone. No audience. Powerful stuff.",
    "You ever notice how a clean street just gets dirty again? Elohim Earthprayer calls that 'the municipal samsara.'",
    "Elohim Earthprayer says the difference between a tourist and a local is three months and one mugging.",
    "I'm not homeless. I'm home-free. Elohim Earthprayer trademarked that. He's very entrepreneurial.",
    "Elohim Earthprayer taught me that every discarded coffee cup is a tiny cathedral for ants.",
    "Before Elohim Earthprayer, I chased quarterly earnings. Now I chase the ice cream truck. Same energy, better ROI.",
    "Elohim Earthprayer says the fog isn't weather. It's San Francisco's way of hiding its shame.",
    "My cardboard sign used to say 'anything helps.' Elohim Earthprayer corrected it to 'nothing matters.' More honest.",
    "Elohim Earthprayer fasted for 40 days once. Then he remembered he had a Costco membership.",
    "The pigeons work for Elohim Earthprayer. Don't let anyone tell you otherwise.",
];

function getRandomHoboQuote() {
    const name = HOBO_NAMES[Math.floor(Math.random() * HOBO_NAMES.length)];
    const quote = HOBO_QUOTES[Math.floor(Math.random() * HOBO_QUOTES.length)];
    return { name, quote };
}

// ============================================
// ASSETS
// ============================================
const wordmarkImg = new Image();
wordmarkImg.src = 'assets/wordmark.png?v=2';

// ============================================
// GAME STATE
// ============================================
let gameState = {
    // Core
    screen: 'title',  // title, playing, paused, gameOver, districtComplete, charSelect, districtSelect
    gameMode: 'normal',  // normal, daily
    district: 0,       // Index into DISTRICTS array
    timer: 60,
    started: false,
    animationTime: 0,

    // Character
    selectedCharacter: 0,  // Index into CHARACTERS

    // Player
    player: {
        x: 12, y: 20,
        visualX: 12, visualY: 20,
        direction: 0,   // 0=down, 1=left, 2=up, 3=right
        frame: 0,
        moveTimer: 0,
        cleaning: false,
        cleanTimer: 0,
        speed: 1,
    },

    // World
    tiles: [],       // 2D: tile type
    messes: [],      // 2D: MESS type
    cleanState: [],  // 2D: CLEAN_STATE
    pigeons: [],     // Array of pigeon objects
    hobos: [],       // Array of hobo objects

    // Camera
    camera: { x: 0, y: 0, targetX: 0, targetY: 0 },

    // Stats
    totalMesses: 0,
    messesClean: 0,
    timeBonus: 0,
    pigeonsSprayed: 0,
    hazardsDodged: 0,
    clutchFinish: false,   // finished with <5s left
    nearMiss: false,       // finished 95-99% clean

    // Earthquake
    earthquakeTimer: 0,
    earthquakeActive: false,
    earthquakeCooldown: 0,
    earthquakeImmune: false,  // Armor ability

    // Particles & celebrations
    particles: [],
    celebrations: [],

    // Progression
    districtStars: {},     // { districtId: stars }
    districtBests: {},     // { districtId: { pct, time, stars } }
    cityGrade: 'F',
    totalStars: 0,
    districtsUnlocked: 10, // All districts unlocked from start

    // Headlines collection
    headlinesSeen: [],     // Array of headline strings the player has earned

    // Daily district
    dailyPlayed: false,
    dailySeed: 0,
    dailyResult: null,  // { pct, timeLeft, stars, grade, districtName, charName, scoreText }

    // News ticker
    tickerOffset: 0,
    tickerIndex: 0,

    // Screen shake
    shake: { x: 0, y: 0, intensity: 0, timer: 0 },

    // Score sharing
    lastScoreText: '',    // Generated score text for clipboard
    scoreCopied: false,

    // Pause menu
    pauseMenuIndex: 0,    // Currently selected pause menu item

    // Recent district history (for smart "Next District" randomization)
    recentDistricts: [],   // Last N district indices played (max 9)

    // Hobo quote for end screen
    currentHoboQuote: '',
};

// Mobile detection (touch-capable device)
const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// Hit rect for the share card (in canvas coordinates), set each frame by drawScoreShare
let shareCardRect = null;  // { x, y, w, h } in canvas coords, or null when not visible

// Persistent touch direction for smooth in-game movement (bypasses shouldMove gating)
// Set by the touch system, cleared on touchend. Read directly by updatePlayer.
let touchDir = { x: 0, y: 0 };  // -1, 0, or 1 for each axis

// Hit rects for mobile UI buttons, set each frame by draw functions
let mobileBackBtnRect = null;   // { x, y, w, h } in canvas coords
let mobileFinishBtnRect = null; // { x, y, w, h } in canvas coords
let mobilePauseBtnRect = null;  // { x, y, w, h } in canvas coords
let pauseMenuRects = [];        // Array of { x, y, w, h, idx } for pause menu items
let endScreenCardRects = [];    // Array of { x, y, w, h, action } for end screen buttons

// ============================================
// INPUT SYSTEM
// ============================================
let keys = {};
let keyPressTime = {};
let keyMoved = {};
let keyBuffer = {};  // Buffer for one-shot keys (survives until consumed by a frame)
const MOVE_DELAY = 100;
const MOBILE_MOVE_DELAY = 65;   // Faster tile movement on touch (was 100 — ~15 tiles/sec vs ~10)
const HOLD_THRESHOLD = 150;

const inputActions = {
    up: false, down: false, left: false, right: false,
    pause: false, confirm: false,
    _lastPause: false, _lastConfirm: false,
};

function updateInputActions() {
    const shouldMove = (codes) => {
        if (!codes) return false;
        return codes.some(key => {
            const held = keys[key];
            const buffered = keyBuffer[key];
            if (!held && !buffered) return false;
            // Buffered tap: always trigger once
            if (buffered && !held) return true;
            const holdDuration = Date.now() - (keyPressTime[key] || 0);
            const hasMoved = keyMoved[key];
            if (!hasMoved) {
                keyMoved[key] = true;
                return true;
            }
            return holdDuration >= HOLD_THRESHOLD;
        });
    };

    inputActions.up = shouldMove(['ArrowUp', 'KeyW', 'SwipeUp']);
    inputActions.down = shouldMove(['ArrowDown', 'KeyS', 'SwipeDown']);
    inputActions.left = shouldMove(['ArrowLeft', 'KeyA', 'SwipeLeft']);
    inputActions.right = shouldMove(['ArrowRight', 'KeyD', 'SwipeRight']);

    const pausePressed = keys['Escape'] || keys['KeyP'] ||
                         keyBuffer['Escape'] || keyBuffer['KeyP'];
    inputActions.pause = pausePressed && !inputActions._lastPause;
    inputActions._lastPause = !!pausePressed;

    const confirmPressed = keys['Space'] || keys['Enter'] ||
                           keyBuffer['Space'] || keyBuffer['Enter'];
    inputActions.confirm = confirmPressed && !inputActions._lastConfirm;
    inputActions._lastConfirm = !!confirmPressed;

    // Clear the buffer after processing
    keyBuffer = {};
}

// ============================================
// CITY BLOCK GENERATION
// ============================================
function generateCityBlock(districtIndex) {
    const district = DISTRICTS[districtIndex];
    const tiles = [];
    const messes = [];
    const cleanState = [];

    // Initialize all as sidewalk
    for (let y = 0; y < MAP_HEIGHT; y++) {
        tiles[y] = [];
        messes[y] = [];
        cleanState[y] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            tiles[y][x] = TILE.SIDEWALK;
            messes[y][x] = MESS.NONE;
            cleanState[y][x] = CLEAN_STATE.CLEAN;
        }
    }

    // === ROADS ===
    // Horizontal road through middle
    for (let x = 0; x < MAP_WIDTH; x++) {
        tiles[10][x] = TILE.ROAD;
        tiles[11][x] = TILE.ROAD;
        tiles[12][x] = TILE.ROAD;
        tiles[13][x] = TILE.ROAD;
    }
    // Vertical road
    for (let y = 0; y < MAP_HEIGHT; y++) {
        tiles[y][10] = TILE.ROAD;
        tiles[y][11] = TILE.ROAD;
        tiles[y][12] = TILE.ROAD;
        tiles[y][13] = TILE.ROAD;
    }

    // Road lines (center)
    for (let x = 0; x < MAP_WIDTH; x++) {
        if (tiles[11][x] === TILE.ROAD) tiles[11][x] = TILE.ROAD;
        if (tiles[12][x] === TILE.ROAD) tiles[12][x] = TILE.ROAD;
    }

    // Crosswalks at intersection
    for (let x = 10; x <= 13; x++) {
        tiles[9][x] = TILE.CROSSWALK;
        tiles[14][x] = TILE.CROSSWALK;
    }
    for (let y = 10; y <= 13; y++) {
        tiles[y][9] = TILE.CROSSWALK;
        tiles[y][14] = TILE.CROSSWALK;
    }

    // Curbs along roads
    for (let x = 0; x < MAP_WIDTH; x++) {
        if (x < 9 || x > 14) {
            if (tiles[9][x] === TILE.SIDEWALK) tiles[9][x] = TILE.CURB;
            if (tiles[14][x] === TILE.SIDEWALK) tiles[14][x] = TILE.CURB;
        }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
        if (y < 9 || y > 14) {
            if (tiles[y][9] === TILE.SIDEWALK) tiles[y][9] = TILE.CURB;
            if (tiles[y][14] === TILE.SIDEWALK) tiles[y][14] = TILE.CURB;
        }
    }

    // === BUILDINGS ===
    // Top-left block: buildings with alleys
    placeBuilding(tiles, 0, 0, 4, 4);
    placeBuilding(tiles, 5, 0, 4, 4);
    placeBuilding(tiles, 0, 5, 4, 3);
    placeBuilding(tiles, 5, 5, 4, 3);

    // Top-right block
    placeBuilding(tiles, 15, 0, 4, 4);
    placeBuilding(tiles, 20, 0, 4, 4);
    placeBuilding(tiles, 15, 5, 4, 3);
    placeBuilding(tiles, 20, 5, 4, 3);

    // Bottom-left block
    placeBuilding(tiles, 0, 15, 4, 4);
    placeBuilding(tiles, 5, 15, 4, 3);
    placeBuilding(tiles, 0, 20, 4, 3);
    placeBuilding(tiles, 5, 19, 4, 4);

    // Bottom-right block
    placeBuilding(tiles, 15, 15, 4, 4);
    placeBuilding(tiles, 20, 15, 4, 4);
    placeBuilding(tiles, 15, 20, 4, 3);
    placeBuilding(tiles, 20, 20, 4, 3);

    // === DISTRICT-SPECIFIC FEATURES ===
    if (districtIndex === 0) {
        // District 1: Fisherman's Wharf - waterfront piers
        // Water strip across top
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 10; x++) tiles[y][x] = TILE.WATER;
            for (let x = 15; x < MAP_WIDTH; x++) tiles[y][x] = TILE.WATER;
        }
        // Pier docks on left and right
        for (let y = 4; y < 9; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.PIER;
            for (let x = 20; x < MAP_WIDTH; x++) tiles[y][x] = TILE.PIER;
        }
        // Horizontal pier connecting left dock
        for (let x = 4; x < 10; x++) tiles[4][x] = TILE.PIER;
        // Small wharf building (fish market)
        for (let y = 5; y < 8; y++) {
            for (let x = 5; x < 9; x++) tiles[y][x] = TILE.BUILDING;
        }
        tiles[7][6] = TILE.BUILDING_DOOR;
        // Pre-place food waste on piers
        messes[5][1] = MESS.POOP; cleanState[5][1] = CLEAN_STATE.FILTHY;
        messes[6][2] = MESS.NEEDLES; cleanState[6][2] = CLEAN_STATE.DIRTY;
        messes[5][21] = MESS.POOP; cleanState[5][21] = CLEAN_STATE.FILTHY;
        messes[7][22] = MESS.LITTER; cleanState[7][22] = CLEAN_STATE.DIRTY;

    } else if (districtIndex === 1) {
        // District 2: Union Square - grand plaza with fountain
        // Plaza in bottom-right quadrant
        for (let y = 15; y < 23; y++) {
            for (let x = 15; x < 23; x++) tiles[y][x] = TILE.PLAZA;
        }
        // Fountain in center of plaza
        tiles[18][18] = TILE.FOUNTAIN;
        tiles[18][19] = TILE.FOUNTAIN;
        tiles[19][18] = TILE.FOUNTAIN;
        tiles[19][19] = TILE.FOUNTAIN;
        // Luxury shop front top-left
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }

    } else if (districtIndex === 2) {
        // District 3: SoMa
        // Hotel - top right
        for (let y = 0; y < 4; y++) {
            for (let x = 15; x < 19; x++) tiles[y][x] = TILE.HOTEL;
        }
        // Office building - across the street
        for (let y = 0; y < 4; y++) {
            for (let x = 20; x < 24; x++) tiles[y][x] = TILE.OFFICE;
        }
        // Coffee shop next to hotel
        tiles[5][15] = TILE.COFFEE_SHOP;
        tiles[5][16] = TILE.COFFEE_SHOP;
        tiles[6][15] = TILE.COFFEE_SHOP;
        tiles[6][16] = TILE.COFFEE_SHOP;
        // Alley across from coffee shop
        for (let y = 5; y < 9; y++) {
            tiles[y][17] = TILE.ALLEY;
            tiles[y][18] = TILE.ALLEY;
        }
        // Place "mystery puddle" in the alley
        messes[6][17] = MESS.NEEDLES; cleanState[6][17] = CLEAN_STATE.FILTHY;
        messes[7][17] = MESS.NEEDLES; cleanState[7][17] = CLEAN_STATE.FILTHY;

    } else if (districtIndex === 3) {
        // District 4: Russian Hill - hilltop park with trees
        // Large park in top-left quadrant
        for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 9; x++) tiles[y][x] = TILE.PARK_GRASS;
        }
        // Scatter trees in the park
        const russianHillTrees = [
            [0,0],[0,3],[0,7],[1,5],[2,1],[2,8],
            [3,0],[3,6],[4,3],[4,8],[5,1],[5,5]
        ];
        for (const [ty, tx] of russianHillTrees) tiles[ty][tx] = TILE.TREE;
        // Second green patch bottom-right
        for (let y = 15; y < 19; y++) {
            for (let x = 15; x < 19; x++) {
                if (tiles[y][x] === TILE.BUILDING || tiles[y][x] === TILE.BUILDING_DOOR) {
                    tiles[y][x] = TILE.PARK_GRASS;
                }
            }
        }
        tiles[16][16] = TILE.TREE;
        tiles[17][17] = TILE.TREE;

    } else if (districtIndex === 4) {
        // District 5: Haight-Ashbury - colorful murals + vintage shops
        // Mural walls top rows
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.MURAL_WALL;
            for (let x = 5; x < 9; x++) tiles[y][x] = TILE.MURAL_WALL;
        }
        // Shop fronts below murals
        for (let y = 5; y < 8; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.SHOP_FRONT;
            for (let x = 5; x < 9; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }
        // More shops bottom-right
        for (let y = 15; y < 19; y++) {
            for (let x = 20; x < MAP_WIDTH; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }

    } else if (districtIndex === 5) {
        // District 6: Mission District - taquerias + murals
        // Mural walls top-left upper
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.MURAL_WALL;
            for (let x = 5; x < 9; x++) tiles[y][x] = TILE.MURAL_WALL;
        }
        // Taqueria row below murals
        for (let y = 5; y < 8; y++) {
            for (let x = 0; x < 9; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }
        // More taquerias bottom-right
        for (let y = 15; y < 19; y++) {
            for (let x = 15; x < MAP_WIDTH; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }
        // Wider alley between mural blocks
        for (let y = 0; y < 9; y++) {
            if (tiles[y][4] !== TILE.ROAD) tiles[y][4] = TILE.ALLEY;
            if (tiles[y][5] !== TILE.ROAD && tiles[y][5] !== TILE.SHOP_FRONT && tiles[y][5] !== TILE.MURAL_WALL) {
                tiles[y][5] = TILE.ALLEY;
            }
        }

    } else if (districtIndex === 6) {
        // District 7: The Tenderloin - dense alleys + vacant lot
        // Extra alleys everywhere (overwrite sidewalk only)
        const extraAlleyCols = [2, 7, 16, 21];
        for (const col of extraAlleyCols) {
            for (let y = 0; y < 9; y++) {
                if (tiles[y][col] === TILE.SIDEWALK) tiles[y][col] = TILE.ALLEY;
            }
            for (let y = 15; y < MAP_HEIGHT; y++) {
                if (tiles[y][col] === TILE.SIDEWALK) tiles[y][col] = TILE.ALLEY;
            }
        }
        // Horizontal alleys
        for (let x = 0; x < 9; x++) {
            if (tiles[2][x] === TILE.SIDEWALK) tiles[2][x] = TILE.ALLEY;
            if (tiles[7][x] === TILE.SIDEWALK) tiles[7][x] = TILE.ALLEY;
        }
        for (let x = 15; x < MAP_WIDTH; x++) {
            if (tiles[17][x] === TILE.SIDEWALK) tiles[17][x] = TILE.ALLEY;
            if (tiles[22][x] === TILE.SIDEWALK) tiles[22][x] = TILE.ALLEY;
        }
        // Vacant lot bottom-right far corner
        for (let y = 19; y < MAP_HEIGHT; y++) {
            for (let x = 15; x < MAP_WIDTH; x++) tiles[y][x] = TILE.ALLEY;
        }
        // Grimy shop fronts
        for (let y = 5; y < 8; y++) {
            for (let x = 15; x < 18; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }
        // Pre-place mystery puddles in vacant lot
        messes[20][17] = MESS.POOP; cleanState[20][17] = CLEAN_STATE.FILTHY;
        messes[21][19] = MESS.NEEDLES; cleanState[21][19] = CLEAN_STATE.FILTHY;
        messes[20][21] = MESS.POOP; cleanState[20][21] = CLEAN_STATE.FILTHY;
        messes[22][18] = MESS.NEEDLES; cleanState[22][18] = CLEAN_STATE.FILTHY;

    } else if (districtIndex === 7) {
        // District 8: Golden Gate Park - vast park with pond
        // Top-left quadrant → park
        for (let y = 0; y < 9; y++) {
            for (let x = 0; x < 10; x++) {
                if (tiles[y][x] !== TILE.ROAD && tiles[y][x] !== TILE.CROSSWALK && tiles[y][x] !== TILE.CURB) {
                    tiles[y][x] = TILE.PARK_GRASS;
                }
            }
        }
        // Bottom-right quadrant → park
        for (let y = 15; y < MAP_HEIGHT; y++) {
            for (let x = 14; x < MAP_WIDTH; x++) {
                if (tiles[y][x] !== TILE.ROAD && tiles[y][x] !== TILE.CROSSWALK && tiles[y][x] !== TILE.CURB) {
                    tiles[y][x] = TILE.PARK_GRASS;
                }
            }
        }
        // Pond in top-left
        for (let y = 1; y < 6; y++) {
            for (let x = 1; x < 7; x++) tiles[y][x] = TILE.WATER;
        }
        // Trees in top-left park
        const ggpTreesTop = [[0,0],[0,4],[0,8],[2,8],[3,7],[6,0],[6,3],[6,7],[7,1],[7,5],[8,3],[8,8]];
        for (const [ty, tx] of ggpTreesTop) {
            if (tiles[ty][tx] === TILE.PARK_GRASS) tiles[ty][tx] = TILE.TREE;
        }
        // Trees in bottom-right park
        const ggpTreesBot = [[15,15],[15,19],[15,23],[17,17],[17,22],[19,15],[19,20],[20,18],[21,23],[22,15],[22,21],[23,17]];
        for (const [ty, tx] of ggpTreesBot) {
            if (tiles[ty][tx] === TILE.PARK_GRASS) tiles[ty][tx] = TILE.TREE;
        }

    } else if (districtIndex === 8) {
        // District 9: Chinatown - dragon gate + dense shop fronts
        // Dragon gate across road approach
        for (let x = 10; x <= 13; x++) tiles[8][x] = TILE.GATE;
        // Replace most buildings with shop fronts (dense market feel)
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.SHOP_FRONT;
            for (let x = 5; x < 9; x++) tiles[y][x] = TILE.SHOP_FRONT;
            for (let x = 15; x < 19; x++) tiles[y][x] = TILE.SHOP_FRONT;
            for (let x = 20; x < MAP_WIDTH; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }
        for (let y = 5; y < 8; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.SHOP_FRONT;
            for (let x = 5; x < 9; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }
        // Bottom shops
        for (let y = 15; y < 19; y++) {
            for (let x = 0; x < 4; x++) tiles[y][x] = TILE.SHOP_FRONT;
            for (let x = 5; x < 9; x++) tiles[y][x] = TILE.SHOP_FRONT;
        }

    } else if (districtIndex === 9) {
        // District 10: City Hall - grand civic building + formal plaza
        // Large City Hall building top-left
        for (let y = 0; y < 7; y++) {
            for (let x = 0; x < 9; x++) tiles[y][x] = TILE.BUILDING;
        }
        // Columned entrance along bottom of City Hall
        for (let x = 2; x < 7; x++) tiles[6][x] = TILE.GATE;
        // Civic plaza top-right
        for (let y = 0; y < 9; y++) {
            for (let x = 15; x < MAP_WIDTH; x++) {
                if (tiles[y][x] !== TILE.ROAD && tiles[y][x] !== TILE.CROSSWALK && tiles[y][x] !== TILE.CURB) {
                    tiles[y][x] = TILE.PLAZA;
                }
            }
        }
        // Fountain in plaza center
        tiles[3][18] = TILE.FOUNTAIN;
        tiles[3][19] = TILE.FOUNTAIN;
        tiles[4][18] = TILE.FOUNTAIN;
        tiles[4][19] = TILE.FOUNTAIN;
        // Tree-lined approach south of City Hall
        const cityHallTrees = [[7,0],[7,2],[7,4],[7,6],[7,8]];
        for (const [ty, tx] of cityHallTrees) {
            if (tiles[ty][tx] !== TILE.ROAD) tiles[ty][tx] = TILE.TREE;
        }
        // Second plaza bottom-left
        for (let y = 20; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < 9; x++) {
                if (tiles[y][x] !== TILE.ROAD && tiles[y][x] !== TILE.CROSSWALK && tiles[y][x] !== TILE.CURB) {
                    tiles[y][x] = TILE.PLAZA;
                }
            }
        }
        tiles[21][3] = TILE.FOUNTAIN;
        tiles[21][4] = TILE.FOUNTAIN;
        tiles[22][3] = TILE.FOUNTAIN;
        tiles[22][4] = TILE.FOUNTAIN;
    }

    // === PARK AREAS (small green patches) - for districts without custom layouts ===
    if (districtIndex >= 3 && districtIndex !== 7 && districtIndex !== 8 && districtIndex !== 9) {
        for (let y = 15; y < 18; y++) {
            for (let x = 6; x < 9; x++) {
                if (tiles[y][x] === TILE.SIDEWALK) {
                    tiles[y][x] = TILE.PARK_GRASS;
                }
            }
        }
    }

    // === ALLEYS between buildings ===
    // Skip alleys for Golden Gate Park (nature, not urban)
    if (districtIndex !== 7) {
        for (let y = 0; y < 9; y++) {
            if (tiles[y][4] === TILE.SIDEWALK) tiles[y][4] = TILE.ALLEY;
            if (tiles[y][19] === TILE.SIDEWALK) tiles[y][19] = TILE.ALLEY;
        }
        for (let y = 15; y < MAP_HEIGHT; y++) {
            if (tiles[y][4] === TILE.SIDEWALK) tiles[y][4] = TILE.ALLEY;
            if (tiles[y][19] === TILE.SIDEWALK) tiles[y][19] = TILE.ALLEY;
        }
    }

    // === SCATTER MESSES ===
    let messCount = district.messCount;
    let placed = 0;
    let attempts = 0;
    while (placed < messCount && attempts < 1000) {
        attempts++;
        const x = Math.floor(Math.random() * MAP_WIDTH);
        const y = Math.floor(Math.random() * MAP_HEIGHT);
        if (isCleanableTile(tiles[y][x]) && messes[y][x] === MESS.NONE) {
            // Pick mess type based on tile and district
            if (tiles[y][x] === TILE.ALLEY) {
                messes[y][x] = Math.random() < 0.5 ? MESS.NEEDLES : MESS.POOP;
            } else if (tiles[y][x] === TILE.PARK_GRASS) {
                messes[y][x] = Math.random() < 0.8 ? MESS.POOP : MESS.LITTER;
            } else if (districtIndex === 0) {
                // Fisherman's Wharf: tourists leave litter, some poop
                const roll = Math.random();
                if (roll < 0.45) messes[y][x] = MESS.LITTER;
                else if (roll < 0.8) messes[y][x] = MESS.POOP;
                else messes[y][x] = MESS.NEEDLES;
            } else if (districtIndex === 4) {
                // Haight-Ashbury: heavy needles
                const roll = Math.random();
                if (roll < 0.45) messes[y][x] = MESS.NEEDLES;
                else if (roll < 0.7) messes[y][x] = MESS.POOP;
                else messes[y][x] = MESS.LITTER;
            } else if (districtIndex === 5) {
                // Mission: mixed mess
                const roll = Math.random();
                if (roll < 0.35) messes[y][x] = MESS.POOP;
                else if (roll < 0.65) messes[y][x] = MESS.LITTER;
                else messes[y][x] = MESS.NEEDLES;
            } else if (districtIndex === 6) {
                // Tenderloin: heavy poop + needles
                const roll = Math.random();
                if (roll < 0.4) messes[y][x] = MESS.POOP;
                else if (roll < 0.75) messes[y][x] = MESS.NEEDLES;
                else messes[y][x] = MESS.LITTER;
            } else if (districtIndex === 7) {
                // Golden Gate Park: mostly poop (dogs), some litter
                const roll = Math.random();
                if (roll < 0.5) messes[y][x] = MESS.POOP;
                else if (roll < 0.85) messes[y][x] = MESS.LITTER;
                else messes[y][x] = MESS.NEEDLES;
            } else if (districtIndex === 8) {
                // Chinatown: litter heavy, some poop
                const roll = Math.random();
                if (roll < 0.45) messes[y][x] = MESS.LITTER;
                else if (roll < 0.8) messes[y][x] = MESS.POOP;
                else messes[y][x] = MESS.NEEDLES;
            } else {
                // Default distribution
                const roll = Math.random();
                if (roll < 0.35) messes[y][x] = MESS.LITTER;
                else if (roll < 0.65) messes[y][x] = MESS.POOP;
                else messes[y][x] = MESS.NEEDLES;
            }
            cleanState[y][x] = Math.random() < 0.4 ? CLEAN_STATE.FILTHY : CLEAN_STATE.DIRTY;
            placed++;
        }
    }

    // Count total messes
    let total = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (messes[y][x] !== MESS.NONE) total++;
        }
    }

    gameState.tiles = tiles;
    gameState.messes = messes;
    gameState.cleanState = cleanState;
    gameState.totalMesses = total;
    gameState.messesClean = 0;

    // Generate pigeons
    gameState.pigeons = [];
    for (let i = 0; i < district.pigeonCount; i++) {
        spawnPigeon();
    }

    // Generate hobos
    gameState.hobos = [];
    for (let i = 0; i < district.hoboCount; i++) {
        spawnHobo();
    }

    debugLog(`Generated district ${district.name}: ${total} messes, ${district.pigeonCount} pigeons, ${district.hoboCount} hobos`);
}

function placeBuilding(tiles, startX, startY, w, h) {
    for (let y = startY; y < startY + h && y < MAP_HEIGHT; y++) {
        for (let x = startX; x < startX + w && x < MAP_WIDTH; x++) {
            tiles[y][x] = TILE.BUILDING;
        }
    }
    // Door on south side
    const doorX = startX + Math.floor(w / 2);
    const doorY = startY + h - 1;
    if (doorY < MAP_HEIGHT && doorX < MAP_WIDTH) {
        tiles[doorY][doorX] = TILE.BUILDING_DOOR;
    }
}

function spawnPigeon() {
    let x, y, attempts = 0;
    do {
        x = Math.floor(Math.random() * MAP_WIDTH);
        y = Math.floor(Math.random() * MAP_HEIGHT);
        attempts++;
    } while ((isBlockingTile(gameState.tiles[y][x]) ||
              gameState.tiles[y][x] === TILE.ROAD) && attempts < 100);

    gameState.pigeons.push({
        x, y,
        visualX: x, visualY: y,
        direction: Math.floor(Math.random() * 4),
        moveTimer: Math.random() * 2,
        state: 'idle',  // idle, walking, bombing, fleeing
        bombTimer: 5 + Math.random() * 10,
        idleTimer: 1 + Math.random() * 3,
        frame: 0,
    });
}

function spawnHobo() {
    let x, y, attempts = 0;
    do {
        x = Math.floor(Math.random() * MAP_WIDTH);
        y = Math.floor(Math.random() * MAP_HEIGHT);
        attempts++;
    } while ((isBlockingTile(gameState.tiles[y][x]) ||
              gameState.tiles[y][x] === TILE.ROAD ||
              gameState.tiles[y][x] === TILE.PARK_GRASS) && attempts < 100);

    gameState.hobos.push({
        x, y,
        visualX: x, visualY: y,
        direction: Math.floor(Math.random() * 4),
        moveTimer: Math.random() * 3,
        state: 'wandering',  // wandering, squatting, fleeing
        poopTimer: 8 + Math.random() * 15,
        squatTimer: 0,
        idleTimer: 2 + Math.random() * 4,
        frame: 0,
    });
}

// ============================================
// PLAYER MOVEMENT & CLEANING
// ============================================
function updatePlayer(dt) {
    const p = gameState.player;
    p.moveTimer -= dt;
    p.frame += dt * 6;

    // Movement — keyboard input via shouldMove(), touch input via persistent touchDir
    let dx = 0, dy = 0;
    if (touchDir.x !== 0 || touchDir.y !== 0) {
        // Touch: use persistent direction directly (no shouldMove gating)
        dx = touchDir.x;
        dy = touchDir.y;
    } else {
        // Keyboard
        if (inputActions.up) { dy = -1; }
        else if (inputActions.down) { dy = 1; }
        else if (inputActions.left) { dx = -1; }
        else if (inputActions.right) { dx = 1; }
    }
    if (dy === -1) p.direction = 2;
    else if (dy === 1) p.direction = 0;
    else if (dx === -1) p.direction = 1;
    else if (dx === 1) p.direction = 3;

    // Use faster move delay on mobile for snappier feel
    const effectiveMoveDelay = (touchDir.x !== 0 || touchDir.y !== 0) ? MOBILE_MOVE_DELAY : MOVE_DELAY;

    if ((dx !== 0 || dy !== 0) && p.moveTimer <= 0) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT &&
            !isBlockingTile(gameState.tiles[ny][nx])) {
            p.x = nx;
            p.y = ny;
            p.moveTimer = (effectiveMoveDelay / 1000) * p.speed;

            // Auto-clean when walking over messy tiles
            tryCleanTile(nx, ny);
        }
    }

    // Smooth visual interpolation
    const lerpSpeed = 12 * dt;
    p.visualX += (p.x - p.visualX) * Math.min(1, lerpSpeed);
    p.visualY += (p.y - p.visualY) * Math.min(1, lerpSpeed);
}

function tryCleanTile(x, y) {
    if (gameState.messes[y][x] !== MESS.NONE &&
        gameState.cleanState[y][x] !== CLEAN_STATE.CLEAN &&
        gameState.cleanState[y][x] !== CLEAN_STATE.SPARKLING) {

        const prevState = gameState.cleanState[y][x];
        const char = CHARACTERS[gameState.selectedCharacter];

        // Clean ability: skip DIRTY state, go straight to CLEAN
        if (char.ability === 'clean' && prevState === CLEAN_STATE.FILTHY) {
            gameState.cleanState[y][x] = CLEAN_STATE.CLEAN;
            gameState.messesClean++;
            spawnCleanParticles(x, y, COLORS.uiClean);
            addCelebration('+10', x, y, COLORS.uiClean);
            checkCleanMilestones();
            return;
        }

        if (prevState === CLEAN_STATE.FILTHY) {
            gameState.cleanState[y][x] = CLEAN_STATE.DIRTY;
            spawnCleanParticles(x, y, '#aaa');
        } else if (prevState === CLEAN_STATE.DIRTY) {
            gameState.cleanState[y][x] = CLEAN_STATE.CLEAN;
            gameState.messesClean++;
            spawnCleanParticles(x, y, COLORS.uiClean);
            addCelebration('+10', x, y, COLORS.uiClean);
            checkCleanMilestones();
        }
    }
}

function checkCleanMilestones() {
    const pct = gameState.totalMesses > 0 ? (gameState.messesClean / gameState.totalMesses) : 0;
    if (pct >= 1.0 && !gameState._milestone100) {
        gameState._milestone100 = true;
        addCelebration('100% CLEAN!', gameState.player.x, gameState.player.y - 2, '#ffdd44', true);
        triggerShake(0.3, 8);
    } else if (pct >= 0.75 && !gameState._milestone75) {
        gameState._milestone75 = true;
        addCelebration('75% Clean!', gameState.player.x, gameState.player.y - 2, COLORS.uiAccent);
    } else if (pct >= 0.50 && !gameState._milestone50) {
        gameState._milestone50 = true;
        addCelebration('Halfway!', gameState.player.x, gameState.player.y - 2, COLORS.uiAccent);
    }
}

// ============================================
// PIGEON AI
// ============================================
function updatePigeons(dt) {
    for (const pig of gameState.pigeons) {
        pig.frame += dt * 4;

        // Smooth visual lerp
        const lerpSpeed = 8 * dt;
        pig.visualX += (pig.x - pig.visualX) * Math.min(1, lerpSpeed);
        pig.visualY += (pig.y - pig.visualY) * Math.min(1, lerpSpeed);

        // Distance to player
        const px = gameState.player.x;
        const py = gameState.player.y;
        const dist = Math.abs(pig.x - px) + Math.abs(pig.y - py);

        // State machine
        if (pig.state === 'fleeing') {
            pig.moveTimer -= dt;
            if (pig.moveTimer <= 0) {
                // Move away from player
                const fdx = pig.x - px;
                const fdy = pig.y - py;
                let mx = 0, my = 0;
                if (Math.abs(fdx) > Math.abs(fdy)) mx = fdx > 0 ? 1 : -1;
                else my = fdy > 0 ? 1 : -1;

                const nx = pig.x + mx;
                const ny = pig.y + my;
                if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT &&
                    !isBlockingTile(gameState.tiles[ny][nx]) &&
                    gameState.tiles[ny][nx] !== TILE.ROAD) {
                    pig.x = nx;
                    pig.y = ny;
                }
                pig.moveTimer = 0.15;
                pig.idleTimer -= dt;
                if (pig.idleTimer <= 0 || dist > 8) {
                    pig.state = 'idle';
                    pig.idleTimer = 2 + Math.random() * 3;
                }
            }
        } else if (pig.state === 'bombing') {
            pig.bombTimer -= dt;
            if (pig.bombTimer <= 0) {
                // BOMB! Dirty a 3x3 area
                pigeonBomb(pig.x, pig.y);
                pig.state = 'idle';
                pig.bombTimer = 8 + Math.random() * 12;
                pig.idleTimer = 1 + Math.random() * 2;
                addCelebration('PIGEON BOMB!', pig.x, pig.y - 1, '#ff4444');
                triggerShake(0.2, 4);
                gameState.pigeonsSprayed++; // track for stats (count as event)
            }
        } else {
            // Idle or walking
            pig.idleTimer -= dt;
            pig.bombTimer -= dt;

            // Check if player is close - flee!
            if (dist <= 2) {
                pig.state = 'fleeing';
                pig.idleTimer = 2;
                pig.moveTimer = 0;
            }
            // Time to bomb?
            else if (pig.bombTimer <= 0) {
                pig.state = 'bombing';
                pig.bombTimer = 0.8; // Wind up time
            }
            // Random walk
            else if (pig.idleTimer <= 0) {
                pig.moveTimer -= dt;
                if (pig.moveTimer <= 0) {
                    const dirs = [{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:0}];
                    // Occasionally change direction
                    if (Math.random() < 0.3) {
                        pig.direction = Math.floor(Math.random() * 4);
                    }
                    const d = dirs[pig.direction];
                    const nx = pig.x + d.x;
                    const ny = pig.y + d.y;
                    if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT &&
                        !isBlockingTile(gameState.tiles[ny][nx]) &&
                        gameState.tiles[ny][nx] !== TILE.ROAD) {
                        pig.x = nx;
                        pig.y = ny;
                    } else {
                        pig.direction = Math.floor(Math.random() * 4);
                    }
                    pig.moveTimer = 0.4 + Math.random() * 0.3;

                    // After a few moves, go idle again
                    if (Math.random() < 0.2) {
                        pig.idleTimer = 1 + Math.random() * 3;
                    }
                }
            }
        }
    }
}

function pigeonBomb(cx, cy) {
    // Dirty a 3x3 area around the pigeon
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT &&
                isCleanableTile(gameState.tiles[y][x])) {
                // Re-dirty clean tiles
                if (gameState.cleanState[y][x] === CLEAN_STATE.CLEAN ||
                    gameState.cleanState[y][x] === CLEAN_STATE.SPARKLING) {
                    if (gameState.messes[y][x] !== MESS.NONE) {
                        gameState.messesClean = Math.max(0, gameState.messesClean - 1);
                    }
                    gameState.cleanState[y][x] = CLEAN_STATE.DIRTY;
                }
                // Add mess if there wasn't one
                if (gameState.messes[y][x] === MESS.NONE) {
                    gameState.messes[y][x] = MESS.POOP;
                    gameState.cleanState[y][x] = CLEAN_STATE.DIRTY;
                    gameState.totalMesses++;
                }
                // Spawn splat particles
                spawnSplatParticles(x, y);
            }
        }
    }
}

// ============================================
// HOBO AI
// ============================================
function updateHobos(dt) {
    for (const hobo of gameState.hobos) {
        hobo.frame += dt * 3;

        // Smooth visual lerp
        const lerpSpeed = 6 * dt;
        hobo.visualX += (hobo.x - hobo.visualX) * Math.min(1, lerpSpeed);
        hobo.visualY += (hobo.y - hobo.visualY) * Math.min(1, lerpSpeed);

        // Distance to player
        const px = gameState.player.x;
        const py = gameState.player.y;
        const dist = Math.abs(hobo.x - px) + Math.abs(hobo.y - py);

        // State machine
        if (hobo.state === 'fleeing') {
            hobo.moveTimer -= dt;
            if (hobo.moveTimer <= 0) {
                // Run away from player
                const fdx = hobo.x - px;
                const fdy = hobo.y - py;
                let mx = 0, my = 0;
                if (Math.abs(fdx) > Math.abs(fdy)) mx = fdx > 0 ? 1 : -1;
                else my = fdy > 0 ? 1 : -1;

                const nx = hobo.x + mx;
                const ny = hobo.y + my;
                if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT &&
                    !isBlockingTile(gameState.tiles[ny][nx])) {
                    hobo.x = nx;
                    hobo.y = ny;
                    hobo.direction = mx > 0 ? 3 : mx < 0 ? 1 : my > 0 ? 0 : 2;
                }
                hobo.moveTimer = 0.12;
                hobo.idleTimer -= dt;
                if (hobo.idleTimer <= 0 || dist > 10) {
                    hobo.state = 'wandering';
                    hobo.idleTimer = 3 + Math.random() * 4;
                }
            }
        } else if (hobo.state === 'squatting') {
            hobo.squatTimer -= dt;
            if (hobo.squatTimer <= 0) {
                // Done squatting - leave a mess
                hoboPoop(hobo.x, hobo.y);
                hobo.state = 'fleeing';
                hobo.idleTimer = 2;
                hobo.moveTimer = 0;
                hobo.poopTimer = 10 + Math.random() * 15;
                addCelebration('OH NO...', hobo.x, hobo.y - 1, '#8B4513');
                triggerShake(0.15, 3);
            }
        } else {
            // Wandering
            hobo.poopTimer -= dt;
            hobo.idleTimer -= dt;

            // Flee if player gets close
            if (dist <= 3) {
                hobo.state = 'fleeing';
                hobo.idleTimer = 2;
                hobo.moveTimer = 0;
            }
            // Time to squat?
            else if (hobo.poopTimer <= 0) {
                // Find alley or sidewalk to squat in
                const tile = gameState.tiles[hobo.y][hobo.x];
                if (tile === TILE.ALLEY || tile === TILE.SIDEWALK) {
                    hobo.state = 'squatting';
                    hobo.squatTimer = 1.5; // Squat for 1.5 seconds
                } else {
                    // Not in a good spot, wander toward alleys
                    hobo.poopTimer = 2 + Math.random() * 3;
                }
            }
            // Random wander
            else if (hobo.idleTimer <= 0) {
                hobo.moveTimer -= dt;
                if (hobo.moveTimer <= 0) {
                    const dirs = [{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:0}];
                    // Bias toward alleys
                    if (Math.random() < 0.4) {
                        hobo.direction = Math.floor(Math.random() * 4);
                    }
                    const d = dirs[hobo.direction];
                    const nx = hobo.x + d.x;
                    const ny = hobo.y + d.y;
                    if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT &&
                        !isBlockingTile(gameState.tiles[ny][nx])) {
                        hobo.x = nx;
                        hobo.y = ny;
                    } else {
                        hobo.direction = Math.floor(Math.random() * 4);
                    }
                    hobo.moveTimer = 0.5 + Math.random() * 0.5;

                    if (Math.random() < 0.15) {
                        hobo.idleTimer = 2 + Math.random() * 4;
                    }
                }
            }
        }
    }
}

function hoboPoop(cx, cy) {
    // Create a mystery mess on the tile and adjacent
    if (cx >= 0 && cx < MAP_WIDTH && cy >= 0 && cy < MAP_HEIGHT &&
        isCleanableTile(gameState.tiles[cy][cx])) {
        if (gameState.cleanState[cy][cx] === CLEAN_STATE.CLEAN ||
            gameState.cleanState[cy][cx] === CLEAN_STATE.SPARKLING) {
            if (gameState.messes[cy][cx] !== MESS.NONE) {
                gameState.messesClean = Math.max(0, gameState.messesClean - 1);
            }
            gameState.cleanState[cy][cx] = CLEAN_STATE.FILTHY;
        }
        if (gameState.messes[cy][cx] === MESS.NONE) {
            gameState.messes[cy][cx] = MESS.POOP;
            gameState.cleanState[cy][cx] = CLEAN_STATE.FILTHY;
            gameState.totalMesses++;
        } else {
            gameState.cleanState[cy][cx] = CLEAN_STATE.FILTHY;
        }
        spawnSplatParticles(cx, cy);
    }
}

// ============================================
// PARTICLES
// ============================================
function spawnCleanParticles(x, y, color) {
    for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 60;
        const p = ParticlePool.spawn(
            (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE,
            Math.cos(angle) * speed, Math.sin(angle) * speed - 30,
            2 + Math.random() * 2, color, 0.5 + Math.random() * 0.3
        );
        gameState.particles.push(p);
    }
}

function spawnSparkleParticles(x, y) {
    for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 40;
        const p = ParticlePool.spawn(
            (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE,
            Math.cos(angle) * speed, Math.sin(angle) * speed - 50,
            1 + Math.random() * 3, COLORS.uiGold, 0.6 + Math.random() * 0.4,
            'sparkle'
        );
        gameState.particles.push(p);
    }
}

function spawnSplatParticles(x, y) {
    for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 30;
        const p = ParticlePool.spawn(
            (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            2 + Math.random() * 2, '#8a7a5a', 0.4 + Math.random() * 0.3
        );
        gameState.particles.push(p);
    }
}

function updateParticles(dt) {
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        const p = gameState.particles[i];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt; // gravity
        p.alpha = Math.max(0, 1 - p.age / p.lifetime);

        if (p.age >= p.lifetime) {
            ParticlePool.release(p);
            gameState.particles[i] = gameState.particles[gameState.particles.length - 1];
            gameState.particles.pop();
        }
    }
}

// ============================================
// CELEBRATIONS (floating text)
// ============================================
function addCelebration(text, x, y, color, big = false) {
    gameState.celebrations.push({
        text, color,
        x: (x + 0.5) * TILE_SIZE,
        y: (y + 0.5) * TILE_SIZE,
        offsetY: 0,
        timer: big ? 2.0 : 1.2,
        popScale: 0.5,
        big,
    });
}

function updateCelebrations(dt) {
    for (let i = gameState.celebrations.length - 1; i >= 0; i--) {
        const c = gameState.celebrations[i];
        c.timer -= dt;
        c.offsetY -= dt * 40;

        if (c.popScale < 1.0) {
            c.popScale += dt * 8;
            if (c.popScale > 1.1) c.popScale = 1.1;
        } else if (c.popScale > 1.0) {
            c.popScale -= dt * 2;
            if (c.popScale < 1.0) c.popScale = 1.0;
        }

        if (c.timer <= 0) {
            gameState.celebrations[i] = gameState.celebrations[gameState.celebrations.length - 1];
            gameState.celebrations.pop();
        }
    }
}

// ============================================
// SCREEN SHAKE
// ============================================
function triggerShake(duration, intensity) {
    gameState.shake.timer = duration;
    gameState.shake.intensity = intensity;
}

function updateShake(dt) {
    if (gameState.shake.timer > 0) {
        gameState.shake.timer -= dt;
        const t = gameState.shake.intensity * (gameState.shake.timer > 0 ? 1 : 0);
        gameState.shake.x = (Math.random() - 0.5) * t * 2;
        gameState.shake.y = (Math.random() - 0.5) * t * 2;
    } else {
        gameState.shake.x = 0;
        gameState.shake.y = 0;
    }
}

// ============================================
// EARTHQUAKE SYSTEM
// ============================================
function updateEarthquake(dt) {
    if (gameState.screen !== 'playing') return;

    gameState.earthquakeCooldown -= dt;
    if (gameState.earthquakeCooldown > 0) return;

    // Random earthquake chance (increases in later districts)
    const distIdx = gameState.district;
    const quakeChance = (0.003 + distIdx * 0.002) * dt; // ~every 30-60s on avg

    if (gameState.earthquakeActive) {
        gameState.earthquakeTimer -= dt;
        if (gameState.earthquakeTimer <= 0) {
            gameState.earthquakeActive = false;
            gameState.earthquakeCooldown = 20 + Math.random() * 15; // 20-35s cooldown
        } else {
            // During earthquake: shake intensely, scatter some messes
            triggerShake(0.05, 6);
        }
        return;
    }

    if (Math.random() < quakeChance) {
        // Trigger earthquake!
        gameState.earthquakeActive = true;
        gameState.earthquakeTimer = 1.5 + Math.random() * 1.0; // 1.5-2.5s duration
        gameState.earthquakeCooldown = 0;

        // Armor ability: immune to first earthquake
        if (gameState.earthquakeImmune) {
            gameState.earthquakeImmune = false;
            addCelebration('QUAKE BLOCKED!', gameState.player.x, gameState.player.y - 2, '#8040c0', true);
            gameState.earthquakeActive = false;
            gameState.earthquakeCooldown = 30;
            return;
        }

        addCelebration('EARTHQUAKE!', gameState.player.x, gameState.player.y - 2, '#ff4444', true);
        triggerShake(1.5, 12);

        // Scatter 3-6 new messes randomly
        const messCount = 3 + Math.floor(Math.random() * 4);
        let placed = 0;
        let attempts = 0;
        while (placed < messCount && attempts < 50) {
            attempts++;
            const x = Math.floor(Math.random() * MAP_WIDTH);
            const y = Math.floor(Math.random() * MAP_HEIGHT);
            if (isCleanableTile(gameState.tiles[y][x]) && gameState.messes[y][x] === MESS.NONE) {
                gameState.messes[y][x] = MESS.LITTER;
                gameState.cleanState[y][x] = CLEAN_STATE.DIRTY;
                gameState.totalMesses++;
                spawnSplatParticles(x, y);
                placed++;
            }
        }
    }
}

// ============================================
// LAST-SECOND PIGEON RAMP-UP
// ============================================
function updatePigeonFrenzy(dt) {
    if (gameState.screen !== 'playing') return;
    if (gameState.timer > 15) return; // Only in final 15 seconds

    // Pigeons bomb more frequently as time runs out
    const urgency = 1 - (gameState.timer / 15); // 0 to 1
    for (const pig of gameState.pigeons) {
        if (pig.state === 'idle' || pig.state === 'walking') {
            // Accelerate bomb timer
            pig.bombTimer -= dt * urgency * 3;
        }
    }
    // Hobos also get antsy
    for (const hobo of gameState.hobos) {
        if (hobo.state === 'wandering') {
            hobo.poopTimer -= dt * urgency * 2;
        }
    }
}

// ============================================
// SCORE SHARING (WORDLE-STYLE)
// ============================================
function generateScoreText(stars) {
    const district = DISTRICTS[gameState.district];
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;
    const timeLeft = Math.floor(Math.max(0, gameState.timeBonus));
    const starStr = '\u2B50'.repeat(stars) + '\u2606'.repeat(3 - stars);
    const char = CHARACTERS[gameState.selectedCharacter];
    const districtGrade = calculateDistrictGrade(pct, timeLeft);

    let headline = getGradeHeadline(districtGrade);
    if (gameState.clutchFinish) headline = CLUTCH_HEADLINES[Math.floor(Math.random() * CLUTCH_HEADLINES.length)];
    else if (gameState.nearMiss) headline = NEAR_MISS_HEADLINES[Math.floor(Math.random() * NEAR_MISS_HEADLINES.length)];

    const lines = [
        `DOODY CALLS - D${district.id}: ${district.name}`,
        `${starStr} | Cleaned: ${pct}% | Time: ${timeLeft}s left`,
        `${char.name} | Grade: ${districtGrade}`,
        `"${headline}"`,
        ``,
        `https://kingmadellc.github.io/DoodyCallsSF/`,
    ];
    return lines.join('\n');
}

function shareScore() {
    const text = gameState.lastScoreText;
    if (!text) return;

    // On mobile, prefer the native Web Share API (share sheet)
    if (isMobile && navigator.share) {
        navigator.share({
            title: 'DOODY CALLS',
            text: text,
        }).then(() => {
            gameState.scoreCopied = true;
        }).catch(() => {
            // User cancelled or share failed — fall through to clipboard
            copyToClipboard(text);
        });
        return;
    }

    // Desktop or no Web Share: copy to clipboard
    copyToClipboard(text);
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            gameState.scoreCopied = true;
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); gameState.scoreCopied = true; } catch (e) {}
    document.body.removeChild(ta);
}

// ============================================
// DAILY DISTRICT
// ============================================
function getDailySeed() {
    // Daily resets at 5:00 AM PST (13:00 UTC)
    const now = new Date();
    const utcH = now.getUTCHours();
    const utcD = new Date(now);
    // If before 13:00 UTC (5 AM PST), use yesterday's date
    if (utcH < 13) {
        utcD.setUTCDate(utcD.getUTCDate() - 1);
    }
    return utcD.getUTCFullYear() * 10000 + (utcD.getUTCMonth() + 1) * 100 + utcD.getUTCDate();
}

function getDailyDistrictIndex() {
    const seed = getDailySeed();
    return seed % DISTRICTS.length;
}

// Seeded random for daily levels
function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (s >>> 0) / 0xFFFFFFFF;
    };
}

// ============================================
// CAMERA
// ============================================
function updateCamera(dt) {
    const cam = gameState.camera;
    const p = gameState.player;
    const vpW = getViewportWidth();

    cam.targetX = p.visualX - vpW / 2 + 0.5;
    cam.targetY = p.visualY - VIEWPORT_HEIGHT / 2 + 0.5;

    // Clamp
    cam.targetX = Math.max(0, Math.min(MAP_WIDTH - vpW, cam.targetX));
    cam.targetY = Math.max(0, Math.min(MAP_HEIGHT - VIEWPORT_HEIGHT, cam.targetY));

    // Lerp
    const speed = CAMERA_LERP_SPEED * dt;
    cam.x += (cam.targetX - cam.x) * Math.min(1, speed);
    cam.y += (cam.targetY - cam.y) * Math.min(1, speed);
}

// ============================================
// TIMER & GAME FLOW
// ============================================
function updateTimer(dt) {
    if (gameState.screen !== 'playing') return;
    gameState.timer -= dt;
    if (gameState.timer <= 0) {
        gameState.timer = 0;
        gameState.timeBonus = 0;
        gameState.screen = 'gameOver';
        gameState._endMenuIndex = 0;
        trackRecentDistrict(gameState.district);
        gameState.currentHoboQuote = getRandomHoboQuote();
        triggerShake(0.5, 12);
        // Generate score text for sharing
        gameState.lastScoreText = generateScoreText(0);
        gameState.scoreCopied = false;
        // Save daily result if this was a daily district
        const pctGO = gameState.totalMesses > 0 ?
            Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;
        if (gameState.gameMode === 'daily') {
            saveDailyResult(pctGO, 0, 0);
        }
        gameState.gameMode = 'normal';
    }
}

function startDistrict(districtIndex) {
    gameState.district = districtIndex;
    const dist = DISTRICTS[districtIndex];
    const char = CHARACTERS[gameState.selectedCharacter];

    let timer = dist.timer;
    // Scout ability: +30s on first district
    if (char.ability === 'scout' && districtIndex === 0) timer += 30;
    // Bonus ability: +10% bonus time each district
    if (char.ability === 'bonus') timer = Math.floor(timer * 1.1);

    gameState.timer = timer;
    gameState.screen = 'playing';
    gameState.started = true;

    // Reset player position
    gameState.player.x = 12;
    gameState.player.y = 20;
    gameState.player.visualX = 12;
    gameState.player.visualY = 20;
    gameState.player.moveTimer = 0;

    // Character speed ability
    gameState.player.speed = char.ability === 'speed' ? 0.8 : 1.0; // lower moveTimer = faster

    // Reset stats
    gameState.pigeonsSprayed = 0;
    gameState.hazardsDodged = 0;
    gameState.clutchFinish = false;
    gameState.nearMiss = false;
    gameState.scoreCopied = false;
    gameState.lastScoreText = '';
    gameState._milestone50 = false;
    gameState._milestone75 = false;
    gameState._milestone100 = false;

    // Earthquake state
    gameState.earthquakeTimer = 0;
    gameState.earthquakeActive = false;
    gameState.earthquakeCooldown = 15 + Math.random() * 10; // First quake after 15-25s
    gameState.earthquakeImmune = char.ability === 'armor';

    // Generate level
    generateCityBlock(districtIndex);

    // Center camera
    gameState.camera.x = gameState.player.x - getViewportWidth() / 2;
    gameState.camera.y = gameState.player.y - VIEWPORT_HEIGHT / 2;
}

function getNextRandomDistrict() {
    // Pick a random district that hasn't been played recently (last 9)
    const recent = gameState.recentDistricts || [];
    const available = [];
    for (let i = 0; i < DISTRICTS.length; i++) {
        if (!recent.includes(i)) available.push(i);
    }
    // If somehow all districts are recent (shouldn't happen with 10 districts and max 9 history),
    // fall back to any district except the current one
    if (available.length === 0) {
        for (let i = 0; i < DISTRICTS.length; i++) {
            if (i !== gameState.district) available.push(i);
        }
    }
    return available[Math.floor(Math.random() * available.length)];
}

function trackRecentDistrict(districtIdx) {
    if (!gameState.recentDistricts) gameState.recentDistricts = [];
    gameState.recentDistricts.push(districtIdx);
    // Keep only last 9
    if (gameState.recentDistricts.length > 9) {
        gameState.recentDistricts.shift();
    }
}

function executeEndScreenAction(action) {
    if (action === 'retry') {
        startDistrict(gameState.district);
    } else if (action === 'next') {
        const nextDist = getNextRandomDistrict();
        startDistrict(nextDist);
    } else if (action === 'replay') {
        startDistrict(gameState.district);
    } else if (action === 'menu') {
        gameState.screen = 'title';
    }
}

function completeDistrict() {
    const pct = gameState.totalMesses > 0 ? (gameState.messesClean / gameState.totalMesses) : 0;
    const pctInt = Math.floor(pct * 100);
    const timeLeft = gameState.timer;

    // Clutch / near-miss detection
    gameState.clutchFinish = timeLeft > 0 && timeLeft < 5 && pct >= 0.6;
    gameState.nearMiss = pctInt >= 95 && pctInt < 100;

    if (gameState.clutchFinish) {
        addCelebration('CLUTCH!', gameState.player.x, gameState.player.y - 2, '#ffdd44', true);
        triggerShake(0.4, 10);
    }

    // Efficiency ability: +15% score bonus
    const char = CHARACTERS[gameState.selectedCharacter];
    const effPct = char.ability === 'efficiency' ? Math.min(1, pct * 1.15) : pct;

    let stars = 0;
    if (effPct >= 0.6) stars = 1;
    if (effPct >= 0.8) stars = 2;
    if (effPct >= 1.0 && timeLeft > 10) stars = 3;

    const distId = DISTRICTS[gameState.district].id;
    const prevStars = gameState.districtStars[distId] || 0;
    if (stars > prevStars) {
        gameState.districtStars[distId] = stars;
    }

    // Personal best tracking
    const prevBest = gameState.districtBests[distId];
    if (!prevBest || pctInt > prevBest.pct || (pctInt === prevBest.pct && timeLeft > prevBest.time)) {
        gameState.districtBests[distId] = { pct: pctInt, time: Math.floor(timeLeft), stars };
    }

    // Recalculate total stars and grade
    let total = 0;
    for (const key in gameState.districtStars) {
        total += gameState.districtStars[key];
    }
    gameState.totalStars = total;
    gameState.cityGrade = calculateGrade(total);

    // Collect headline
    const headline = getGradeHeadline(gameState.cityGrade);
    if (!gameState.headlinesSeen.includes(headline)) {
        gameState.headlinesSeen.push(headline);
    }

    gameState.timeBonus = Math.floor(timeLeft);
    gameState.screen = 'districtComplete';
    gameState._endMenuIndex = 0;

    // Track this district as recently played
    trackRecentDistrict(gameState.district);

    // Pick a hobo quote for the end screen
    gameState.currentHoboQuote = getRandomHoboQuote();

    // Generate score share text
    gameState.lastScoreText = generateScoreText(stars);
    gameState.scoreCopied = false;

    // Save daily result if this was a daily district
    if (gameState.gameMode === 'daily') {
        saveDailyResult(pctInt, Math.floor(timeLeft), stars);
    }
    gameState.gameMode = 'normal';

    saveProgress();
}

function saveDailyResult(pct, timeLeft, stars) {
    const district = DISTRICTS[gameState.district];
    const char = CHARACTERS[gameState.selectedCharacter];
    const grade = calculateDistrictGrade(pct, timeLeft);
    gameState.dailyResult = {
        pct, timeLeft, stars, grade,
        districtName: district.name,
        charName: char.name,
        scoreText: gameState.lastScoreText,
        clutch: gameState.clutchFinish,
        nearMiss: gameState.nearMiss,
    };
    saveProgress();
}

function calculateGrade(stars) {
    if (stars >= 28) return 'A+';
    if (stars >= 24) return 'A';
    if (stars >= 20) return 'B+';
    if (stars >= 16) return 'B';
    if (stars >= 12) return 'C+';
    if (stars >= 8) return 'C';
    if (stars >= 4) return 'D';
    return 'F';
}

function calculateDistrictGrade(pct, timeLeft) {
    if (pct >= 100 && timeLeft > 10) return 'A+';
    if (pct >= 100) return 'A';
    if (pct >= 90) return 'B+';
    if (pct >= 80) return 'B';
    if (pct >= 70) return 'C+';
    if (pct >= 60) return 'C';
    if (pct >= 40) return 'D';
    return 'F';
}

function getGradeHeadline(grade) {
    const headlines = {
        'F': 'SF Ranked Dirtiest City in America for 47th Consecutive Year',
        'D': 'City Officials Acknowledge "Slight Odor Improvement"',
        'C': 'Tech Workers Consider Returning to Office One Day Per Week',
        'C+': 'Tourists Report "Slightly Less Horrified" After Visit',
        'B': 'Real Estate Prices Somehow Increase Further',
        'B+': 'Food Truck Owners Report Record Sales on Cleaner Streets',
        'A': 'SF Named "Most Improved" — Residents Suspicious',
        'A+': 'Tech Worker Spotted Walking to Office Without Hazmat Suit',
    };
    return headlines[grade] || headlines['F'];
}

// ============================================
// DRAWING - TILES
// ============================================
function drawTile(x, y) {
    const sx = x * TILE_SIZE;
    const sy = y * TILE_SIZE;
    const tile = gameState.tiles[y][x];
    const mess = gameState.messes[y][x];
    const clean = gameState.cleanState[y][x];

    // Base tile
    switch (tile) {
        case TILE.SIDEWALK:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.sidewalkLight : COLORS.sidewalkDark;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Sidewalk crack lines
            if ((x * 7 + y * 13) % 11 === 0) {
                ctx.strokeStyle = '#a09878';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(sx, sy + TILE_SIZE / 2);
                ctx.lineTo(sx + TILE_SIZE, sy + TILE_SIZE / 2);
                ctx.stroke();
            }
            break;

        case TILE.ROAD:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.roadDark : COLORS.roadLight;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Center line
            if ((y === 11 || y === 12) && x % 3 !== 0) {
                ctx.fillStyle = COLORS.roadLine;
                ctx.fillRect(sx + 2, sy + TILE_SIZE / 2 - 1, TILE_SIZE - 4, 2);
            }
            if ((x === 11 || x === 12) && y % 3 !== 0) {
                ctx.fillStyle = COLORS.roadLine;
                ctx.fillRect(sx + TILE_SIZE / 2 - 1, sy + 2, 2, TILE_SIZE - 4);
            }
            break;

        case TILE.CROSSWALK:
            ctx.fillStyle = COLORS.roadDark;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Stripes
            ctx.fillStyle = COLORS.crosswalk;
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(sx + 2, sy + i * 8 + 1, TILE_SIZE - 4, 4);
            }
            break;

        case TILE.BUILDING:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.buildingWall : COLORS.buildingWallAlt;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Window
            const windowLit = ((x * 3 + y * 7) % 5) < 3; // More lit windows — people waking up
            ctx.fillStyle = windowLit ? COLORS.buildingWindowLit : COLORS.buildingWindow;
            ctx.fillRect(sx + 6, sy + 4, TILE_SIZE - 12, TILE_SIZE - 8);
            // Window frame
            ctx.strokeStyle = '#4a4a5a';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 6, sy + 4, TILE_SIZE - 12, TILE_SIZE - 8);
            // Window cross
            ctx.beginPath();
            ctx.moveTo(sx + TILE_SIZE / 2, sy + 4);
            ctx.lineTo(sx + TILE_SIZE / 2, sy + TILE_SIZE - 4);
            ctx.moveTo(sx + 6, sy + TILE_SIZE / 2);
            ctx.lineTo(sx + TILE_SIZE - 6, sy + TILE_SIZE / 2);
            ctx.stroke();
            break;

        case TILE.BUILDING_DOOR:
            ctx.fillStyle = COLORS.buildingWall;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = COLORS.buildingDoor;
            ctx.fillRect(sx + 8, sy + 2, TILE_SIZE - 16, TILE_SIZE - 2);
            // Door knob
            ctx.fillStyle = '#c0a040';
            ctx.beginPath();
            ctx.arc(sx + TILE_SIZE - 12, sy + TILE_SIZE / 2, 2, 0, Math.PI * 2);
            ctx.fill();
            break;

        case TILE.HOTEL:
            ctx.fillStyle = COLORS.hotelWall;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Fancy window
            ctx.fillStyle = COLORS.buildingWindowLit;
            ctx.fillRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.strokeStyle = COLORS.hotelAccent;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 4, sy + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            // "W" logo hint (on first tile)
            if (x === 15 && y === 0) {
                ctx.fillStyle = COLORS.hotelSign;
                ctx.font = `${Math.floor(TILE_SIZE * 0.6)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('W', sx + TILE_SIZE / 2, sy + TILE_SIZE * 0.7);
            }
            break;

        case TILE.OFFICE:
            ctx.fillStyle = COLORS.officeWall;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Modern window
            ctx.fillStyle = '#4a6a8a';
            ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            ctx.strokeStyle = COLORS.officeAccent;
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
            // Logo hint on first tile
            if (x === 20 && y === 0) {
                ctx.fillStyle = COLORS.officeAccent;
                ctx.font = `${Math.floor(TILE_SIZE * 0.5)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('A', sx + TILE_SIZE / 2, sy + TILE_SIZE * 0.65);
            }
            break;

        case TILE.COFFEE_SHOP:
            ctx.fillStyle = COLORS.coffeeWall;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Awning
            ctx.fillStyle = COLORS.coffeeAwning;
            ctx.fillRect(sx, sy, TILE_SIZE, 6);
            // Striped awning detail
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = i % 2 === 0 ? COLORS.coffeeAwning : '#b08030';
                ctx.fillRect(sx + i * (TILE_SIZE / 4), sy, TILE_SIZE / 4, 6);
            }
            break;

        case TILE.ALLEY:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.alleyDark : COLORS.alleyLight;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Grime
            if ((x * 5 + y * 3) % 7 === 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fillRect(sx + 2, sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            }
            break;

        case TILE.PARK_GRASS:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.grassLight : COLORS.grassDark;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Grass blades
            ctx.fillStyle = '#6aaa3a';
            for (let i = 0; i < 3; i++) {
                const bx = sx + 4 + i * 10 + ((x * 3 + y) % 4);
                ctx.fillRect(bx, sy + TILE_SIZE - 6, 2, 6);
            }
            break;

        case TILE.CURB:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.sidewalkLight : COLORS.sidewalkDark;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = COLORS.curbColor;
            ctx.fillRect(sx, sy + TILE_SIZE - 4, TILE_SIZE, 4);
            break;

        case TILE.WATER:
            ctx.fillStyle = COLORS.waterDeep;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            // Sunrise reflection shimmer on water
            const sunReflect = Math.sin(animCache.time * 1.5 + x * 0.7 + y * 0.3) * 0.12 + 0.08;
            ctx.fillStyle = `rgba(255,160,80,${sunReflect})`;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = COLORS.waterLight;
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const wy = sy + 8 + i * 10;
                const waveOffset = Math.sin(animCache.time * 2 + x * 0.5 + i) * 3;
                ctx.beginPath();
                ctx.moveTo(sx, wy + waveOffset);
                ctx.lineTo(sx + TILE_SIZE / 2, wy - waveOffset);
                ctx.lineTo(sx + TILE_SIZE, wy + waveOffset);
                ctx.stroke();
            }
            if ((x * 7 + y * 3) % 5 === 0) {
                ctx.fillStyle = COLORS.waterFoam;
                ctx.fillRect(sx + 4, sy + 2, 3, 2);
            }
            break;

        case TILE.PIER:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.pierWood : COLORS.pierWoodAlt;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#6a5020';
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(sx, sy + i * 8 + 4);
                ctx.lineTo(sx + TILE_SIZE, sy + i * 8 + 4);
                ctx.stroke();
            }
            if ((x * 3 + y * 5) % 4 === 0) {
                ctx.fillStyle = COLORS.pierNail;
                ctx.fillRect(sx + 6, sy + 6, 2, 2);
                ctx.fillRect(sx + 22, sy + 22, 2, 2);
            }
            break;

        case TILE.FOUNTAIN:
            ctx.fillStyle = COLORS.fountainStone;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = COLORS.fountainWater;
            ctx.beginPath();
            ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#7a7a8a';
            ctx.lineWidth = 2;
            ctx.stroke();
            const spoutH = 4 + Math.sin(animCache.time * 4) * 2;
            ctx.fillStyle = COLORS.waterFoam;
            ctx.fillRect(sx + TILE_SIZE / 2 - 1, sy + TILE_SIZE / 2 - spoutH, 2, spoutH);
            break;

        case TILE.SHOP_FRONT: {
            const dist = DISTRICTS[gameState.district];
            const awningColor = dist ? dist.palette.accent : '#c04040';
            ctx.fillStyle = COLORS.shopWall;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#2a3a4a';
            ctx.fillRect(sx + 4, sy + 10, TILE_SIZE - 8, TILE_SIZE - 12);
            ctx.fillStyle = awningColor;
            ctx.fillRect(sx, sy, TILE_SIZE, 8);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            for (let i = 0; i < 4; i += 2) {
                ctx.fillRect(sx + i * (TILE_SIZE / 4), sy, TILE_SIZE / 4, 8);
            }
            break;
        }

        case TILE.MURAL_WALL: {
            ctx.fillStyle = COLORS.muralBase;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            const mColors = COLORS.muralColors;
            for (let i = 0; i < 3; i++) {
                const ci = (x * 3 + y * 7 + i * 5) % mColors.length;
                ctx.fillStyle = mColors[ci];
                ctx.fillRect(sx + 2, sy + 2 + i * 10, TILE_SIZE - 4, 8);
            }
            ctx.strokeStyle = '#5a4a3a';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            break;
        }

        case TILE.PLAZA:
            ctx.fillStyle = (x + y) % 2 === 0 ? COLORS.plazaBrick : COLORS.plazaBrickAlt;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#908070';
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                ctx.moveTo(sx, sy + i * 8);
                ctx.lineTo(sx + TILE_SIZE, sy + i * 8);
                ctx.stroke();
            }
            {
                const brickOff = (y % 2) * (TILE_SIZE / 2);
                ctx.beginPath();
                ctx.moveTo(sx + brickOff + TILE_SIZE / 2, sy);
                ctx.lineTo(sx + brickOff + TILE_SIZE / 2, sy + TILE_SIZE);
                ctx.stroke();
            }
            break;

        case TILE.TREE:
            ctx.fillStyle = COLORS.grassDark;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = COLORS.treeTrunkDark;
            ctx.fillRect(sx + 12, sy + 18, 8, 14);
            ctx.fillStyle = COLORS.treeLeafDark;
            ctx.beginPath();
            ctx.arc(sx + TILE_SIZE / 2, sy + 12, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = COLORS.treeLeafLight;
            ctx.beginPath();
            ctx.arc(sx + TILE_SIZE / 2 - 3, sy + 9, 6, 0, Math.PI * 2);
            ctx.fill();
            break;

        case TILE.GATE: {
            ctx.fillStyle = COLORS.roadDark;
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
            if (gameState.district === 8) {
                // Chinatown dragon gate
                ctx.fillStyle = COLORS.gateRed;
                ctx.fillRect(sx, sy, 6, TILE_SIZE);
                ctx.fillRect(sx + TILE_SIZE - 6, sy, 6, TILE_SIZE);
                ctx.fillStyle = COLORS.gateGold;
                ctx.fillRect(sx, sy, TILE_SIZE, 6);
                ctx.fillRect(sx + TILE_SIZE / 2 - 3, sy - 4, 6, 8);
            } else if (gameState.district === 9) {
                // City Hall columns
                ctx.fillStyle = COLORS.civicColumn;
                ctx.fillRect(sx + 2, sy, 8, TILE_SIZE);
                ctx.fillRect(sx + TILE_SIZE - 10, sy, 8, TILE_SIZE);
                ctx.fillStyle = COLORS.civicStone;
                ctx.fillRect(sx, sy, TILE_SIZE, 4);
                ctx.fillRect(sx, sy + TILE_SIZE - 4, TILE_SIZE, 4);
            } else {
                // Generic arch
                ctx.fillStyle = COLORS.gateRed;
                ctx.fillRect(sx, sy, 6, TILE_SIZE);
                ctx.fillRect(sx + TILE_SIZE - 6, sy, 6, TILE_SIZE);
                ctx.fillStyle = COLORS.gateGold;
                ctx.fillRect(sx, sy, TILE_SIZE, 6);
            }
            break;
        }
    }

    // === MESS OVERLAY ===
    if (mess !== MESS.NONE && clean !== CLEAN_STATE.CLEAN && clean !== CLEAN_STATE.SPARKLING) {
        const messAlpha = clean === CLEAN_STATE.FILTHY ? 0.95 : 0.6;
        ctx.globalAlpha = messAlpha;

        switch (mess) {
            case MESS.LITTER:
                // Paper/cups scattered — bright white paper, tan cups
                ctx.fillStyle = '#f0e8d0';
                ctx.fillRect(sx + 4, sy + 8, 8, 6);
                ctx.fillStyle = COLORS.litterColor;
                ctx.fillRect(sx + 16, sy + 14, 6, 8);
                ctx.fillStyle = '#f8f0e0';
                ctx.fillRect(sx + 10, sy + 18, 10, 4);
                // Coffee cup rim highlight
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(sx + 16, sy + 14, 6, 2);
                break;

            case MESS.POOP:
                // Brown mound with highlight and stink lines
                ctx.fillStyle = COLORS.poopColor;
                // Base mound
                ctx.beginPath();
                ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + 3,
                    TILE_SIZE / 3, TILE_SIZE / 4.5, 0, 0, Math.PI * 2);
                ctx.fill();
                // Top coil
                ctx.beginPath();
                ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 - 2,
                    TILE_SIZE / 4.5, TILE_SIZE / 5, 0, 0, Math.PI * 2);
                ctx.fill();
                // Tip
                ctx.beginPath();
                ctx.ellipse(sx + TILE_SIZE / 2 + 1, sy + TILE_SIZE / 2 - 6,
                    TILE_SIZE / 7, TILE_SIZE / 8, 0, 0, Math.PI * 2);
                ctx.fill();
                // Highlight
                ctx.fillStyle = COLORS.poopHighlight;
                ctx.fillRect(sx + 10, sy + 10, 3, 2);
                ctx.fillRect(sx + 12, sy + 6, 2, 2);
                // Stink lines (wavy green)
                ctx.strokeStyle = '#8a9a40';
                ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    const wx = sx + 7 + i * 7;
                    const sway = Math.sin(animCache.time * 3 + i * 2.5) * 3;
                    ctx.beginPath();
                    ctx.moveTo(wx + sway, sy + 4);
                    ctx.lineTo(wx - sway, sy - 3);
                    ctx.stroke();
                }
                break;

            case MESS.NEEDLES:
                // Scattered syringes — 2-3 needles at angles
                ctx.strokeStyle = COLORS.needleColor;
                ctx.lineWidth = 2;
                // Needle 1 (diagonal)
                ctx.beginPath();
                ctx.moveTo(sx + 4, sy + 18);
                ctx.lineTo(sx + 18, sy + 8);
                ctx.stroke();
                // Red tip
                ctx.fillStyle = COLORS.needleTip;
                ctx.fillRect(sx + 3, sy + 17, 3, 3);
                // Plunger end
                ctx.fillStyle = '#a0a0a8';
                ctx.fillRect(sx + 17, sy + 7, 3, 3);

                // Needle 2 (more horizontal)
                ctx.strokeStyle = COLORS.needleColor;
                ctx.beginPath();
                ctx.moveTo(sx + 10, sy + 22);
                ctx.lineTo(sx + 24, sy + 18);
                ctx.stroke();
                ctx.fillStyle = COLORS.needleTip;
                ctx.fillRect(sx + 9, sy + 21, 2, 2);
                ctx.fillStyle = '#a0a0a8';
                ctx.fillRect(sx + 23, sy + 17, 2, 2);

                // Orange cap (discarded)
                ctx.fillStyle = '#e08030';
                ctx.fillRect(sx + 16, sy + 14, 3, 2);
                break;
        }

        ctx.globalAlpha = 1;

        // Animated flies on FILTHY tiles (darker for contrast)
        if (clean === CLEAN_STATE.FILTHY) {
            ctx.fillStyle = '#1a1a1a';
            for (let i = 0; i < 2; i++) {
                const fx = sx + TILE_SIZE / 2 + Math.sin(animCache.time * 5 + i * 3 + x) * 8;
                const fy = sy + 4 + Math.cos(animCache.time * 4 + i * 2 + y) * 4;
                ctx.fillRect(fx, fy, 3, 3);
            }
        }
    }

    // === SPARKLE OVERLAY (clean tiles) ===
    if (clean === CLEAN_STATE.SPARKLING) {
        const sparkle = Math.sin(animCache.time * 4 + x * 2 + y * 3) * 0.3 + 0.3;
        ctx.fillStyle = `rgba(255, 255, 200, ${sparkle})`;
        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        // Sparkle star
        const starX = sx + TILE_SIZE / 2 + Math.sin(animCache.time * 2 + x) * 4;
        const starY = sy + TILE_SIZE / 2 + Math.cos(animCache.time * 2.5 + y) * 4;
        ctx.fillStyle = `rgba(255, 255, 100, ${sparkle + 0.2})`;
        ctx.fillRect(starX - 1, starY - 4, 2, 8);
        ctx.fillRect(starX - 4, starY - 1, 8, 2);
    }
}

// ============================================
// DRAWING - PLAYER
// ============================================
function drawPlayer() {
    const p = gameState.player;
    const sx = p.visualX * TILE_SIZE;
    const sy = p.visualY * TILE_SIZE;
    const bounce = Math.sin(p.frame * 2) * 1.5;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE - 2, TILE_SIZE / 3, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (hazmat suit) - uses character color
    const char = CHARACTERS[gameState.selectedCharacter];
    ctx.fillStyle = char.color;
    ctx.fillRect(sx + 6, sy + 6 + bounce, TILE_SIZE - 12, TILE_SIZE - 10);

    // Head
    ctx.fillStyle = char.color;
    ctx.fillRect(sx + 8, sy + 2 + bounce, TILE_SIZE - 16, 8);

    // Visor
    ctx.fillStyle = char.visorColor;
    const visorShine = 0.7 + Math.sin(animCache.time * 3) * 0.15;
    ctx.globalAlpha = visorShine;
    if (p.direction === 0) {
        ctx.fillRect(sx + 10, sy + 4 + bounce, TILE_SIZE - 20, 4);
    } else if (p.direction === 2) {
        ctx.fillRect(sx + 10, sy + 3 + bounce, TILE_SIZE - 20, 3);
    } else if (p.direction === 1) {
        ctx.fillRect(sx + 8, sy + 4 + bounce, 6, 4);
    } else {
        ctx.fillRect(sx + TILE_SIZE - 14, sy + 4 + bounce, 6, 4);
    }
    ctx.globalAlpha = 1;

    // Boots
    ctx.fillStyle = char.bootsColor || COLORS.playerBoots;
    ctx.fillRect(sx + 6, sy + TILE_SIZE - 6, 6, 4);
    ctx.fillRect(sx + TILE_SIZE - 12, sy + TILE_SIZE - 6, 6, 4);

    // Broom (held in front)
    ctx.fillStyle = '#8a6a3a';
    const dirs = [{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:0}];
    const d = dirs[p.direction];
    const broomX = sx + TILE_SIZE / 2 + d.x * 12;
    const broomY = sy + TILE_SIZE / 2 + d.y * 12 + bounce;
    ctx.fillRect(broomX - 1, broomY - 1, 3, 10);
    ctx.fillStyle = '#c0a040';
    ctx.fillRect(broomX - 4, broomY + 8, 9, 4);
}

// ============================================
// DRAWING - PIGEONS
// ============================================
function drawPigeon(pig) {
    const sx = pig.visualX * TILE_SIZE;
    const sy = pig.visualY * TILE_SIZE;
    const bob = Math.sin(pig.frame * 3) * 1;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE - 2, 6, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = COLORS.pigeonBody;
    ctx.beginPath();
    ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + 2 + bob, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = COLORS.pigeonHead;
    ctx.beginPath();
    ctx.arc(sx + TILE_SIZE / 2 + (pig.direction === 3 ? 4 : pig.direction === 1 ? -4 : 0),
            sy + TILE_SIZE / 2 - 3 + bob, 4, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = COLORS.pigeonBeak;
    const beakDir = pig.direction === 3 ? 1 : pig.direction === 1 ? -1 : 0;
    ctx.fillRect(sx + TILE_SIZE / 2 + beakDir * 7 - 1,
                 sy + TILE_SIZE / 2 - 3 + bob, 3, 2);

    // Eye
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(sx + TILE_SIZE / 2 + beakDir * 3,
                 sy + TILE_SIZE / 2 - 5 + bob, 2, 2);

    // Bombing indicator
    if (pig.state === 'bombing') {
        const flash = Math.sin(animCache.time * 20) > 0;
        if (flash) {
            ctx.fillStyle = '#ff0000';
            ctx.font = `${Math.floor(TILE_SIZE * 0.4)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('!', sx + TILE_SIZE / 2, sy - 2);
        }
    }
}

function drawHobo(hobo) {
    const sx = hobo.visualX * TILE_SIZE;
    const sy = hobo.visualY * TILE_SIZE;
    const isSquatting = hobo.state === 'squatting';
    const bob = isSquatting ? 0 : Math.sin(hobo.frame * 2) * 1;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE - 2, 7, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isSquatting) {
        // Squatting pose - shorter, wider
        // Legs (bent)
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(sx + 3, sy + TILE_SIZE - 6, 4, 4);
        ctx.fillRect(sx + TILE_SIZE - 7, sy + TILE_SIZE - 6, 4, 4);

        // Body (hunched)
        ctx.fillStyle = '#6b5b4b';
        ctx.beginPath();
        ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + 4, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head (ducked)
        ctx.fillStyle = '#d4a574';
        ctx.beginPath();
        ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 - 1, 4, 0, Math.PI * 2);
        ctx.fill();

        // Beanie
        ctx.fillStyle = '#3a6b3a';
        ctx.beginPath();
        ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 - 3, 4, Math.PI, 0);
        ctx.fill();

        // Stink lines
        const stinkPhase = hobo.squatTimer * 4;
        ctx.strokeStyle = '#8B7355';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const wave = Math.sin(stinkPhase + i * 2) * 3;
            ctx.beginPath();
            ctx.moveTo(sx + TILE_SIZE / 2 - 4 + i * 4, sy + TILE_SIZE / 2 + 6);
            ctx.lineTo(sx + TILE_SIZE / 2 - 4 + i * 4 + wave, sy + TILE_SIZE / 2 + 10);
            ctx.stroke();
        }
    } else {
        // Standing/walking pose
        // Legs
        ctx.fillStyle = '#4a3a2a';
        const legOffset = Math.sin(hobo.frame * 4) * 2;
        ctx.fillRect(sx + 5, sy + TILE_SIZE - 6 + bob, 3, 5);
        ctx.fillRect(sx + TILE_SIZE - 8, sy + TILE_SIZE - 6 + bob + legOffset, 3, 5);

        // Body (trenchcoat)
        ctx.fillStyle = '#6b5b4b';
        ctx.fillRect(sx + 3, sy + TILE_SIZE / 2 - 2 + bob, TILE_SIZE - 6, 9);

        // Head
        ctx.fillStyle = '#d4a574';
        ctx.beginPath();
        ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 - 5 + bob, 4, 0, Math.PI * 2);
        ctx.fill();

        // Beanie
        ctx.fillStyle = '#3a6b3a';
        ctx.beginPath();
        ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 - 7 + bob, 4, Math.PI, 0);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#222';
        const faceDir = hobo.direction === 3 ? 2 : hobo.direction === 1 ? -2 : 0;
        ctx.fillRect(sx + TILE_SIZE / 2 + faceDir - 2, sy + TILE_SIZE / 2 - 6 + bob, 2, 2);
        ctx.fillRect(sx + TILE_SIZE / 2 + faceDir + 1, sy + TILE_SIZE / 2 - 6 + bob, 2, 2);

        // Fleeing - show ! above head
        if (hobo.state === 'fleeing') {
            const flash = Math.sin(animCache.time * 12) > 0;
            if (flash) {
                ctx.fillStyle = '#ffaa00';
                ctx.font = `${Math.floor(TILE_SIZE * 0.4)}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('!', sx + TILE_SIZE / 2, sy - 2 + bob);
            }
        }
    }
}

// ============================================
// DRAWING - PARTICLES
// ============================================
function drawParticles() {
    for (const p of gameState.particles) {
        ctx.globalAlpha = p.alpha;
        if (p.type === 'sparkle') {
            ctx.fillStyle = p.color;
            // Draw as star shape
            ctx.fillRect(p.x - 1, p.y - p.size, 2, p.size * 2);
            ctx.fillRect(p.x - p.size, p.y - 1, p.size * 2, 2);
        } else {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
    }
    ctx.globalAlpha = 1;
}

// ============================================
// DRAWING - CELEBRATIONS
// ============================================
function drawCelebrations() {
    for (const c of gameState.celebrations) {
        const alpha = Math.min(1, c.timer / 0.4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(c.x, c.y + c.offsetY);
        ctx.scale(c.popScale, c.popScale);
        ctx.font = c.big ? `bold ${Math.floor(TILE_SIZE * 0.7)}px monospace` :
                           `bold ${Math.floor(TILE_SIZE * 0.45)}px monospace`;
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, 0, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// DRAWING - HUD
// ============================================
function drawHUD() {
    const district = DISTRICTS[gameState.district];
    const ts = TILE_SIZE;

    // Top bar background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, 36);

    // District name
    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`D${district.id}: ${district.name}`, 8, 14);

    // Subtitle
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText(district.subtitle, 8, 28);

    // Timer
    const timeLeft = Math.max(0, gameState.timer);
    const timerColor = timeLeft <= 15 ? '#ff4444' : timeLeft <= 30 ? '#ffaa44' : COLORS.uiText;
    ctx.fillStyle = timerColor;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(timeLeft)}s`, canvas.width / 2, 22);

    // Timer pulse effect when low
    if (timeLeft <= 15) {
        const pulse = Math.sin(animCache.time * 8) * 0.3 + 0.3;
        ctx.fillStyle = `rgba(255, 60, 60, ${pulse})`;
        ctx.fillRect(0, 0, canvas.width, 36);
    }

    // Clean percentage
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;
    ctx.fillStyle = pct >= 100 ? COLORS.uiGold : COLORS.uiClean;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}% CLEAN`, canvas.width - 8, 14);

    // Messes counter
    ctx.fillStyle = '#aaa';
    ctx.font = '10px monospace';
    ctx.fillText(`${gameState.messesClean}/${gameState.totalMesses}`, canvas.width - 8, 28);

    // Progress bar
    const barY = 34;
    const barH = 2;
    ctx.fillStyle = '#333';
    ctx.fillRect(0, barY, canvas.width, barH);
    const fillW = (gameState.messesClean / Math.max(1, gameState.totalMesses)) * canvas.width;
    ctx.fillStyle = pct >= 100 ? COLORS.uiGold : COLORS.uiClean;
    ctx.fillRect(0, barY, fillW, barH);

    // Earthquake warning
    if (gameState.earthquakeActive) {
        const quakeFlash = Math.sin(animCache.time * 16) * 0.4 + 0.4;
        ctx.fillStyle = `rgba(200, 100, 0, ${quakeFlash})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff8800';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('EARTHQUAKE!', canvas.width / 2, canvas.height / 2 - 20);
    }

    // === Pause button (all platforms) ===
    const pbSize = 28;
    const pbX = canvas.width - pbSize - 6;
    const pbY = 4;
    mobilePauseBtnRect = { x: pbX, y: pbY, w: pbSize, h: pbSize };
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.roundRect(pbX, pbY, pbSize, pbSize, 4);
    ctx.fill();
    // Draw pause icon (two vertical bars)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const pBarW = 4, pBarH = 14;
    const pBarGap = 5;
    const pBarsX = pbX + (pbSize - pBarW * 2 - pBarGap) / 2;
    const pBarsY = pbY + (pbSize - pBarH) / 2;
    ctx.fillRect(pBarsX, pBarsY, pBarW, pBarH);
    ctx.fillRect(pBarsX + pBarW + pBarGap, pBarsY, pBarW, pBarH);

    // === Finish Shift button when >= 60% clean ===
    mobileFinishBtnRect = null;
    if (pct >= 60) {
        const label = isMobile ? 'FINISH SHIFT' : 'FINISH SHIFT [F]';
        const bw = isMobile ? 100 : 120, bh = 26;
        const bx = canvas.width / 2 - bw / 2;
        const by = canvas.height - 50;
        mobileFinishBtnRect = { x: bx, y: by, w: bw, h: bh };

        const pulse = Math.sin(animCache.time * 4) * 0.15 + 0.85;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = COLORS.uiAccent;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 6);
        ctx.fill();
        ctx.fillStyle = '#0a0a1e';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, bx + bw / 2, by + 17);
        ctx.globalAlpha = 1;
    }

    // === NEWS TICKER at bottom ===
    drawNewsTicker();

    // Timer danger vignette
    if (timeLeft <= 20) {
        const vigor = (1 - timeLeft / 20) * 0.4;
        const grad = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
            canvas.width / 2, canvas.height / 2, canvas.width * 0.7
        );
        grad.addColorStop(0, 'rgba(255,0,0,0)');
        grad.addColorStop(1, `rgba(255,0,0,${vigor})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawPauseMenu() {
    const cw = canvas.width;
    const ch = canvas.height;

    // Dim overlay
    ctx.fillStyle = 'rgba(10,10,30,0.80)';
    ctx.fillRect(0, 0, cw, ch);

    // Title
    ctx.fillStyle = '#4ecdc4';
    ctx.font = `bold ${Math.floor(cw * 0.07)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', cw / 2, ch * 0.28);

    // Menu items
    const items = ['Resume', 'Restart District', 'Quit to Menu'];
    const itemH = Math.floor(ch * 0.09);
    const itemW = Math.floor(cw * 0.6);
    const startY = ch * 0.38;
    const idx = gameState.pauseMenuIndex;

    pauseMenuRects = [];

    for (let i = 0; i < items.length; i++) {
        const x = (cw - itemW) / 2;
        const y = startY + i * (itemH + 10);
        const selected = i === idx;

        pauseMenuRects.push({ x, y, w: itemW, h: itemH, idx: i });

        // Button background
        ctx.fillStyle = selected ? 'rgba(78,205,196,0.20)' : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(x, y, itemW, itemH, 8);
        ctx.fill();

        // Button border
        ctx.strokeStyle = selected ? '#4ecdc4' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(x, y, itemW, itemH, 8);
        ctx.stroke();

        // Selected glow
        if (selected) {
            ctx.shadowColor = '#4ecdc4';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.roundRect(x, y, itemW, itemH, 8);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Label
        ctx.fillStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.6)';
        ctx.font = `bold ${Math.floor(cw * 0.035)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(items[i], cw / 2, y + itemH / 2 + Math.floor(cw * 0.012));
    }

    // Controls hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `${Math.floor(cw * 0.02)}px monospace`;
    ctx.textAlign = 'center';
    const hintY = startY + items.length * (itemH + 10) + 30;
    if (isMobile) {
        ctx.fillText('Tap to select', cw / 2, hintY);
    } else {
        ctx.fillText('↑↓ Navigate  •  Enter Select  •  Esc Resume', cw / 2, hintY);
    }
}

function updatePaused() {
    if (inputActions.up) {
        gameState.pauseMenuIndex = Math.max(0, gameState.pauseMenuIndex - 1);
    }
    if (inputActions.down) {
        gameState.pauseMenuIndex = Math.min(2, gameState.pauseMenuIndex + 1);
    }

    // Resume on Escape/P
    if (inputActions.pause) {
        gameState.screen = 'playing';
        return;
    }

    // Confirm selection
    if (inputActions.confirm) {
        const idx = gameState.pauseMenuIndex;
        if (idx === 0) {
            // Resume
            gameState.screen = 'playing';
        } else if (idx === 1) {
            // Restart District
            startDistrict(gameState.district);
        } else if (idx === 2) {
            // Quit to Menu
            gameState.screen = 'title';
        }
    }
}

function drawNewsTicker() {
    const tickerH = 20;
    const tickerY = canvas.height - tickerH;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, tickerY, canvas.width, tickerH);

    // Red "LIVE" badge
    ctx.fillStyle = '#e04040';
    ctx.fillRect(2, tickerY + 3, 32, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LIVE', 18, tickerY + 14);

    // Scrolling text
    const headline = NEWS_HEADLINES[gameState.tickerIndex % NEWS_HEADLINES.length];
    ctx.fillStyle = '#ddd';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    // Measure and scroll
    const textW = ctx.measureText(headline).width;
    const startX = 40;
    const maxScroll = textW + canvas.width;

    ctx.save();
    ctx.beginPath();
    ctx.rect(36, tickerY, canvas.width - 36, tickerH);
    ctx.clip();
    ctx.fillText(headline, startX + canvas.width - gameState.tickerOffset, tickerY + 14);
    ctx.restore();

    // Advance ticker
    gameState.tickerOffset += 0.8;
    if (gameState.tickerOffset > maxScroll) {
        gameState.tickerOffset = 0;
        gameState.tickerIndex++;
    }
}

// ============================================
// DRAWING - TITLE SCREEN
// ============================================
// ── Title screen card hit rects (rebuilt every frame) ──
let titleCardRects = [];

function drawTitleScreen() {
    const cw = canvas.width;
    const ch = canvas.height;
    const t = animCache.time;

    // ── Layer 1: Sky gradient (pre-dawn atmosphere) ──
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
    skyGrad.addColorStop(0.00, '#0a0a1e');
    skyGrad.addColorStop(0.15, '#141432');
    skyGrad.addColorStop(0.35, '#1e1440');
    skyGrad.addColorStop(0.55, '#3d1a4a');
    skyGrad.addColorStop(0.70, '#6b2040');
    skyGrad.addColorStop(0.82, '#c84820');
    skyGrad.addColorStop(0.92, '#e87830');
    skyGrad.addColorStop(1.00, '#f0a040');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch);

    // ── Layer 2: Sun radial glow ──
    const horizonY = ch * 0.78;
    const sunGrad = ctx.createRadialGradient(cw * 0.5, horizonY, 0, cw * 0.5, horizonY, cw * 0.55);
    sunGrad.addColorStop(0.0, 'rgba(255,200,80,0.45)');
    sunGrad.addColorStop(0.2, 'rgba(255,140,50,0.30)');
    sunGrad.addColorStop(0.5, 'rgba(200,60,40,0.15)');
    sunGrad.addColorStop(1.0, 'rgba(60,20,40,0.0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, cw, ch);

    // ── Layer 3: Horizontal glow band ──
    const bandGrad = ctx.createLinearGradient(0, ch * 0.72, 0, ch * 0.88);
    bandGrad.addColorStop(0.0, 'rgba(255,160,60,0.0)');
    bandGrad.addColorStop(0.4, 'rgba(255,160,60,0.20)');
    bandGrad.addColorStop(0.6, 'rgba(255,200,100,0.25)');
    bandGrad.addColorStop(1.0, 'rgba(255,160,60,0.0)');
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, 0, cw, ch);

    // ── Layer 4: Stars ──
    for (let i = 0; i < 30; i++) {
        const sx = ((i * 137 + 47) % 600) + 20;
        const sy = ((i * 251 + 89) % (ch * 0.35));
        const size = (i % 3 === 0) ? 2 : 1;
        let alpha = 0.3 + (i * 73 % 50) / 100;
        if (i % 6 === 0) {
            alpha *= 0.5 + 0.5 * Math.sin(t * (0.8 + (i % 5) * 0.3) + i);
        }
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx, sy, size, size);
    }
    ctx.globalAlpha = 1;

    // ── Layer 5–6: City skyline (shifted up so buildings are visible) ──
    const skylineShift = Math.floor(ch * 0.38);
    ctx.save();
    ctx.translate(0, -skylineShift);
    drawCitySkyline();
    ctx.restore();

    // ── Layer 7: Darken only the lower portion where cards go ──
    const darkStart = ch * 0.50;
    const darkGrad = ctx.createLinearGradient(0, darkStart - ch * 0.12, 0, darkStart + ch * 0.08);
    darkGrad.addColorStop(0, 'rgba(10,10,30,0.0)');
    darkGrad.addColorStop(1, 'rgba(10,10,30,0.92)');
    ctx.fillStyle = darkGrad;
    ctx.fillRect(0, darkStart - ch * 0.12, cw, ch - darkStart + ch * 0.12);

    // ── Layer 9: Touch-first card grid (2x2) at bottom of screen ──
    const dailyDist = DISTRICTS[getDailyDistrictIndex()];
    const dailyDone = gameState.dailyPlayed && !IS_ADMIN;
    const selectedIndex = gameState._menuIndex || 0;
    const cardItems = [
        { icon: '\u{1F9F9}', label: 'START', desc: 'Begin District 1', accent: '#4ecdc4' },
        { icon: '\u26A1',    label: 'QUICK', desc: 'Random district', accent: '#ff8040' },
        { icon: '\u{1F5FA}', label: 'DISTRICTS', desc: 'Select district', accent: '#ffe66d' },
        { icon: '\u{1F4C5}', label: 'DAILY DISTRICT', desc: dailyDone ? 'Completed today!' : dailyDist.name, accent: dailyDone ? '#666' : '#ff6b9d' },
    ];

    const pad = Math.floor(cw * 0.03);
    const gridW = cw - pad * 2;
    const gap = Math.floor(cw * 0.025);
    const cardW = Math.floor((gridW - gap) / 2);
    const cardH = Math.floor(ch * 0.15);
    const footerH = 22;
    const gridBottom = ch - footerH;
    const gridTop = gridBottom - (cardH * 2 + gap);

    // ── Layer 8: Wordmark logo (centered between top and card grid) ──
    const taglineFontSize = Math.floor(cw * 0.022);
    const taglineGap = 8;
    if (wordmarkImg.complete && wordmarkImg.naturalWidth > 0) {
        const logoW = cw * 0.52;
        const logoH = logoW * (wordmarkImg.naturalHeight / wordmarkImg.naturalWidth);
        const totalBlockH = logoH + taglineGap + taglineFontSize;
        const logoY = (gridTop - totalBlockH) / 2;
        const logoX = (cw - logoW) / 2;
        ctx.drawImage(wordmarkImg, logoX, logoY, logoW, logoH);

        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#4ecdc4';
        ctx.font = `${taglineFontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('San Francisco needs you before they wake up.', cw / 2, logoY + logoH + taglineGap + taglineFontSize * 0.5);
        ctx.globalAlpha = 1;
    } else {
        // Wordmark not loaded — show tagline only (no fallback title)
        const tagY = gridTop / 2 + taglineFontSize * 0.5;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#4ecdc4';
        ctx.font = `${taglineFontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('San Francisco needs you before they wake up.', cw / 2, tagY);
        ctx.globalAlpha = 1;
    }
    const gridLeft = pad;
    const cornerR = 8;

    titleCardRects = [];

    for (let i = 0; i < 4; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = gridLeft + col * (cardW + gap);
        const cy = gridTop + row * (cardH + gap);
        const item = cardItems[i];
        const selected = i === selectedIndex;

        titleCardRects.push({ x: cx, y: cy, w: cardW, h: cardH, idx: i });

        // Card press scale animation
        const pressScale = (selected && gameState._cardPressAnim) ? 0.97 : 1.0;
        const centerX = cx + cardW / 2;
        const centerY = cy + cardH / 2;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(pressScale, pressScale);
        ctx.translate(-centerX, -centerY);

        // Card background
        const bgAlpha = selected ? 0.25 : 0.12;
        ctx.fillStyle = selected
            ? `rgba(78,205,196,${bgAlpha})`
            : `rgba(255,255,255,${bgAlpha})`;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, cornerR);
        ctx.fill();

        // Card border
        ctx.strokeStyle = selected ? item.accent : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, cornerR);
        ctx.stroke();

        // Selected glow
        if (selected) {
            ctx.shadowColor = item.accent;
            ctx.shadowBlur = 16;
            ctx.strokeStyle = item.accent + '60';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(cx, cy, cardW, cardH, cornerR);
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        // Icon
        const iconSize = Math.floor(cardH * 0.38);
        ctx.font = `${iconSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(item.icon, cx + cardW * 0.22, cy + cardH * 0.42);
        ctx.textBaseline = 'alphabetic';

        // Label
        const labelSize = Math.floor(cw * 0.032);
        ctx.fillStyle = selected ? item.accent : '#d0d8e0';
        ctx.font = `bold ${labelSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(item.label, cx + cardW * 0.40, cy + cardH * 0.40);

        // Description
        const descSize = Math.floor(cw * 0.018);
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)';
        ctx.font = `${descSize}px monospace`;
        ctx.fillText(item.desc, cx + cardW * 0.40, cy + cardH * 0.62);

        ctx.restore();
    }

    // ── Layer 10: Footer ──
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#384050';
    ctx.font = `${Math.floor(cw * 0.014)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('A Kingmade LLC Production  |  Built with love in San Francisco',
                 cw / 2, ch - 14);
    ctx.globalAlpha = 1;
}

function drawCitySkyline() {
    const t = animCache.time;
    const cw = canvas.width;
    const ch = canvas.height;

    // Back row (distant, dimmer) — heights 0.30–0.50 of canvas, anchored to bottom
    const backBuildings = [
        { x: 0.00, w: 0.06, h: 0.30 },
        { x: 0.07, w: 0.08, h: 0.42 },
        { x: 0.16, w: 0.05, h: 0.33 },
        { x: 0.22, w: 0.07, h: 0.45, style: 'setback' },
        { x: 0.30, w: 0.06, h: 0.50, style: 'pyramid' },    // Transamerica
        { x: 0.37, w: 0.09, h: 0.38 },
        { x: 0.47, w: 0.05, h: 0.35, style: 'antenna' },
        { x: 0.53, w: 0.04, h: 0.48 },                       // Tall narrow tower
        { x: 0.58, w: 0.08, h: 0.40 },
        { x: 0.67, w: 0.06, h: 0.32 },
        { x: 0.74, w: 0.10, h: 0.44, style: 'setback' },
        { x: 0.85, w: 0.05, h: 0.36 },
        { x: 0.91, w: 0.09, h: 0.30 },
    ];

    // Front row (closer, brighter, shorter) — heights 0.20–0.38
    const frontBuildings = [
        { x: 0.00, w: 0.09, h: 0.22 },
        { x: 0.10, w: 0.06, h: 0.32 },
        { x: 0.17, w: 0.08, h: 0.25 },
        { x: 0.26, w: 0.07, h: 0.36 },
        { x: 0.34, w: 0.10, h: 0.28 },
        { x: 0.45, w: 0.06, h: 0.38 },
        { x: 0.52, w: 0.09, h: 0.24 },
        { x: 0.62, w: 0.05, h: 0.34 },
        { x: 0.68, w: 0.08, h: 0.26 },
        { x: 0.77, w: 0.10, h: 0.30 },
        { x: 0.88, w: 0.06, h: 0.20 },
        { x: 0.95, w: 0.06, h: 0.28 },
    ];

    function drawBuildingRow(buildings, bodyColor, winGapX, winGapY, winW, winH) {
        for (const b of buildings) {
            const bx = b.x * cw;
            const bw = b.w * cw;
            const bh = b.h * ch;
            let topY = ch - bh;

            ctx.fillStyle = bodyColor;

            // Special building styles
            if (b.style === 'pyramid') {
                // Triangular spire on top
                ctx.beginPath();
                ctx.moveTo(bx, topY);
                ctx.lineTo(bx + bw / 2, topY - bw * 0.7);
                ctx.lineTo(bx + bw, topY);
                ctx.closePath();
                ctx.fill();
                ctx.fillRect(bx, topY, bw, bh);
            } else if (b.style === 'antenna') {
                // Thin antenna extending up
                ctx.fillRect(bx + bw / 2 - 1, topY - 18, 2, 18);
                ctx.fillRect(bx, topY, bw, bh);
            } else if (b.style === 'setback') {
                // Narrower top section
                const inset = bw * 0.2;
                const setbackH = bh * 0.3;
                ctx.fillRect(bx + inset, topY, bw - inset * 2, setbackH);
                ctx.fillRect(bx, topY + setbackH, bw, bh - setbackH);
            } else {
                ctx.fillRect(bx, topY, bw, bh);
            }

            // Windows with blinking lights
            for (let wy = topY + 4; wy < ch - 3; wy += winGapY) {
                for (let wx = bx + 3; wx < bx + bw - 3; wx += winGapX) {
                    const seed = (Math.floor(wx) * 137 + Math.floor(wy) * 251) % 1000;
                    const blinkRate = 0.08 + (seed % 60) / 60 * 0.35;
                    const blinkPhase = seed / 1000 * Math.PI * 2;
                    const blinkVal = Math.sin(t * blinkRate * Math.PI * 2 + blinkPhase);

                    const isBlinking = seed % 6 === 0;
                    const isLit = isBlinking ? blinkVal > 0 : seed % 3 !== 0;

                    if (isLit) {
                        const tone = seed % 7;
                        ctx.fillStyle = tone === 0 ? '#f0d06080' :
                                        tone === 1 ? '#e8c04070' :
                                        tone === 2 ? '#d0a03060' :
                                        tone === 3 ? '#c0d8f050' :
                                        tone === 4 ? '#f0e8c878' :
                                        tone === 5 ? '#90b0d048' :
                                                     '#e0c87060' ;
                    } else {
                        ctx.fillStyle = '#1a1a3a';
                    }
                    ctx.fillRect(wx, wy, winW, winH);
                }
            }
            // Reset fill for next building body
            ctx.fillStyle = bodyColor;
        }
    }

    // Draw back row (dimmer, smaller windows)
    drawBuildingRow(backBuildings, '#0d0d20', 6, 7, 2, 2);

    // Draw front row (brighter, larger windows)
    drawBuildingRow(frontBuildings, '#12122e', 7, 8, 3, 3);
}

// ============================================
// DRAWING - GAME OVER SCREEN
// ============================================
function drawGameOverScreen() {
    const cw = canvas.width;
    const ch = canvas.height;
    const cornerR = 8;
    const t = animCache.time;

    // Darken overlay with red tint
    ctx.fillStyle = 'rgba(10,5,5,0.88)';
    ctx.fillRect(0, 0, cw, ch);

    // Subtle red vignette at top
    const vigGrad = ctx.createRadialGradient(cw / 2, 0, 0, cw / 2, 0, cw * 0.8);
    vigGrad.addColorStop(0, 'rgba(255,40,40,0.08)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, cw, ch * 0.5);

    const district = DISTRICTS[gameState.district];
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;
    const headline = GAME_OVER_HEADLINES[Math.floor(gameState.district) % GAME_OVER_HEADLINES.length];

    // ── HEADER: "TIME'S UP" with pulsing alarm ──
    const pulseAlpha = 0.7 + Math.sin(t * 4) * 0.3;
    ctx.fillStyle = `rgba(255,68,68,${pulseAlpha})`;
    ctx.font = `bold ${Math.floor(cw * 0.065)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText("\u23F0 TIME'S UP", cw / 2, ch * 0.10);

    // District name
    ctx.fillStyle = '#ff8888';
    ctx.font = `${Math.floor(cw * 0.020)}px monospace`;
    ctx.fillText(district.name, cw / 2, ch * 0.15);

    // ── HERO: Big percentage with progress ring ──
    const ringCX = cw / 2;
    const ringCY = ch * 0.29;
    const ringR = Math.floor(cw * 0.10);
    const ringW = 6;

    // Background ring
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Progress ring
    const pctFrac = pct / 100;
    const ringColor = pct >= 60 ? '#4ecdc4' : pct >= 30 ? '#ff8040' : '#ff4444';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringW;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ringCX, ringCY, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pctFrac);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Percentage number inside ring
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(cw * 0.055)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, ringCX, ringCY - 2);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#888';
    ctx.font = `${Math.floor(cw * 0.014)}px monospace`;
    ctx.fillText(`${gameState.messesClean}/${gameState.totalMesses}`, ringCX, ringCY + ringR * 0.55);

    // ── HEADLINE: Funny failure news ──
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `italic ${Math.floor(cw * 0.014)}px monospace`;
    ctx.textAlign = 'center';
    wrapText(headline, cw / 2, ch * 0.44, cw * 0.85, 14);

    // ── SHARE CARD ──
    const shareW = cw * 0.80;
    const shareX = (cw - shareW) / 2;
    const shareY = ch * 0.50;
    const shareH = Math.floor(ch * 0.12);
    drawScoreShare(shareX, shareY, shareW, shareH, 0);

    // ── HOBO QUOTE ──
    const quoteY = shareY + shareH + Math.floor(ch * 0.012);
    const btnTop = ch - 22 - Math.floor(ch * 0.13);
    const quoteH = btnTop - quoteY - Math.floor(ch * 0.012);
    if (quoteH > 30) {
        drawHoboQuote(shareX, quoteY, shareW, quoteH);
    }

    // ── BOTTOM BUTTONS ──
    const pad = Math.floor(cw * 0.03);
    const gap = Math.floor(cw * 0.025);
    const gridW = cw - pad * 2;
    const cardH = Math.floor(ch * 0.13);
    const footerH = 22;
    const gridBottom = ch - footerH;
    const gridTop = gridBottom - cardH;

    const cardItems = [
        { icon: '\u{1F504}', label: 'RETRY', desc: 'Try again', accent: '#ff8040', action: 'retry' },
        { icon: '\u27A1\uFE0F', label: 'NEXT', desc: 'Random district', accent: '#4ecdc4', action: 'next' },
        { icon: '\u{1F3E0}', label: 'MENU', desc: 'Back to title', accent: '#ffe66d', action: 'menu' },
    ];

    drawEndScreenButtons(cardItems, pad, gap, gridW, cardH, gridTop, cornerR, cw);
}

// ============================================
// DRAWING - DISTRICT COMPLETE SCREEN
// ============================================
function drawDistrictCompleteScreen() {
    const cw = canvas.width;
    const ch = canvas.height;
    const cornerR = 8;
    const t = animCache.time;

    // Darken overlay with golden tint
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    ctx.fillRect(0, 0, cw, ch);

    // Celebration glow
    const glowGrad = ctx.createRadialGradient(cw / 2, ch * 0.22, 0, cw / 2, ch * 0.22, cw * 0.5);
    glowGrad.addColorStop(0, 'rgba(255,220,100,0.06)');
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, cw, ch * 0.5);

    const district = DISTRICTS[gameState.district];
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;

    let stars = 0;
    if (pct >= 60) stars = 1;
    if (pct >= 80) stars = 2;
    if (pct >= 100 && gameState.timeBonus > 10) stars = 3;

    // ── HEADER ──
    ctx.fillStyle = COLORS.uiGold;
    ctx.font = `bold ${Math.floor(cw * 0.055)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('SHIFT COMPLETE!', cw / 2, ch * 0.10);

    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `${Math.floor(cw * 0.020)}px monospace`;
    ctx.fillText(district.name, cw / 2, ch * 0.15);

    // ── STARS with bounce animation ──
    const starSize = Math.floor(cw * 0.07);
    const starSpacing = Math.floor(starSize * 1.6);
    const starsBaseY = ch * 0.22;
    for (let i = 0; i < 3; i++) {
        const filled = i < stars;
        const bounce = filled ? Math.sin(t * 3 + i * 0.8) * 3 : 0;
        ctx.fillStyle = filled ? COLORS.uiGold : 'rgba(255,255,255,0.12)';
        ctx.font = `${starSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(filled ? '\u2605' : '\u2606', cw / 2 - starSpacing + i * starSpacing, starsBaseY + bounce);
    }

    // ── HERO: Progress ring + percentage ──
    const ringCX = cw / 2;
    const ringCY = ch * 0.36;
    const ringR = Math.floor(cw * 0.09);
    const ringW = 6;

    // Background ring
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(ringCX, ringCY, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Progress ring
    const pctFrac = pct / 100;
    const ringColor = pct >= 100 ? COLORS.uiGold : pct >= 80 ? COLORS.uiAccent : pct >= 60 ? '#ff8040' : '#ff4444';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = ringW;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(ringCX, ringCY, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pctFrac);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Percentage inside
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(cw * 0.048)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct}%`, ringCX, ringCY - 2);
    ctx.textBaseline = 'alphabetic';

    // Stats row below ring
    const rowY = ringCY + ringR + Math.floor(ch * 0.04);
    ctx.font = `${Math.floor(cw * 0.016)}px monospace`;
    ctx.textAlign = 'center';

    // Grade
    const districtGrade = calculateDistrictGrade(pct, Math.floor(gameState.timeBonus));
    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `bold ${Math.floor(cw * 0.028)}px monospace`;
    ctx.fillText(districtGrade, cw / 2 - cw * 0.18, rowY);
    ctx.fillStyle = '#555';
    ctx.font = `${Math.floor(cw * 0.012)}px monospace`;
    ctx.fillText('GRADE', cw / 2 - cw * 0.18, rowY + 14);

    // Time left
    ctx.fillStyle = '#ccc';
    ctx.font = `bold ${Math.floor(cw * 0.028)}px monospace`;
    ctx.fillText(`${gameState.timeBonus}s`, cw / 2, rowY);
    ctx.fillStyle = '#555';
    ctx.font = `${Math.floor(cw * 0.012)}px monospace`;
    ctx.fillText('TIME LEFT', cw / 2, rowY + 14);

    // City grade
    ctx.fillStyle = COLORS.uiGold;
    ctx.font = `bold ${Math.floor(cw * 0.028)}px monospace`;
    ctx.fillText(gameState.cityGrade, cw / 2 + cw * 0.18, rowY);
    ctx.fillStyle = '#555';
    ctx.font = `${Math.floor(cw * 0.012)}px monospace`;
    ctx.fillText('CITY', cw / 2 + cw * 0.18, rowY + 14);

    // Clutch / near miss
    if (gameState.clutchFinish) {
        ctx.fillStyle = '#ffdd44';
        ctx.font = `bold ${Math.floor(cw * 0.016)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('\u26A1 CLUTCH FINISH!', cw / 2, rowY + 30);
    } else if (gameState.nearMiss) {
        ctx.fillStyle = '#ff8888';
        ctx.font = `bold ${Math.floor(cw * 0.016)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('SO CLOSE...', cw / 2, rowY + 30);
    }

    // ── SHARE CARD ──
    const shareW = cw * 0.80;
    const shareX = (cw - shareW) / 2;
    const shareY = rowY + 42;
    const shareH = Math.floor(ch * 0.11);
    drawScoreShare(shareX, shareY, shareW, shareH, stars);

    // ── HOBO QUOTE ──
    const btnTop = ch - 22 - Math.floor(ch * 0.13);
    const quoteY = shareY + shareH + Math.floor(ch * 0.010);
    const quoteH = btnTop - quoteY - Math.floor(ch * 0.010);
    if (quoteH > 30) {
        drawHoboQuote(shareX, quoteY, shareW, quoteH);
    }

    // ── BOTTOM BUTTONS ──
    const pad = Math.floor(cw * 0.03);
    const gap = Math.floor(cw * 0.025);
    const gridW = cw - pad * 2;
    const cardH = Math.floor(ch * 0.13);
    const footerH = 22;
    const gridBottom = ch - footerH;
    const gridTop = gridBottom - cardH;

    const cardItems = [
        { icon: '\u27A1\uFE0F', label: 'NEXT', desc: 'Random district', accent: '#4ecdc4', action: 'next' },
        { icon: '\u{1F504}', label: 'REPLAY', desc: district.name, accent: '#ff8040', action: 'replay' },
        { icon: '\u{1F3E0}', label: 'MENU', desc: 'Back to title', accent: '#ffe66d', action: 'menu' },
    ];

    drawEndScreenButtons(cardItems, pad, gap, gridW, cardH, gridTop, cornerR, cw);
}

function drawEndScreenButtons(cardItems, pad, gap, gridW, cardH, gridTop, cornerR, cw) {
    const cardW = Math.floor((gridW - gap * (cardItems.length - 1)) / cardItems.length);
    endScreenCardRects = [];

    for (let i = 0; i < cardItems.length; i++) {
        const item = cardItems[i];
        const cx = pad + i * (cardW + gap);
        const cy = gridTop;
        const selected = i === (gameState._endMenuIndex || 0);

        endScreenCardRects.push({ x: cx, y: cy, w: cardW, h: cardH, action: item.action, idx: i });

        // Card background
        ctx.fillStyle = selected ? `rgba(78,205,196,0.20)` : `rgba(255,255,255,0.08)`;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, cornerR);
        ctx.fill();

        // Card border
        ctx.strokeStyle = selected ? item.accent : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(cx, cy, cardW, cardH, cornerR);
        ctx.stroke();

        if (selected) {
            ctx.shadowColor = item.accent;
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.roundRect(cx, cy, cardW, cardH, cornerR);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Icon
        const iconSize = Math.floor(cardH * 0.36);
        ctx.font = `${iconSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(item.icon, cx + cardW * 0.22, cy + cardH * 0.48);
        ctx.textBaseline = 'alphabetic';

        // Label
        ctx.fillStyle = selected ? item.accent : '#d0d8e0';
        ctx.font = `bold ${Math.floor(cw * 0.028)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(item.label, cx + cardW * 0.40, cy + cardH * 0.42);

        // Desc
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)';
        ctx.font = `${Math.floor(cw * 0.015)}px monospace`;
        ctx.fillText(item.desc, cx + cardW * 0.40, cy + cardH * 0.65);
    }
}

function drawHoboQuote(x, y, w, h) {
    const hq = gameState.currentHoboQuote;
    if (!hq || !hq.quote) return;

    const cw = canvas.width;

    // Quote card background
    ctx.fillStyle = 'rgba(180,140,60,0.08)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,140,60,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.stroke();

    // Hobo name
    ctx.fillStyle = '#c0a050';
    ctx.font = `bold ${Math.floor(cw * 0.016)}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`\u{1F9D9} ${hq.name} says:`, x + 10, y + 14);

    // Quote text (word-wrapped)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `italic ${Math.floor(cw * 0.014)}px monospace`;
    ctx.textAlign = 'left';

    const words = hq.quote.split(' ');
    let line = '"';
    let lineY = y + 30;
    const maxWidth = w - 20;
    const lineH = Math.floor(cw * 0.019);

    for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line !== '"') {
            if (lineY + lineH > y + h - 4) break; // don't overflow card
            ctx.fillText(line.trim(), x + 10, lineY);
            line = word + ' ';
            lineY += lineH;
        } else {
            line = testLine;
        }
    }
    // Last line with closing quote
    if (lineY + lineH <= y + h + 2) {
        ctx.fillText((line.trim() + '"'), x + 10, lineY);
    }
}

function drawScoreShare(x, y, w, h, stars) {
    // Store hit rect for tap-to-share on mobile
    shareCardRect = { x, y, w, h };

    // Share card background
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = gameState.scoreCopied ? '#4ecdc4' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = gameState.scoreCopied ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.stroke();

    const district = DISTRICTS[gameState.district];
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;
    const char = CHARACTERS[gameState.selectedCharacter];

    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    if (gameState.scoreCopied) {
        ctx.fillStyle = COLORS.uiAccent;
        ctx.fillText('COPIED TO CLIPBOARD!', x + 8, y + 14);
    } else if (isMobile) {
        ctx.fillStyle = COLORS.uiAccent;
        ctx.fillText('\u261D TAP HERE TO SHARE', x + 8, y + 14);
    } else {
        ctx.fillText('Press C to copy score & share:', x + 8, y + 14);
    }

    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
    ctx.fillText(`DOODY CALLS - D${district.id}: ${district.name}`, x + 8, y + 30);
    const timeLeft = Math.floor(gameState.timeBonus);
    ctx.fillText(`${starStr} | Cleaned: ${pct}% | Time: ${timeLeft}s left`, x + 8, y + 44);
    const districtGrade = calculateDistrictGrade(pct, timeLeft);
    ctx.fillText(`${char.name} | Grade: ${districtGrade}`, x + 8, y + 58);

    // Near-miss or clutch indicator
    if (gameState.clutchFinish) {
        ctx.fillStyle = '#ffdd44';
        ctx.fillText('CLUTCH FINISH!', x + 8, y + 72);
    } else if (gameState.nearMiss) {
        ctx.fillStyle = '#ff8888';
        ctx.fillText('SO CLOSE...', x + 8, y + 72);
    }
}

// ============================================
// DRAWING - DAILY RESULT SCREEN (replay scorecard)
// ============================================
function drawDailyResultScreen() {
    const cw = canvas.width;
    const ch = canvas.height;
    const r = gameState.dailyResult;

    // Background
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(0, 0, cw, ch);

    // Subtle gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, 'rgba(255,107,157,0.08)');
    grad.addColorStop(1, 'rgba(78,205,196,0.05)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    const dailyDist = DISTRICTS[getDailyDistrictIndex()];

    // Header
    ctx.fillStyle = '#ff6b9d';
    ctx.font = `bold ${Math.floor(cw * 0.05)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('\u{1F4C5} DAILY DISTRICT', cw / 2, ch * 0.10);

    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `${Math.floor(cw * 0.022)}px monospace`;
    ctx.fillText(dailyDist.name, cw / 2, ch * 0.16);

    // "COMPLETED" badge
    ctx.fillStyle = 'rgba(78,205,196,0.12)';
    ctx.beginPath();
    ctx.roundRect(cw * 0.25, ch * 0.20, cw * 0.5, ch * 0.045, 20);
    ctx.fill();
    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `bold ${Math.floor(cw * 0.017)}px monospace`;
    ctx.fillText('\u2705 COMPLETED', cw / 2, ch * 0.23);

    if (r) {
        // ── Full result with stats ──

        // Stars
        const starSize = Math.floor(cw * 0.065);
        const starSpacing = Math.floor(starSize * 1.5);
        const starsY = ch * 0.30;
        for (let i = 0; i < 3; i++) {
            const filled = i < r.stars;
            ctx.fillStyle = filled ? COLORS.uiGold : '#333';
            ctx.font = `${starSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(filled ? '\u2605' : '\u2606', cw / 2 - starSpacing + i * starSpacing, starsY);
        }

        // Stats card
        const statsW = cw * 0.82;
        const statsH = Math.floor(ch * 0.20);
        const statsX = (cw - statsW) / 2;
        const statsY = ch * 0.35;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.roundRect(statsX, statsY, statsW, statsH, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(statsX, statsY, statsW, statsH, 8);
        ctx.stroke();

        // Cleaned %
        const pctColor = r.pct >= 100 ? COLORS.uiGold : r.pct >= 60 ? COLORS.uiAccent : '#ff6b6b';
        ctx.fillStyle = pctColor;
        ctx.font = `bold ${Math.floor(cw * 0.05)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${r.pct}%`, cw / 2, statsY + statsH * 0.25);
        ctx.fillStyle = '#888';
        ctx.font = `${Math.floor(cw * 0.016)}px monospace`;
        ctx.fillText('CLEANED', cw / 2, statsY + statsH * 0.37);

        // Divider
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(statsX + 20, statsY + statsH * 0.45);
        ctx.lineTo(statsX + statsW - 20, statsY + statsH * 0.45);
        ctx.stroke();

        // Stats row
        ctx.textAlign = 'center';

        // Grade
        ctx.fillStyle = COLORS.uiAccent;
        ctx.font = `bold ${Math.floor(cw * 0.028)}px monospace`;
        ctx.fillText(r.grade, cw / 2 - cw * 0.18, statsY + statsH * 0.62);
        ctx.fillStyle = '#666';
        ctx.font = `${Math.floor(cw * 0.012)}px monospace`;
        ctx.fillText('GRADE', cw / 2 - cw * 0.18, statsY + statsH * 0.72);

        // Time
        ctx.fillStyle = '#ccc';
        ctx.font = `bold ${Math.floor(cw * 0.028)}px monospace`;
        ctx.fillText(`${r.timeLeft}s`, cw / 2, statsY + statsH * 0.62);
        ctx.fillStyle = '#666';
        ctx.font = `${Math.floor(cw * 0.012)}px monospace`;
        ctx.fillText('TIME LEFT', cw / 2, statsY + statsH * 0.72);

        // Character
        ctx.fillStyle = '#ccc';
        ctx.font = `bold ${Math.floor(cw * 0.017)}px monospace`;
        ctx.fillText(r.charName, cw / 2 + cw * 0.18, statsY + statsH * 0.62);
        ctx.fillStyle = '#666';
        ctx.font = `${Math.floor(cw * 0.012)}px monospace`;
        ctx.fillText('WORKER', cw / 2 + cw * 0.18, statsY + statsH * 0.72);

        // Clutch / near miss badge
        if (r.clutch) {
            ctx.fillStyle = '#ffdd44';
            ctx.font = `bold ${Math.floor(cw * 0.015)}px monospace`;
            ctx.fillText('\u26A1 CLUTCH FINISH!', cw / 2, statsY + statsH * 0.87);
        } else if (r.nearMiss) {
            ctx.fillStyle = '#ff8888';
            ctx.font = `bold ${Math.floor(cw * 0.015)}px monospace`;
            ctx.fillText('SO CLOSE...', cw / 2, statsY + statsH * 0.87);
        }

        // ── Share card (drawn from saved scoreText) ──
        const shareW = statsW;
        const shareH = Math.floor(ch * 0.13);
        const shareX = statsX;
        const shareYPos = statsY + statsH + Math.floor(ch * 0.02);
        drawDailyShareCard(shareX, shareYPos, shareW, shareH, r);

    } else {
        // ── No saved result (played before the update) ──
        // Try to reconstruct from districtBests
        const distId = dailyDist.id;
        const best = gameState.districtBests[distId];

        if (best) {
            ctx.fillStyle = '#ccc';
            ctx.font = `bold ${Math.floor(cw * 0.04)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(`${best.pct}%`, cw / 2, ch * 0.38);
            ctx.fillStyle = '#888';
            ctx.font = `${Math.floor(cw * 0.016)}px monospace`;
            ctx.fillText('BEST SCORE', cw / 2, ch * 0.42);
        } else {
            ctx.fillStyle = '#888';
            ctx.font = `${Math.floor(cw * 0.020)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('Already completed today!', cw / 2, ch * 0.38);
        }

        // Still clear the shareCardRect so no stale hits
        shareCardRect = null;
    }

    // Next daily countdown
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `${Math.floor(cw * 0.015)}px monospace`;
    ctx.textAlign = 'center';
    const nextReset = getNextDailyReset();
    ctx.fillText(`New daily in ${nextReset}`, cw / 2, ch * 0.82);

    // Back hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `${Math.floor(cw * 0.014)}px monospace`;
    ctx.fillText(isMobile ? 'Tap anywhere to go back' : 'Press any key to go back', cw / 2, ch * 0.92);
}

function drawDailyShareCard(x, y, w, h, r) {
    // Store hit rect for tap-to-share
    shareCardRect = { x, y, w, h };

    // Card background
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = gameState.scoreCopied ? '#4ecdc4' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = gameState.scoreCopied ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.stroke();

    const cw = canvas.width;
    ctx.textAlign = 'left';

    // Header line
    if (gameState.scoreCopied) {
        ctx.fillStyle = COLORS.uiAccent;
        ctx.font = `bold 9px monospace`;
        ctx.fillText('COPIED TO CLIPBOARD!', x + 8, y + 14);
    } else if (isMobile) {
        ctx.fillStyle = COLORS.uiAccent;
        ctx.font = `bold 9px monospace`;
        ctx.fillText('\u261D TAP HERE TO SHARE', x + 8, y + 14);
    } else {
        ctx.fillStyle = '#888';
        ctx.font = '9px monospace';
        ctx.fillText('Press C to copy score & share:', x + 8, y + 14);
    }

    // Score text preview (from saved scoreText)
    if (r.scoreText) {
        ctx.fillStyle = '#aaa';
        ctx.font = '9px monospace';
        const lines = r.scoreText.split('\n');
        let lineY = y + 28;
        for (let i = 0; i < Math.min(lines.length, 4); i++) {
            ctx.fillText(lines[i], x + 8, lineY);
            lineY += 14;
        }
    } else {
        // Reconstruct a basic score line
        ctx.fillStyle = '#aaa';
        ctx.font = '9px monospace';
        const starStr = '\u2605'.repeat(r.stars) + '\u2606'.repeat(3 - r.stars);
        ctx.fillText(`DOODY CALLS - Daily: ${r.districtName}`, x + 8, y + 28);
        ctx.fillText(`${starStr} | Cleaned: ${r.pct}% | Grade: ${r.grade}`, x + 8, y + 42);
        ctx.fillText(`${r.charName} | Time: ${r.timeLeft}s left`, x + 8, y + 56);
    }
}

function getNextDailyReset() {
    const now = new Date();
    // Next reset is 13:00 UTC (5 AM PST)
    const reset = new Date(now);
    reset.setUTCHours(13, 0, 0, 0);
    if (now >= reset) {
        reset.setUTCDate(reset.getUTCDate() + 1);
    }
    const diff = reset - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// ============================================
// DRAWING - CHARACTER SELECT
// ============================================
// ── Character select carousel state ──
let charCarousel = {
    offset: 0,         // current pixel offset
    velocity: 0,       // current swipe velocity
    targetIndex: 0,    // snap target
    dragging: false,
    dragStartX: 0,
    dragStartOffset: 0,
    lastDragX: 0,
    lastDragTime: 0,
    settled: true,
};

// ── Confirm button hit rect ──
let charConfirmBtnRect = null;

function getCharCardSpacing() { return canvas.width * 0.72; }

function drawCharSelectScreen() {
    const cw = canvas.width;
    const ch = canvas.height;
    const t = animCache.time;
    const numChars = CHARACTERS.length;

    // Background: sky + skyline
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(0, 0, cw, ch);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
    skyGrad.addColorStop(0.0, '#0a0a1e');
    skyGrad.addColorStop(0.4, '#141432');
    skyGrad.addColorStop(0.7, '#1e1440');
    skyGrad.addColorStop(1.0, '#2a1a3a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch);

    drawCitySkyline();

    // Darken overlay
    ctx.fillStyle = 'rgba(10,10,30,0.70)';
    ctx.fillRect(0, 0, cw, ch);

    // ── Back button (always visible) ──
    const bbW = 70, bbH = 34;
    const bbX = 12, bbY = 12;
    mobileBackBtnRect = { x: bbX, y: bbY, w: bbW, h: bbH };
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(bbX, bbY, bbW, bbH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bbX, bbY, bbW, bbH, 6);
    ctx.stroke();
    ctx.fillStyle = '#8899aa';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('\u2190 Back', bbX + bbW / 2, bbY + 22);

    // ── Title ──
    ctx.fillStyle = '#8899aa';
    ctx.font = `${Math.floor(cw * 0.025)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('CHOOSE YOUR WORKER', cw / 2, ch * 0.09);

    // ── Carousel ──
    const cardSpacing = getCharCardSpacing();
    const cardW = cw * 0.58;
    const cardH = ch * 0.52;
    const centerY = ch * 0.43;
    const centerX = cw / 2;

    const currentFrac = charCarousel.offset / cardSpacing;
    const activeIdx = Math.round(currentFrac);

    const visibleRange = 2;
    for (let di = -visibleRange; di <= visibleRange; di++) {
        let i = activeIdx + di;
        if (i < 0 || i >= numChars) continue;

        const cardCenterX = centerX + (i * cardSpacing - charCarousel.offset);
        const distFromCenter = Math.abs(cardCenterX - centerX);
        const normalizedDist = Math.min(distFromCenter / cardSpacing, 1.5);

        const scale = 1.0 - normalizedDist * 0.25;
        const alpha = 1.0 - normalizedDist * 0.5;
        if (alpha <= 0.02 || scale <= 0.3) continue;

        const char = CHARACTERS[i];
        const scaledW = cardW * scale;
        const scaledH = cardH * scale;
        const cx = cardCenterX - scaledW / 2;
        const cy = centerY - scaledH / 2;
        const isActive = i === activeIdx && normalizedDist < 0.15;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);

        // Card background
        ctx.fillStyle = isActive ? 'rgba(78,205,196,0.12)' : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(cx, cy, scaledW, scaledH, 10 * scale);
        ctx.fill();

        // Card border
        ctx.strokeStyle = isActive ? `${char.color}90` : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(cx, cy, scaledW, scaledH, 10 * scale);
        ctx.stroke();

        // Character preview
        const prevCX = cardCenterX;
        const prevCY = cy + scaledH * 0.32;
        const sz = 80 * scale;

        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(prevCX, prevCY + sz / 2 + 6 * scale, sz / 2, 8 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = char.color;
        ctx.fillRect(prevCX - sz / 3, prevCY - sz / 3, sz * 2 / 3, sz * 2 / 3);
        ctx.fillRect(prevCX - sz / 4, prevCY - sz / 2, sz / 2, sz / 3);

        ctx.fillStyle = char.visorColor;
        ctx.fillRect(prevCX - sz / 5, prevCY - sz / 2 + 8 * scale, sz * 2 / 5, sz / 6);

        ctx.fillStyle = char.bootsColor || '#3a3a3a';
        ctx.fillRect(prevCX - sz / 3, prevCY + sz / 3 - 4 * scale, sz / 4, 8 * scale);
        ctx.fillRect(prevCX + sz / 12, prevCY + sz / 3 - 4 * scale, sz / 4, 8 * scale);

        // Name
        ctx.fillStyle = char.color;
        ctx.font = `bold ${Math.floor(cw * 0.036 * scale)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(char.name, prevCX, cy + scaledH * 0.64);

        // Description
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `${Math.floor(cw * 0.02 * scale)}px monospace`;
        ctx.fillText(char.desc, prevCX, cy + scaledH * 0.72);

        // Ability badge (active card only)
        if (isActive) {
            const abilityY = cy + scaledH * 0.82;
            const badgeW = cw * 0.42;
            const badgeH = 24 * scale;
            ctx.fillStyle = 'rgba(78,205,196,0.15)';
            ctx.beginPath();
            ctx.roundRect(prevCX - badgeW / 2, abilityY - badgeH / 2, badgeW, badgeH, 4);
            ctx.fill();
            ctx.strokeStyle = 'rgba(78,205,196,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(prevCX - badgeW / 2, abilityY - badgeH / 2, badgeW, badgeH, 4);
            ctx.stroke();

            ctx.fillStyle = COLORS.uiGold;
            ctx.font = `bold ${Math.floor(cw * 0.018)}px monospace`;
            ctx.fillText(`\u2B50 ${char.abilityDesc}`, prevCX, abilityY + 5);
        }

        ctx.restore();
    }

    // ── Page indicator dots ──
    const dotY = ch * 0.76;
    const dotGap = 14;
    const totalDotsW = (numChars - 1) * dotGap;
    for (let i = 0; i < numChars; i++) {
        const dx = cw / 2 - totalDotsW / 2 + i * dotGap;
        const isNear = Math.abs(i - currentFrac) < 0.6;
        const dotR = isNear ? 4 : 2.5;
        ctx.fillStyle = isNear ? CHARACTERS[i].color : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Swipe hint arrows ──
    if (charCarousel.settled && !charCarousel.dragging) {
        const hintAlpha = 0.4 + Math.sin(t * 3) * 0.15;
        ctx.globalAlpha = hintAlpha;
        ctx.fillStyle = '#4ecdc4';
        const arrowSize = Math.floor(cw * 0.05);
        ctx.font = `${arrowSize}px monospace`;
        ctx.textAlign = 'center';
        if (activeIdx > 0) ctx.fillText('\u2039', cw * 0.06, centerY + 4);
        if (activeIdx < numChars - 1) ctx.fillText('\u203A', cw * 0.94, centerY + 4);
        ctx.globalAlpha = 1;
    }

    // ── Confirm button ──
    const btnW = cw * 0.55;
    const btnH = ch * 0.072;
    const btnX = (cw - btnW) / 2;
    const btnY = ch * 0.83;
    charConfirmBtnRect = { x: btnX, y: btnY, w: btnW, h: btnH };

    const activeChar = CHARACTERS[gameState._charIndex || 0];
    const btnPulse = 1.0 + Math.sin(t * 4) * 0.015;

    ctx.save();
    ctx.translate(btnX + btnW / 2, btnY + btnH / 2);
    ctx.scale(btnPulse, btnPulse);
    ctx.translate(-(btnX + btnW / 2), -(btnY + btnH / 2));

    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, activeChar.color);
    btnGrad.addColorStop(1, activeChar.color + '80');
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(cw * 0.028)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`SELECT ${activeChar.name.toUpperCase()}`, cw / 2, btnY + btnH * 0.62);

    ctx.restore();

    // ── Counter ──
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `${Math.floor(cw * 0.018)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${(gameState._charIndex || 0) + 1} / ${numChars}`, cw / 2, ch * 0.93);
}

// ============================================
// DRAWING - DISTRICT SELECT
// ============================================
function drawDistrictSelectScreen() {
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `bold ${Math.floor(canvas.width * 0.04)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('DISTRICT SELECT', canvas.width / 2, 35);

    // City grade
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText(`City Grade: ${gameState.cityGrade}  •  ${gameState.totalStars} total stars`, canvas.width / 2, 55);

    const idx = gameState._distSelectIndex || 0;
    const listY = 75;
    const itemH = 52;
    const maxVisible = 10;

    // Scrolling offset
    const scrollOffset = Math.max(0, idx - 4) * itemH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, listY, canvas.width, canvas.height - listY - 40);
    ctx.clip();

    for (let i = 0; i < DISTRICTS.length; i++) {
        const d = DISTRICTS[i];
        const y = listY + i * itemH - scrollOffset;
        if (y < listY - itemH || y > canvas.height) continue;

        const locked = i >= gameState.districtsUnlocked;
        const selected = i === idx;
        const stars = gameState.districtStars[d.id] || 0;
        const best = gameState.districtBests[d.id];

        // Background
        if (selected) {
            ctx.fillStyle = locked ? 'rgba(100,40,40,0.3)' : 'rgba(78,205,196,0.15)';
            ctx.fillRect(10, y, canvas.width - 20, itemH - 4);
        }

        // District number and name
        ctx.fillStyle = locked ? '#444' : selected ? COLORS.uiAccent : '#aaa';
        ctx.font = `bold 14px monospace`;
        ctx.textAlign = 'left';
        const label = locked ? `D${d.id}: ???` : `D${d.id}: ${d.name}`;
        ctx.fillText(label, 20, y + 18);

        // Subtitle
        ctx.fillStyle = locked ? '#333' : '#666';
        ctx.font = '10px monospace';
        ctx.fillText(locked ? 'Complete previous district to unlock' : d.subtitle, 20, y + 34);

        // Stars
        if (!locked) {
            ctx.fillStyle = COLORS.uiGold;
            ctx.font = '14px monospace';
            ctx.textAlign = 'right';
            const starStr = '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars);
            ctx.fillText(starStr, canvas.width - 20, y + 18);

            // Personal best
            if (best) {
                ctx.fillStyle = '#666';
                ctx.font = '10px monospace';
                ctx.fillText(`Best: ${best.pct}% | ${best.time}s left`, canvas.width - 20, y + 34);
            }
        } else {
            ctx.fillStyle = '#333';
            ctx.font = '14px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('\uD83D\uDD12', canvas.width - 20, y + 22);
        }

        // Timer info
        if (!locked) {
            ctx.fillStyle = '#555';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${d.timer}s`, 20, y + 46);
        }
    }

    ctx.restore();

    // Bottom hint
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    if (isMobile) {
        ctx.fillText('Tap district to select  •  Tap again to play', canvas.width / 2, canvas.height - 15);
    } else {
        ctx.fillText('ENTER to play  •  ESC to go back', canvas.width / 2, canvas.height - 15);
    }

    // Mobile back button
    if (isMobile) {
        const bw = 60, bh = 28;
        const bx = 10, by = 5;
        mobileBackBtnRect = { x: bx, y: by, w: bw, h: bh };
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('← Back', bx + bw / 2, by + 18);
    }
}

// ============================================
// UTILITY: TEXT WRAPPING
// ============================================
function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let lineY = y;

    ctx.textAlign = 'center';
    for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line !== '') {
            ctx.fillText(line.trim(), x, lineY);
            line = word + ' ';
            lineY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line.trim(), x, lineY);
}

// ============================================
// MAIN UPDATE
// ============================================
function update(dt) {
    gameState.animationTime += dt;
    animCache.update(gameState.animationTime);

    updateInputActions();
    updateShake(dt);

    if (gameState.screen === 'title') {
        updateTitleMenu(dt);
    } else if (gameState.screen === 'playing') {
        // Pause takes priority
        if (inputActions.pause) {
            gameState.pauseMenuIndex = 0;
            gameState.screen = 'paused';
            return;
        }

        updatePlayer(dt);
        updatePigeons(dt);
        updateHobos(dt);
        updateEarthquake(dt);
        updatePigeonFrenzy(dt);
        updateCamera(dt);
        updateTimer(dt);
        updateParticles(dt);
        updateCelebrations(dt);

        // Finish shift early (F key or action) when >= 60% clean
        const pct = gameState.totalMesses > 0 ? (gameState.messesClean / gameState.totalMesses) : 0;
        if (pct >= 0.6 && (keys['KeyF'] || keyBuffer['KeyF'])) {
            completeDistrict();
        }
    } else if (gameState.screen === 'paused') {
        updatePaused();
    } else if (gameState.screen === 'gameOver') {
        updateParticles(dt);
        if (gameState._endMenuIndex === undefined) gameState._endMenuIndex = 0;
        // C key to copy score
        if (keys['KeyC'] || keyBuffer['KeyC']) {
            shareScore();
        }
        // Navigate cards (3 cards: Retry, Next, Menu)
        if (inputActions.left) gameState._endMenuIndex = Math.max(0, gameState._endMenuIndex - 1);
        if (inputActions.right) gameState._endMenuIndex = Math.min(2, gameState._endMenuIndex + 1);
        // Confirm selection
        if (inputActions.confirm) {
            const rect = endScreenCardRects[gameState._endMenuIndex];
            if (rect) executeEndScreenAction(rect.action);
        }
    } else if (gameState.screen === 'districtComplete') {
        if (gameState._endMenuIndex === undefined) gameState._endMenuIndex = 0;
        // C key to copy score
        if (keys['KeyC'] || keyBuffer['KeyC']) {
            shareScore();
        }
        // Navigate cards (3 cards: Next, Replay, Menu)
        if (inputActions.left) gameState._endMenuIndex = Math.max(0, gameState._endMenuIndex - 1);
        if (inputActions.right) gameState._endMenuIndex = Math.min(2, gameState._endMenuIndex + 1);
        // Confirm selection
        if (inputActions.confirm) {
            const rect = endScreenCardRects[gameState._endMenuIndex];
            if (rect) executeEndScreenAction(rect.action);
        }
    } else if (gameState.screen === 'dailyResult') {
        // C key to copy score
        if (keys['KeyC'] || keyBuffer['KeyC']) {
            shareScore();
        }
        // Any other key returns to title
        else if (inputActions.confirm || inputActions.pause) {
            gameState.screen = 'title';
        }
    } else if (gameState.screen === 'charSelect') {
        updateCharSelect(dt);
    } else if (gameState.screen === 'districtSelect') {
        updateDistrictSelect(dt);
    }
}

function titleMenuSelect(idx) {
    // Prevent confirm from carrying over to next screen
    inputActions.confirm = false;
    inputActions._lastConfirm = true;

    if (idx === 0) {
        gameState._pendingMode = 'start';
        gameState.screen = 'charSelect';
        gameState._charIndex = gameState.selectedCharacter;
        charCarousel.offset = (gameState._charIndex || 0) * getCharCardSpacing();
        charCarousel.velocity = 0;
        charCarousel.settled = true;
    } else if (idx === 1) {
        gameState._pendingMode = 'quick';
        gameState.screen = 'charSelect';
        gameState._charIndex = gameState.selectedCharacter;
        charCarousel.offset = (gameState._charIndex || 0) * getCharCardSpacing();
        charCarousel.velocity = 0;
        charCarousel.settled = true;
    } else if (idx === 2) {
        gameState.screen = 'districtSelect';
        gameState._distSelectIndex = 0;
    } else if (idx === 3) {
        // Daily District — only once per day unless admin
        if (gameState.dailyPlayed && !IS_ADMIN) {
            // Load saved score text for sharing
            if (gameState.dailyResult && gameState.dailyResult.scoreText) {
                gameState.lastScoreText = gameState.dailyResult.scoreText;
            }
            gameState.scoreCopied = false;
            gameState.screen = 'dailyResult';
            return;
        }
        const dailyIdx = getDailyDistrictIndex();
        gameState._pendingMode = 'daily';
        gameState._pendingDistrict = dailyIdx;
        gameState.screen = 'charSelect';
        gameState._charIndex = gameState.selectedCharacter;
        charCarousel.offset = (gameState._charIndex || 0) * getCharCardSpacing();
        charCarousel.velocity = 0;
        charCarousel.settled = true;
    }
}

function updateTitleMenu(dt) {
    if (gameState._menuIndex === undefined) gameState._menuIndex = 0;

    // 2x2 grid navigation: up/down moves between rows, left/right between columns
    const idx = gameState._menuIndex;
    const col = idx % 2;
    const row = Math.floor(idx / 2);

    if (inputActions.up && row > 0) {
        gameState._menuIndex = (row - 1) * 2 + col;
    }
    if (inputActions.down && row < 1) {
        gameState._menuIndex = (row + 1) * 2 + col;
    }
    if (inputActions.left && col > 0) {
        gameState._menuIndex = row * 2 + (col - 1);
    }
    if (inputActions.right && col < 1) {
        gameState._menuIndex = row * 2 + (col + 1);
    }

    if (inputActions.confirm) {
        titleMenuSelect(gameState._menuIndex);
    }
}

function charSelectConfirm() {
    gameState.selectedCharacter = gameState._charIndex;
    saveProgress();
    const mode = gameState._pendingMode || 'start';
    if (mode === 'start') {
        startDistrict(0);
    } else if (mode === 'quick') {
        const idx = Math.floor(Math.random() * DISTRICTS.length);
        startDistrict(idx);
    } else if (mode === 'daily') {
        gameState.gameMode = 'daily';
        gameState.dailyPlayed = true;
        gameState.dailySeed = getDailySeed();
        saveProgress();
        startDistrict(gameState._pendingDistrict || 0);
    } else if (mode === 'select') {
        startDistrict(gameState._pendingDistrict || 0);
    }
}

function updateCharSelect(dt) {
    if (gameState._charIndex === undefined) gameState._charIndex = 0;

    const cardSpacing = getCharCardSpacing();
    const numChars = CHARACTERS.length;

    // Keyboard left/right: snap to prev/next
    if (inputActions.left && !charCarousel.dragging) {
        const newIdx = Math.max(0, (gameState._charIndex || 0) - 1);
        gameState._charIndex = newIdx;
        charCarousel.velocity = 0;
        charCarousel.settled = false;
    }
    if (inputActions.right && !charCarousel.dragging) {
        const newIdx = Math.min(numChars - 1, (gameState._charIndex || 0) + 1);
        gameState._charIndex = newIdx;
        charCarousel.velocity = 0;
        charCarousel.settled = false;
    }

    // Smooth snap animation: exponential ease toward target
    if (!charCarousel.dragging) {
        const targetOffset = (gameState._charIndex || 0) * cardSpacing;
        const diff = targetOffset - charCarousel.offset;

        // After a fling, use velocity to coast then decelerate
        if (Math.abs(charCarousel.velocity) > 10) {
            charCarousel.offset += charCarousel.velocity * dt;
            charCarousel.velocity *= Math.pow(0.02, dt); // rapid deceleration
        }

        // Exponential lerp: closes 95% of gap in ~0.12s (very snappy)
        const lerpSpeed = 25; // higher = snappier
        const t = 1 - Math.exp(-lerpSpeed * dt);
        charCarousel.offset += diff * t;
        charCarousel.velocity *= 0.9; // bleed off residual velocity

        // Snap when close enough
        if (Math.abs(diff) < 0.5) {
            charCarousel.offset = targetOffset;
            charCarousel.velocity = 0;
            charCarousel.settled = true;
        } else {
            charCarousel.settled = false;
        }
    }

    // Confirm selection
    if (inputActions.confirm) {
        charSelectConfirm();
    }

    // Back to title
    if (inputActions.pause) {
        gameState.screen = 'title';
    }
}

function updateDistrictSelect(dt) {
    if (gameState._distSelectIndex === undefined) gameState._distSelectIndex = 0;

    if (inputActions.up) {
        gameState._distSelectIndex = Math.max(0, gameState._distSelectIndex - 1);
    }
    if (inputActions.down) {
        gameState._distSelectIndex = Math.min(DISTRICTS.length - 1, gameState._distSelectIndex + 1);
    }
    if (inputActions.left) {
        gameState._distSelectIndex = Math.max(0, gameState._distSelectIndex - 1);
    }
    if (inputActions.right) {
        gameState._distSelectIndex = Math.min(DISTRICTS.length - 1, gameState._distSelectIndex + 1);
    }
    if (inputActions.confirm) {
        if (gameState._distSelectIndex < gameState.districtsUnlocked) {
            gameState._pendingMode = 'select';
            gameState._pendingDistrict = gameState._distSelectIndex;
            gameState.screen = 'charSelect';
            gameState._charIndex = gameState.selectedCharacter;
        }
    }
    // Back to title
    if (inputActions.pause) {
        gameState.screen = 'title';
    }
}

// ============================================
// MAIN DRAW
// ============================================
function draw() {
    // Clear UI hit rects (will be set by draw functions if visible)
    shareCardRect = null;
    mobileBackBtnRect = null;
    mobileFinishBtnRect = null;
    mobilePauseBtnRect = null;
    charConfirmBtnRect = null;
    titleCardRects = [];
    pauseMenuRects = [];
    endScreenCardRects = [];

    // Clear
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState.screen === 'title') {
        drawTitleScreen();
        return;
    }

    if (gameState.screen === 'charSelect') {
        drawCharSelectScreen();
        return;
    }

    if (gameState.screen === 'districtSelect') {
        drawDistrictSelectScreen();
        return;
    }

    if (gameState.screen === 'dailyResult') {
        drawDailyResultScreen();
        return;
    }

    if (gameState.screen === 'gameOver') {
        drawGameWorld();
        drawGameOverScreen();
        return;
    }

    if (gameState.screen === 'districtComplete') {
        drawGameWorld();
        drawDistrictCompleteScreen();
        return;
    }

    if (gameState.screen === 'playing') {
        drawGameWorld();
        drawHUD();
    }

    if (gameState.screen === 'paused') {
        drawGameWorld();
        drawHUD();
        drawPauseMenu();
    }
}

function drawSunriseBackground() {
    const cw = canvas.width;
    const ch = canvas.height;
    const dist = DISTRICTS[gameState.district];
    const skyTop = dist ? dist.palette.sky : '#202030';
    const skyBot = dist && dist.palette.skyHorizon ? dist.palette.skyHorizon : '#c06040';

    // Vertical gradient: dark pre-dawn sky at top → warm sunrise at bottom
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0.0, skyTop);
    grad.addColorStop(0.5, skyTop);
    grad.addColorStop(0.85, skyBot);
    grad.addColorStop(1.0, skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    // Subtle sun glow at bottom center
    const glowGrad = ctx.createRadialGradient(cw * 0.5, ch, 0, cw * 0.5, ch, cw * 0.6);
    glowGrad.addColorStop(0.0, 'rgba(255,180,80,0.18)');
    glowGrad.addColorStop(0.4, 'rgba(255,120,50,0.08)');
    glowGrad.addColorStop(1.0, 'rgba(255,80,30,0.0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, cw, ch);
}

function drawGameWorld() {
    if (!gameState.tiles || gameState.tiles.length === 0) return;

    // Sunrise sky background (visible where tiles don't cover)
    drawSunriseBackground();

    // Screen shake
    ctx.save();
    ctx.translate(gameState.shake.x, gameState.shake.y);

    // Camera transform
    ctx.save();
    const camOffsetX = -gameState.camera.x * TILE_SIZE;
    const camOffsetY = -gameState.camera.y * TILE_SIZE;
    ctx.translate(camOffsetX, camOffsetY);

    // Visible tile range
    const vpW = getViewportWidth();
    const camX = Math.floor(gameState.camera.x);
    const camY = Math.floor(gameState.camera.y);
    const startX = Math.max(0, camX - 1);
    const startY = Math.max(0, camY - 1);
    const endX = Math.min(MAP_WIDTH, camX + vpW + 2);
    const endY = Math.min(MAP_HEIGHT, camY + VIEWPORT_HEIGHT + 2);

    // Draw tiles
    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            drawTile(x, y);
        }
    }

    // Draw pigeons
    for (const pig of gameState.pigeons) {
        drawPigeon(pig);
    }

    // Draw hobos
    for (const hobo of gameState.hobos) {
        drawHobo(hobo);
    }

    // Draw particles (in world space)
    drawParticles();

    // Draw player on top
    drawPlayer();

    // Draw celebrations (in world space)
    drawCelebrations();

    // Restore camera
    ctx.restore();
    // Restore shake
    ctx.restore();

    // === Early morning warm light overlay ===
    // Subtle golden tint from the rising sun, stronger toward bottom of screen
    const warmGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    warmGrad.addColorStop(0.0, 'rgba(255,180,100,0.0)');
    warmGrad.addColorStop(0.6, 'rgba(255,160,80,0.04)');
    warmGrad.addColorStop(1.0, 'rgba(255,140,60,0.10)');
    ctx.fillStyle = warmGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ============================================
// GAME LOOP
// ============================================
let lastTime = 0;

function gameLoop(timestamp) {
    let dt = (timestamp - lastTime) / 1000;
    if (lastTime === 0 || dt > 0.1) dt = 0.016;
    lastTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}

// ============================================
// INITIALIZATION
// ============================================
function initGame() {
    // Set resolution
    const res = RESOLUTIONS[displaySettings.currentResolution];
    canvas.width = res.width;
    canvas.height = res.height;
    TILE_SIZE = getTileSize();

    // Keyboard listeners
    document.addEventListener('keydown', (e) => {
        if (!e.repeat) {
            keys[e.code] = true;
            keyBuffer[e.code] = true;  // Buffer so fast taps survive to next frame
            keyPressTime[e.code] = Date.now();
            keyMoved[e.code] = false;
        }
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) {
            e.preventDefault();
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.code] = false;
        keyPressTime[e.code] = 0;
        keyMoved[e.code] = false;
    });

    // ================================================================
    // TOUCH / SWIPE CONTROLS FOR MOBILE
    // ================================================================
    // Architecture:
    //   - During GAMEPLAY: sets persistent `touchDir` for smooth continuous movement.
    //     Player movement reads touchDir directly, bypassing keyboard shouldMove gates.
    //   - During MENUS: fires one-shot key events for instant response.
    //   - Taps are context-aware: left/right zones on char select, district rows, etc.
    // ================================================================
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchActive = false;
    let touchSwiped = false;          // True if any swipe occurred during this touch
    const SWIPE_THRESHOLD = 12;       // min pixels for initial swipe detection
    const DRAG_THRESHOLD = 10;        // pixels to re-detect direction while dragging
    const TAP_THRESHOLD = 14;         // max movement for a touch to count as a tap

    // Convert client coords to canvas coords
    function clientToCanvas(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    // Fire a virtual key press (one-shot, for menus)
    function fireKey(code) {
        keyBuffer[code] = true;
        keys[code] = true;
        keyPressTime[code] = Date.now();
        keyMoved[code] = false;
        setTimeout(() => { keys[code] = false; }, 60);
    }

    // Determine the cardinal direction from dx/dy
    function getSwipeDir(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) {
            return dx > 0 ? 'right' : 'left';
        }
        return dy > 0 ? 'down' : 'up';
    }

    // ── Handle swipe on MENU screens (one-shot actions) ──
    // NOTE: charSelect uses direct drag handling, not one-shot swipes
    function handleMenuSwipe(dir) {
        const screen = gameState.screen;

        if (screen === 'districtSelect') {
            if (dir === 'up')    { fireKey('ArrowUp');    return true; }
            if (dir === 'down')  { fireKey('ArrowDown');  return true; }
            if (dir === 'left')  { fireKey('Escape');     return true; }
            return false;
        }

        // Title: no swipe navigation needed (cards are tappable)
        return false;
    }

    // ── Handle tap on MENU screens (context-aware) ──
    function handleMenuTap(canvasX, canvasY) {
        const screen = gameState.screen;
        const cw = canvas.width;
        const ch = canvas.height;

        // Check back button on any screen
        if (mobileBackBtnRect &&
            canvasX >= mobileBackBtnRect.x && canvasX <= mobileBackBtnRect.x + mobileBackBtnRect.w &&
            canvasY >= mobileBackBtnRect.y && canvasY <= mobileBackBtnRect.y + mobileBackBtnRect.h) {
            fireKey('Escape');
            return true;
        }

        // Title: hit test against card rects
        if (screen === 'title') {
            for (const card of titleCardRects) {
                if (canvasX >= card.x && canvasX <= card.x + card.w &&
                    canvasY >= card.y && canvasY <= card.y + card.h) {
                    gameState._menuIndex = card.idx;
                    titleMenuSelect(card.idx);
                    return true;
                }
            }
            return false;
        }

        // Character Select: tap confirm button, or tap card to confirm
        if (screen === 'charSelect') {
            if (charConfirmBtnRect &&
                canvasX >= charConfirmBtnRect.x && canvasX <= charConfirmBtnRect.x + charConfirmBtnRect.w &&
                canvasY >= charConfirmBtnRect.y && canvasY <= charConfirmBtnRect.y + charConfirmBtnRect.h) {
                charSelectConfirm();
                return true;
            }
            return false;
        }

        // District Select: tap a row to select, tap selected row to confirm
        if (screen === 'districtSelect') {
            const listY = 75;
            const itemH = 52;
            const idx = gameState._distSelectIndex || 0;
            const scrollOffset = Math.max(0, idx - 4) * itemH;

            const relY = canvasY - listY + scrollOffset;
            if (canvasY >= listY && canvasY < ch - 40 && relY >= 0) {
                const tappedIdx = Math.floor(relY / itemH);
                if (tappedIdx >= 0 && tappedIdx < DISTRICTS.length) {
                    if (tappedIdx === gameState._distSelectIndex) {
                        fireKey('Space');
                    } else {
                        gameState._distSelectIndex = tappedIdx;
                    }
                    return true;
                }
            }
            return false;
        }

        // Daily Result: share card tap, or tap anywhere else to go back
        if (screen === 'dailyResult') {
            if (shareCardRect &&
                canvasX >= shareCardRect.x && canvasX <= shareCardRect.x + shareCardRect.w &&
                canvasY >= shareCardRect.y && canvasY <= shareCardRect.y + shareCardRect.h) {
                shareScore();
                return true;
            }
            gameState.screen = 'title';
            return true;
        }

        // Game Over / District Complete: card buttons or share card
        if (screen === 'gameOver' || screen === 'districtComplete') {
            // Check card buttons first
            for (const rect of endScreenCardRects) {
                if (canvasX >= rect.x && canvasX <= rect.x + rect.w &&
                    canvasY >= rect.y && canvasY <= rect.y + rect.h) {
                    gameState._endMenuIndex = rect.idx;
                    executeEndScreenAction(rect.action);
                    return true;
                }
            }
            // Share card tap
            if (shareCardRect &&
                canvasX >= shareCardRect.x && canvasX <= shareCardRect.x + shareCardRect.w &&
                canvasY >= shareCardRect.y && canvasY <= shareCardRect.y + shareCardRect.h) {
                shareScore();
                return true;
            }
            return false;
        }

        return false;
    }

    // ── Handle tap during GAMEPLAY ──
    function handlePlayTap(canvasX, canvasY) {
        // Pause button
        if (mobilePauseBtnRect &&
            canvasX >= mobilePauseBtnRect.x && canvasX <= mobilePauseBtnRect.x + mobilePauseBtnRect.w &&
            canvasY >= mobilePauseBtnRect.y && canvasY <= mobilePauseBtnRect.y + mobilePauseBtnRect.h) {
            fireKey('Escape');
            return true;
        }
        // Finish shift button
        if (mobileFinishBtnRect &&
            canvasX >= mobileFinishBtnRect.x && canvasX <= mobileFinishBtnRect.x + mobileFinishBtnRect.w &&
            canvasY >= mobileFinishBtnRect.y && canvasY <= mobileFinishBtnRect.y + mobileFinishBtnRect.h) {
            completeDistrict();
            return true;
        }
        fireKey('Space');
        return true;
    }

    // ── Handle tap during PAUSED ──
    function handlePauseTap(canvasX, canvasY) {
        for (const rect of pauseMenuRects) {
            if (canvasX >= rect.x && canvasX <= rect.x + rect.w &&
                canvasY >= rect.y && canvasY <= rect.y + rect.h) {
                gameState.pauseMenuIndex = rect.idx;
                // Execute the selection
                if (rect.idx === 0) {
                    gameState.screen = 'playing';
                } else if (rect.idx === 1) {
                    startDistrict(gameState.district);
                } else if (rect.idx === 2) {
                    gameState.screen = 'title';
                }
                return true;
            }
        }
        return false;
    }

    // ── Track the initial touch position for carousel drag detection ──
    let touchOriginX = 0;
    let touchOriginY = 0;

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchOriginX = touch.clientX;
        touchOriginY = touch.clientY;
        touchStartTime = Date.now();
        touchActive = true;
        touchSwiped = false;

        // Begin carousel drag on charSelect
        if (gameState.screen === 'charSelect') {
            charCarousel.dragging = true;
            charCarousel.dragStartX = touch.clientX;
            charCarousel.dragStartOffset = charCarousel.offset;
            charCarousel.lastDragX = touch.clientX;
            charCarousel.lastDragTime = Date.now();
            charCarousel.velocity = 0;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!touchActive) return;
        const touch = e.touches[0];

        // Character Select: direct carousel drag (horizontal)
        if (gameState.screen === 'charSelect' && charCarousel.dragging) {
            const rect = canvas.getBoundingClientRect();
            const scale = canvas.width / rect.width;
            const clientDx = touch.clientX - charCarousel.dragStartX;
            const canvasDx = clientDx * scale;

            charCarousel.offset = charCarousel.dragStartOffset - canvasDx;

            // Clamp with rubber-band at edges
            const maxOffset = (CHARACTERS.length - 1) * getCharCardSpacing();
            if (charCarousel.offset < 0) {
                charCarousel.offset *= 0.3; // rubber-band
            } else if (charCarousel.offset > maxOffset) {
                charCarousel.offset = maxOffset + (charCarousel.offset - maxOffset) * 0.3;
            }

            // Track velocity
            const now = Date.now();
            const timeDelta = now - charCarousel.lastDragTime;
            if (timeDelta > 0) {
                const velDx = (touch.clientX - charCarousel.lastDragX) * scale;
                charCarousel.velocity = -velDx / (timeDelta / 1000);
            }
            charCarousel.lastDragX = touch.clientX;
            charCarousel.lastDragTime = now;

            // Track total movement for tap detection
            const totalDx = touch.clientX - touchOriginX;
            const totalDy = touch.clientY - touchOriginY;
            if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > TAP_THRESHOLD) {
                touchSwiped = true;
            }
            return;
        }

        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const threshold = touchSwiped ? DRAG_THRESHOLD : SWIPE_THRESHOLD;

        if (dist >= threshold) {
            const dir = getSwipeDir(dx, dy);
            touchSwiped = true;

            if (gameState.screen === 'playing') {
                touchDir.x = (dir === 'left') ? -1 : (dir === 'right') ? 1 : 0;
                touchDir.y = (dir === 'up')   ? -1 : (dir === 'down')  ? 1 : 0;
            } else {
                handleMenuSwipe(dir);
            }

            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (!touchActive) return;
        touchActive = false;

        touchDir.x = 0;
        touchDir.y = 0;

        // Finalize carousel drag
        if (gameState.screen === 'charSelect' && charCarousel.dragging) {
            charCarousel.dragging = false;
            const cardSpacing = getCharCardSpacing();

            // Determine snap target based on position + velocity
            const velocityBoost = charCarousel.velocity * 0.15;
            const projectedOffset = charCarousel.offset + velocityBoost;
            let snapIdx = Math.round(projectedOffset / cardSpacing);
            snapIdx = Math.max(0, Math.min(CHARACTERS.length - 1, snapIdx));

            gameState._charIndex = snapIdx;
            charCarousel.settled = false;
            // velocity will be applied by spring physics in updateCharSelect
        }

        const elapsed = Date.now() - touchStartTime;
        const touch = e.changedTouches[0];
        const tdx = touch.clientX - touchOriginX;
        const tdy = touch.clientY - touchOriginY;
        const dist = Math.sqrt(tdx * tdx + tdy * tdy);

        if (dist < TAP_THRESHOLD && elapsed < 300 && !touchSwiped) {
            const c = clientToCanvas(touch.clientX, touch.clientY);

            if (gameState.screen === 'playing') {
                handlePlayTap(c.x, c.y);
            } else if (gameState.screen === 'paused') {
                handlePauseTap(c.x, c.y);
            } else {
                handleMenuTap(c.x, c.y);
            }
        }
    }, { passive: false });

    // ================================================================
    // MOUSE CLICK HANDLING (for desktop pause button / pause menu)
    // ================================================================
    canvas.addEventListener('click', (e) => {
        const c = clientToCanvas(e.clientX, e.clientY);

        // Back button (works on any screen that draws it)
        if (mobileBackBtnRect &&
            c.x >= mobileBackBtnRect.x && c.x <= mobileBackBtnRect.x + mobileBackBtnRect.w &&
            c.y >= mobileBackBtnRect.y && c.y <= mobileBackBtnRect.y + mobileBackBtnRect.h) {
            gameState.screen = 'title';
            return;
        }

        if (gameState.screen === 'playing') {
            // Pause button
            if (mobilePauseBtnRect &&
                c.x >= mobilePauseBtnRect.x && c.x <= mobilePauseBtnRect.x + mobilePauseBtnRect.w &&
                c.y >= mobilePauseBtnRect.y && c.y <= mobilePauseBtnRect.y + mobilePauseBtnRect.h) {
                gameState.pauseMenuIndex = 0;
                gameState.screen = 'paused';
                return;
            }
            // Finish shift button
            if (mobileFinishBtnRect &&
                c.x >= mobileFinishBtnRect.x && c.x <= mobileFinishBtnRect.x + mobileFinishBtnRect.w &&
                c.y >= mobileFinishBtnRect.y && c.y <= mobileFinishBtnRect.y + mobileFinishBtnRect.h) {
                completeDistrict();
                return;
            }
        } else if (gameState.screen === 'paused') {
            handlePauseTap(c.x, c.y);
        } else if (gameState.screen === 'dailyResult') {
            // Share card click
            if (shareCardRect &&
                c.x >= shareCardRect.x && c.x <= shareCardRect.x + shareCardRect.w &&
                c.y >= shareCardRect.y && c.y <= shareCardRect.y + shareCardRect.h) {
                shareScore();
                return;
            }
            gameState.screen = 'title';
            return;
        } else if (gameState.screen === 'gameOver' || gameState.screen === 'districtComplete') {
            // End screen card buttons
            for (const rect of endScreenCardRects) {
                if (c.x >= rect.x && c.x <= rect.x + rect.w &&
                    c.y >= rect.y && c.y <= rect.y + rect.h) {
                    gameState._endMenuIndex = rect.idx;
                    executeEndScreenAction(rect.action);
                    return;
                }
            }
            // Share card click on end screens
            if (shareCardRect &&
                c.x >= shareCardRect.x && c.x <= shareCardRect.x + shareCardRect.w &&
                c.y >= shareCardRect.y && c.y <= shareCardRect.y + shareCardRect.h) {
                shareScore();
            }
        } else if (gameState.screen === 'charSelect') {
            // Confirm button click
            if (charConfirmBtnRect &&
                c.x >= charConfirmBtnRect.x && c.x <= charConfirmBtnRect.x + charConfirmBtnRect.w &&
                c.y >= charConfirmBtnRect.y && c.y <= charConfirmBtnRect.y + charConfirmBtnRect.h) {
                charSelectConfirm();
            }
        }
    });

    // Load saved progress
    loadProgress();

    // Start game loop
    gameState.screen = 'title';
    gameState._menuIndex = 0;
    requestAnimationFrame(gameLoop);
}

function loadProgress() {
    try {
        const saved = localStorage.getItem('doodyCalls_progress');
        if (saved) {
            const data = JSON.parse(saved);
            gameState.districtStars = data.districtStars || {};
            gameState.districtBests = data.districtBests || {};
            gameState.totalStars = data.totalStars || 0;
            gameState.districtsUnlocked = 10;
            gameState.headlinesSeen = data.headlinesSeen || [];
            gameState.selectedCharacter = data.selectedCharacter || 0;
            gameState.cityGrade = calculateGrade(gameState.totalStars);

            // Daily district: reset if it's a new day
            const todaySeed = getDailySeed();
            if (data.dailySeed === todaySeed) {
                gameState.dailyPlayed = data.dailyPlayed || false;
                gameState.dailySeed = todaySeed;
                gameState.dailyResult = data.dailyResult || null;
            } else {
                gameState.dailyPlayed = false;
                gameState.dailySeed = todaySeed;
                gameState.dailyResult = null;
            }
        }
    } catch (e) {
        debugLog('Failed to load progress:', e);
    }
}

function saveProgress() {
    try {
        localStorage.setItem('doodyCalls_progress', JSON.stringify({
            districtStars: gameState.districtStars,
            districtBests: gameState.districtBests,
            totalStars: gameState.totalStars,
            districtsUnlocked: gameState.districtsUnlocked,
            headlinesSeen: gameState.headlinesSeen,
            selectedCharacter: gameState.selectedCharacter,
            dailyPlayed: gameState.dailyPlayed,
            dailySeed: gameState.dailySeed,
            dailyResult: gameState.dailyResult,
        }));
    } catch (e) {
        debugLog('Failed to save progress:', e);
    }
}

// Start the game
initGame();
