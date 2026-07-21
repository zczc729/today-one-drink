import "../static/beer-level.js";

const BeerLevelMath = globalThis.BeerLevelMath;

const {
    TOTAL_DRINK_MS,
    MS_PER_PERCENT,
    clampConsumedMs,
    getVisualLevel,
    getLogicalLevel,
    getConsumedMsForLevel,
    getConsumedMsAt,
    BEER_MOTION_DURATIONS,
    getHeldMotionState,
    shouldShowDrinkingOverlay,
    FULL_POUR_DURATION,
    getAutoPourLevel,
    canStartAutoPour,
    getPourStreamGeometry,
    getRefillBottleLayout,
} = BeerLevelMath;

const cases = [
    [-500, 100],
    [0, 100],
    [50, 99],
    [1250, 75],
    [2500, 50],
    [3750, 25],
    [4950, 1],
    [4999, 1],
    [5000, 0],
    [6500, 0],
];

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(
            `${label}: expected ${expected}, received ${actual}`
        );
    }
}

assertEqual(TOTAL_DRINK_MS, 5000, "total duration");
assertEqual(MS_PER_PERCENT, 50, "milliseconds per percent");

for (const [elapsedMs, expectedLevel] of cases) {
    assertEqual(
        getLogicalLevel(elapsedMs),
        expectedLevel,
        `${elapsedMs}ms logical level`
    );
}

assertEqual(clampConsumedMs(-1), 0, "lower clamp");
assertEqual(
    clampConsumedMs(5001),
    5000,
    "upper clamp"
);
assertEqual(
    getVisualLevel(1250),
    75,
    "1250ms visual level"
);
assertEqual(
    getConsumedMsForLevel(75),
    1250,
    "75% inverse conversion"
);
assertEqual(
    getConsumedMsForLevel(-10),
    5000,
    "inverse lower clamp"
);
assertEqual(
    getConsumedMsForLevel(110),
    0,
    "inverse upper clamp"
);
assertEqual(
    getConsumedMsAt({
        accumulatedDrinkMs: 1250,
        currentDrinkStartedAt: 100,
        now: 10100,
        isDrinking: false,
    }),
    1250,
    "idle time is ignored by active clock"
);
assertEqual(
    getConsumedMsAt({
        accumulatedDrinkMs: 1250,
        currentDrinkStartedAt: 100,
        now: 1350,
        isDrinking: true,
    }),
    2500,
    "active clock adds real elapsed time"
);
assertEqual(
    getConsumedMsAt({
        accumulatedDrinkMs: 4950,
        currentDrinkStartedAt: 100,
        now: 300,
        isDrinking: true,
    }),
    5000,
    "active clock clamps over-consumption"
);

let accumulatedDrinkMs = 0;
accumulatedDrinkMs = clampConsumedMs(
    accumulatedDrinkMs + 1250
);
assertEqual(
    getLogicalLevel(accumulatedDrinkMs),
    75,
    "first 1.25s press"
);

const levelBeforeIdleWait =
    getLogicalLevel(accumulatedDrinkMs);
assertEqual(
    getLogicalLevel(accumulatedDrinkMs),
    levelBeforeIdleWait,
    "idle wait does not consume beer"
);

accumulatedDrinkMs = clampConsumedMs(
    accumulatedDrinkMs + 1250
);
assertEqual(
    getLogicalLevel(accumulatedDrinkMs),
    50,
    "second 1.25s press resumes"
);

const shortPressDurations = [
    100,
    150,
    200,
    300,
    500,
];
const shortPressTotal =
    shortPressDurations.reduce(
        (total, duration) => (
            clampConsumedMs(total + duration)
        ),
        0
    );
assertEqual(
    getLogicalLevel(shortPressTotal),
    75,
    "multiple short presses accumulate"
);

assertEqual(
    BEER_MOTION_DURATIONS.anticipation,
    55,
    "anticipation duration"
);
assertEqual(
    BEER_MOTION_DURATIONS.lifting,
    185,
    "lifting duration"
);
assertEqual(
    BEER_MOTION_DURATIONS.nearMouth,
    115,
    "near-mouth duration"
);
assertEqual(
    BEER_MOTION_DURATIONS.gulping,
    420,
    "gulp duration"
);
assertEqual(
    BEER_MOTION_DURATIONS.lowering,
    285,
    "lowering duration"
);
assertEqual(
    getHeldMotionState(0),
    "anticipation",
    "initial motion state"
);
assertEqual(
    getHeldMotionState(55),
    "lifting",
    "lifting boundary"
);
assertEqual(
    getHeldMotionState(239.999),
    "lifting",
    "lifting remains active"
);
assertEqual(
    getHeldMotionState(240),
    "nearMouth",
    "near-mouth boundary"
);
assertEqual(
    getHeldMotionState(355),
    "gulping",
    "gulping boundary"
);
assertEqual(
    shouldShowDrinkingOverlay(184.499),
    false,
    "close overlay stays hidden before 70%"
);
assertEqual(
    shouldShowDrinkingOverlay(184.5),
    true,
    "close overlay switches at 70%"
);

assertEqual(
    FULL_POUR_DURATION,
    2400,
    "full pour duration"
);

function assertNear(
    actual,
    expected,
    tolerance,
    label
) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(
            `${label}: expected ${expected} ± ${tolerance}, received ${actual}`
        );
    }
}

const desktopBottleLayout =
    getRefillBottleLayout({
        sceneLeft: 0,
        sceneTop: 0,
        glassLeft: 500,
        glassTop: 300,
        glassWidth: 340,
        glassHeight: 425,
        heightRatio: 1.55,
    });

assertNear(
    desktopBottleLayout.bottleHeight,
    658.75,
    0.0001,
    "desktop bottle height ratio"
);
assertNear(
    desktopBottleLayout.bottleWidth /
        desktopBottleLayout.bottleHeight,
    64 / 160,
    0.0001,
    "bottle aspect ratio"
);
assertEqual(
    desktopBottleLayout.tiltDegrees,
    -120,
    "bottle tilt"
);
assertNear(
    desktopBottleLayout.mouthClearance,
    31.875,
    0.0001,
    "proportional mouth clearance"
);

const reconstructedMouthX =
    desktopBottleLayout.actorLeft +
    desktopBottleLayout.origin.x +
    desktopBottleLayout
        .rotatedMouthOffset.x;
const reconstructedMouthY =
    desktopBottleLayout.actorTop +
    desktopBottleLayout.origin.y +
    desktopBottleLayout
        .rotatedMouthOffset.y;

assertNear(
    reconstructedMouthX,
    desktopBottleLayout.desiredMouth.x,
    0.0001,
    "rotated bottle mouth x"
);
assertNear(
    reconstructedMouthY,
    desktopBottleLayout.desiredMouth.y,
    0.0001,
    "rotated bottle mouth y"
);

const mobileBottleLayout =
    getRefillBottleLayout({
        glassHeight: 320,
        heightRatio: 1.45 * 0.9,
    });

assertNear(
    mobileBottleLayout.bottleHeight,
    417.6,
    0.0001,
    "mobile bottle 90% height ratio"
);

const reducedDesktopBottleLayout =
    getRefillBottleLayout({
        glassHeight: 425,
        heightRatio: 1.55 * 0.9,
    });

assertNear(
    reducedDesktopBottleLayout.bottleHeight,
    592.875,
    0.0001,
    "desktop bottle 90% height ratio"
);
assertEqual(
    getAutoPourLevel(0),
    0,
    "pour starts empty"
);
assertEqual(
    getAutoPourLevel(600),
    25,
    "600ms pour level"
);
assertEqual(
    getAutoPourLevel(610),
    25.416666666666664,
    "pour level remains fractional"
);
assertEqual(
    getAutoPourLevel(1200),
    50,
    "1200ms pour level"
);
assertEqual(
    getAutoPourLevel(1800),
    75,
    "1800ms pour level"
);
assertEqual(
    getAutoPourLevel(2400),
    100,
    "pour finishes full"
);
assertEqual(
    getAutoPourLevel(3000),
    100,
    "pour clamps above full"
);

const validAutoPourState = {
    beerLevel: 0,
    isAiResponseComplete: true,
    pourState: "idle",
    refillPending: true,
    hasStartedForEmptyCycle: false,
};
assertEqual(
    canStartAutoPour(validAutoPourState),
    true,
    "auto pour starts when both conditions pass"
);
assertEqual(
    canStartAutoPour({
        ...validAutoPourState,
        beerLevel: 0.01,
    }),
    false,
    "auto pour rejects partial beer"
);
assertEqual(
    canStartAutoPour({
        ...validAutoPourState,
        isAiResponseComplete: false,
        pourState: "waitingForAi",
    }),
    false,
    "auto pour waits for AI output"
);
assertEqual(
    canStartAutoPour({
        ...validAutoPourState,
        pourState: "waitingForAi",
    }),
    true,
    "AI completion releases waiting pour"
);
assertEqual(
    canStartAutoPour({
        ...validAutoPourState,
        pourState: "pouring",
    }),
    false,
    "active pour cannot duplicate"
);
assertEqual(
    canStartAutoPour({
        ...validAutoPourState,
        hasStartedForEmptyCycle: true,
    }),
    false,
    "empty cycle starts only once"
);

const diagonalStream = getPourStreamGeometry({
    mouthX: 10,
    mouthY: 20,
    targetX: 13,
    targetY: 24,
});
assertEqual(
    diagonalStream.length,
    5,
    "pour stream uses point distance"
);
assertEqual(
    diagonalStream.angle,
    Math.atan2(4, 3),
    "pour stream uses point angle"
);
assertEqual(
    getPourStreamGeometry({
        mouthX: 200,
        mouthY: 100,
        targetX: 100,
        targetY: 100,
    }).angle,
    Math.PI,
    "pour stream points left toward glass"
);

console.log(
    `beer-level: ${cases.length + 52} assertions passed`
);
