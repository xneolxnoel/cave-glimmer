'use strict';
/* ============================================================
 *  洞窟微光 Cave Glimmer
 *  第一关：单屏氛围走廊（不卷轴）
 *  第二关：横向卷轴 · 水面石台连跳（落水则火把熄灭，游戏结束）
 *  光照核心：黑暗遮罩打洞 + 暖色光晕；摄像机按关卡宽度自动启停
 * ============================================================ */

/* ---------------- 基础常量 ---------------- */
const VIEW_W = 1280, VIEW_H = 720;        // 逻辑分辨率
const GRAV = 2150, JUMP_V = 700;          // 重力 / 起跳速度（轻柔弧线）
const RUN_SPD = 235, ACC = 1600, DEC = 1900, AIR_ACC = 1000;
const STEP_UP = 17;                       // 可自动迈上的台阶高度
const COYOTE = 0.09, JBUF = 0.12;         // 土狼时间 / 跳跃缓冲
const PH = 60;                            // 玩家身高
const COMBOS = [                            // 四段连斩（角度为弧度，负=上方）
  { dur: .26, a0: -2.55, a1: .85,  reach: 66, kb: 16, both: false }, // 一段：竖劈
  { dur: .22, a0: -.9,   a1: .7,   reach: 70, kb: 14, both: false }, // 二段：横劈（快）
  { dur: .34, a0: -2.95, a1: .95,  reach: 82, kb: 34, both: false }, // 三段：大力竖劈
  { dur: .42, a0: .6,    a1: -.6,  reach: 78, kb: 30, both: true, spin: true } // 四段：转身横劈（全周）
];
const DASH_T = .16, DASH_V = 900, DASH_CD = .9;   // 闪冲
const QI_SKILL_COST = 75;                          // 喷火消耗
const QI_HIT_GAIN = 25, QI_BLOCK_GAIN = 12, QI_HURT_GAIN = 10;   // 砍怪/格挡/受击攒气
const GUARD_MAX = 3, GUARD_REGEN = 2.2;            // 格挡条：3 段，每 2.2 秒回 1 段
const QI_CHARGE_CAP = 75, QI_CHARGE_RATE = 38;     // 长按空格蓄气：上限 3/4 / 速率（较慢）

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let k = 1;                                // 设备像素缩放
let sk = 1;                               // 静态场景预渲染缩放（上限 1.5，控内存）
const cam = { x: 0 };                     // 摄像机（世界坐标左边缘）

/* ---------------- 离屏画布 ---------------- */
const sceneCanvas = document.createElement('canvas');   // 静态洞窟（整关预渲染）
const darkCanvas  = document.createElement('canvas');   // 黑暗遮罩（逻辑分辨率）
darkCanvas.width = VIEW_W; darkCanvas.height = VIEW_H;
const dctx = darkCanvas.getContext('2d');
const vigCanvas = document.createElement('canvas');     // 暗角
vigCanvas.width = VIEW_W; vigCanvas.height = VIEW_H;

/* ============================================================
 *  关卡数据
 *  spans: 地面段落（段落之间是水面/深渊，没有地面）
 * ============================================================ */
const LEVEL1 = {
  name: 1,
  width: VIEW_W, spawnX: 110, minX: 80, maxX: 1204,
  waterY: null,
  goal: { x: 1148, hover: 64 },
  spans: [{ x1: -60, x2: 1300, pts: [
    [-60,604],[120,604],[210,590],[320,590],[320,560],[420,560],[500,560],
    [622,584],[720,584],[720,556],[820,556],[920,556],[920,596],[1300,596]
  ]}],
  ceil: [
    [-60,308],[160,308],[260,326],[380,326],[470,310],[560,310],
    [640,332],[740,332],[820,314],[920,314],[1000,334],[1120,334],[1200,316],[1300,316]
  ],
  stalactites: [
    [130,38,13],[205,26,9],[300,52,15],[452,30,10],[508,44,13],
    [612,58,16],[700,24,8],[772,40,12],[858,30,9],[942,50,14],
    [1048,36,10],[1162,26,8],[1232,44,12]
  ],
  stalagmites: [
    [172,34,12],[350,46,15],[432,24,9],[585,38,13],[660,26,8],
    [758,44,14],[880,22,7],[975,40,13],[1088,30,10],[1214,22,7]
  ],
  rocks: [
    [146,16,10],[352,20,12],[562,18,11],[724,14,9],[906,26,14],
    [1036,16,10],[1180,20,12],[280,12,8],[688,18,11]
  ],
  mushrooms: [[258,2],[772,2]],
  roots: [[352,58],[655,46],[928,64],[498,40]],
  drips: [[130,38],[300,52],[508,44],[772,40],[942,50],[1232,44]],
  puddles: [
    { x: 286, w: 44, y: 590 },
    { x: 668, w: 58, y: 584 },
    { x: 866, w: 46, y: 556 },
    { x: 1062, w: 82, y: 596 }
  ],
  wet: [[240,60,590],[455,70,560],[680,55,584],[855,60,556],[1075,90,596]],
  moss: [
    [150,601,1,11],[246,589,.9,23],[309,589,1.1,37],[330,559,.7,157],
    [354,559,.8,41],[470,559,1,53],[560,563,.6,173],[640,583,.9,67],
    [700,583,.7,71],[728,555,.7,163],[775,555,1,83],[875,555,.8,97],
    [906,541,.7,179],[965,595,1.1,101],[1105,595,.9,113],[1180,582,.6,181],
    [1188,595,.7,127],[316,588,.9,131],[352,517,.6,139],[64,603,1,149],
    [1218,595,.9,151]
  ]
};

const LEVEL2 = {
  name: 2,
  width: 2800, spawnX: 110, minX: 70, maxX: 2745,
  waterY: 640,
  goal: { x: 2600, hover: 64 },
  spans: [
    { x1: -60,  x2: 520,  pts: [[-60,596],[180,596],[260,582],[420,582],[520,596]] },
    { x1: 600,  x2: 700,  pts: [[600,560],[700,560]] },
    { x1: 790,  x2: 880,  pts: [[790,540],[880,540]] },
    { x1: 970,  x2: 1060, pts: [[970,560],[1060,560]] },
    { x1: 1150, x2: 1560, pts: [[1150,596],[1240,578],[1420,578],[1500,596],[1560,596]] },
    { x1: 1650, x2: 1750, pts: [[1650,556],[1750,556]] },
    { x1: 1830, x2: 1930, pts: [[1830,548],[1930,548]] },
    { x1: 2015, x2: 2840, pts: [[2015,596],[2120,584],[2340,584],[2460,596],[2840,596]] }
  ],
  ceil: [
    [-60,196],[300,188],[700,208],[1100,184],[1500,204],
    [1900,192],[2300,210],[2650,192],[2900,200]
  ],
  stalactites: [
    [180,44,14],[420,30,10],[560,56,16],[760,36,12],[900,48,14],[1040,28,9],
    [1240,52,15],[1420,34,11],[1620,58,16],[1800,30,10],[1960,46,13],[2140,36,11],
    [2320,50,14],[2520,30,9],[2680,60,17]
  ],
  stalagmites: [
    [240,40,13],[500,26,9],[625,52,15],[800,30,10],[985,44,13],[1180,26,8],
    [1380,50,14],[1520,32,10],[1845,42,13],[2080,28,9],[2240,46,14],
    [2440,30,10],[2620,40,13],[2700,26,8]
  ],
  rocks: [
    [170,16,10],[350,22,13],[470,14,9],[640,20,12],[835,18,11],[1010,22,13],
    [1240,18,11],[1330,26,14],[1480,16,10],[1700,20,12],[1900,18,11],
    [2100,24,13],[2350,16,10],[2500,20,12],[2680,18,11]
  ],
  mushrooms: [[300,3],[430,2],[655,2],[1000,2],[1200,3],[1450,2],[1880,2],[2250,3],[2560,2],[2650,2]],
  roots: [[420,50],[860,60],[1240,44],[1700,56],[2280,48],[2700,62]],
  drips: [[560,56],[1040,28],[1620,58],[1960,46],[2680,60]],
  puddles: [
    { x: 400, w: 56, y: 582 },
    { x: 1370, w: 60, y: 578 },
    { x: 2250, w: 56, y: 584 },
    { x: 2700, w: 60, y: 596 }
  ],
  wet: [[350,60,582],[1290,64,578],[2180,60,584],[2740,80,596],[640,40,560],[1005,44,560]],
  moss: [
    [140,599,1,11],[255,581,.9,23],[405,581,1,37],[505,594,.9,131],
    [612,559,.8,141],[688,559,.7,67],[800,539,.8,143],[868,539,.7,71],
    [978,559,.8,145],[1052,559,.7,73],[1160,594,1,53],[1260,577,.9,55],
    [1400,577,.8,57],[1545,594,.9,59],[1672,555,.7,147],[1748,555,.7,75],
    [1852,547,.7,149],[1928,547,.7,77],[2035,594,.9,61],[2135,582,.8,63],
    [2310,582,.8,65],[2450,594,1,91],[2600,594,.9,151],[2700,594,1,93],
    [2745,594,.7,109],[625,510,.6,177]
  ]
};

const LEVEL3 = {
  name: 3,
  width: 2600, spawnX: 110, minX: 70, maxX: 2545,
  waterY: null,
  goal: { x: 2480, hover: 64 },
  spans: [{ x1: -60, x2: 2660, pts: [
    [-60,596],[200,596],[300,572],[430,572],[540,596],[900,596],[980,570],
    [1120,570],[1210,596],[1600,596],[1700,574],[1830,574],[1920,596],[2660,596]
  ]}],
  ceil: [[-60,210],[400,200],[800,214],[1200,198],[1600,212],[2000,196],[2400,206],[2700,200]],
  stalactites: [
    [240,42,13],[520,30,10],[760,52,15],[1010,28,9],[1230,46,13],[1450,34,11],
    [1690,56,15],[1930,30,10],[2140,48,14],[2380,32,11],[2570,44,13]
  ],
  stalagmites: [
    [330,34,12],[600,26,9],[880,44,13],[1060,24,8],[1320,40,13],[1560,26,8],
    [1800,42,13],[2050,28,9],[2260,38,12],[2480,24,8]
  ],
  rocks: [
    [180,16,10],[420,20,12],[700,24,13],[940,16,10],[1150,20,12],[1420,24,13],
    [1660,16,10],[1880,20,12],[2140,24,13],[2360,16,10]
  ],
  mushrooms: [[260,2],[1240,2],[2010,2]],
  roots: [[520,50],[1080,44],[1660,56],[2200,48]],
  drips: [[520,30],[1010,28],[1690,56],[2140,48]],
  puddles: [
    { x: 640, w: 56, y: 572 },
    { x: 1360, w: 60, y: 596 },
    { x: 2000, w: 56, y: 596 }
  ],
  wet: [[600,60,572],[1300,64,596],[1950,60,596],[2400,60,574]],
  moss: [
    [150,599,1,11],[290,570,.9,23],[420,570,1,37],[560,594,.9,131],
    [700,594,1,53],[860,594,.9,55],[1000,568,.8,57],[1090,568,.7,59],
    [1300,594,1,61],[1560,594,.9,63],[1710,572,.8,65],[1840,572,.7,67],
    [1960,594,1,69],[2110,594,.9,71],[2360,594,.8,73],[2500,594,1,75]
  ],
  enemies: [
    { x1: 640, x2: 880 },
    { x1: 1290, x2: 1560 },
    { x1: 2100, x2: 2400 }
  ]
};

const LEVEL4 = {
  name: 4,
  width: 3000, spawnX: 110, minX: 70, maxX: 2920,
  waterY: 640, torchR: 310,
  goal: { x: 2900, hover: 64 },
  spans: [
    { x1: -60, x2: 460,  pts: [[-60,596],[140,596],[240,580],[360,580],[460,596]] },
    { x1: 540, x2: 640,  pts: [[540,556],[640,556]] },
    { x1: 720, x2: 820,  pts: [[720,536],[820,536]] },
    { x1: 900, x2: 1460, pts: [[900,596],[1000,578],[1180,578],[1280,596],[1460,596]] },
    { x1: 1540, x2: 1650, pts: [[1540,550],[1650,550]] },
    { x1: 1730, x2: 3060, pts: [[1730,596],[1860,580],[2060,580],[2200,596],[3060,596]] }
  ],
  ceil: [
    [-60,200],[400,192],[800,206],[1200,190],[1600,204],
    [2000,192],[2400,206],[2800,194],[3060,200]
  ],
  stalactites: [
    [210,44,13],[380,30,10],[620,52,15],[780,30,10],[960,46,13],[1120,30,10],
    [1300,54,15],[1560,30,10],[1780,48,14],[1980,32,11],[2160,52,15],[2380,30,10],
    [2560,46,13],[2760,32,11],[2950,42,12]
  ],
  stalagmites: [
    [180,36,12],[330,26,9],[420,22,8],[570,20,7],[760,22,8],[960,40,13],
    [1100,26,9],[1240,36,12],[1380,24,8],[1590,20,7],[1800,38,13],[1980,26,9],
    [2120,36,12],[2300,24,8],[2520,40,13],[2700,26,9],[2900,34,12]
  ],
  rocks: [
    [200,18,11],[360,22,13],[600,16,10],[770,14,9],[1000,24,13],[1160,16,10],
    [1320,22,13],[1600,14,9],[1840,20,12],[2000,24,13],[2250,16,10],[2450,20,12],
    [2700,22,13],[2880,16,10]
  ],
  mushrooms: [[280,2],[1040,2],[1900,3],[2800,2]],
  roots: [[400,52],[940,60],[1520,46],[2040,58],[2600,50]],
  drips: [[620,52],[1120,30],[1780,48],[2560,46]],
  puddles: [{ x: 1050, w: 60, y: 578 }, { x: 1960, w: 56, y: 580 }, { x: 2820, w: 64, y: 596 }],
  wet: [[1020,60,578],[1920,56,580],[2780,64,596],[620,36,556]],
  moss: [
    [150,597,1,11],[300,578,.9,23],[430,578,.8,37],
    [560,554,.7,157],[660,554,.8,67],[760,534,.7,71],[830,534,.8,73],
    [940,594,1,41],[1080,576,.9,43],[1200,576,.8,45],[1330,594,1,47],
    [1440,594,.8,49],[1580,548,.7,51],[1750,594,.8,53],[1810,585,1,55],
    [1990,578,.9,57],[2140,586,.8,59],[2260,594,1,61],[2480,594,.9,63],
    [2660,594,.8,65],[2860,594,1,67]
  ],
  enemies: [
    { x1: 260, x2: 440 },
    { x1: 1000, x2: 1400, big: true },
    { x1: 1850, x2: 2280 },
    { x1: 2550, x2: 2900 }
  ]
};

const LEVEL5 = {
  name: 5,
  width: 3000, spawnX: 110, minX: 70, maxX: 2930,
  waterY: 640, torchR: 285,
  goal: { x: 2900, hover: 64 },
  spans: [
    { x1: -60, x2: 600,  pts: [[-60,596],[160,596],[280,582],[420,582],[600,596]] },
    { x1: 700, x2: 800,  pts: [[700,550],[800,550]] },
    { x1: 880, x2: 1980, pts: [[880,596],[980,584],[1980,584]] },
    { x1: 2060, x2: 2160, pts: [[2060,552],[2160,552]] },
    { x1: 2240, x2: 3060, pts: [[2240,596],[2400,584],[2560,584],[2700,596],[3060,596]] }
  ],
  ceil: [
    [-60,196],[400,188],[800,202],[1200,190],[1600,200],
    [2000,190],[2400,204],[2800,194],[3060,200]
  ],
  stalactites: [
    [240,46,13],[460,30,10],[680,54,15],[760,28,9],[940,44,13],[1160,32,11],
    [1380,56,16],[1560,30,10],[1760,48,14],[1940,30,9],[2120,52,15],[2300,32,11],
    [2480,46,13],[2660,30,10],[2840,44,13]
  ],
  stalagmites: [
    [200,34,12],[420,24,8],[540,22,7],[740,20,7],[940,38,13],[1060,24,8],
    [1300,40,13],[1450,26,9],[1620,22,7],[1800,36,12],[1900,24,8],[2100,20,7],
    [2300,36,12],[2450,24,8],[2620,40,13],[2800,28,10],[2950,22,7]
  ],
  rocks: [
    [220,18,11],[380,22,13],[520,16,10],[750,14,9],[960,24,13],[1180,18,11],
    [1360,26,14],[1540,18,11],[1720,22,13],[1880,16,10],[2100,14,9],[2320,22,13],
    [2500,18,11],[2700,24,13],[2900,16,10]
  ],
  mushrooms: [[300,2],[1360,3],[2380,2],[2860,2]],
  roots: [[460,50],[1080,58],[1560,50],[2260,56],[2800,50]],
  drips: [[680,54],[1380,56],[2120,52],[2840,44]],
  puddles: [{ x: 360, w: 56, y: 582 }, { x: 1240, w: 60, y: 584 }, { x: 2760, w: 64, y: 596 }],
  wet: [[330,60,582],[1200,64,584],[2680,70,596],[700,36,550]],
  moss: [
    [150,597,1,11],[300,580,.9,23],[440,580,.8,37],[560,591,.9,39],
    [715,548,.7,157],[890,584,.8,67],[930,588,1,41],[1040,582,.9,43],
    [1180,582,.8,45],[1330,582,1,47],[1520,582,.8,49],[1700,582,.7,51],
    [1830,582,.8,53],[1930,582,.7,55],[2090,550,.7,157],[2140,550,.6,59],
    [2290,591,1,61],[2430,582,.9,63],[2600,586,.9,65],[2750,594,.8,67],
    [2900,594,1,69]
  ],
  enemies: [
    { x1: 340, x2: 540 },
    { x1: 1150, x2: 1350 },
    { x1: 1450, x2: 1650, big: true },
    { x1: 1600, x2: 1900, big: true, hp: 10, speed: 55, chaseSpd: 125, dmg: 30 }
  ]
};

const LEVEL6 = {
  name: 6,
  width: 2600, spawnX: 110, minX: 70, maxX: 2530,
  waterY: null, torchR: 300,
  goal: { x: 2400, hover: 64 },
  plate: { x: 1050, w: 78, pressed: false },
  dripHazards: [[1180,40],[1290,46],[1360,36],[1480,44],[1580,34]],
  spans: [{ x1: -60, x2: 2660, pts: [
    [-60,596],[200,596],[380,584],[700,584],[840,596],[1100,596],
    [1240,584],[1420,584],[1560,596],[2660,596]
  ]}],
  ceil: [[-60,196],[400,188],[800,200],[1200,186],[1600,198],[2000,190],[2400,200],[2700,192]],
  stalactites: [
    [260,40,12],[480,28,9],[700,46,13],[940,32,10],[1330,34,11],
    [1750,28,9],[1950,40,12],[2200,30,10]
  ],
  stalagmites: [
    [300,30,10],[560,24,8],[760,36,12],[1020,24,8],[1300,32,11],
    [1500,22,7],[1750,34,12],[2000,26,9],[2300,30,10]
  ],
  rocks: [
    [240,16,10],[450,20,12],[660,14,9],[980,20,12],[1180,14,9],[1400,20,12],
    [1700,16,10],[2050,20,12],[2350,16,10]
  ],
  mushrooms: [[420,2],[2300,2]],
  roots: [[700,48],[2100,50]],
  drips: [[380,30],[940,28]],
  puddles: [{ x: 1340, w: 56, y: 584 }, { x: 2100, w: 56, y: 596 }],
  wet: [[1180,60,584],[1400,60,584],[520,50,584]],
  moss: [
    [150,595,1,11],[300,587,.9,23],[440,582,.8,37],[620,582,.9,39],
    [760,587,.8,41],[900,594,.9,43],[1080,594,.8,45],[1200,585,.7,47],
    [1360,582,.9,49],[1470,586,.7,51],[1610,594,1,53],[1860,594,.9,55],
    [2100,594,.8,57],[2350,594,1,59],[2500,594,.8,61]
  ],
  enemies: []
};

const LEVELS = { 1: LEVEL1, 2: LEVEL2, 3: LEVEL3, 4: LEVEL4, 5: LEVEL5, 6: LEVEL6 };
for (const L of [LEVEL1, LEVEL2, LEVEL3, LEVEL4, LEVEL5, LEVEL6]) for (const sp of L.spans) sp.at = makeSampler(sp.pts);

/* ---------------- 当前关卡状态 ---------------- */
let LV = LEVEL1, levelNum = 1;
let ceilAt = makeSampler(LV.ceil);
let goalX = LV.goal.x, goalY = 0;

function groundAt(x) {
  for (const sp of LV.spans) {
    if (x >= sp.x1 && x <= sp.x2) return sp.at(x);
  }
  return null;   // 悬空（水面上方）
}
function floorOrWater(x) {
  const g = groundAt(x);
  return g !== null ? g : (LV.waterY !== null ? LV.waterY : 600);
}
function goalLocked() { return !!(LV.enemies && enemies.some(en => !en.dead)); }

function makeSampler(pts) {
  return function (x) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (x <= pts[i + 1][0]) {
        const dx = pts[i + 1][0] - pts[i][0];
        if (dx === 0) return Math.max(pts[i][1], pts[i + 1][1]); // 垂直陡坎：取左（低处）值
        const t = (x - pts[i][0]) / dx;
        return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
      }
    }
    return pts[pts.length - 1][1];
  };
}

/* ============================================================
 *  状态
 * ============================================================ */
let state = 'menu';          // menu | play | clearing | clear | drowning | gameover
let tGlobal = 0;
let playStart = 0, playTime = 0;
let darknessMult = 1;
let clearingT = 0, drownT = 0, torchLife = 1;
let hintTimer = null;
let lastDenyT = -9;
let hitStopT = 0;                                        // 命中顿帧
let shakeT = 0, shakeDur = 1, shakeAmp = 0;              // 镜头震动
let shakeOx = 0, shakeOy = 0;
function addShake(amp, dur) {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeDur = Math.max(shakeDur, dur);
  shakeT = Math.max(shakeT, dur);
}

const player = {
  x: LEVEL1.spawnX, y: 604,
  vx: 0, vy: 0, grounded: true,
  face: 1, faceF: 1,
  phase: 0, coyote: 0, jbuf: 0, landT: 0,
  hp: 100, qi: 0, invulnT: 0, attackT: 0, attackCd: 0, attackDur: .26,
  blocking: false, blockFxT: 0, guard: GUARD_MAX,
  holding: false, wasHolding: false, holdStartQi: 0, holdGain: 0,
  breathT: 0, ultT: 0, flashT: 0, ultRingT: 0,
  comboStep: 0, comboQueued: false, comboResetT: 0,
  dashT: 0, dashCd: 0, dashDir: 1
};

/* ---------------- 粒子 ---------------- */
const flames = [];   // 火焰 + 火星
const dust   = [];   // 尘埃
const sparks = [];   // 终点光屑
const flies  = [];   // 萤火虫
const scarf  = [];   // 围巾跟随点
const fogs   = [];   // 贴地雾气
const drops  = [];   // 下落中的水滴
const ripples = [];  // 水面涟漪
const enemies = [];  // 敌人（第三关暗影虫）
const ghosts = [];   // 闪冲残影
const puffs = [];    // 尘土/水花
let prevTip = null;  // 火把尖上一帧位置（用于沿运动路径播种拖尾）
let DRIP_SRC = [];   // 装饰性滴水
const hazSrcs = [];  // 危险滴水源（第六关机关）
const hazDrops = []; // 下落中的致命水滴
let plateGlow = 0;   // 压力板按下时的符文亮度

function initDust() {
  dust.length = 0;
  for (let i = 0; i < 60; i++) {
    const x = 60 + Math.random() * (LV.width - 120);
    dust.push({
      x, y: ceilAt(x) + 30 + Math.random() * Math.max(40, floorOrWater(x) - ceilAt(x) - 60),
      vx: (Math.random() - .5) * 12, vy: (Math.random() - .5) * 8,
      a: .05 + Math.random() * .12, s: .8 + Math.random() * 1.3,
      ph: Math.random() * Math.PI * 2
    });
  }
}
function initFlies() {
  flies.length = 0;
  for (let i = 0; i < 14; i++) {
    const x = 80 + Math.random() * (LV.width - 160);
    flies.push({
      x, y: ceilAt(x) + 40 + Math.random() * Math.max(40, floorOrWater(x) - ceilAt(x) - 80),
      vx: (Math.random() - .5) * 7, vy: (Math.random() - .5) * 5,
      ph: Math.random() * Math.PI * 2,
      blink: Math.random() * Math.PI * 2, blinkSpd: .7 + Math.random() * .9,
      r: 1.3 + Math.random() * 1.2
    });
  }
}
function initFogs() {
  fogs.length = 0;
  for (let i = 0; i < 6; i++) {
    const x = 80 + Math.random() * (LV.width - 160);
    fogs.push({ x, y: floorOrWater(x) - 18 - Math.random() * 55, r: 60 + Math.random() * 50, vx: (Math.random() - .5) * 7, ph: Math.random() * 7 });
  }
}
function buildDrips() {
  return LV.drips.map(([x, l]) => ({ x, y: ceilAt(x) + l - 2, t: 1 + Math.random() * 5 }));
}
function initEnemies() {
  enemies.length = 0;
  for (const e of (LV.enemies || [])) {
    enemies.push({
      x1: e.x1, x2: e.x2, x: (e.x1 + e.x2) / 2, dir: 1,
      hp: e.hp ?? 2, big: !!e.big, size: e.big ? 1.55 : 1,
      dmg: e.dmg ?? (e.big ? 30 : 20),
      speed: e.speed ?? 42, chaseSpd: e.chaseSpd ?? 88 + Math.random() * 24,
      hurtT: 0, dead: false, bob: Math.random() * 7,
      st: 'chase', air: 0, airV: 0, lvx: 0, atkCd: Math.random() * .8, recT: 0
    });
  }
}
function initScarf() {
  scarf.length = 0;
  for (let i = 0; i < 4; i++) scarf.push({ x: player.x, y: player.y - 40 - i * 5 });
}
function spawnPuffs(x, y, n, spread) {
  for (let i = 0; i < n; i++) {
    puffs.push({
      x: x + (Math.random() - .5) * spread, y: y - Math.random() * 8,
      vx: (Math.random() - .5) * 50, vy: -8 - Math.random() * 26,
      life: .35 + Math.random() * .3, t: 0, r: 1.8 + Math.random() * 2.4,
      c: 'rgba(205,192,168,'
    });
  }
}
function spawnSplash(x, y) {
  for (let i = 0; i < 4; i++) {
    puffs.push({
      x: x + (Math.random() - .5) * 12, y: y - Math.random() * 5,
      vx: (Math.random() - .5) * 100, vy: -40 - Math.random() * 70,
      life: .28 + Math.random() * .2, t: 0, r: .9 + Math.random() * 1.1,
      c: 'rgba(175,215,235,'
    });
  }
}

initDust(); initFlies(); initFogs();
DRIP_SRC = buildDrips();
initEnemies();
initScarf();

/* ---------------- 输入 ---------------- */
const keys = {};
window.addEventListener('keydown', e => {
  const c = e.code;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(c)) e.preventDefault();
  if (e.repeat) return;
  keys[c] = true;
  if (c === 'ArrowUp' || c === 'KeyW') player.jbuf = JBUF;
  if (c === 'Space' || c === 'KeyJ') if (!e.repeat) doAttack();   // 长按空格 = 蓄气，不重复出刀
  if (c === 'ShiftLeft' || c === 'ShiftRight') tryDash();
  if (c === 'KeyE') releaseSkill();
  if (c === 'Enter') {
    if (state === 'menu') startGame();
    else if (state === 'clear') { if (levelNum === 1) goNext(); else restart(); }
    else if (state === 'gameover') restart();
  }
  if (c === 'KeyR' && (state === 'play' || state === 'clear' || state === 'gameover')) restart();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

/* ============================================================
 *  玩家物理
 * ============================================================ */
function updatePlayer(dt) {
  player.landT = Math.max(0, player.landT - dt);
  const wasDashing = player.dashT > 0;
  player.dashT = Math.max(0, player.dashT - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.blockFxT = Math.max(0, player.blockFxT - dt);
  // 格挡：按住 Q 举盾（移速降低，被击不损血改为攒气）
  player.blocking = state === 'play' && !!keys['KeyQ'] && player.attackT <= 0 && player.dashT <= 0;
  const maxSpd = RUN_SPD * (player.blocking ? .42 : 1);
  // 蓄力：长按空格蓄气（上限 3/4），松手只流失蓄力所得（砍怪攒的气保留）
  const holding = state === 'play' && !!keys['Space'];
  if (holding && !player.wasHolding) { player.holdStartQi = player.qi; player.holdGain = 0; }
  player.holding = holding;
  if (holding) {
    const cap = Math.max(QI_CHARGE_CAP, player.holdStartQi);
    const prev = player.qi;
    player.qi = Math.min(cap, player.qi + QI_CHARGE_RATE * dt);
    player.holdGain += Math.max(0, player.qi - prev);
  } else if (player.wasHolding) {
    player.qi = Math.max(player.holdStartQi, player.qi - player.holdGain);
    player.holdGain = 0;
  }
  player.wasHolding = holding;
  const left  = keys['ArrowLeft'] || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];
  const dir = (right ? 1 : 0) - (left ? 1 : 0);

  if (dir !== 0) {
    const a = player.grounded ? ACC : AIR_ACC;
    player.vx += dir * a * dt;
    player.vx = Math.max(-maxSpd, Math.min(maxSpd, player.vx));
    player.face = dir;
  } else {
    const d = (player.grounded ? DEC : 600) * dt;
    if (Math.abs(player.vx) <= d) player.vx = 0; else player.vx -= Math.sign(player.vx) * d;
  }
  player.faceF += (player.face - player.faceF) * Math.min(1, dt * 12);

  // 闪冲：短时间内锁定高速位移
  if (player.dashT > 0) {
    player.vx = player.dashDir * DASH_V;
    if (!player.grounded && player.vy > 200) player.vy = 200;   // 空中闪冲下坠减缓
  }
  if (wasDashing && player.dashT === 0) {
    player.vx = player.dashDir * 260;   // 冲刺收势：保留少量惯性
  }

  // 跳跃（土狼时间 + 缓冲）
  player.coyote = player.grounded ? COYOTE : player.coyote - dt;
  player.jbuf -= dt;
  if (player.jbuf > 0 && player.coyote > 0) {
    player.vy = -JUMP_V; player.grounded = false;
    player.coyote = 0; player.jbuf = 0;
  }

  // 水平：太高的坎视为墙；悬空方向不拦（那是水！）
  let nx = player.x + player.vx * dt;
  const gN = groundAt(nx);
  if (gN !== null && player.y - gN > STEP_UP) { nx = player.x; player.vx = 0; }
  player.x = Math.max(LV.minX, Math.min(LV.maxX, nx));

  // 垂直
  const gy = groundAt(player.x);
  if (player.grounded) {
    if (gy === null) {
      player.grounded = false;          // 走出地面边缘（下面是水）
    } else {
      const rise = player.y - gy, drop = gy - player.y;
      if (rise > 0 && rise <= STEP_UP) player.y = gy;
      else if (drop > 0 && drop <= STEP_UP) player.y = gy;
      else if (drop > STEP_UP) player.grounded = false;
    }
  }
  if (!player.grounded) {
    player.vy += GRAV * dt;
    player.y += player.vy * dt;
    const g2 = groundAt(player.x);
    if (g2 !== null && player.vy >= 0 && player.y >= g2) {
      if (player.vy > 360) {
        player.landT = 0.16;                        // 落地压缩
        spawnPuffs(player.x, g2, 6, 26);            // 落地尘土
        if (player.vy > 620) addShake(2.5, .16);
      }
      player.y = g2; player.vy = 0; player.grounded = true;
    }
    const cy = ceilAt(player.x);
    if (player.y - PH < cy) { player.y = cy + PH; if (player.vy < 0) player.vy = 0; }
  }
  if (player.grounded) {
    player.phase += Math.abs(player.vx) * dt * 0.05;
    // 奔跑脚步扬尘
    if (Math.abs(player.vx) > 200) {
      player.footAcc = (player.footAcc || 0) + dt;
      if (player.footAcc > .22) { player.footAcc = 0; spawnPuffs(player.x, player.y, 1, 12); }
    }
  }

  // 压力石板：踩上启动机关（第六关，滴水永久停止）
  if (LV.plate && !LV.plate.pressed && state === 'play' && player.grounded
      && Math.abs(player.x - LV.plate.x) < LV.plate.w / 2 - 8) {
    LV.plate.pressed = true;
    plateGlow = 1;
    addShake(2, .15);
    spawnPuffs(LV.plate.x, floorOrWater(LV.plate.x), 5, LV.plate.w * .6);
    hintEl.textContent = '机关启动 · 滴水停了';
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove('show'), 2600);
  }

  // 落水 → 火把熄灭
  if (LV.waterY !== null && player.y > LV.waterY + 6) beginDeath('water');

  // 到达终点（有敌人存活时光门锁定，光点呈绿色）
  if (state === 'play') {
    const d = Math.hypot(player.x - goalX, (player.y - 30) - goalY);
    if (d < 42) {
      if (goalLocked()) {
        if (tGlobal - lastDenyT > 2.2) {
          lastDenyT = tGlobal;
          hintEl.textContent = '暗影仍在游荡 · 光门未开';
          hintEl.classList.add('show');
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => hintEl.classList.remove('show'), 1600);
        }
      } else {
        beginClear();
      }
    }
  }
}

/* ============================================================
 *  火把姿态（绘制与光照共用）
 * ============================================================ */
function torchPose() {
  const f = player.faceF;
  const px = player.x, py = player.y;
  const speedN = Math.min(1, Math.abs(player.vx) / RUN_SPD);
  const bob = player.grounded ? Math.abs(Math.sin(player.phase)) * 1.6 * speedN : 0;
  const breath = Math.sin(tGlobal * 2.1) * .9;
  const dip = player.landT > 0 ? (player.landT / 0.16) * 3.5 : 0;
  let hx, hy, tx, ty, swingP = -1;
  if (player.attackT > 0) {
    // 当前段斩击：预摆 → 快速挥出 → 收势
    const c = COMBOS[player.comboStep - 1] || COMBOS[0];
    swingP = 1 - player.attackT / player.attackDur;
    const shX = px + f * 3, shY = py - 40, armR = 15;
    let ang;
    if (swingP < .3)       { const t = swingP / .3; ang = -.45 + (c.a0 - -.45) * (t * t); }
    else if (swingP < .62) { const t = (swingP - .3) / .32; ang = c.a0 + (c.a1 - c.a0) * (1 - (1 - t) * (1 - t)); }
    else                   { const t = (swingP - .62) / .38; ang = c.a1 + (-.45 - c.a1) * (t * t * (3 - 2 * t)); }
    hx = shX + Math.cos(ang) * armR * f;
    hy = shY + Math.sin(ang) * armR;
    tx = shX + Math.cos(ang) * (armR + 22) * f;
    ty = shY + Math.sin(ang) * (armR + 22);
  } else if (player.blocking) {
    // 格挡姿态：火把竖举身前作火焰盾
    hx = px + f * 15;
    hy = py - 44;
    tx = px + f * 18;
    ty = py - 68;
  } else {
    hx = px + f * 11 + Math.sin(player.phase) * 1.6 * speedN;
    hy = py - 40 - bob * .5 - dip + breath * .4;
    tx = px + f * 17.5 + Math.sin(player.phase) * 1.2 * speedN;
    ty = hy - 21;
  }
  return { f, px, py, speedN, bob, breath, dip, hx, hy, tx, ty, swingP };
}
function torchTip() {
  const p = torchPose();
  return { x: p.tx, y: p.ty };
}

/* ============================================================
 *  粒子更新
 * ============================================================ */
function updateParticles(dt) {
  const tip = torchTip();
  const ptPrev = prevTip;
  // 火焰
  if (state !== 'clear' && state !== 'dying' && state !== 'gameover' && torchLife > .3) {
    // 沿火把尖上一帧→当前位置的路径播种，拖尾贴合实际运动方向
    const sx0 = ptPrev ? ptPrev.x : tip.x, sy0 = ptPrev ? ptPrev.y : tip.y;
    for (let i = 0; i < 2; i++) if (Math.random() < .9) {
      const k = Math.random();
      flames.push({
        x: sx0 + (tip.x - sx0) * k + (Math.random() - .5) * 5,
        y: sy0 + (tip.y - sy0) * k + (Math.random() - .5) * 3,
        vx: player.vx * (player.dashT > 0 ? .25 : .8) + (Math.random() - .5) * 16,
        vy: -30 - Math.random() * 55,
        life: .22 + Math.random() * .3, t: 0, s: 2.2 + Math.random() * 3,
        ember: false
      });
    }
    if (Math.random() < dt * 11) flames.push({
      x: tip.x + (Math.random() - .5) * 4, y: tip.y,
      vx: player.vx * .85 + (Math.random() - .5) * 10, vy: -40 - Math.random() * 30,
      life: .8 + Math.random() * .7, t: 0, s: 1 + Math.random() * 1.2,
      ember: true
    });
    // 劈砍：火把扫过空气拖出火星
    if (player.attackT > 0) {
      const pp = 1 - player.attackT / player.attackDur;
      const stp = player.comboStep;
      if (pp > .18 && pp < .78) {
        for (let i = 0; i < 3; i++) flames.push({
          x: tip.x + (Math.random() - .5) * 6, y: tip.y + (Math.random() - .5) * 6,
          vx: player.face * (40 + Math.random() * 130) + (Math.random() - .5) * 40,
          vy: (stp === 2 ? -90 - Math.random() * 80 : (Math.random() - .5) * 90 - (stp === 3 ? 40 : 20)),
          life: .28 + Math.random() * .32, t: 0, s: 1.1 + Math.random() * 1.9,
          ember: true
        });
      }
    }
    // 蓄气：火星从四周向火把尖吸聚
    if (player.holding && player.qi < Math.max(QI_CHARGE_CAP, player.holdStartQi)) {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.28, r = 42 + Math.random() * 44;
        const px2 = tip.x + Math.cos(a) * r, py2 = tip.y + Math.sin(a) * r;
        flames.push({
          x: px2, y: py2,
          vx: (tip.x - px2) * 4.5 + (Math.random() - .5) * 20,
          vy: (tip.y - py2) * 4.5 - 15,
          life: .3, t: 0, s: 1.1 + Math.random(), ember: true
        });
      }
    }
    // 闪冲：火星向后拖出一条尾迹
    if (player.dashT > 0) {
      for (let i = 0; i < 2; i++) flames.push({
        x: tip.x + (Math.random() - .5) * 5, y: tip.y + (Math.random() - .5) * 5,
        vx: player.vx * .25 + (Math.random() - .5) * 30, vy: (Math.random() - .5) * 50 - 10,
        life: .3 + Math.random() * .3, t: 0, s: 1.1 + Math.random() * 1.6,
        ember: true
      });
      if (Math.random() < .5) spawnPuffs(player.x, player.y, 1, 14);
    }
  }
  prevTip = { x: tip.x, y: tip.y };
  for (let i = flames.length - 1; i >= 0; i--) {
    const p = flames[i];
    p.t += dt;
    if (p.t >= p.life) { flames.splice(i, 1); continue; }
    p.px = p.x; p.py = p.y;
    p.vy -= (p.ember ? 26 : 55) * dt;
    p.vx += (Math.random() - .5) * 60 * dt;
    if (!p.ember && !p.trail) p.vx += Math.sin((p.sw = (p.sw || Math.random() * 6.28) + dt * 7)) * 34 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // 火星拖尾：火星飞行时洒下细小余烬
    if (p.ember) {
      p.trailAcc = (p.trailAcc || 0) + dt;
      while (p.trailAcc > .03) {
        p.trailAcc -= .03;
        flames.push({
          x: p.x + (Math.random() - .5) * 1.5, y: p.y + (Math.random() - .5) * 1.5,
          vx: p.vx * .18, vy: p.vy * .18 + 8,
          life: .16 + Math.random() * .14, t: 0, s: .9, ember: false, trail: true
        });
      }
    }
  }
  if (flames.length > 700) flames.splice(0, flames.length - 700);

  // 围巾：重力垂坠 + 拖尾 + 微风，再约束到等长
  {
    const p = torchPose();
    scarf[0].x = p.px - p.f * 1;
    scarf[0].y = p.py - 37 + p.breath * .5;
    const seg = 5;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < scarf.length; i++) {
        const pt = scarf[i];
        if (pass === 0) {
          pt.y += 90 * dt;                                     // 重力垂坠
          pt.x += (-player.vx * .3 - player.face * 4) * dt;    // 跑动拖尾（温和）
          pt.y += Math.sin(tGlobal * 2.6 + i * 1.3) * 5 * dt;  // 微风
        }
        const dx = pt.x - scarf[i - 1].x, dy = pt.y - scarf[i - 1].y;
        const l = Math.hypot(dx, dy) || 1;
        pt.x = scarf[i - 1].x + dx / l * seg;
        pt.y = scarf[i - 1].y + dy / l * seg;
      }
    }
  }

  // 尘埃
  for (const d of dust) {
    d.ph += dt;
    d.x += (d.vx + Math.sin(d.ph * .8) * 5) * dt;
    d.y += (d.vy + Math.cos(d.ph * .6) * 4) * dt;
    const cy = ceilAt(d.x) + 12, gy = floorOrWater(d.x) - 8;
    if (d.y < cy) d.y = cy; if (d.y > gy) d.y = gy;
    if (d.x < 60) d.x = LV.width - 60;
    if (d.x > LV.width - 60) d.x = 60;
  }

  // 萤火虫
  for (const fl of flies) {
    fl.ph += dt;
    fl.blink += fl.blinkSpd * dt;
    fl.x += (fl.vx + Math.sin(fl.ph * .5) * 6) * dt;
    fl.y += (fl.vy + Math.cos(fl.ph * .4) * 5) * dt;
    const cy = ceilAt(fl.x) + 26, gy = floorOrWater(fl.x) - 16;
    if (fl.y < cy) { fl.y = cy; fl.vy = Math.abs(fl.vy); }
    if (fl.y > gy) { fl.y = gy; fl.vy = -Math.abs(fl.vy); }
    if (fl.x < 70) { fl.x = 70; fl.vx = Math.abs(fl.vx); }
    if (fl.x > LV.width - 70) { fl.x = LV.width - 70; fl.vx = -Math.abs(fl.vx); }
  }

  // 雾气：贴地漂移的水汽
  for (const fg of fogs) {
    fg.ph += dt;
    fg.x += (fg.vx + Math.sin(fg.ph * .4) * 3) * dt;
    const cy = ceilAt(fg.x) + 60, gy = floorOrWater(fg.x) - 12;
    if (fg.y < cy) fg.y = cy;
    if (fg.y > gy) fg.y = gy;
    if (fg.x < 60) fg.x = LV.width - 60;
    if (fg.x > LV.width - 60) fg.x = 60;
  }

  // 滴水：从钟乳石尖坠落
  for (const src of DRIP_SRC) {
    src.t -= dt;
    if (src.t <= 0) {
      drops.push({ x: src.x + (Math.random() - .5) * 3, y: src.y, vy: 0, floor: floorOrWater(src.x) });
      src.t = 3 + Math.random() * 5;
    }
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vy += 1500 * dt;
    d.y += d.vy * dt;
    if (d.y >= d.floor) {
      const gHere = groundAt(d.x);
      if (gHere === null && LV.waterY !== null) {
        ripples.push({ x: d.x, y: LV.waterY + 1, t: 0, life: .9 });        // 滴入水面
      } else {
        const pd = LV.puddles.find(p => Math.abs(d.x - p.x) < p.w / 2 && Math.abs(p.y - d.floor) < 8);
        if (pd) ripples.push({ x: d.x, y: pd.y + 1, t: 0, life: .9 });
      }
      drops.splice(i, 1);
    }
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.t += dt;
    if (r.t >= r.life) ripples.splice(i, 1);
  }

  // 危险滴水（第六关机关）：未踩压力板时周期性凝结坠落
  if (LV.dripHazards && !(LV.plate && LV.plate.pressed)) {
    for (const src of hazSrcs) {
      src.t -= dt;
      if (src.t <= 0) {
        hazDrops.push({ x: src.x + (Math.random() - .5) * 3, y: src.y + 4, vy: 0 });
        src.t = src.period;
      }
    }
  }
  for (let i = hazDrops.length - 1; i >= 0; i--) {
    const d = hazDrops[i];
    d.vy += 1600 * dt;
    d.y += d.vy * dt;
    const fl = floorOrWater(d.x);
    // 命中玩家（火把被浇熄）
    if (state === 'play' && player.invulnT <= 0
        && Math.abs(d.x - player.x) < 13 && d.y > player.y - PH - 4 && d.y < player.y + 6) {
      hazDrops.splice(i, 1);
      beginDeath('drip');
      continue;
    }
    if (d.y >= fl - 2) {
      spawnSplash(d.x, fl - 2);
      hazDrops.splice(i, 1);
    }
  }

  // 尘土
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.t += dt;
    if (p.t >= p.life) { puffs.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= (1 - 1.5 * dt);
  }

  // 敌人（第三关）与战斗计时
  if (player.invulnT > 0) player.invulnT -= dt;
  if (player.attackCd > 0) player.attackCd -= dt;
  if (player.guard < GUARD_MAX) player.guard = Math.min(GUARD_MAX, player.guard + dt / GUARD_REGEN);   // 格挡条缓慢回复
  if (player.hurtFlashT > 0) player.hurtFlashT -= dt;
  if (player.comboResetT > 0) {
    player.comboResetT -= dt;
    if (player.comboResetT <= 0) player.comboStep = 0;   // 连击窗口结束，段数重置
  }
  if (player.attackT > 0) {
    player.attackT -= dt;
    if (player.attackT <= 0) {
      // 转身横劈收势完成：转身，朝向反转
      if (player.comboStep === 4) player.face = -player.face;
      if (player.comboQueued && player.comboResetT > 0
          && player.comboStep < 4 && state === 'play') {
        startSlash(player.comboStep + 1);
      } else {
        player.comboQueued = false;
      }
    }
  }
  if (player.breathT > 0) {
    player.breathT -= dt;
    // 喷火：火焰铺满整个判定锥（远端也着火，与判定框一致）
    const reach = 400;
    for (let i = 0; i < 9; i++) {
      const d = Math.pow(Math.random(), .65) * reach;         // 沿锥长分布
      const spread = (Math.random() - .5) * (14 + d * .42);   // 锥形展开（远端更宽）
      flames.push({
        x: tip.x + player.face * (14 + d) + (Math.random() - .5) * 8,
        y: tip.y + spread * .5,
        vx: player.face * (160 + Math.random() * 160),
        vy: spread * 1.1 + (Math.random() - .5) * 50,
        life: .3 + Math.random() * .35, t: 0,
        s: 2.2 + Math.random() * 2.6 + d * .004,
        ember: Math.random() < .4
      });
    }
    // 核心亮流（近端密集亮白）
    for (let i = 0; i < 3; i++) flames.push({
      x: tip.x + player.face * (10 + Math.random() * 26),
      y: tip.y + (Math.random() - .5) * 12,
      vx: player.face * (430 + Math.random() * 170),
      vy: (Math.random() - .5) * 60,
      life: .22 + Math.random() * .16, t: 0, s: 2 + Math.random() * 1.6,
      ember: false
    });
    addShake(1.2, .07);
    if (Math.random() < .3) spawnPuffs(player.x + player.face * 150, player.y - 30, 1, 40);
  }
  if (player.ultT > 0) {
    player.ultT -= dt;
    // 全屏喷火：火柱只在面朝的半边屏幕喷发
    const gx1 = player.face > 0 ? Math.max(cam.x + 30, player.x - 60) : cam.x + 30;
    const gx2 = player.face > 0 ? cam.x + VIEW_W - 30 : Math.min(cam.x + VIEW_W - 30, player.x + 60);
    if (gx2 - gx1 > 40 && Math.random() < .95) {
      const colX = gx1 + Math.random() * (gx2 - gx1);
      const gy = floorOrWater(colX);
      for (let i = 0; i < 9; i++) flames.push({
        x: colX + (Math.random() - .5) * 14, y: gy - i * (18 + Math.random() * 14),
        vx: (Math.random() - .5) * 40, vy: -140 - Math.random() * 140,
        life: .5 + Math.random() * .3, t: 0, s: 3 + Math.random() * 3,
        ember: i % 2 === 0
      });
      if (Math.random() < .3) spawnPuffs(colX, gy, 1, 24);
    }
  }
  if (player.ultRingT > 0) player.ultRingT -= dt;
  if (player.flashT > 0) player.flashT -= dt;
  // 闪冲残影记录
  if (player.dashT > 0) {
    player.ghostAcc = (player.ghostAcc || 0) + dt;
    while (player.ghostAcc > .03) {
      player.ghostAcc -= .03;
      ghosts.push({ x: player.x, y: player.y, faceF: player.faceF, t: 0, life: .26 });
    }
  }
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i];
    g.t += dt;
    if (g.t >= g.life) ghosts.splice(i, 1);
  }
  for (const en of enemies) {
    if (en.dead) continue;
    en.bob += dt * 6;
    en.hurtT = Math.max(0, en.hurtT - dt);
    // 跳跃扑击阶段：抛物线腾空
    if (en.st === 'leap') {
      en.airV -= 2000 * dt;
      en.air += en.airV * dt;
      en.x += en.lvx * dt;
      if (en.air <= 0) {
        en.air = 0;
        en.st = 'recover';
        en.recT = .5;
        spawnPuffs(en.x, floorOrWater(en.x), 3, 14 * (en.size || 1));
      }
    } else if (en.recT > 0) {
      en.recT -= dt;
      if (en.recT <= 0) en.st = 'chase';
    } else {
      // 追踪 AI：玩家靠近时追过去，否则来回巡逻（追击有拴绳，不会跑进水里）
      const pdx = player.x - en.x;
      const aggro = state === 'play' && Math.abs(pdx) < 280
        && Math.abs(floorOrWater(en.x) - floorOrWater(player.x)) < 80;
      if (aggro) {
        en.dir = pdx >= 0 ? 1 : -1;
        en.x += en.dir * en.chaseSpd * dt;
        en.x = Math.max(en.x1 - 50, Math.min(en.x2 + 50, en.x));
        // 近距离起跳扑击（主要攻击方式）
        if (Math.abs(pdx) < (en.big ? 165 : 135) && Math.abs(floorOrWater(en.x) - floorOrWater(player.x)) < 60 && en.atkCd <= 0) {
          en.st = 'leap';
          en.airV = en.big ? 420 : 360;
          en.lvx = Math.sign(pdx) * Math.min(en.big ? 380 : 320, Math.max(en.big ? 170 : 140, Math.abs(pdx) * (en.big ? 2.4 : 2.2)));
          en.dir = Math.sign(pdx) || en.dir;
          en.atkCd = 1.9;
        }
      } else {
        en.x += en.dir * en.speed * dt;
        if (en.x < en.x1) { en.x = en.x1; en.dir = 1; }
        if (en.x > en.x2) { en.x = en.x2; en.dir = -1; }
      }
    }
    en.atkCd = Math.max(0, en.atkCd - dt);
    // 接触判定：腾空扑击与地面碰撞都算（格挡时盾弧略伸长，更容易挡住）
    if (state === 'play' && player.invulnT <= 0) {
      const d = Math.hypot(en.x - player.x, (floorOrWater(en.x) - en.air - 12) - (player.y - 24));
      const contactR = 26 + 10 * (en.size || 1) + (player.blocking ? 12 : 0);
      if (d < contactR) {
        if (player.blocking && player.guard >= 1) {
          // 格挡成功：不掉血，攒气，消耗 1 段格挡条，敌人被弹开
          player.guard = Math.max(0, player.guard - 1);
          player.qi = Math.min(100, player.qi + QI_BLOCK_GAIN);
          player.invulnT = .5;
          player.blockFxT = .18;
          en.x += (en.x < player.x ? -1 : 1) * 26;
          en.st = 'recover'; en.recT = .45; en.air = 0;
          spawnPuffs(player.x + player.face * 20, player.y - 34, 2, 10);
        } else {
          // 未格挡或格挡条耗尽：正常掉血（被打仍攒气）
          damagePlayer(en.x < player.x ? 1 : -1, en.dmg);
        }
      }
    }
  }

  // 终点光屑
  if (Math.random() < dt * 2.6) sparks.push({
    x: goalX + (Math.random() - .5) * 34, y: goalY + (Math.random() - .5) * 26,
    vx: (Math.random() - .5) * 8, vy: -8 - Math.random() * 10,
    life: 1 + Math.random() * .8, t: 0
  });
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.t += dt;
    if (p.t >= p.life) { sparks.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

/* ============================================================
 *  静态场景预渲染（整关宽度）
 * ============================================================ */
function makeRockTile() {
  const t = document.createElement('canvas');
  t.width = 220; t.height = 220;
  const c = t.getContext('2d');
  // 凹坑 / 矿物亮斑 / 深色斑点
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 220, y = Math.random() * 220, r = Math.random() * 2.2 + .3;
    const p = Math.random();
    c.fillStyle = p < .38 ? 'rgba(0,0,0,.13)' : p < .72 ? 'rgba(255,255,255,.05)' : p < .9 ? 'rgba(255,240,220,.06)' : 'rgba(0,0,0,.07)';
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  // 细裂纹
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 220, y = Math.random() * 220, a = Math.random() * 6.28, len = 8 + Math.random() * 22;
    c.strokeStyle = 'rgba(0,0,0,.10)'; c.lineWidth = .9;
    c.beginPath(); c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    c.stroke();
  }
  // 层理短划
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 220, y = Math.random() * 220;
    c.strokeStyle = 'rgba(255,255,255,.045)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + Math.random() * 10, y + (Math.random() - .5) * 2);
    c.stroke();
  }
  return c.createPattern(t, 'repeat');
}
let rockPattern = makeRockTile();

function tracePath(s, pts, closeY) {
  s.beginPath();
  s.moveTo(pts[0][0], closeY);
  for (const [x, y] of pts) s.lineTo(x, y);
  s.lineTo(pts[pts.length - 1][0], closeY);
  s.closePath();
}
function edgeLine(s, pts) {
  s.beginPath();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
}

/* 地板视觉路径：把垂直坎画成侵蚀感的圆润 S 曲线（物理判定仍是硬坎） */
/* 地板视觉路径：把垂直坎画成侵蚀感的圆润 S 曲线（物理判定仍是硬坎），
   并对平缓段做粗糙化起伏，让石头边缘不光滑 */
const roughCache = new Map();
function roughOf(pts) {
  if (!roughCache.has(pts)) {
    let sd = 91;
    const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const x1 = pts[i][0], y1 = pts[i][1], x2 = pts[i + 1][0], y2 = pts[i + 1][1];
      out.push([x1, y1]);
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.floor(segLen / 22));
      for (let j = 1; j < n; j++) {
        const t = j / n;
        out.push([x1 + (x2 - x1) * t + (rnd() - .5) * 3.5, y1 + (y2 - y1) * t + (rnd() - .5) * 3.5]);
      }
    }
    out.push(pts[pts.length - 1]);
    roughCache.set(pts, out);
  }
  return roughCache.get(pts);
}

function traceFloorVisual(s, pts, closeY) {
  const rp = roughOf(pts);
  const open = closeY === null;
  const n0 = rp.length;
  const sx0 = rp[0][0], sy0 = rp[0][1];
  const lx = rp[n0 - 1][0], ly = rp[n0 - 1][1];
  s.beginPath();
  if (open) {
    s.moveTo(sx0, sy0);
  } else {
    s.moveTo(sx0, closeY);
    // 起始侧壁：微微内收的粗糙面
    s.bezierCurveTo(sx0 - 3, closeY - 16, sx0 + 4, sy0 + 18, sx0, sy0);
  }
  for (let i = 1; i < n0; i++) {
    const x = rp[i][0], y = rp[i][1];
    const py_ = rp[i - 1][1], px_ = rp[i - 1][0];
    if (x === px_) {
      if (y < py_) {
        s.bezierCurveTo(x - 6, py_ - 5, x + 7, y + 8, x + 2, y);
      } else {
        s.bezierCurveTo(x - 6, py_ + 5, x + 7, y - 8, x + 2, y);
      }
    } else {
      s.lineTo(x, y);
    }
  }
  if (open) return;
  // 末尾侧壁：轻微外扩的粗糙面
  s.bezierCurveTo(lx + 4, ly + 16, lx - 3, closeY - 18, lx, closeY);
  s.closePath();
}

/* 洞顶视觉路径（粗糙化） */
function traceCeilVisual(s, pts, closeY) {
  const rp = roughOf(pts);
  const open = closeY === null;
  s.beginPath();
  if (open) s.moveTo(rp[0][0], rp[0][1]);
  else { s.moveTo(rp[0][0], closeY); s.lineTo(rp[0][0], rp[0][1]); }
  for (let i = 1; i < rp.length; i++) s.lineTo(rp[i][0], rp[i][1]);
  if (open) return;
  s.lineTo(rp[rp.length - 1][0], closeY);
  s.closePath();
}

/* 岩面多边形碎面：需在岩体 clip 内调用，营造凿痕断面感 */
function drawFacets(s, seed, count) {
  let sd = seed;
  const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  const picks = ['rgba(255,232,200,.032)', 'rgba(0,0,0,.085)', 'rgba(120,96,70,.05)', 'rgba(0,0,0,.06)'];
  for (let i = 0; i < count; i++) {
    const cx = rnd() * LV.width, cy = rnd() * VIEW_H;
    const r = 14 + rnd() * 34;
    const a1 = rnd() * 6.28;
    s.fillStyle = picks[Math.floor(rnd() * picks.length)];
    s.beginPath();
    s.moveTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    s.lineTo(cx + Math.cos(a1 + 2.1) * r * (.7 + rnd() * .6), cy + Math.sin(a1 + 2.1) * r);
    s.lineTo(cx + Math.cos(a1 + 4.2) * r * (.7 + rnd() * .6), cy + Math.sin(a1 + 4.2) * r);
    s.closePath(); s.fill();
    if (rnd() < .3) {           // 部分碎面加暗色描边，像岩块接缝
      s.strokeStyle = 'rgba(0,0,0,.10)'; s.lineWidth = 1;
      s.stroke();
    }
  }
}

/* 大块风化晕染斑：需在岩体 clip 内调用 */
function drawMottle(s, seed, count) {
  let sd = seed;
  const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const cx = rnd() * LV.width, cy = rnd() * VIEW_H, r = 70 + rnd() * 120;
    const g = s.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = rnd() < .55;
    g.addColorStop(0, dark ? 'rgba(0,0,0,.07)' : 'rgba(255,228,195,.04)');
    g.addColorStop(1, dark ? 'rgba(0,0,0,0)' : 'rgba(255,228,195,0)');
    s.fillStyle = g;
    s.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

/* 表面浮雕：凸起石瘤（暗底+左上亮边）与凹坑（暗心+下缘微光）+ 细颗粒二级噪点
   需在岩体 clip 内调用，给火把照亮的表面增加触感 */
function drawSurfaceRelief(s, seed, count) {
  let sd = seed;
  const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const cx = rnd() * LV.width, cy = rnd() * VIEW_H;
    const r = 3 + rnd() * 6;
    const rot = rnd() * 3;
    if (rnd() < .5) {
      // 凸起小石瘤
      s.fillStyle = 'rgba(0,0,0,.14)';
      s.beginPath(); s.ellipse(cx, cy, r, r * .75, rot, 0, 7); s.fill();
      s.fillStyle = 'rgba(255,235,205,.10)';
      s.beginPath(); s.ellipse(cx - r * .25, cy - r * .3, r * .8, r * .5, rot, 0, 7); s.fill();
    } else {
      // 凹陷坑洞
      s.fillStyle = 'rgba(0,0,0,.18)';
      s.beginPath(); s.ellipse(cx, cy, r * .8, r * .6, 0, 0, 7); s.fill();
      s.strokeStyle = 'rgba(255,235,205,.08)'; s.lineWidth = 1;
      s.beginPath(); s.arc(cx, cy + r * .25, r * .7, .3, 2.8); s.stroke();
    }
  }
  // 细颗粒二级噪点（更细更密，对比更强）
  for (let i = 0; i < count * 3; i++) {
    const cx = rnd() * LV.width, cy = rnd() * VIEW_H;
    s.fillStyle = i % 2 ? 'rgba(0,0,0,.16)' : 'rgba(255,240,215,.10)';
    s.beginPath(); s.arc(cx, cy, .5 + rnd() * .9, 0, 7); s.fill();
  }
}

function drawStalactite(s, x, len, hw) {
  const y0 = ceilAt(x) - 2;
  s.beginPath();
  s.moveTo(x - hw, y0);
  s.quadraticCurveTo(x - hw * .5, y0 + len * .55, x, y0 + len);
  s.quadraticCurveTo(x + hw * .5, y0 + len * .55, x + hw, y0);
  s.closePath(); s.fill();
  // 侧向凸瘤：轮廓不规则
  const side = (x % 7) < 3.5 ? -1 : 1;
  s.beginPath();
  s.moveTo(x + side * hw * .2, y0 + len * .32);
  s.quadraticCurveTo(x + side * hw * 1.15, y0 + len * .5, x + side * hw * .3, y0 + len * .78);
  s.quadraticCurveTo(x + side * hw * .05, y0 + len * .55, x + side * hw * .2, y0 + len * .32);
  s.fill();
  s.strokeStyle = 'rgba(242,224,195,.10)'; s.lineWidth = 1.4;
  s.beginPath();
  s.moveTo(x - hw + 1.5, y0 + 2);
  s.quadraticCurveTo(x - hw * .5, y0 + len * .55, x - .5, y0 + len - 1);
  s.stroke();
}
function drawStalagmite(s, x, h, hw) {
  const y0 = floorOrWater(x) + 2;
  s.beginPath();
  s.moveTo(x - hw, y0);
  s.quadraticCurveTo(x - hw * .45, y0 - h * .5, x, y0 - h);
  s.quadraticCurveTo(x + hw * .45, y0 - h * .5, x + hw, y0);
  s.closePath(); s.fill();
  const side = (x % 5) < 2.5 ? -1 : 1;
  s.beginPath();
  s.moveTo(x + side * hw * .2, y0 - h * .32);
  s.quadraticCurveTo(x + side * hw * 1.15, y0 - h * .5, x + side * hw * .3, y0 - h * .78);
  s.quadraticCurveTo(x + side * hw * .05, y0 - h * .55, x + side * hw * .2, y0 - h * .32);
  s.fill();
  s.strokeStyle = 'rgba(242,224,195,.12)'; s.lineWidth = 1.4;
  s.beginPath();
  s.moveTo(x + hw - 1.5, y0 - 1);
  s.quadraticCurveTo(x + hw * .45, y0 - h * .5, x + .5, y0 - h + 1);
  s.stroke();
}

function renderScene() {
  sceneCanvas.width = Math.round(LV.width * sk);
  sceneCanvas.height = Math.round(VIEW_H * sk);
  const s = sceneCanvas.getContext('2d');
  s.setTransform(sk, 0, 0, sk, 0, 0);

  /* --- 洞窟后壁 --- */
  const bw = s.createLinearGradient(0, 0, 0, VIEW_H);
  bw.addColorStop(0, '#191310'); bw.addColorStop(.42, '#2b2118');
  bw.addColorStop(.72, '#271e15'); bw.addColorStop(1, '#161009');
  s.fillStyle = bw; s.fillRect(0, 0, LV.width, VIEW_H);
  s.save(); s.globalAlpha = .85; s.fillStyle = rockPattern;
  s.fillRect(0, 0, LV.width, VIEW_H); s.restore();

  /* --- 远处岩层纹理 --- */
  s.strokeStyle = 'rgba(0,0,0,.16)'; s.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) {
    const y = 120 + i * 98 + (i * 37) % 24;
    s.beginPath(); s.moveTo(0, y);
    for (let x = 0; x <= LV.width; x += 64)
      s.lineTo(x, y + Math.sin(x * .011 + i * 2.3) * 8);
    s.stroke();
  }
  // 矿脉细线（受光时隐约可见的浅色岩脉）
  s.strokeStyle = 'rgba(225,214,190,.06)'; s.lineWidth = 1.2;
  let sd5 = 23;
  const rnd5 = () => ((sd5 = (sd5 * 9301 + 49297) % 233280) / 233280);
  const veinN = Math.max(2, Math.round(LV.width / 700));
  for (let i = 0; i < veinN; i++) {
    let vx2 = 200 + rnd5() * (LV.width - 400);
    let vy2 = 160 + rnd5() * 260;
    s.beginPath(); s.moveTo(vx2, vy2);
    for (let seg = 0; seg < 5; seg++) {
      vx2 += (rnd5() - .5) * 60; vy2 += 30 + rnd5() * 40;
      s.lineTo(vx2, vy2);
    }
    s.stroke();
  }
  s.strokeStyle = 'rgba(0,0,0,.13)'; s.lineWidth = 1.2;
  const crackN = Math.max(3, Math.round(LV.width / 420));
  let sd4 = 17;
  const rnd4 = () => ((sd4 = (sd4 * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < crackN; i++) {
    const cx = 140 + (LV.width - 280) * ((i + rnd4() * .6) / crackN);
    const top = ceilAt(cx) + 30, bot = floorOrWater(cx) - 30;
    const sway = (rnd4() - .5) * 60;
    s.beginPath(); s.moveTo(cx, top);
    s.bezierCurveTo(cx + sway, top + 70, cx - sway, bot - 70, cx + sway * .4, bot);
    s.stroke();
    // 分叉
    const by = top + (bot - top) * (.35 + rnd4() * .3);
    s.beginPath(); s.moveTo(cx + sway * .3, by);
    s.quadraticCurveTo(cx + sway * .5 + 18, by + 30, cx + sway * .2 + 30, by + 48);
    s.stroke();
  }

  /* --- 水体（画在岩体后面，只在段落间隙露出） --- */
  if (LV.waterY !== null) {
    for (let i = 0; i < LV.spans.length - 1; i++) {
      const gx1 = LV.spans[i].x2, gx2 = LV.spans[i + 1].x1;
      const wg = s.createLinearGradient(0, LV.waterY, 0, VIEW_H + 30);
      wg.addColorStop(0, 'rgba(18,30,38,.62)');
      wg.addColorStop(.3, 'rgba(9,16,22,.8)');
      wg.addColorStop(1, '#04080c');
      s.fillStyle = wg;
      s.fillRect(gx1 - 2, LV.waterY, gx2 - gx1 + 4, VIEW_H + 40 - LV.waterY);
      s.fillStyle = 'rgba(140,195,210,.22)';
      s.fillRect(gx1 - 2, LV.waterY - 1, gx2 - gx1 + 4, 2);
    }
  }

  /* --- 天花板与地板岩体 --- */
  s.fillStyle = '#231a12';
  traceCeilVisual(s, LV.ceil, -40); s.fill();
  s.fillStyle = '#291f15';
  for (const sp of LV.spans) { traceFloorVisual(s, sp.pts, VIEW_H + 40); s.fill(); }

  // 岩体纹理 + 多面体碎面 + 风化晕染 + 表面浮雕（粗糙质感）
  s.save();
  traceCeilVisual(s, LV.ceil, -40); s.clip();
  s.globalAlpha = .9; s.fillStyle = rockPattern; s.fillRect(0, 0, LV.width, VIEW_H);
  drawFacets(s, 101, Math.round(LV.width / 45));
  drawMottle(s, 401, Math.round(LV.width / 300) + 4);
  drawSurfaceRelief(s, 111, Math.round(LV.width / 24));
  s.restore();
  for (let si = 0; si < LV.spans.length; si++) {
    const sp = LV.spans[si];
    s.save();
    traceFloorVisual(s, sp.pts, VIEW_H + 40); s.clip();
    s.globalAlpha = .9; s.fillStyle = rockPattern; s.fillRect(0, 0, LV.width, VIEW_H);
    drawFacets(s, 200 + si * 7, Math.max(6, Math.round((sp.x2 - sp.x1) / 36)));
    drawMottle(s, 500 + si * 31, Math.max(4, Math.round((sp.x2 - sp.x1) / 240)));
    drawSurfaceRelief(s, 800 + si * 17, Math.max(8, Math.round((sp.x2 - sp.x1) / 22)));
    // 地面碎石
    s.fillStyle = 'rgba(0,0,0,.2)';
    let sdP = 700 + si * 3;
    const rndP = () => ((sdP = (sdP * 9301 + 49297) % 233280) / 233280);
    for (let px2 = sp.x1 + 26; px2 < sp.x2 - 18; px2 += 22 + rndP() * 40) {
      const py2 = sp.at(px2) - rndP() * 2.5;
      s.beginPath(); s.arc(px2, py2, .7 + rndP() * 1.2, 0, 7); s.fill();
    }
    s.restore();
  }

  // 接缝处的环境光遮蔽（暗带）
  s.strokeStyle = 'rgba(0,0,0,.22)'; s.lineWidth = 26; s.lineCap = 'round'; s.lineJoin = 'round';
  traceCeilVisual(s, LV.ceil, null); s.stroke();
  for (const sp of LV.spans) { traceFloorVisual(s, sp.pts, null); s.stroke(); }
  // 受光棱线
  s.lineWidth = 2;
  s.strokeStyle = 'rgba(242,216,180,.20)';
  traceCeilVisual(s, LV.ceil, null); s.stroke();
  s.strokeStyle = 'rgba(242,216,180,.26)';
  for (const sp of LV.spans) { traceFloorVisual(s, sp.pts, null); s.stroke(); }
  // 棱线碎屑缺口
  s.fillStyle = 'rgba(0,0,0,.28)';
  let sd3 = 31;
  const rnd3 = () => ((sd3 = (sd3 * 9301 + 49297) % 233280) / 233280);
  for (let x = 70; x < LV.width - 60; x += 46 + rnd3() * 70) {
    const gy = groundAt(x);
    if (gy === null) continue;
    s.fillRect(x, gy - 2.5, 3 + rnd3() * 5, 2.2);
  }

  /* --- 潮湿感：水洼、滴水湿痕、地面湿斑 --- */
  for (const pd of LV.puddles) {
    s.fillStyle = 'rgba(24,40,48,.55)';
    s.beginPath(); s.ellipse(pd.x, pd.y + 1.5, pd.w / 2, 3.2, 0, 0, 7); s.fill();
    s.fillStyle = 'rgba(150,205,220,.16)';
    s.beginPath(); s.ellipse(pd.x - pd.w * .12, pd.y + .8, pd.w / 2.6, 1.8, 0, 0, 7); s.fill();
    s.strokeStyle = 'rgba(0,0,0,.28)'; s.lineWidth = 1.2;
    s.beginPath(); s.ellipse(pd.x, pd.y + 2.6, pd.w / 2, 2.6, 0, 0, 7); s.stroke();
    s.lineWidth = 2;
  }
  s.fillStyle = 'rgba(8,10,12,.15)';
  for (const [x, l] of LV.stalactites) {
    const ty = ceilAt(x) + l;
    const h = 26 + (x * 13) % 34;
    const gw = s.createLinearGradient(0, ty, 0, ty + h);
    gw.addColorStop(0, 'rgba(8,10,12,.20)'); gw.addColorStop(1, 'rgba(8,10,12,0)');
    s.fillStyle = gw;
    s.fillRect(x - 1.6, ty, 3.2, h);
  }
  s.fillStyle = 'rgba(10,13,16,.16)';
  for (const [wx, ww, wy] of LV.wet) {
    s.beginPath(); s.ellipse(wx, wy + 4, ww / 2, 4.5, 0, 0, 7); s.fill();
  }

  /* --- 苔藓 --- */
  const mossCols = ['#3e5c44', '#4d7250', '#5d855a'];
  const mossAt = (mx, my, sc, seed) => {
    let sd = seed;
    const rnd = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    const n = 7 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      s.globalAlpha = .8;
      s.fillStyle = mossCols[Math.floor(rnd() * mossCols.length)];
      s.beginPath();
      s.arc(mx + (rnd() - .5) * 26 * sc, my - rnd() * 6 * sc, (1 + rnd() * 2.4) * sc, 0, 7);
      s.fill();
    }
    s.globalAlpha = 1;
  };
  for (const [mx, my, sc, sd] of LV.moss) mossAt(mx, my, sc, sd);

  // 顶部潮气微粒
  s.fillStyle = 'rgba(190,225,235,.13)';
  let sd2 = 7;
  const rnd2 = () => ((sd2 = (sd2 * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) {
    const sx = 80 + rnd2() * (LV.width - 160);
    s.beginPath();
    s.arc(sx, ceilAt(sx) + 8 + rnd2() * 60, .8 + rnd2() * .9, 0, 7);
    s.fill();
  }

  /* --- 侧壁 --- */
  for (const [wi, wx, ww] of [[0, -40, 88], [1, LV.width - 48, 88]]) {
    s.save();
    s.fillStyle = '#1f1811';
    s.beginPath();
    s.moveTo(wx, -20); s.lineTo(wx + ww, -20);
    s.bezierCurveTo(wx + ww * .3, 200, wx + ww * .75, 480, wx + ww * .35, VIEW_H + 20);
    s.lineTo(wx, VIEW_H + 20); s.closePath(); s.fill();
    s.clip();
    drawFacets(s, 300 + wi * 13, 9);
    drawMottle(s, 313 + wi * 5, 3);
    drawSurfaceRelief(s, 330 + wi * 7, 12);
    s.restore();
    s.strokeStyle = 'rgba(242,216,180,.14)'; s.lineWidth = 2;
    s.beginPath();
    s.moveTo(wx + ww, -20);
    s.bezierCurveTo(wx + ww * .3, 200, wx + ww * .75, 480, wx + ww * .35, VIEW_H + 20);
    s.stroke();
  }

  /* --- 钟乳石 / 石笋 / 石块 --- */
  s.fillStyle = '#261c13';
  for (const [x, l, w] of LV.stalactites) drawStalactite(s, x, l, w);
  for (const [x, h, w] of LV.stalagmites) drawStalagmite(s, x, h, w);

  /* --- 湿滑滴水钟乳石（第六关机关，尖端挂着水珠与湿痕） --- */
  for (const [hx, hl] of (LV.dripHazards || [])) {
    const y0 = ceilAt(hx) - 2;
    s.fillStyle = '#2a3140';
    s.beginPath();
    s.moveTo(hx - 9, y0);
    s.quadraticCurveTo(hx - 4.5, y0 + hl * .7, hx, y0 + hl);
    s.quadraticCurveTo(hx + 4.5, y0 + hl * .7, hx + 9, y0);
    s.closePath(); s.fill();
    s.strokeStyle = 'rgba(175,215,235,.20)'; s.lineWidth = 1.4;
    s.beginPath(); s.moveTo(hx - 2.5, y0 + 5); s.lineTo(hx - .5, y0 + hl - 3); s.stroke();
    s.beginPath(); s.moveTo(hx + 2.5, y0 + 5); s.lineTo(hx + .5, y0 + hl - 6); s.stroke();
    // 下方岩壁湿痕
    const gw2 = s.createLinearGradient(0, y0 + hl, 0, y0 + hl + 52);
    gw2.addColorStop(0, 'rgba(130,175,195,.13)'); gw2.addColorStop(1, 'rgba(130,175,195,0)');
    s.fillStyle = gw2;
    s.fillRect(hx - 7, y0 + hl, 14, 52);
  }
  for (const [x, rx, ry] of LV.rocks) {
    const gy = floorOrWater(x);
    s.fillStyle = '#2b2117';
    s.beginPath(); s.ellipse(x, gy - ry * .35, rx, ry, 0, 0, 7); s.fill();
    // 顶部凸块
    s.beginPath(); s.ellipse(x + rx * .35, gy - ry * .55, rx * .55, ry * .6, 0, 0, 7); s.fill();
    // 底部沉影
    s.fillStyle = 'rgba(0,0,0,.22)';
    s.beginPath(); s.ellipse(x, gy - ry * .05, rx * .9, ry * .4, 0, 0, 7); s.fill();
    s.strokeStyle = 'rgba(242,216,180,.16)'; s.lineWidth = 1.4;
    s.beginPath(); s.ellipse(x, gy - ry * .35, rx, ry, 0, Math.PI * 1.15, Math.PI * 1.95); s.stroke();
  }

  /* --- 垂根 --- */
  s.strokeStyle = 'rgba(20,12,8,.55)'; s.lineWidth = 1.6;
  for (const [x, len] of LV.roots) {
    const y0 = ceilAt(x) + 2;
    for (let b = 0; b < 3; b++) {
      s.beginPath(); s.moveTo(x + (b - 1) * 4, y0);
      s.bezierCurveTo(x + (b - 1) * 9, y0 + len * .4, x - (b - 1) * 7, y0 + len * .7, x + (b - 1) * 5, y0 + len + b * 9);
      s.stroke();
    }
  }

  /* --- 发光苔藓底座（光晕在动态层） --- */
  for (const [cx, n] of LV.mushrooms) {
    const gy = floorOrWater(cx);
    for (let i = 0; i < n; i++) {
      const mx = cx + (i - (n - 1) / 2) * 14 + (i * 5) % 6, h = 9 + (i * 4) % 7;
      s.strokeStyle = '#362a1d'; s.lineWidth = 2.2;
      s.beginPath(); s.moveTo(mx, gy); s.lineTo(mx, gy - h); s.stroke();
      s.fillStyle = '#518f6c';
      s.beginPath(); s.ellipse(mx, gy - h - 2, 5.5, 3.6, 0, 0, 7); s.fill();
      s.fillStyle = 'rgba(214,255,220,.4)';
      s.beginPath(); s.arc(mx - 1.5, gy - h - 3, 1.2, 0, 7); s.fill();
    }
  }
}

/* ---------------- 暗角 ---------------- */
function buildVignette() {
  const v = vigCanvas.getContext('2d');
  v.clearRect(0, 0, VIEW_W, VIEW_H);
  const g = v.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 300, VIEW_W / 2, VIEW_H / 2, 780);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.36)');
  v.fillStyle = g; v.fillRect(0, 0, VIEW_W, VIEW_H);
  const g2 = v.createLinearGradient(0, 0, 0, 90);
  g2.addColorStop(0, 'rgba(0,0,0,.26)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  v.fillStyle = g2; v.fillRect(0, 0, VIEW_W, 90);
}
buildVignette();

/* ============================================================
 *  动态渲染
 * ============================================================ */
function flicker(t) {
  return 1 + .045 * Math.sin(t * 9.3) + .035 * Math.sin(t * 23.7 + 1.7)
           + .028 * Math.sin(t * 5.1 + .6) + .02 * Math.sin(t * 41.2 + 2.1);
}

function drawPlayer(s) {
  const p = torchPose();
  const f = p.f, px = p.px, py = p.py;
  const speedN = p.speedN;
  const col = '#1a1410';

  s.save(); s.globalCompositeOperation = 'lighter';
  const bg = s.createRadialGradient(px, py - 28, 0, px, py - 28, 58);
  bg.addColorStop(0, 'rgba(255,160,70,.09)');
  bg.addColorStop(1, 'rgba(255,150,60,0)');
  s.fillStyle = bg;
  s.fillRect(px - 60, py - 90, 120, 120);
  s.restore();
  s.lineCap = 'round'; s.lineJoin = 'round'; s.strokeStyle = col;

  // 转身横劈：整周旋转
  const spinning = player.attackT > 0 && player.comboStep === 4;
  if (spinning) {
    const t = Math.min(1, (1 - player.attackT / player.attackDur) / .62);
    const ease = 1 - (1 - t) * (1 - t);
    s.save();
    s.translate(px, py - 28);
    s.rotate(f * 6.283 * ease);
    s.translate(-px, -(py - 28));
  }

  const air = !player.grounded;

  // ---- 腿：两段式（髋→膝→脚），步行迈步抬脚，空中收腿 ----
  const L1 = 14, L2 = 14;
  const hipX = px + Math.sin(player.phase) * 1.4 * speedN;
  const hipY = py - 24 - p.dip - (air ? 0 : Math.abs(Math.sin(player.phase)) * 2 * speedN);
  const kneeTo = (fx0, fy0, bend) => {
    let dx = fx0 - hipX, dy = fy0 - hipY;
    let d = Math.hypot(dx, dy);
    const maxD = L1 + L2 - 0.6;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    if (d < 3) d = 3;
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const ux = dx / d, uy = dy / d;
    const mx = hipX + ux * a, my = hipY + uy * a;
    return { kx: mx + uy * h * bend, ky: my - ux * h * bend, fx: hipX + dx, fy: hipY + dy };
  };
  let footA, footB;
  if (air) {
    footA = { x: px + f * 7, y: py - 12 };
    footB = { x: px - f * 6, y: py - 4 };
  } else if (speedN > 0.05) {
    const stride = 16 * speedN, liftA = 8.5 * speedN;
    const fa = Math.sin(player.phase) * stride;
    const fb = Math.sin(player.phase + Math.PI) * stride;
    footA = { x: px + fa, y: floorOrWater(px + fa) - Math.max(0, Math.cos(player.phase)) * liftA };
    footB = { x: px + fb, y: floorOrWater(px + fb) - Math.max(0, Math.cos(player.phase + Math.PI)) * liftA };
  } else {
    const sway = Math.sin(tGlobal * .8);
    footA = { x: px + 4.5, y: floorOrWater(px + 4.5) };
    footB = { x: px - 4.5 + sway * .4, y: floorOrWater(px - 4.5) };
  }
  const legA = kneeTo(footA.x, footA.y, f);
  const legB = kneeTo(footB.x, footB.y, f);
  s.lineWidth = 5;
  for (const leg of [legB, legA]) {
    s.beginPath();
    s.moveTo(hipX, hipY);
    s.lineTo(leg.kx, leg.ky);
    s.lineTo(leg.fx, leg.fy);
    s.stroke();
    s.beginPath(); s.moveTo(leg.fx, leg.fy); s.lineTo(leg.fx + f * 4, leg.fy);
    s.lineWidth = 4; s.stroke(); s.lineWidth = 5;
  }

  // ---- 躯干与头：前倾 + 步态摇滚 + 呼吸 ----
  let leanX = player.vx * 0.014 + f * 1.2 * speedN;
  leanX += Math.sin(player.phase) * 1.6 * speedN;   // 迈步时躯干左右摇滚
  if (p.swingP >= 0) {
    // 劈砍时身体随挥动先仰后倾
    const sw = p.swingP < .3 ? -1 : (p.swingP < .6 ? 1.6 : .5);
    leanX += f * 3.2 * sw;
  }
  const shoulderX = hipX + leanX;
  const shoulderY = hipY - 17 + p.breath * .5;
  const headX = shoulderX + f * 2 + leanX * .3;
  const headY = shoulderY - 10 - (air ? 0 : Math.sin(player.phase * 2) * .9 * speedN) + p.breath * .3;

  // ---- 围巾（画在身体后面）----
  s.strokeStyle = '#9c4a38';
  const widths = [5.5, 4.6, 3.8, 3];
  for (let i = 1; i < scarf.length; i++) {
    s.lineWidth = widths[i] || 3;
    s.beginPath();
    s.moveTo(scarf[i - 1].x, scarf[i - 1].y);
    s.lineTo(scarf[i].x, scarf[i].y);
    s.stroke();
  }

  // ---- 斗篷（身体后面的披布，随风与动作飘动）----
  const sway = Math.max(-9, Math.min(9, -player.vx * .035)) - f * 1.5;
  const rise = Math.max(-10, Math.min(8, player.vy * .03));
  const flut = Math.sin(tGlobal * 3.3) * 2.2 + Math.sin(tGlobal * 5.7) * 1.2;
  s.fillStyle = '#241c11';
  s.beginPath();
  s.moveTo(shoulderX - f * 7, shoulderY + 1);
  s.quadraticCurveTo(shoulderX - f * 9 + sway * .5, hipY + 4, shoulderX - f * 8 + sway, py - 12 + rise + flut * .5);
  s.quadraticCurveTo(shoulderX - f * 3 + sway * .9, py - 4 + rise * .8 + flut, shoulderX + f * 2 + sway * .7, py - 2 + rise * .6);
  s.quadraticCurveTo(shoulderX + f * 7 - sway * .3, py - 9 + rise * .5 - flut * .5, shoulderX + f * 6, shoulderY + 3);
  s.closePath();
  s.fill();

  // ---- 躯干 ----
  s.strokeStyle = col;
  s.lineWidth = 8.5;
  s.beginPath(); s.moveTo(hipX, hipY); s.lineTo(shoulderX, shoulderY); s.stroke();
  // 围巾结
  s.fillStyle = '#9c4a38';
  s.beginPath(); s.arc(shoulderX - f * 2.5, shoulderY + 3.5, 2.6, 0, 7); s.fill();
  // 头
  s.fillStyle = col;
  s.beginPath(); s.arc(headX, headY, 8, 0, 7); s.fill();

  // ---- 兜帽（罩住头顶，后侧垂布随微风与跑动摆动）----
  const hoodSway = Math.sin(tGlobal * 2.4) * 1.5 + Math.max(-4, Math.min(4, -player.vx * .012));
  s.beginPath();
  s.moveTo(headX - f * 8 - hoodSway, headY + 3);
  s.quadraticCurveTo(headX - f * 10.5 - hoodSway, headY - 8, headX - f * 2, headY - 12.5);
  s.quadraticCurveTo(headX + f * 8, headY - 12, headX + f * 8.6, headY + 1);
  s.quadraticCurveTo(headX + f * 5, headY + 9.5, headX - f * 2.5, headY + 8.5);
  s.quadraticCurveTo(headX - f * 6, headY + 7, headX - f * 8 - hoodSway, headY + 3);
  s.closePath();
  s.fill();

  // ---- 后臂 ----
  s.lineWidth = 4;
  if (air) {
    s.beginPath();
    s.moveTo(shoulderX, shoulderY + 1);
    s.quadraticCurveTo(shoulderX - f * 8, shoulderY + 5, shoulderX - f * 11, shoulderY - 4);
    s.stroke();
  } else {
    const swing = Math.sin(player.phase + Math.PI) * 9 * speedN;
    s.beginPath();
    s.moveTo(shoulderX, shoulderY + 1);
    s.quadraticCurveTo(shoulderX - f * 2 + swing * .5, shoulderY + 9, shoulderX - f * 2 + swing, shoulderY + 16);
    s.stroke();
  }

  // ---- 持火把的前臂 ----
  s.beginPath();
  s.moveTo(shoulderX, shoulderY + 1);
  s.quadraticCurveTo((shoulderX + p.hx) / 2 + f, (shoulderY + p.hy) / 2 + 3, p.hx, p.hy);
  s.stroke();
  // 火把柄
  s.strokeStyle = '#6b4a2a'; s.lineWidth = 4;
  s.beginPath(); s.moveTo(p.hx, p.hy); s.lineTo(p.tx, p.ty); s.stroke();
  // 火把头缠绕布
  s.strokeStyle = '#8a5a30'; s.lineWidth = 6.5;
  s.beginPath(); s.moveTo(p.tx - f * 1.5, p.ty + 4.5); s.lineTo(p.tx + f * 1.5, p.ty + .5); s.stroke();
  if (spinning) s.restore();
}

function drawFlameCore(s) {
  if (torchLife <= .04) return;
  const tip = torchTip();
  const fk = flicker(tGlobal);
  s.save(); s.globalCompositeOperation = 'lighter';
  s.globalAlpha = torchLife;
  const r1 = 9 * (0.9 + fk * .2), jy = Math.sin(tGlobal * 31) * 1.2;
  const layers = [
    ['#ff6a1a', r1 * 1.5, 0, .5], ['#ffa640', r1 * .95, jy * .5, .75], ['#ffe9a8', r1 * .45, jy, .95]
  ];
  for (const [c, r, oy, a] of layers) {
    s.fillStyle = c; s.globalAlpha = a * torchLife;
    s.beginPath(); s.ellipse(tip.x, tip.y - 4 + oy, r * .72, r * 1.25, 0, 0, 7); s.fill();
  }
  s.restore();
}

function drawFlameParticles(s) {
  s.save(); s.globalCompositeOperation = 'lighter';
  for (const p of flames) {
    const lt = 1 - p.t / p.life;
    const r = p.s * (p.ember ? 1 : lt);
    if (p.trail) {
      // 拖尾余烬：细小、快速变暗
      s.fillStyle = `rgba(255,170,80,${(.32 * lt).toFixed(3)})`;
      s.beginPath(); s.arc(p.x, p.y, p.s * lt + .4, 0, 7); s.fill();
    } else if (p.ember) {
      // 火星：带运动方向的拖尾条纹
      const px = p.px !== undefined ? p.px : p.x, py = p.py !== undefined ? p.py : p.y;
      s.strokeStyle = `rgba(255,190,110,${(.45 * lt).toFixed(3)})`;
      s.lineWidth = Math.max(.6, r * .8);
      s.beginPath(); s.moveTo(px, py); s.lineTo(p.x, p.y); s.stroke();
      s.fillStyle = `rgba(255,190,110,${(.5 * lt).toFixed(3)})`;
      s.beginPath(); s.arc(p.x, p.y, r, 0, 7); s.fill();
    } else {
      s.fillStyle = `rgba(255,120,30,${(.4 * lt).toFixed(3)})`;
      s.beginPath(); s.arc(p.x, p.y, r * 1.6, 0, 7); s.fill();
      s.fillStyle = `rgba(255,214,130,${(.8 * lt).toFixed(3)})`;
      s.beginPath(); s.arc(p.x, p.y, r, 0, 7); s.fill();
    }
  }
  s.restore();
}

function drawDust(s) {
  s.save();
  for (const d of dust) {
    s.fillStyle = `rgba(255,228,190,${d.a})`;
    s.beginPath(); s.arc(d.x, d.y, d.s, 0, 7); s.fill();
  }
  s.restore();
}

function clearingProgress() {
  return state === 'clearing' ? Math.min(1, clearingT / 1.5) : (state === 'clear' ? 1 : 0);
}

function drawGoal(s, flare) {
  const locked = goalLocked();
  const fy = goalY + Math.sin(tGlobal * 1.3) * 5;
  const pulse = .8 + .2 * Math.sin(tGlobal * 2.1);
  const halo1 = locked ? 'rgba(150,235,165,' : 'rgba(255,236,196,';
  const halo2 = locked ? 'rgba(140,228,160,' : 'rgba(255,228,170,';
  const halo3 = locked ? 'rgba(130,220,150,0)' : 'rgba(255,220,160,0)';
  s.save(); s.globalCompositeOperation = 'lighter';
  const haloR = (52 + 42 * pulse) * (1 + flare * 2.6);
  let g = s.createRadialGradient(goalX, fy, 0, goalX, fy, haloR);
  g.addColorStop(0, `${halo1}${(.36 + flare * .5) * pulse + flare * .4})`);
  g.addColorStop(.4, `${halo2}${(.14 + flare * .2) * pulse})`);
  g.addColorStop(1, halo3);
  s.fillStyle = g;
  s.beginPath(); s.arc(goalX, fy, haloR, 0, 7); s.fill();
  s.fillStyle = locked ? `rgba(235,255,240,${.9 + flare * .1})` : `rgba(255,252,240,${.9 + flare * .1})`;
  s.beginPath(); s.arc(goalX, fy, 6 + pulse * 1.6, 0, 7); s.fill();
  s.fillStyle = locked ? 'rgba(220,250,230,.55)' : 'rgba(255,248,225,.55)';
  s.beginPath(); s.arc(goalX, fy, 12 + pulse * 4, 0, 7); s.fill();
  s.strokeStyle = locked
    ? `rgba(170,240,185,${(.34 + flare * .25) * pulse})`
    : `rgba(255,240,200,${(.28 + flare * .25) * pulse})`;
  s.lineWidth = 1.4;
  s.beginPath(); s.arc(goalX, fy, 18 + pulse * 6, 0, 7); s.stroke();
  s.restore();
  s.save(); s.globalCompositeOperation = 'lighter';
  for (const p of sparks) {
    const lt = 1 - p.t / p.life;
    s.fillStyle = `rgba(255,222,150,${(.7 * lt).toFixed(3)})`;
    s.beginPath(); s.arc(p.x, p.y, 1.5 * lt + .5, 0, 7); s.fill();
  }
  s.restore();
}

function drawMushroomGlow(s) {
  s.save(); s.globalCompositeOperation = 'lighter';
  for (const [cx, n] of LV.mushrooms) {
    const gy = floorOrWater(cx);
    for (let i = 0; i < n; i++) {
      const mx = cx + (i - (n - 1) / 2) * 14 + (i * 5) % 6, h = 9 + (i * 4) % 7;
      const a = .05 + .02 * Math.sin(tGlobal * 1.7 + i * 2.1 + cx);
      const g = s.createRadialGradient(mx, gy - h, 0, mx, gy - h, 46);
      g.addColorStop(0, `rgba(152,235,172,${a})`);
      g.addColorStop(1, 'rgba(152,235,172,0)');
      s.fillStyle = g;
      s.beginPath(); s.arc(mx, gy - h, 46, 0, 7); s.fill();
    }
  }
  s.restore();
}

/* 尘土/水花粒子（落地/奔跑/闪冲扬尘，滴水溅花） */
function drawPuffs(s) {
  s.save();
  for (const p of puffs) {
    const lt = 1 - p.t / p.life;
    s.fillStyle = p.c + (.22 * lt).toFixed(3) + ')';
    s.beginPath(); s.arc(p.x, p.y, p.r * (1 + p.t * 2), 0, 7); s.fill();
  }
  s.restore();
}

/* 萤火虫：画在黑暗遮罩之后，是黑暗里的小灯笼 */
function drawFlies(s) {
  s.save(); s.globalCompositeOperation = 'lighter';
  for (const fl of flies) {
    const p = Math.sin(fl.blink);
    const a = (0.2 + 0.8 * Math.max(0, p) * Math.max(0, p)) * .9;
    if (a < .02) continue;
    const g = s.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 11);
    g.addColorStop(0, `rgba(255,214,120,${(a * .4).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,214,120,0)');
    s.fillStyle = g;
    s.beginPath(); s.arc(fl.x, fl.y, 11, 0, 7); s.fill();
    s.fillStyle = `rgba(255,238,180,${a.toFixed(3)})`;
    s.beginPath(); s.arc(fl.x, fl.y, fl.r, 0, 7); s.fill();
  }
  s.restore();
}

/* 敌人：暗影虫本体（世界层，黑暗会遮住它，但眼睛在遮罩上发光） */
function drawEnemies(s) {
  for (const en of enemies) {
    if (en.dead) continue;
    const sz = en.size || 1;
    const gy = floorOrWater(en.x);
    const bob = Math.sin(en.bob) * 1.6;
    const cx = en.x, cy = gy - en.air - 11 + bob;
    s.save();
    if (en.hurtT > 0) {
      const k = Math.sin(en.hurtT * 40) * 2;
      s.translate(k, 0);
    }
    s.fillStyle = en.hurtT > 0 ? '#54495c' : '#191420';
    s.beginPath();
    s.ellipse(cx, cy, 15 * sz, (10 - Math.abs(bob) * .5) * sz * (en.st === 'leap' ? 1.12 : 1), 0, 0, 7);
    s.fill();
    // 小触足（腾空时收起垂下）
    s.strokeStyle = '#191420'; s.lineWidth = 3 * sz; s.lineCap = 'round';
    const wob = Math.sin(en.bob * 2) * 3;
    const footY = en.air > .5 ? cy + 12 * sz : gy;
    s.beginPath(); s.moveTo(cx - 6 * sz, cy + 7); s.lineTo(cx - 6 * sz + wob, footY); s.stroke();
    s.beginPath(); s.moveTo(cx + 6 * sz, cy + 7); s.lineTo(cx + 6 * sz - wob, footY); s.stroke();
    s.restore();
  }
}

/* 敌人眼睛：画在黑暗遮罩之上，黑暗里也看得见（精英偏红） */
function drawEnemyEyes(s) {
  s.save(); s.globalCompositeOperation = 'lighter';
  for (const en of enemies) {
    if (en.dead) continue;
    const sz = en.size || 1;
    if (en.x - cam.x < -60 || en.x - cam.x > VIEW_W + 60) continue;
    if (Math.sin(en.bob * .7) < -.92) continue;   // 偶尔眨眼
    const gy = floorOrWater(en.x);
    const cy = gy - en.air - 13 + Math.sin(en.bob) * 1.6;
    const ex = en.x + en.dir * 5 * sz;
    s.fillStyle = en.hurtT > 0 ? 'rgba(255,225,190,.95)'
      : en.big ? 'rgba(255,110,70,.9)' : 'rgba(255,150,90,.85)';
    s.beginPath(); s.arc(ex - 3.5 * sz, cy - 2, 1.7 * sz, 0, 7); s.fill();
    s.beginPath(); s.arc(ex + 3.5 * sz, cy - 2, 1.7 * sz, 0, 7); s.fill();
    const g = s.createRadialGradient(ex, cy - 2, 0, ex, cy - 2, 14 * sz);
    g.addColorStop(0, `rgba(255,150,90,${(.14 * sz).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,150,90,0)');
    s.fillStyle = g;
    s.beginPath(); s.arc(ex, cy - 2, 14 * sz, 0, 7); s.fill();
  }
  s.restore();
}

/* 挥击光弧：跟随当前段斩击的角度扫过的余晖 + 先导亮边 */
function drawAttackFx(s) {
  if (player.attackT <= 0) return;
  const prog = 1 - player.attackT / player.attackDur;
  const c = COMBOS[player.comboStep - 1] || COMBOS[0];
  const heavy = player.comboStep === 3;
  const f = player.face;
  s.save(); s.globalCompositeOperation = 'lighter';
  s.translate(player.x + f * 3, player.y - 40);
  s.scale(f, 1);
  const reach = heavy ? 42 : 34;
  let cur, alpha = .14, lw = 4;
  if (prog < .3) {
    const t = prog / .3;
    cur = -.45 + (c.a0 - -.45) * (t * t);          // 预摆微光
    alpha = .12 + .12 * t;
  } else if (prog < .62) {
    const t = (prog - .3) / .32, w = 1 - (1 - t) * (1 - t);
    cur = c.a0 + (c.a1 - c.a0) * w;                // 快速挥出的亮弧
    alpha = .22 + .5 * w; lw = (heavy ? 5 : 3.5) + 5 * w;
  } else {
    const t = (prog - .62) / .38;
    cur = c.a1 + (-.45 - c.a1) * (t * t * (3 - 2 * t));
    alpha = .55 * (1 - t); lw = 3.5;
  }
  s.strokeStyle = `rgba(255,205,125,${alpha.toFixed(3)})`;
  s.lineWidth = lw; s.lineCap = 'round';
  s.beginPath();
  s.arc(0, 0, reach, Math.min(c.a0, cur), Math.max(c.a0, cur));
  s.stroke();
  // 先导亮边
  if (prog >= .3 && prog < .7) {
    s.strokeStyle = `rgba(255,240,200,${Math.min(1, alpha * 1.3).toFixed(3)})`;
    s.lineWidth = 2;
    s.beginPath(); s.arc(0, 0, reach + 3, cur - .28, cur + .02); s.stroke();
  }
  s.restore();
}

/* 喷火火焰锥的体积光：长度与判定框一致，全程稳定覆盖 */
function drawBreathFx(s) {
  if (player.breathT <= 0) return;
  const k = player.breathT / .75;                    // 1 → 0
  const f = player.face;
  const reach = 395 + Math.sin(tGlobal * 29) * 16;   // 与判定距离 420 基本一致（含抖动）
  const halfY = 46 + 8 * (1 - k);
  s.save(); s.globalCompositeOperation = 'lighter';
  s.translate(player.x + f * 12, player.y - 40);
  s.scale(f, 1);
  const g = s.createLinearGradient(0, 0, reach, 0);
  g.addColorStop(0, `rgba(255,224,155,${(.42 + .18 * Math.sin(tGlobal * 27)).toFixed(3)})`);
  g.addColorStop(.55, `rgba(255,152,60,${(.24 + .08 * Math.sin(tGlobal * 23)).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,120,40,0)');
  s.fillStyle = g;
  s.beginPath();
  s.moveTo(0, 0);
  s.quadraticCurveTo(reach * .45, -halfY * .95, reach, -halfY * .8);
  s.quadraticCurveTo(reach * .62, halfY * .1, reach * .56, halfY * .28);
  s.quadraticCurveTo(reach * .4, halfY * .95, 0, 0);
  s.fill();
  s.restore();
}

/* 火焰盾：格挡姿态的火弧与格挡成功闪光 */
function drawBlockFx(s) {
  if (levelNum !== 3) return;
  const f = player.faceF;
  const cx = player.x + f * 20, cy = player.y - 34;
  s.save(); s.globalCompositeOperation = 'lighter';
  if (player.blocking) {
    s.strokeStyle = `rgba(255,185,95,${(.28 + .1 * Math.sin(tGlobal * 9)).toFixed(3)})`;
    s.lineWidth = 3;
    s.beginPath();
    if (f > 0) s.arc(cx, cy, 20, -1.15, 1.15);
    else s.arc(cx, cy, 20, Math.PI - 1.15, Math.PI + 1.15);
    s.stroke();
  }
  if (player.blockFxT > 0) {
    const k = player.blockFxT / .18;
    s.strokeStyle = `rgba(255,238,190,${(.85 * k).toFixed(3)})`;
    s.lineWidth = 4 * k + 1;
    s.beginPath();
    if (f > 0) s.arc(cx, cy, 22 + (1 - k) * 12, -.9, .9);
    else s.arc(cx, cy, 22 + (1 - k) * 12, Math.PI - .9, Math.PI + .9);
    s.stroke();
  }
  s.restore();
}

/* 压力石板（第六关机关） */
function drawPlate(s) {
  if (!LV.plate) return;
  const pd = LV.plate;
  const gy = floorOrWater(pd.x);
  const sunk = pd.pressed ? 2.5 : 0;
  s.fillStyle = pd.pressed ? '#2e3440' : '#3a3f4c';
  s.beginPath(); s.ellipse(pd.x, gy - 3 + sunk * .4, pd.w / 2, 7, 0, 0, 7); s.fill();
  s.strokeStyle = 'rgba(242,216,180,.22)'; s.lineWidth = 1.4;
  s.beginPath(); s.ellipse(pd.x, gy - 3 + sunk * .4, pd.w / 2, 7, 0, 0, 7); s.stroke();
  // 符文环
  const ra = pd.pressed ? .5 + .25 * Math.sin(tGlobal * 3) + plateGlow * .4 : .16 + .08 * Math.sin(tGlobal * 1.8);
  const rc = pd.pressed ? `rgba(255,190,110,${ra.toFixed(3)})` : `rgba(150,200,220,${(ra * .7).toFixed(3)})`;
  s.strokeStyle = rc; s.lineWidth = 2;
  s.beginPath(); s.ellipse(pd.x, gy - 4 + sunk * .4, pd.w / 3.2, 3.4, 0, 0, 7); s.stroke();
  // 未触发时的呼吸微光（引导注意）
  if (!pd.pressed) {
    s.save(); s.globalCompositeOperation = 'lighter';
    const g = s.createRadialGradient(pd.x, gy - 4, 0, pd.x, gy - 4, 42);
    g.addColorStop(0, `rgba(150,200,220,${(.10 + .05 * Math.sin(tGlobal * 2)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(150,200,220,0)');
    s.fillStyle = g;
    s.beginPath(); s.arc(pd.x, gy - 4, 42, 0, 7); s.fill();
    s.restore();
  }
}

/* 危险滴水：尖端凝结的水珠（预警）与坠落的水滴 */
function drawHazDrips(s) {
  if (!LV.dripHazards) return;
  s.save();
  if (!(LV.plate && LV.plate.pressed)) {
    s.fillStyle = 'rgba(175,215,235,.9)';
    for (const src of hazSrcs) {
      if (src.x - cam.x < -40 || src.x - cam.x > VIEW_W + 40) continue;
      const growK = Math.max(0, Math.min(1, 1 - src.t / .55));
      if (growK > 0) {
        s.beginPath();
        s.ellipse(src.x, src.y + 2 + growK * 3, 1.1 + growK * 1.6, 1.6 + growK * 2.6, 0, 0, 7);
        s.fill();
      }
    }
  }
  // 下落中的致命水滴
  s.fillStyle = 'rgba(185,225,245,.9)';
  for (const d of hazDrops) {
    s.beginPath(); s.ellipse(d.x, d.y, 1.4, 3.4, 0, 0, 7); s.fill();
  }
  s.restore();
}

/* 大招冲击波环 */
function drawUltRing(s) {
  if (player.ultRingT <= 0) return;
  const k = player.ultRingT / .45;
  const r = (1 - k) * 520 + 30;
  s.save(); s.globalCompositeOperation = 'lighter';
  s.strokeStyle = `rgba(255,200,120,${(.5 * k).toFixed(3)})`;
  s.lineWidth = 6 * k + 1.5;
  s.beginPath(); s.arc(player.x, player.y - 30, r, 0, 7); s.stroke();
  s.restore();
}

/* 闪冲残影：橙热色的速度残像 */
function drawGhosts(s) {
  s.save(); s.globalCompositeOperation = 'lighter';
  for (const g of ghosts) {
    const k = 1 - g.t / g.life;
    s.globalAlpha = .3 * k;
    s.fillStyle = 'rgba(255,180,110,1)';
    s.beginPath(); s.ellipse(g.x, g.y - 26, 9, 18, 0, 0, 7); s.fill();
    s.beginPath(); s.arc(g.x + g.faceF * 1.5, g.y - 51, 8, 0, 7); s.fill();
    s.strokeStyle = 'rgba(255,220,170,.4)';
    s.lineWidth = 1.2;
    s.beginPath(); s.moveTo(g.x - g.faceF * 26, g.y - 34); s.lineTo(g.x - g.faceF * 12, g.y - 34); s.stroke();
  }
  s.globalAlpha = 1;
  s.restore();
}

/* HUD：生命 / 气（仅第三关） */
function drawHUD(s) {
  if (levelNum < 3) return;
  s.save();
  s.font = '12px "Microsoft YaHei", "PingFang SC", sans-serif';
  s.fillStyle = 'rgba(240,220,180,.78)';
  s.fillText('生命', 22, 30);
  drawBar(s, 58, 20, 190, 13, player.hp / 100, '#b85446');
  s.fillStyle = 'rgba(240,220,180,.78)';
  s.fillText('气', 22, 52);
  if (player.holding) s.globalAlpha = .65 + .35 * Math.abs(Math.sin(tGlobal * 9));
  drawBar(s, 58, 41, 190, 10, player.qi / 100, '#e0893e');
  s.globalAlpha = 1;
  // 3/4 蓄气上限刻度
  s.fillStyle = 'rgba(242,216,180,.4)';
  s.fillRect(58 + 190 * .75 - 1, 39, 2, 13);
  // 格挡条（3 段，缓慢回复）
  s.fillStyle = 'rgba(240,220,180,.6)';
  s.fillText('格挡', 22, 72);
  const gFull = Math.floor(player.guard + 1e-6);
  for (let i = 0; i < 3; i++) {
    const px3 = 58 + i * 20;
    const filled = i < gFull;
    const partial = (!filled && i === gFull) ? player.guard - i : 0;
    s.fillStyle = 'rgba(10,8,6,.55)';
    s.fillRect(px3 - 1, 62, 17, 10);
    s.fillStyle = filled ? '#9fb8c9' : 'rgba(159,184,201,.18)';
    s.fillRect(px3, 63, 15, 8);
    if (partial > 0) {
      s.fillStyle = '#9fb8c9';
      s.fillRect(px3, 63, 15 * Math.min(1, partial), 8);
    }
  }
  if (player.guard < 1) {
    s.fillStyle = `rgba(255,150,110,${(.5 + .5 * Math.abs(Math.sin(tGlobal * 6))).toFixed(2)})`;
    s.fillText('格挡耗尽', 122, 71);
  }
  // 释放/蓄气提示
  if (player.holding) {
    s.fillStyle = `rgba(255,220,150,${(.55 + .45 * Math.abs(Math.sin(tGlobal * 8))).toFixed(2)})`;
    s.fillText('蓄气中 · 松手流失', 258, 52);
  } else if (player.qi >= 100) {
    s.fillStyle = `rgba(255,235,170,${(.6 + .4 * Math.abs(Math.sin(tGlobal * 5))).toFixed(2)})`;
    s.fillText('气满 · E 全屏喷火', 258, 52);
  } else if (player.qi >= 75) {
    s.fillStyle = 'rgba(240,220,180,.65)';
    s.fillText('E · 喷火', 258, 52);
  }
  // 释放提示
  if (player.qi >= 100) {
    s.fillStyle = `rgba(255,235,170,${(.6 + .4 * Math.abs(Math.sin(tGlobal * 5))).toFixed(2)})`;
    s.fillText('气满 · E 全屏喷火', 258, 52);
  } else if (player.qi >= 75) {
    s.fillStyle = 'rgba(240,220,180,.65)';
    s.fillText('E · 喷火', 258, 52);
  }
  // 剩余暗影数（无敌人关卡隐藏）
  if (enemies.length) {
    s.fillStyle = 'rgba(240,220,180,.6)';
    s.fillText('暗影 · ' + enemies.filter(e => !e.dead).length, 22, 72);
  }
  s.restore();
}
function drawBar(s, x, y, w, h, pct, col) {
  pct = Math.max(0, Math.min(1, pct));
  s.fillStyle = 'rgba(10,8,6,.55)';
  s.fillRect(x - 1, y - 1, w + 2, h + 2);
  s.fillStyle = 'rgba(58,32,20,.8)';
  s.fillRect(x, y, w, h);
  s.fillStyle = col;
  s.fillRect(x, y, w * pct, h);
  s.strokeStyle = 'rgba(242,216,180,.25)';
  s.lineWidth = 1;
  s.strokeRect(x + .5, y + .5, w - 1, h - 1);
}

/* 潮湿氛围的动态层：雾气、水面微光与倒影、涟漪、水滴 */
function drawDamp(s) {
  // 雾气
  s.save();
  for (const fg of fogs) {
    const a = .03 + .012 * Math.sin(fg.ph * .7);
    const g = s.createRadialGradient(fg.x, fg.y, 0, fg.x, fg.y, fg.r);
    g.addColorStop(0, `rgba(165,195,205,${a.toFixed(3)})`);
    g.addColorStop(1, 'rgba(165,195,205,0)');
    s.fillStyle = g;
    s.beginPath(); s.arc(fg.x, fg.y, fg.r, 0, 7); s.fill();
  }
  s.restore();

  // 水洼微光 + 火把倒影
  s.save(); s.globalCompositeOperation = 'lighter';
  for (const pd of LV.puddles) {
    const a = .08 + .035 * Math.sin(tGlobal * .8 + pd.x);
    s.fillStyle = `rgba(160,210,225,${a.toFixed(3)})`;
    s.beginPath(); s.ellipse(pd.x - pd.w * .1, pd.y + .8, pd.w / 2.8, 1.6, 0, 0, 7); s.fill();
    const dist = Math.hypot(pd.x - player.x, pd.y - (player.y - 30));
    if (dist < 360 && torchLife > .1) {
      const kk = 1 - dist / 360;
      const g = s.createLinearGradient(0, pd.y - 4, 0, pd.y + 30);
      g.addColorStop(0, `rgba(255,150,60,${(.16 * kk * torchLife).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,150,60,0)');
      s.fillStyle = g;
      s.beginPath(); s.ellipse(pd.x, pd.y + 12, pd.w * .3, 16, 0, 0, 7); s.fill();
    }
  }
  // 大水面：波光、漂浮微光、火把倒影
  if (LV.waterY !== null) {
    for (let i = 0; i < LV.spans.length - 1; i++) {
      const gx1 = LV.spans[i].x2, gx2 = LV.spans[i + 1].x1;
      if (gx2 - gx1 < 20) continue;
      if (gx2 - cam.x < -40 || gx1 - cam.x > VIEW_W + 40) continue;   // 视口外跳过
      const a = .05 + .03 * Math.sin(tGlobal * 1.1 + gx1 * .05);
      s.fillStyle = `rgba(150,205,225,${a.toFixed(3)})`;
      s.fillRect(gx1, LV.waterY - 1, gx2 - gx1, 2);
      for (let j = 0; j < 3; j++) {
        const gx = gx1 + ((tGlobal * (14 + j * 7) + j * 53 + gx1) % (gx2 - gx1));
        s.fillStyle = 'rgba(180,225,240,.10)';
        s.beginPath(); s.ellipse(gx, LV.waterY + 5 + j * 8, 9 - j * 2, 1.2, 0, 0, 7); s.fill();
      }
      const cxm = (gx1 + gx2) / 2;
      const dist = Math.hypot(cxm - player.x, LV.waterY - (player.y - 30));
      if (dist < 380 && torchLife > .1) {
        const kk = 1 - dist / 380;
        const g = s.createLinearGradient(0, LV.waterY - 2, 0, LV.waterY + 42);
        g.addColorStop(0, `rgba(255,150,60,${(.2 * kk * torchLife).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,150,60,0)');
        s.fillStyle = g;
        const rx = Math.min(gx2 - 14, Math.max(gx1 + 14, player.x));
        s.beginPath(); s.ellipse(rx, LV.waterY + 18, 22, 24, 0, 0, 7); s.fill();
      }
    }
  }
  s.restore();

  // 涟漪
  s.save();
  for (const r of ripples) {
    const k2 = 1 - r.t / r.life;
    const rx = 3 + r.t * 30;
    s.strokeStyle = `rgba(190,225,235,${(.4 * k2).toFixed(3)})`;
    s.lineWidth = 1.1;
    s.beginPath(); s.ellipse(r.x, r.y, rx, rx * .28, 0, 0, 7); s.stroke();
  }
  s.restore();

  // 下落中的水滴
  s.save();
  s.fillStyle = 'rgba(175,215,230,.85)';
  for (const d of drops) {
    s.beginPath(); s.ellipse(d.x, d.y, 1.2, 2.6, 0, 0, 7); s.fill();
  }
  s.restore();
}

/* ---------------- 黑暗遮罩 ---------------- */
function renderDarkness() {
  const tip = torchTip();
  const tx = tip.x - cam.x + shakeOx, ty = tip.y + shakeOy;
  const fk = flicker(tGlobal);
  const R = (LV.torchR ?? 330) * fk * (0.94 + .06 * Math.sin(tGlobal * 1.1)) * torchLife;
  const baseA = (.942 + .012 * Math.sin(tGlobal * 2.2) + .007 * Math.sin(tGlobal * 7.7)) * darknessMult;

  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, VIEW_W, VIEW_H);
  dctx.fillStyle = `rgba(14,9,5,${baseA.toFixed(4)})`;
  dctx.fillRect(0, 0, VIEW_W, VIEW_H);

  dctx.globalCompositeOperation = 'destination-out';

  if (R > 4) {
    const g = dctx.createRadialGradient(tx, ty, 0, tx, ty, R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(.38, 'rgba(0,0,0,.74)');
    g.addColorStop(.72, 'rgba(0,0,0,.26)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.fillRect(tx - R, ty - R, R * 2, R * 2);
  }

  // 喷火照亮锥形区域（火是光源，照亮自己的判定范围）
  if (player.breathT > 0) {
    const bk = player.breathT / .75;
    const bx = tx + player.face * 200, by = ty + shakeOy;
    let bl = dctx.createRadialGradient(bx, by, 0, bx, by, 250);
    bl.addColorStop(0, `rgba(0,0,0,${(.7 * bk).toFixed(3)})`);
    bl.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = bl;
    dctx.fillRect(bx - 250, by - 250, 500, 500);
    const bx2 = tx + player.face * 370, by2 = ty + shakeOy;
    bl = dctx.createRadialGradient(bx2, by2, 0, bx2, by2, 220);
    bl.addColorStop(0, `rgba(0,0,0,${(.5 * bk).toFixed(3)})`);
    bl.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = bl;
    dctx.fillRect(bx2 - 220, by2 - 220, 440, 440);
  }

  // 终点光点
  const gx = goalX - cam.x + shakeOx;
  const fy = goalY + Math.sin(tGlobal * 1.3) * 5 + shakeOy;
  const GR = (265 + 22 * Math.sin(tGlobal * 2.1)) * (1 + clearingProgress() * 1.8);
  const g2 = dctx.createRadialGradient(gx, fy, 0, gx, fy, GR);
  g2.addColorStop(0, `rgba(0,0,0,${(.88 * darknessMult).toFixed(3)})`);
  g2.addColorStop(.45, `rgba(0,0,0,${(.38 * darknessMult).toFixed(3)})`);
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = g2;
  dctx.fillRect(gx - GR, fy - GR, GR * 2, GR * 2);

  // 苔藓微光
  for (const [cx] of LV.mushrooms) {
    const mx = cx - cam.x + shakeOx;
    if (mx < -80 || mx > VIEW_W + 80) continue;
    const my = floorOrWater(cx) - 12 + shakeOy;
    const g3 = dctx.createRadialGradient(mx, my, 0, mx, my, 52);
    g3.addColorStop(0, 'rgba(0,0,0,.5)');
    g3.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g3;
    dctx.fillRect(mx - 52, my - 52, 104, 104);
  }
}

function render() {
  /* 镜头震动偏移 */
  const sk1 = shakeT > 0 ? shakeT / shakeDur : 0;
  shakeOx = (Math.random() - .5) * 2 * shakeAmp * sk1;
  shakeOy = (Math.random() - .5) * 2 * shakeAmp * sk1;

  /* 1. 静态洞窟（取摄像机所在切片） */
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(sceneCanvas, cam.x * sk, 0, VIEW_W * sk, sceneCanvas.height, 0, 0, canvas.width, canvas.height);

  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.translate(-cam.x + shakeOx, shakeOy);

  /* 2. 动态发光物（世界坐标） */
  drawMushroomGlow(ctx);
  drawGoal(ctx, clearingProgress());
  drawDamp(ctx);
  drawDust(ctx);
  drawPuffs(ctx);
  drawPlate(ctx);
  drawHazDrips(ctx);
  drawGhosts(ctx);
  drawEnemies(ctx);
  drawBlockFx(ctx);
  // 死亡下沉/消散 + 受击无敌闪烁
  const pa = state === 'dying' ? Math.max(0, 1 - drownT / 1.4) : (state === 'gameover' ? 0 : 1);
  const blink = player.invulnT > 0 && Math.sin(tGlobal * 26) > 0;
  if (pa > .02 && !blink) {
    ctx.save(); ctx.globalAlpha = pa;
    drawPlayer(ctx);
    ctx.restore();
  }
  drawFlameCore(ctx);
  drawFlameParticles(ctx);

  /* 3. 黑暗遮罩 */
  renderDarkness();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(darkCanvas, 0, 0, canvas.width, canvas.height);

  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.translate(-cam.x + shakeOx, shakeOy);

  /* 3.5 萤火虫 / 敌人眼睛 / 挥击光弧（黑暗遮罩之上） */
  drawFlies(ctx);
  drawEnemyEyes(ctx);
  drawAttackFx(ctx);
  drawBreathFx(ctx);
  drawUltRing(ctx);

  /* 4. 火把暖色氛围 */
  if (torchLife > .02) {
    const tip = torchTip();
    const fk = flicker(tGlobal);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 300 * (LV.torchR ?? 330) / 330 * fk);
    g.addColorStop(0, `rgba(255,150,58,${.21 * fk * darknessMult * torchLife})`);
    g.addColorStop(.5, `rgba(255,125,45,${.07 * fk * darknessMult * torchLife})`);
    g.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(tip.x - 310, tip.y - 310, 620, 620);
    g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 80);
    g.addColorStop(0, `rgba(255,204,110,${.26 * fk * darknessMult * torchLife})`);
    g.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(tip.x - 90, tip.y - 90, 180, 180);
    ctx.restore();
  }
  // 终点暖白余晖（光门锁定时呈绿色）
  const fy = goalY + Math.sin(tGlobal * 1.3) * 5;
  const pulse = .8 + .2 * Math.sin(tGlobal * 2.1);
  const lockedNow = goalLocked();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g3 = ctx.createRadialGradient(goalX, fy, 0, goalX, fy, 235 * pulse);
  const cAmb = lockedNow
    ? [`rgba(150,235,165,${(.14 + clearingProgress() * .12) * darknessMult + clearingProgress() * .1})`, 'rgba(140,225,155,0)']
    : [`rgba(255,236,200,${(.16 + clearingProgress() * .12) * darknessMult + clearingProgress() * .1})`, 'rgba(255,235,190,0)'];
  g3.addColorStop(0, cAmb[0]);
  g3.addColorStop(1, cAmb[1]);
  ctx.fillStyle = g3;
  ctx.fillRect(goalX - 180, fy - 180, 360, 360);
  ctx.restore();

  /* 5. 暗角 + 胶片颗粒（屏幕坐标） */
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.drawImage(vigCanvas, 0, 0);
  ctx.save();
  ctx.globalAlpha = .035;
  const ox = (Math.random() * 220) | 0, oy = (Math.random() * 220) | 0;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = rockPattern;
  ctx.fillRect(0, 0, VIEW_W + 220, VIEW_H + 220);
  ctx.restore();

  /* 6. HUD（第三关战斗状态） */
  drawHUD(ctx);

  /* 7. 大招全屏闪光 */
  if (player.flashT > 0) {
    ctx.fillStyle = `rgba(255,190,110,${(player.flashT / .25 * .22).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}



/* ============================================================
 *  流程控制
 * ============================================================ */
const menuEl = document.getElementById('menu');
const clearEl = document.getElementById('clear');
const overEl = document.getElementById('over');
const hintEl = document.getElementById('hint');

goalY = groundAt(goalX) - LV.goal.hover;

function loadLevel(n) {
  levelNum = n;
  LV = LEVELS[n];
  ceilAt = makeSampler(LV.ceil);
  goalX = LV.goal.x;
  goalY = groundAt(goalX) - LV.goal.hover;
  DRIP_SRC = buildDrips();
  // 危险滴水机关源（第六关）
  hazSrcs.length = 0;
  for (const [hx, hl] of (LV.dripHazards || [])) {
    hazSrcs.push({ x: hx, y: ceilAt(hx) + hl - 2, period: 2.2 + Math.random() * 1.3, t: Math.random() * 1.6 });
  }
  hazDrops.length = 0;
  if (LV.plate) LV.plate.pressed = false;
  plateGlow = 0;
  initDust(); initFlies(); initFogs(); initScarf();
  initEnemies();
  flames.length = 0; sparks.length = 0; drops.length = 0; ripples.length = 0;
  ghosts.length = 0; puffs.length = 0;
  darknessMult = 1; torchLife = 1; clearingT = 0; drownT = 0;
  resetPlayer();
  cam.x = Math.max(0, Math.min(LV.width - VIEW_W, player.x - VIEW_W / 2));
  playStart = performance.now(); playTime = 0;
  hintEl.textContent = n === 1 ? '别着急 · 慢慢走向那盏光'
    : n === 2 ? '跳过水面 · 别让火把熄灭'
    : n === 3 ? '空格连斩 · Q 格挡'
    : n === 4 ? '水面与暗影 · 越往深处越暗'
    : n === 5 ? '暗影之王 · 净化一切'
    : '钟乳石在滴水 · 踩下石板停住它';
  fit();                                  // 重渲染整关静态场景
}

function startGame() {
  menuEl.classList.remove('show');
  loadLevel(1);
  state = 'play';
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), 5200);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function beginClear() { state = 'clearing'; clearingT = 0; }
function finishClear() {
  state = 'clear';
  document.getElementById('timeText').textContent = `走了 ${playTime.toFixed(1)} 秒，抵达了光`;
  const CN = ['一', '二', '三', '四', '五', '六'];
  document.getElementById('clearTitle').textContent = `✦ 第${CN[levelNum - 1]}关 · 完成 ✦`;
  const nb = document.getElementById('nextBtn');
  if (levelNum < 6) {
    nb.disabled = false; nb.classList.remove('locked');
    nb.textContent = `进 入 第 ${CN[levelNum]} 关`;
  } else {
    nb.disabled = true; nb.classList.add('locked');
    nb.textContent = '第七关 · 敬请期待';
  }
  clearEl.classList.add('show');
}
function goNext() {
  if (levelNum >= 6) return;
  clearEl.classList.remove('show');
  loadLevel(levelNum + 1);
  state = 'play';
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), 5200);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function restart() {
  clearEl.classList.remove('show');
  overEl.classList.remove('show');
  loadLevel(levelNum);
  state = 'play';
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), 3600);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function resetPlayer() {
  player.x = LV.spawnX;
  player.y = floorOrWater(player.x);
  player.vx = 0; player.vy = 0;
  player.grounded = true; player.face = 1; player.faceF = 1;
  player.phase = 0; player.coyote = 0; player.jbuf = 0; player.landT = 0;
  player.hp = 100; player.qi = 0;
  player.invulnT = 0; player.attackT = 0; player.attackCd = 0; player.attackDur = .26;
  player.comboStep = 0; player.comboQueued = false; player.comboResetT = 0;
  player.dashT = 0; player.dashCd = 0;
  player.blocking = false; player.blockFxT = 0; player.guard = GUARD_MAX;
  player.holding = false; player.wasHolding = false; player.holdStartQi = 0; player.holdGain = 0;
  player.breathT = 0; player.ultT = 0; player.flashT = 0;
  ghosts.length = 0;
}
let deathCause = 'water';
function startSlash(step) {
  step = ((step - 1) % COMBOS.length) + 1;
  player.comboStep = step;
  const c = COMBOS[step - 1];
  player.attackDur = c.dur;
  player.attackT = c.dur;
  player.attackCd = step === 4 ? .6 : .26;
  player.comboResetT = .9;
  player.comboQueued = false;
  for (const en of enemies) {
    if (en.dead) continue;
    const ey = floorOrWater(en.x) - 12;
    const dx = en.x - player.x;
    const sideOk = c.both ? true : Math.sign(dx) === player.face;
    if (Math.abs(dx) < c.reach && sideOk && Math.abs(ey - (player.y - 26)) < 55) {
      en.hp -= 1;
      en.hurtT = .3;
      en.x += player.face * c.kb;
      hitStopT = Math.max(hitStopT, .05);                       // 命中顿帧
      addShake(player.comboStep >= 3 ? 3.2 : 2.2, .14);
      spawnPuffs(en.x, ey + 8, 3, 18);
      player.qi = Math.min(100, player.qi + Math.round(QI_HIT_GAIN * (en.big ? 1.6 : 1)));       // 打中怪物攒气（精英更多）
      if (en.hp <= 0) killEnemy(en, ey);
    }
  }
}
function doAttack() {
  if (state !== 'play') return;
  if (player.attackT > 0) { player.comboQueued = true; return; }   // 动画中按攻击：预接下一段
  if (player.attackCd > 0) return;
  startSlash(player.comboResetT > 0 ? (player.comboStep % 3) + 1 : 1);
}
function tryDash() {
  if (state !== 'play' || player.dashCd > 0) return;
  player.dashCd = DASH_CD;
  player.dashT = DASH_T;
  player.dashDir = player.face;
  spawnPuffs(player.x, player.y, 5, 20);   // 起步尘土
}
function killEnemy(en, ey) {
  en.dead = true;
  hitStopT = Math.max(hitStopT, .09);
  addShake(4, .2);
  for (let i = 0; i < 10; i++) flames.push({
    x: en.x + (Math.random() - .5) * 22, y: ey + (Math.random() - .5) * 18,
    vx: (Math.random() - .5) * 100, vy: -30 - Math.random() * 90,
    life: .5 + Math.random() * .4, t: 0, s: 1.5 + Math.random() * 2, ember: true
  });
  // 全部净化 → 光门开启
  if (LV.enemies && enemies.every(e => e.dead)) {
    hintEl.textContent = '光门已开';
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove('show'), 3000);
  }
}
function releaseSkill() {
  if (state !== 'play') return;
  if (player.qi >= 100) startUlt();
  else if (player.qi >= QI_SKILL_COST) startBreath();
}
function startBreath() {
  player.qi -= QI_SKILL_COST;
  player.breathT = .75;
  addShake(3.5, .3);
  hitStopT = Math.max(hitStopT, .05);
  for (const en of enemies) {
    if (en.dead) continue;
    const ey = floorOrWater(en.x) - 12;
    const dx = en.x - player.x;
    if (Math.sign(dx) === player.face && Math.abs(dx) < 420 && Math.abs(ey - (player.y - 40)) < 90) {
      en.hp -= 2;                                  // 喷火一下即可烧穿小怪
      en.hurtT = .35;
      en.x += player.face * 34;
      hitStopT = Math.max(hitStopT, .06);
      addShake(3, .18);
      spawnPuffs(en.x, ey + 6, 5, 24);
      if (en.hp <= 0) killEnemy(en, ey);
    }
  }
}
function startUlt() {
  player.qi = 0;
  player.ultT = .95;
  player.flashT = .28;
  player.ultRingT = .45;
  addShake(5.5, .35);
  hitStopT = Math.max(hitStopT, .06);
  // 只烧面朝的半边屏幕（用即时相机位置，避免陈旧值）
  const camNow = Math.max(0, Math.min(LV.width - VIEW_W, player.x - VIEW_W / 2));
  const halfL = player.face > 0 ? player.x - 90 : camNow - 40;
  const halfR = player.face > 0 ? camNow + VIEW_W + 40 : player.x + 90;
  window.__ultDebug = { face: player.face, px: player.x, camx: cam.x, halfL, halfR };
  for (const en of enemies) {
    if (en.dead) continue;
    if (en.x < halfL || en.x > halfR) continue;
    en.hp -= 2;
    en.hurtT = .5;
    if (en.hp <= 0) killEnemy(en, floorOrWater(en.x) - 12);
  }
}
function damagePlayer(dir, dmg = 20) {
  if (state !== 'play' || player.invulnT > 0) return;
  // 闪冲期间伤害减免 50%
  const dashing = player.dashT > 0;
  player.hp -= dashing ? Math.ceil(dmg / 2) : dmg;
  player.qi = Math.min(100, player.qi + QI_HURT_GAIN);   // 被打也能攒气
  player.invulnT = 1;
  player.vx = dir * (dashing ? 150 : 210); player.vy = -170; player.grounded = false;
  hitStopT = Math.max(hitStopT, .07);
  addShake((dmg >= 30 ? 5.5 : 4.5), .28);
  spawnPuffs(player.x, player.y - 26, 4, 22);
  player.hurtFlashT = .3;   // 受击红闪
  if (player.hp <= 0) beginDeath('hp');
}
function beginDeath(cause) {
  state = 'dying';
  deathCause = cause;
  drownT = 0;
  player.vx = 0;
  hintEl.classList.remove('show');
}
function finishDeath() {
  state = 'gameover';
  const p = playTime.toFixed(1);
  const msg = deathCause === 'water' ? `走了 ${p} 秒 · 火把熄灭在水中`
    : deathCause === 'drip' ? `走了 ${p} 秒 · 一滴水浇熄了火把`
    : deathCause === 'burn' ? `走了 ${p} 秒 · 燃烧值耗尽，火把熄灭了`
    : `走了 ${p} 秒 · 被暗影吞没了`;
  document.getElementById('overTime').textContent = msg;
  overEl.classList.add('show');
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('retryBtn').addEventListener('click', restart);
document.getElementById('retryBtn2').addEventListener('click', restart);
document.getElementById('nextBtn').addEventListener('click', goNext);

/* ============================================================
 *  自适应窗口
 * ============================================================ */
function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const cssW = Math.round(VIEW_W * scale), cssH = Math.round(VIEW_H * scale);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  k = canvas.width / VIEW_W;
  sk = Math.min(k, 1.5);
  renderScene();
}
window.addEventListener('resize', fit);
fit();

/* 调试钩子（测试/截图用，不影响游戏） */
window.G = {
  player,
  teleport(x, y) {
    player.x = x;
    player.y = (y !== undefined) ? y : (groundAt(x) !== null ? groundAt(x) : (LV.waterY !== null ? LV.waterY - 80 : 560));
    player.vx = 0; player.vy = 0;
    player.grounded = player.y === groundAt(x);
  },
  state: () => state,
  level: () => levelNum,
  load: n => { overEl.classList.remove('show'); clearEl.classList.remove('show'); loadLevel(n); state = 'play'; },
  start: startGame,
  hurt: () => damagePlayer(1),
  setQi: v => { player.qi = v; },
  enemies: () => enemies,
  combo: () => player.comboStep,
  dash: tryDash,
  platePressed: () => !!(LV.plate && LV.plate.pressed),
  forceDrip: x => { hazDrops.push({ x: x ?? player.x, y: (ceilAt(x ?? player.x) || 300) + 30, vy: 0 }); },
  step: frames => {                     // 确定性推帧：后台/无 rAF 环境下测试用
    for (let i = 0; i < frames; i++) simulate(1 / 60);
    render();
  },
  shot: () => render()
};

/* ============================================================
 *  主循环
 * ============================================================ */
/* 模拟一帧（渲染与输入之外的完整逻辑），loop 与调试步进共用 */
function simulate(dt) {
  tGlobal += dt;

  // 命中顿帧：短暂慢动作，打击更有分量
  let gdt = dt;
  if (hitStopT > 0) { hitStopT = Math.max(0, hitStopT - dt); gdt = dt * .15; }
  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);

  if (state === 'play') {
    updatePlayer(gdt);
    playTime = (performance.now() - playStart) / 1000;
  } else if (state === 'clearing') {
    clearingT += dt;
    darknessMult = Math.max(0, 1 - clearingT / 1.5);
    if (clearingT >= 1.6) finishClear();
  } else if (state === 'dying') {
    drownT += dt;
    torchLife = Math.max(0, 1 - drownT / 1.1);
    if (deathCause === 'water') player.y = Math.min(player.y + 30 * dt, LV.waterY + 30);
    if (drownT > 1.6) finishDeath();
  } else if (state === 'menu') {
    player.phase += dt * .8;
  }

  cam.x = Math.max(0, Math.min(LV.width - VIEW_W, player.x - VIEW_W / 2));
  updateParticles(gdt);
}

let lastT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.033, (now - lastT) / 1000 || .016);
  lastT = now;
  simulate(dt);
  render();
}

requestAnimationFrame(loop);
