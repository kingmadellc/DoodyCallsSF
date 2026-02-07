const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ============================================
// DEBUG MODE
// ============================================
const DEBUG_MODE = false;
function debugLog(...args) { if (DEBUG_MODE) console.log(...args); }

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
};

// Mess types overlaid on tiles
const MESS = {
    NONE: 0,
    LITTER: 1,
    PUDDLE: 2,
    GRAFFITI: 3,
    FOOD_WASTE: 4,
    MYSTERY: 5,       // "mystery puddle" (Marty's story)
};

// Cleanliness state per tile
const CLEAN_STATE = {
    FILTHY: 0,
    DIRTY: 1,
    CLEAN: 2,
    SPARKLING: 3,
};

function isBlockingTile(tile) {
    return tile === TILE.BUILDING || tile === TILE.HOTEL || tile === TILE.OFFICE;
}

function isCleanableTile(tile) {
    return tile === TILE.SIDEWALK || tile === TILE.ALLEY || tile === TILE.CROSSWALK ||
           tile === TILE.CURB || tile === TILE.PARK_GRASS;
}

// ============================================
// COLORS
// ============================================
const COLORS = {
    // Sidewalk
    sidewalkLight: '#b8b0a0',
    sidewalkDark: '#a8a090',
    sidewalkLine: '#c8c0b0',

    // Road
    roadDark: '#3a3a3e',
    roadLight: '#444448',
    roadLine: '#e8d44d',
    crosswalk: '#e8e0d0',

    // Building
    buildingWall: '#6b5b73',
    buildingWallAlt: '#5b4b63',
    buildingWindow: '#2a3a5a',
    buildingWindowLit: '#f0d060',
    buildingDoor: '#8b6b4b',

    // Hotel (The W)
    hotelWall: '#4a3a5a',
    hotelAccent: '#c0a0d0',
    hotelSign: '#e0d0f0',

    // Office (Amplitude)
    officeWall: '#3a4a5a',
    officeAccent: '#60a0c0',

    // Coffee shop
    coffeeWall: '#6b4a2a',
    coffeeAwning: '#d4a050',

    // Alley
    alleyDark: '#4a4440',
    alleyLight: '#5a5450',

    // Park
    grassLight: '#5a8a3a',
    grassDark: '#4a7a2a',
    treeTrunk: '#6b4a2a',
    treeLeaf: '#3a7a2a',

    // Curb
    curbColor: '#9a9080',

    // Mess colors
    litterColor: '#d0c0a0',
    puddleColor: '#7a6a4a',
    graffitiColors: ['#e04040', '#40a0e0', '#e0e040', '#a040e0'],
    foodColor: '#c08040',
    mysteryColor: '#6a5a2a',

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
        timer: 120, messCount: 20, pigeonCount: 2, hoboCount: 0,
        palette: { accent: '#4090c0', sky: '#2a4a6a' }
    },
    {
        id: 2, name: "Union Square", subtitle: "Luxury Litter",
        timer: 120, messCount: 25, pigeonCount: 2, hoboCount: 1,
        palette: { accent: '#c0a040', sky: '#3a2a4a' }
    },
    {
        id: 3, name: "The W Hotel / SoMa", subtitle: "Marty's Morning Walk",
        timer: 120, messCount: 30, pigeonCount: 3, hoboCount: 2,
        palette: { accent: '#a060c0', sky: '#2a1a3e' }
    },
    {
        id: 4, name: "Russian Hill", subtitle: "The Scenic Route",
        timer: 90, messCount: 30, pigeonCount: 3, hoboCount: 1,
        palette: { accent: '#40a060', sky: '#2a3a2a' }
    },
    {
        id: 5, name: "Haight-Ashbury", subtitle: "Vintage Refuse",
        timer: 90, messCount: 35, pigeonCount: 3, hoboCount: 2,
        palette: { accent: '#e04080', sky: '#3a2a3a' }
    },
    {
        id: 6, name: "Mission District", subtitle: "Burrito Boulevard",
        timer: 90, messCount: 35, pigeonCount: 4, hoboCount: 2,
        palette: { accent: '#e08040', sky: '#3a2a1a' }
    },
    {
        id: 7, name: "The Tenderloin", subtitle: "Danger Zone",
        timer: 60, messCount: 45, pigeonCount: 5, hoboCount: 4,
        palette: { accent: '#c04040', sky: '#1a1a1a' }
    },
    {
        id: 8, name: "Golden Gate Park", subtitle: "Nature Fights Back",
        timer: 60, messCount: 40, pigeonCount: 5, hoboCount: 3,
        palette: { accent: '#40c060', sky: '#1a2a1a' }
    },
    {
        id: 9, name: "Chinatown", subtitle: "Celebration Chaos",
        timer: 60, messCount: 40, pigeonCount: 4, hoboCount: 2,
        palette: { accent: '#e04040', sky: '#2a1a1a' }
    },
    {
        id: 10, name: "City Hall", subtitle: "The Final Shift",
        timer: 45, messCount: 50, pigeonCount: 6, hoboCount: 5,
        palette: { accent: '#c0c0d0', sky: '#1a1a2a' }
    },
];

// ============================================
// NEWS TICKER HEADLINES
// ============================================
const NEWS_HEADLINES = [
    "BREAKING: Local sanitation worker seen spraying pigeons with power washer",
    "Pleasanton resident describes SF commute as 'an adventure game'",
    "AI startup claims it can clean streets; demo crashes immediately",
    "Belgian development team announces city cleanup simulator",
    "AI sweat shop produces game overnight, union files complaint",
    "Tech bro on electric scooter leaves trail of destruction, claims 'disrupting sanitation'",
    "Man counts 2 human situations on short walk to coffee shop",
    "Tourists report 'slightly less horrified' after visit to cleaned district",
    "Local man claims he 'used to walk here before it was dirty'",
    "Real estate prices somehow increase further despite everything",
    "City deploys experimental zamboni on Tenderloin sidewalks",
    "Pigeon flock organized, demands union representation",
    "Mime trapped behind invisible wall, sanitation worker walks around",
    "W Hotel guest shocked by alley conditions at 7AM coffee run",
    "Amplitude employee spotted walking to office without hazmat suit",
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
// GAME STATE
// ============================================
let gameState = {
    // Core
    screen: 'title',  // title, playing, paused, gameOver, districtComplete, allComplete
    district: 0,       // Index into DISTRICTS array
    timer: 120,
    started: false,
    animationTime: 0,

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

    // Particles & celebrations
    particles: [],
    celebrations: [],

    // Progression
    districtStars: {},     // { districtId: stars }
    cityGrade: 'F',
    totalStars: 0,

    // News ticker
    tickerOffset: 0,
    tickerIndex: 0,

    // Screen shake
    shake: { x: 0, y: 0, intensity: 0, timer: 0 },
};

// ============================================
// INPUT SYSTEM
// ============================================
let keys = {};
let keyPressTime = {};
let keyMoved = {};
let keyBuffer = {};  // Buffer for one-shot keys (survives until consumed by a frame)
const MOVE_DELAY = 100;
const HOLD_THRESHOLD = 150;

const inputActions = {
    up: false, down: false, left: false, right: false,
    action: false, pause: false, confirm: false,
    _lastAction: false, _lastPause: false, _lastConfirm: false,
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

    inputActions.up = shouldMove(['ArrowUp', 'KeyW']);
    inputActions.down = shouldMove(['ArrowDown', 'KeyS']);
    inputActions.left = shouldMove(['ArrowLeft', 'KeyA']);
    inputActions.right = shouldMove(['ArrowRight', 'KeyD']);

    // One-shot actions use buffered keys (survive fast tap/release)
    const actionPressed = keys['Space'] || keys['KeyZ'] || keys['Enter'] ||
                          keyBuffer['Space'] || keyBuffer['KeyZ'] || keyBuffer['Enter'];
    inputActions.action = actionPressed && !inputActions._lastAction;
    inputActions._lastAction = !!actionPressed;

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
    if (districtIndex === 2) {
        // District 3: The W Hotel / SoMa
        // The W Hotel - top right
        for (let y = 0; y < 4; y++) {
            for (let x = 15; x < 19; x++) {
                tiles[y][x] = TILE.HOTEL;
            }
        }
        // Amplitude Office - across the street
        for (let y = 0; y < 4; y++) {
            for (let x = 20; x < 24; x++) {
                tiles[y][x] = TILE.OFFICE;
            }
        }
        // Coffee shop next to hotel
        tiles[5][15] = TILE.COFFEE_SHOP;
        tiles[5][16] = TILE.COFFEE_SHOP;
        tiles[6][15] = TILE.COFFEE_SHOP;
        tiles[6][16] = TILE.COFFEE_SHOP;

        // Alley across from coffee shop (THE easter egg alley)
        for (let y = 5; y < 9; y++) {
            tiles[y][17] = TILE.ALLEY;
            tiles[y][18] = TILE.ALLEY;
        }

        // Place "mystery puddle" in the alley
        messes[6][17] = MESS.MYSTERY;
        cleanState[6][17] = CLEAN_STATE.FILTHY;
        messes[7][17] = MESS.MYSTERY;
        cleanState[7][17] = CLEAN_STATE.FILTHY;
    }

    // === PARK AREAS (small green patches) ===
    if (districtIndex >= 3) {
        // Add some park grass in bottom-left
        for (let y = 15; y < 18; y++) {
            for (let x = 6; x < 9; x++) {
                if (tiles[y][x] === TILE.SIDEWALK) {
                    tiles[y][x] = TILE.PARK_GRASS;
                }
            }
        }
    }

    // === ALLEYS between buildings ===
    // Vertical alleys
    for (let y = 0; y < 9; y++) {
        if (tiles[y][4] === TILE.SIDEWALK) tiles[y][4] = TILE.ALLEY;
        if (tiles[y][19] === TILE.SIDEWALK) tiles[y][19] = TILE.ALLEY;
    }
    for (let y = 15; y < MAP_HEIGHT; y++) {
        if (tiles[y][4] === TILE.SIDEWALK) tiles[y][4] = TILE.ALLEY;
        if (tiles[y][19] === TILE.SIDEWALK) tiles[y][19] = TILE.ALLEY;
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
            // Pick mess type based on tile
            if (tiles[y][x] === TILE.ALLEY) {
                messes[y][x] = Math.random() < 0.4 ? MESS.MYSTERY : MESS.PUDDLE;
            } else if (tiles[y][x] === TILE.PARK_GRASS) {
                messes[y][x] = MESS.LITTER;
            } else {
                const roll = Math.random();
                if (roll < 0.35) messes[y][x] = MESS.LITTER;
                else if (roll < 0.6) messes[y][x] = MESS.PUDDLE;
                else if (roll < 0.8) messes[y][x] = MESS.FOOD_WASTE;
                else messes[y][x] = MESS.GRAFFITI;
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

    // Movement
    let dx = 0, dy = 0;
    if (inputActions.up) { dy = -1; p.direction = 2; }
    else if (inputActions.down) { dy = 1; p.direction = 0; }
    else if (inputActions.left) { dx = -1; p.direction = 1; }
    else if (inputActions.right) { dx = 1; p.direction = 3; }

    if ((dx !== 0 || dy !== 0) && p.moveTimer <= 0) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx >= 0 && nx < MAP_WIDTH && ny >= 0 && ny < MAP_HEIGHT &&
            !isBlockingTile(gameState.tiles[ny][nx])) {
            p.x = nx;
            p.y = ny;
            p.moveTimer = MOVE_DELAY / 1000;

            // Auto-clean when walking over messy tiles
            tryCleanTile(nx, ny);
        }
    }

    // Smooth visual interpolation
    const lerpSpeed = 12 * dt;
    p.visualX += (p.x - p.visualX) * Math.min(1, lerpSpeed);
    p.visualY += (p.y - p.visualY) * Math.min(1, lerpSpeed);

    // Cleaning with action button (clean adjacent tile in facing direction)
    if (inputActions.action) {
        const dirs = [{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:0}];
        const d = dirs[p.direction];
        const cx = p.x + d.x;
        const cy = p.y + d.y;
        if (cx >= 0 && cx < MAP_WIDTH && cy >= 0 && cy < MAP_HEIGHT) {
            tryCleanTile(cx, cy);
        }
        // Also clean current tile
        tryCleanTile(p.x, p.y);
    }
}

function tryCleanTile(x, y) {
    if (gameState.messes[y][x] !== MESS.NONE &&
        gameState.cleanState[y][x] !== CLEAN_STATE.CLEAN &&
        gameState.cleanState[y][x] !== CLEAN_STATE.SPARKLING) {

        const prevState = gameState.cleanState[y][x];

        if (prevState === CLEAN_STATE.FILTHY) {
            gameState.cleanState[y][x] = CLEAN_STATE.DIRTY;
            spawnCleanParticles(x, y, '#aaa');
        } else if (prevState === CLEAN_STATE.DIRTY) {
            gameState.cleanState[y][x] = CLEAN_STATE.CLEAN;
            gameState.messesClean++;
            spawnCleanParticles(x, y, COLORS.uiClean);

            // Sparkle bonus if you action-clean (not just walk over)
            if (inputActions.action) {
                gameState.cleanState[y][x] = CLEAN_STATE.SPARKLING;
                spawnSparkleParticles(x, y);
                addCelebration('+25', x, y, COLORS.uiGold);
            } else {
                addCelebration('+10', x, y, COLORS.uiClean);
            }

            // Check milestone
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
                    gameState.messes[y][x] = MESS.PUDDLE;
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
            gameState.messes[cy][cx] = MESS.MYSTERY;
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
        triggerShake(0.5, 12);
    }
}

function startDistrict(districtIndex) {
    gameState.district = districtIndex;
    const dist = DISTRICTS[districtIndex];
    gameState.timer = dist.timer;
    gameState.screen = 'playing';
    gameState.started = true;

    // Reset player position
    gameState.player.x = 12;
    gameState.player.y = 20;
    gameState.player.visualX = 12;
    gameState.player.visualY = 20;
    gameState.player.moveTimer = 0;

    // Reset stats
    gameState.pigeonsSprayed = 0;
    gameState._milestone50 = false;
    gameState._milestone75 = false;
    gameState._milestone100 = false;

    // Generate level
    generateCityBlock(districtIndex);

    // Center camera
    gameState.camera.x = gameState.player.x - getViewportWidth() / 2;
    gameState.camera.y = gameState.player.y - VIEWPORT_HEIGHT / 2;
}

function completeDistrict() {
    const pct = gameState.totalMesses > 0 ? (gameState.messesClean / gameState.totalMesses) : 0;
    const timeLeft = gameState.timer;

    let stars = 0;
    if (pct >= 0.6) stars = 1;
    if (pct >= 0.8) stars = 2;
    if (pct >= 1.0 && timeLeft > 10) stars = 3;

    const distId = DISTRICTS[gameState.district].id;
    const prevStars = gameState.districtStars[distId] || 0;
    if (stars > prevStars) {
        gameState.districtStars[distId] = stars;
    }

    // Recalculate total stars and grade
    let total = 0;
    for (const key in gameState.districtStars) {
        total += gameState.districtStars[key];
    }
    gameState.totalStars = total;
    gameState.cityGrade = calculateGrade(total);

    gameState.timeBonus = Math.floor(timeLeft);
    gameState.screen = 'districtComplete';
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

function getGradeHeadline(grade) {
    const headlines = {
        'F': 'SF Ranked Dirtiest City in America for 47th Consecutive Year',
        'D': 'City Officials Acknowledge "Slight Odor Improvement"',
        'C': 'Tech Workers Consider Returning to Office One Day Per Week',
        'C+': 'Tourists Report "Slightly Less Horrified" After Visit',
        'B': 'Real Estate Prices Somehow Increase Further',
        'B+': 'Food Truck Owners Report Record Sales on Cleaner Streets',
        'A': 'SF Named "Most Improved" — Residents Suspicious',
        'A+': 'Mike Dean Spotted Walking to Office Without Hazmat Suit',
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
                ctx.strokeStyle = '#9a9080';
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
            const windowLit = ((x * 3 + y * 7) % 5) < 2;
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
            // "A" logo hint on first tile (Amplitude)
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
    }

    // === MESS OVERLAY ===
    if (mess !== MESS.NONE && clean !== CLEAN_STATE.CLEAN && clean !== CLEAN_STATE.SPARKLING) {
        const messAlpha = clean === CLEAN_STATE.FILTHY ? 0.8 : 0.4;
        ctx.globalAlpha = messAlpha;

        switch (mess) {
            case MESS.LITTER:
                // Paper/cups scattered
                ctx.fillStyle = COLORS.litterColor;
                ctx.fillRect(sx + 4, sy + 8, 8, 6);
                ctx.fillRect(sx + 16, sy + 14, 6, 8);
                ctx.fillStyle = '#e0d0b0';
                ctx.fillRect(sx + 10, sy + 18, 10, 4);
                break;

            case MESS.PUDDLE:
                ctx.fillStyle = COLORS.puddleColor;
                ctx.beginPath();
                ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2,
                    TILE_SIZE / 3, TILE_SIZE / 4, 0, 0, Math.PI * 2);
                ctx.fill();
                break;

            case MESS.GRAFFITI:
                const gColor = COLORS.graffitiColors[(x * 3 + y * 7) % COLORS.graffitiColors.length];
                ctx.fillStyle = gColor;
                ctx.fillRect(sx + 2, sy + 6, TILE_SIZE - 4, 3);
                ctx.fillRect(sx + 6, sy + 2, 3, TILE_SIZE - 4);
                ctx.fillRect(sx + 14, sy + 10, 8, 3);
                break;

            case MESS.FOOD_WASTE:
                ctx.fillStyle = COLORS.foodColor;
                ctx.fillRect(sx + 6, sy + 8, 12, 10);
                ctx.fillStyle = '#a06030';
                ctx.fillRect(sx + 14, sy + 6, 8, 6);
                break;

            case MESS.MYSTERY:
                // "Mystery puddle" - extra gross
                ctx.fillStyle = COLORS.mysteryColor;
                ctx.beginPath();
                ctx.ellipse(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2,
                    TILE_SIZE / 2.5, TILE_SIZE / 3, 0, 0, Math.PI * 2);
                ctx.fill();
                // Stink lines
                ctx.strokeStyle = '#8a7a4a';
                ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    const wx = sx + 8 + i * 8;
                    const sway = Math.sin(animCache.time * 3 + i * 2) * 3;
                    ctx.beginPath();
                    ctx.moveTo(wx + sway, sy + 4);
                    ctx.lineTo(wx - sway, sy - 4);
                    ctx.stroke();
                }
                break;
        }

        ctx.globalAlpha = 1;

        // Animated flies on FILTHY tiles
        if (clean === CLEAN_STATE.FILTHY) {
            ctx.fillStyle = '#2a2a2a';
            for (let i = 0; i < 2; i++) {
                const fx = sx + TILE_SIZE / 2 + Math.sin(animCache.time * 5 + i * 3 + x) * 8;
                const fy = sy + 4 + Math.cos(animCache.time * 4 + i * 2 + y) * 4;
                ctx.fillRect(fx, fy, 2, 2);
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

    // Body (hazmat suit)
    ctx.fillStyle = COLORS.playerBody;
    ctx.fillRect(sx + 6, sy + 6 + bounce, TILE_SIZE - 12, TILE_SIZE - 10);

    // Head
    ctx.fillStyle = COLORS.playerBody;
    ctx.fillRect(sx + 8, sy + 2 + bounce, TILE_SIZE - 16, 8);

    // Visor
    ctx.fillStyle = COLORS.playerVisor;
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
    ctx.fillStyle = COLORS.playerBoots;
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
function drawTitleScreen() {
    // Background
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // City skyline silhouette
    drawCitySkyline();

    // Title
    const titleY = canvas.height * 0.22;
    ctx.save();

    // Title glow
    ctx.shadowColor = '#ff6030';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ff8040';
    ctx.font = `bold ${Math.floor(canvas.width * 0.09)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('DOODY CALLS', canvas.width / 2, titleY);
    ctx.shadowBlur = 0;

    // Subtitle
    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `${Math.floor(canvas.width * 0.028)}px monospace`;
    ctx.fillText('San Francisco Needs You.', canvas.width / 2, titleY + 35);

    ctx.restore();

    // Menu options
    const menuY = canvas.height * 0.45;
    const menuSpacing = 50;
    const menuItems = [
        { label: 'START SHIFT', desc: 'Begin District 1' },
        { label: 'QUICK SHIFT', desc: '3 random districts' },
        { label: 'DISTRICT SELECT', desc: `City Grade: ${gameState.cityGrade}` },
    ];

    const selectedIndex = gameState._menuIndex || 0;

    for (let i = 0; i < menuItems.length; i++) {
        const y = menuY + i * menuSpacing;
        const selected = i === selectedIndex;
        const pulse = selected ? Math.sin(animCache.time * 4) * 0.15 + 0.85 : 0.5;

        ctx.globalAlpha = pulse;
        ctx.fillStyle = selected ? COLORS.uiAccent : '#888';
        ctx.font = `bold ${Math.floor(canvas.width * 0.035)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(menuItems[i].label, canvas.width / 2, y);

        ctx.fillStyle = selected ? '#aaa' : '#555';
        ctx.font = `${Math.floor(canvas.width * 0.02)}px monospace`;
        ctx.fillText(menuItems[i].desc, canvas.width / 2, y + 18);
    }
    ctx.globalAlpha = 1;

    // Selection arrow
    const arrowY = menuY + selectedIndex * menuSpacing - 5;
    const arrowBounce = Math.sin(animCache.time * 6) * 4;
    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `${Math.floor(canvas.width * 0.035)}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('>', canvas.width / 2 - 120 + arrowBounce, arrowY);

    // Controls hint
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Arrow Keys / WASD to move  •  Space to clean  •  Enter to select',
                 canvas.width / 2, canvas.height - 40);

    // Credits
    ctx.fillStyle = '#333';
    ctx.font = '9px monospace';
    ctx.fillText('A Kingmade LLC Production  •  Built by Marty\'s Belgian Dev Team',
                 canvas.width / 2, canvas.height - 20);
}

function drawCitySkyline() {
    const baseY = canvas.height * 0.35;
    ctx.fillStyle = '#0a0a1a';

    // Random-ish buildings
    const buildings = [
        { x: 0.05, w: 0.06, h: 0.15 },
        { x: 0.12, w: 0.04, h: 0.22 },
        { x: 0.17, w: 0.07, h: 0.18 },
        { x: 0.26, w: 0.05, h: 0.25 },
        { x: 0.32, w: 0.06, h: 0.20 },
        { x: 0.40, w: 0.04, h: 0.30 }, // Transamerica-ish
        { x: 0.45, w: 0.07, h: 0.22 },
        { x: 0.54, w: 0.05, h: 0.18 },
        { x: 0.60, w: 0.06, h: 0.24 },
        { x: 0.68, w: 0.04, h: 0.20 },
        { x: 0.74, w: 0.07, h: 0.16 },
        { x: 0.82, w: 0.05, h: 0.22 },
        { x: 0.88, w: 0.06, h: 0.19 },
        { x: 0.95, w: 0.05, h: 0.14 },
    ];

    for (const b of buildings) {
        const bx = b.x * canvas.width;
        const bw = b.w * canvas.width;
        const bh = b.h * canvas.height;
        ctx.fillRect(bx, baseY - bh, bw, bh + canvas.height);

        // Windows
        ctx.fillStyle = '#1a1a3a';
        for (let wy = baseY - bh + 6; wy < baseY; wy += 12) {
            for (let wx = bx + 4; wx < bx + bw - 4; wx += 8) {
                const lit = Math.sin(wx * 3 + wy * 7 + animCache.time * 0.5) > 0.3;
                ctx.fillStyle = lit ? '#f0d06040' : '#1a1a3a';
                ctx.fillRect(wx, wy, 4, 6);
            }
        }
        ctx.fillStyle = '#0a0a1a';
    }

    // Golden Gate hint (distant)
    ctx.strokeStyle = '#c0402040';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.0, baseY + 10);
    ctx.lineTo(canvas.width * 0.15, baseY - 20);
    ctx.lineTo(canvas.width * 0.30, baseY + 10);
    ctx.stroke();
}

// ============================================
// DRAWING - GAME OVER SCREEN
// ============================================
function drawGameOverScreen() {
    // Darken
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Headline
    const headline = GAME_OVER_HEADLINES[Math.floor(gameState.district) % GAME_OVER_HEADLINES.length];

    ctx.fillStyle = '#ff4444';
    ctx.font = `bold ${Math.floor(canvas.width * 0.06)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('SHIFT OVER', canvas.width / 2, canvas.height * 0.25);

    ctx.fillStyle = '#ff8888';
    ctx.font = `${Math.floor(canvas.width * 0.022)}px monospace`;
    // Word wrap the headline
    wrapText(headline, canvas.width / 2, canvas.height * 0.35, canvas.width * 0.8, 18);

    // Stats
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;
    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.fillText(`Cleaned: ${pct}%  |  ${gameState.messesClean}/${gameState.totalMesses} messes`,
                 canvas.width / 2, canvas.height * 0.50);

    // Score share preview
    drawScoreShare(canvas.width * 0.15, canvas.height * 0.57, canvas.width * 0.7, 80, 0);

    // Prompt
    const blink = Math.sin(animCache.time * 4) > 0;
    if (blink) {
        ctx.fillStyle = COLORS.uiAccent;
        ctx.font = 'bold 14px monospace';
        ctx.fillText('Press ENTER to try again', canvas.width / 2, canvas.height * 0.85);
    }
}

// ============================================
// DRAWING - DISTRICT COMPLETE SCREEN
// ============================================
function drawDistrictCompleteScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const district = DISTRICTS[gameState.district];
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;

    // Title
    ctx.fillStyle = COLORS.uiGold;
    ctx.font = `bold ${Math.floor(canvas.width * 0.05)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('SHIFT COMPLETE!', canvas.width / 2, canvas.height * 0.15);

    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = `${Math.floor(canvas.width * 0.025)}px monospace`;
    ctx.fillText(`${district.name}`, canvas.width / 2, canvas.height * 0.22);

    // Stars
    let stars = 0;
    if (pct >= 60) stars = 1;
    if (pct >= 80) stars = 2;
    if (pct >= 100 && gameState.timeBonus > 10) stars = 3;

    const starY = canvas.height * 0.32;
    for (let i = 0; i < 3; i++) {
        const filled = i < stars;
        ctx.fillStyle = filled ? COLORS.uiGold : '#333';
        ctx.font = `${Math.floor(canvas.width * 0.07)}px monospace`;
        ctx.fillText(filled ? '★' : '☆', canvas.width / 2 - 60 + i * 60, starY);
    }

    // Stats
    ctx.fillStyle = '#ccc';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    const statsY = canvas.height * 0.45;
    ctx.fillText(`Cleaned: ${pct}%`, canvas.width / 2, statsY);
    ctx.fillText(`Time Bonus: +${gameState.timeBonus}s`, canvas.width / 2, statsY + 22);

    // City grade
    ctx.fillStyle = COLORS.uiAccent;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`City Grade: ${gameState.cityGrade}`, canvas.width / 2, statsY + 55);

    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    wrapText(getGradeHeadline(gameState.cityGrade), canvas.width / 2, statsY + 75, canvas.width * 0.8, 14);

    // Score share
    drawScoreShare(canvas.width * 0.15, canvas.height * 0.70, canvas.width * 0.7, 80, stars);

    // Next prompt
    const blink = Math.sin(animCache.time * 4) > 0;
    if (blink) {
        ctx.fillStyle = COLORS.uiAccent;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        const nextDist = gameState.district + 1;
        if (nextDist < DISTRICTS.length) {
            ctx.fillText(`Press ENTER for ${DISTRICTS[nextDist].name}`, canvas.width / 2, canvas.height * 0.92);
        } else {
            ctx.fillText('Press ENTER — All districts complete!', canvas.width / 2, canvas.height * 0.92);
        }
    }
}

function drawScoreShare(x, y, w, h, stars) {
    // Share card background
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    const district = DISTRICTS[gameState.district];
    const pct = gameState.totalMesses > 0 ?
        Math.floor((gameState.messesClean / gameState.totalMesses) * 100) : 0;

    ctx.fillStyle = '#888';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DOODY CALLS — copy & share:', x + 8, y + 14);

    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    ctx.fillText(`DOODY CALLS - D${district.id}: ${district.name}`, x + 8, y + 30);
    ctx.fillText(`${starStr} | Cleaned: ${pct}% | Time: ${Math.floor(gameState.timeBonus)}s left`, x + 8, y + 44);
    ctx.fillText(`Grade: ${gameState.cityGrade} ("${getGradeHeadline(gameState.cityGrade).substring(0, 45)}...")`, x + 8, y + 58);
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
        updatePlayer(dt);
        updatePigeons(dt);
        updateHobos(dt);
        updateCamera(dt);
        updateTimer(dt);
        updateParticles(dt);
        updateCelebrations(dt);

        // Check if player pressed action to finish shift (when >= 60% clean)
        const pct = gameState.totalMesses > 0 ? (gameState.messesClean / gameState.totalMesses) : 0;
        if (pct >= 0.6 && inputActions.pause) {
            completeDistrict();
        }
    } else if (gameState.screen === 'gameOver') {
        updateParticles(dt);
        if (inputActions.confirm) {
            // Restart same district
            startDistrict(gameState.district);
        }
    } else if (gameState.screen === 'districtComplete') {
        if (inputActions.confirm) {
            const nextDist = gameState.district + 1;
            if (nextDist < DISTRICTS.length) {
                startDistrict(nextDist);
            } else {
                gameState.screen = 'title';
            }
        }
    }
}

function updateTitleMenu(dt) {
    if (gameState._menuIndex === undefined) gameState._menuIndex = 0;

    if (inputActions.up) {
        gameState._menuIndex = Math.max(0, gameState._menuIndex - 1);
    }
    if (inputActions.down) {
        gameState._menuIndex = Math.min(2, gameState._menuIndex + 1);
    }
    if (inputActions.confirm) {
        if (gameState._menuIndex === 0) {
            // Start shift
            startDistrict(0);
        } else if (gameState._menuIndex === 1) {
            // Quick shift - random 3 districts
            startDistrict(Math.floor(Math.random() * DISTRICTS.length));
        } else if (gameState._menuIndex === 2) {
            // District select - for now just start district 1
            startDistrict(0);
        }
    }
}

// ============================================
// MAIN DRAW
// ============================================
function draw() {
    // Clear
    ctx.fillStyle = COLORS.uiBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState.screen === 'title') {
        drawTitleScreen();
        return;
    }

    if (gameState.screen === 'gameOver') {
        // Draw the game world behind the overlay
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
}

function drawGameWorld() {
    if (!gameState.tiles || gameState.tiles.length === 0) return;

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
            gameState.totalStars = data.totalStars || 0;
            gameState.cityGrade = calculateGrade(gameState.totalStars);
        }
    } catch (e) {
        debugLog('Failed to load progress:', e);
    }
}

function saveProgress() {
    try {
        localStorage.setItem('doodyCalls_progress', JSON.stringify({
            districtStars: gameState.districtStars,
            totalStars: gameState.totalStars,
        }));
    } catch (e) {
        debugLog('Failed to save progress:', e);
    }
}

// Start the game
initGame();
