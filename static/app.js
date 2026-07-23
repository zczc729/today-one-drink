const chatForm = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message-input");
const responseArea = document.querySelector("#response-area");
const submitButton = chatForm?.querySelector("button");
const requestStatus = document.querySelector("#request-status");
const appShell = document.querySelector(".app-shell");
const rootElement = document.documentElement;
const beerMotionStage = document.querySelector(
    ".beer-motion-stage"
);
const entryGuide = document.querySelector("#entry-guide");
const entryGuideDialog = entryGuide?.querySelector(
    ".entry-guide__dialog"
);
const entryGuideStartButton = document.querySelector(
    "#entry-guide-start"
);
const entryGuideHideTodayButton = document.querySelector(
    "#entry-guide-hide-today"
);
const entryGuideCloseButton = document.querySelector(
    "#entry-guide-close"
);

const beerGlass = document.querySelector("#mainBeerMug");
const beerDrinkingOverlay = document.querySelector(
    ".main-beer-mug__glass-overlay--drinking"
);
const beerIdleImage = document.querySelector(
    "#beer-idle-image"
);
const beerStatus = document.querySelector("#beer-status");
const beerScene = document.querySelector(".beer-scene");
const refillActor = document.querySelector("#refill-actor");
const refillBottle = document.querySelector("#refill-bottle");
const refillBottleMouth = document.querySelector(
    "#refill-bottle-mouth"
);
const beerPourStream = document.querySelector(
    "#beer-pour-stream"
);
const tableImpact = document.querySelector("#table-impact");

const STORAGE_KEY = "today_one_drink_history";
const SESSION_ID_KEY = "todayOneDrinkSessionId";
const GUIDE_HIDDEN_DATE_STORAGE_KEY =
    "todayOneDrinkGuideHiddenDate";
const GUIDE_CLOSE_DURATION_MS = 160;
const MAX_HISTORY_MESSAGES = 20;
const MAX_API_HISTORY_MESSAGES = 8;
const NORMAL_COOLDOWN_SECONDS = 2;

const TYPE_INTERVAL_MS = 32;
const WAITING_FRAME_INTERVAL_MS = 450;
const USER_BUBBLE_VISIBLE_MS = 1000;
const BUBBLE_LEAVE_MS = 320;
const AI_BUBBLE_MIN_VISIBLE_MS = 5000;
const AI_BUBBLE_MAX_VISIBLE_MS = 9000;
const SCROLL_BOTTOM_THRESHOLD_PX = 24;
const GULP_STATUS_INTERVAL_MS = 600;
const FINISH_STATUS_VISIBLE_MS = 1400;
const FINISH_STATUS_MINIMUM_MS = 650;
const BOTTLE_SIZE_MULTIPLIER = 0.9;
const BOTTLE_NATIVE_ASPECT_RATIO = 64 / 160;
const BOTTLE_TILT_DEGREES = -120;
const BOTTLE_TRANSFORM_ORIGIN = Object.freeze({
    x: 0.55,
    y: 0.65,
});
const BOTTLE_MOUTH_ANCHOR = Object.freeze({
    x: 0.5,
    y: 6 / 160,
});

const BEER_IDLE_FRAME_MS = 350;
const KEYBOARD_POINTER_ID = "keyboard";
const beerLevelMath = window.BeerLevelMath;
const REQUIRED_BEER_LEVEL_MATH_MEMBERS = Object.freeze({
    TOTAL_DRINK_MS: "number",
    clampConsumedMs: "function",
    getVisualLevel: "function",
    getLogicalLevel: "function",
    getConsumedMsForLevel: "function",
    getConsumedMsAt: "function",
    BEER_MOTION_DURATIONS: "object",
    getHeldMotionState: "function",
    shouldShowDrinkingOverlay: "function",
    FULL_POUR_DURATION: "number",
    getAutoPourLevel: "function",
    canStartAutoPour: "function",
    getPourStreamGeometry: "function",
    getRefillBottleLayout: "function",
});

if (
    !beerLevelMath ||
    typeof beerLevelMath !== "object"
) {
    console.error(
        "[오늘 한잔] BeerLevelMath를 찾을 수 없습니다. " +
            "beer-level.js가 app.js보다 먼저 로드되었는지 확인하세요."
    );
    throw new Error("BeerLevelMath 초기화에 실패했습니다.");
}

const missingBeerLevelMathMembers =
    Object.entries(REQUIRED_BEER_LEVEL_MATH_MEMBERS).filter(
        ([member, memberType]) => (
            typeof beerLevelMath[member] !== memberType
        )
    );

if (missingBeerLevelMathMembers.length > 0) {
    console.error(
        "[오늘 한잔] BeerLevelMath API가 불완전합니다:",
        missingBeerLevelMathMembers.map(
            ([member]) => member
        )
    );
    throw new Error("BeerLevelMath API 검증에 실패했습니다.");
}

const {
    TOTAL_DRINK_MS,
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
} = beerLevelMath;
const BEER_DRINKING_OVERLAY_URL =
    "/static/assets/beer-glass-drinking.svg";
const BEER_MOTION_CLASS_NAMES = Object.freeze([
    "is-anticipating",
    "is-lifting",
    "is-near-mouth",
    "is-gulping",
    "is-lowering",
]);
const BEER_IDLE_FRAME_URLS = Object.freeze(
    Array.from(
        { length: 12 },
        (_, index) => (
            "/static/assets/beer/idle-100/" +
            `frame-${String(index + 1).padStart(2, "0")}.png?v=2`
        )
    )
);
const POUR_STAGE_DURATION_MS = Object.freeze({
    entering: 220,
    tilting: 220,
    stream: 100,
    untilting: 220,
    leaving: 260,
});
const POUR_STATE = Object.freeze({
    IDLE: "idle",
    WAITING_FOR_AI: "waitingForAi",
    ENTERING: "entering",
    TILTING: "tilting",
    POURING: "pouring",
    UNTILTING: "untilting",
    LEAVING: "leaving",
});

const REFILL_MESSAGES = [
    "조금만 채워둘게.",
    "천천히 있어. 한 잔 채워둘게.",
    "한 잔 채워둘게. 꼭 다 마실 필요는 없고.",
];

const AI_STATUS = {
    IDLE: "idle",
    THINKING: "thinking",
    TALKING: "talking",
    REFILLING: "refilling",
};

const DRINK_STATUS_MODE = Object.freeze({
    DEFAULT: "default",
    REFILLING: "refilling",
    CELEBRATING: "celebrating",
    DRINKING: "drinking",
});

const DRINK_STATUS_PRIORITY = Object.freeze({
    [DRINK_STATUS_MODE.DEFAULT]: 0,
    [DRINK_STATUS_MODE.REFILLING]: 1,
    [DRINK_STATUS_MODE.CELEBRATING]: 2,
    [DRINK_STATUS_MODE.DRINKING]: 3,
});

const aiState = {
    status: AI_STATUS.IDLE,
};

const entryGuideState = {
    isOpen: false,
    closeTimerId: null,
    openAnimationFrameId: null,
    previouslyFocusedElement: null,
};

const beerState = {
    amount: 100,
    visualAmount: 100,
    accumulatedDrinkMs: 0,
    currentDrinkStartedAt: null,
    drinkStartedConsumedMs: 0,
    motionStartedAt: null,
    loweringStartedAt: null,
    motionState: "idle",
    isPointerDown: false,
    isDrinking: false,
    isRefilling: false,
    animationFrameId: null,
    drinkSessionId: 0,
    fillAnimationFrameId: null,
    activePointerId: null,
    drinkingOverlayAvailable: false,
    drinkingOverlayVisible: false,
    drinkingOverlayPreloadStarted: false,
    useDrinkingOverlayForCurrentDrink: false,
    didFinishBeerDuringCurrentDrink: false,
};

const refillState = {
    beerIsEmpty: false,
    aiHasFinished: true,
    refillScheduled: false,
    refillCount: 0,
    pourState: POUR_STATE.IDLE,
    refillPending: false,
    hasStartedForEmptyCycle: false,
    pourSessionId: 0,
    stageTimerId: null,
    geometryAnimationFrameId: null,
};

const drinkStatusState = {
    mode: DRINK_STATUS_MODE.DEFAULT,
    gulpTimerId: null,
    gulpFrameIndex: 0,
    celebrationTimerId: null,
    autoPourResumeTimerId: null,
    celebrationMinimumUntil: 0,
};

const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
);
const beerIdleState = {
    frameIndex: 0,
    timerId: null,
    isPlaying: false,
    generation: 0,
    preloadedFrames: [],
    preloadPromise: null,
};

const sessionId = getOrCreateSessionId();
let chatHistory = loadHistory();
let isComposing = false;
let isSending = false;
let cooldownTimer = null;
let cooldownUntil = 0;
let permanentlyDisabled = false;
let bubbleDismissTimerId = null;
let gulpAudioContext = null;
const viewportState = {
    keyboardSceneFrozen: false,
};
const mobileInputQuery = window.matchMedia(
    "(hover: none) and (pointer: coarse)"
);


function syncChatFormHeight() {
    if (!chatForm || !rootElement) {
        return;
    }

    rootElement.style.setProperty(
        "--chat-form-height",
        `${chatForm.offsetHeight}px`
    );
}


function resizeMessageInput() {
    if (!messageInput) {
        return;
    }

    const inputStyles = getComputedStyle(messageInput);
    const minimumHeight = Number.parseFloat(
        inputStyles.minHeight
    );
    const maximumHeight = Number.parseFloat(
        inputStyles.maxHeight
    );

    messageInput.style.height = "auto";

    const nextHeight = Math.min(
        Math.max(messageInput.scrollHeight, minimumHeight),
        maximumHeight
    );

    messageInput.style.height = `${nextHeight}px`;
    messageInput.style.overflowY =
        messageInput.scrollHeight > maximumHeight
            ? "auto"
            : "hidden";
    syncChatFormHeight();
}


function freezeSceneForKeyboard() {
    if (
        viewportState.keyboardSceneFrozen ||
        !rootElement ||
        !responseArea ||
        !beerMotionStage ||
        !beerStatus
    ) {
        return;
    }

    const motionStyles = getComputedStyle(beerMotionStage);
    const statusStyles = getComputedStyle(beerStatus);

    if (appShell) {
        rootElement.style.setProperty(
            "--scene-height",
            `${appShell.offsetHeight}px`
        );
    }
    rootElement.style.setProperty(
        "--keyboard-response-top",
        `${responseArea.offsetTop}px`
    );
    rootElement.style.setProperty(
        "--keyboard-response-height",
        `${responseArea.offsetHeight}px`
    );
    rootElement.style.setProperty(
        "--keyboard-glass-size",
        `${beerMotionStage.offsetWidth}px`
    );
    rootElement.style.setProperty(
        "--keyboard-glass-bottom",
        motionStyles.bottom
    );
    rootElement.style.setProperty(
        "--keyboard-status-bottom",
        statusStyles.bottom
    );
    rootElement.classList.add("is-keyboard-open");
    viewportState.keyboardSceneFrozen = true;
}


function restoreSceneAfterKeyboard() {
    if (!rootElement) {
        return;
    }

    rootElement.classList.remove("is-keyboard-open");
    rootElement.style.removeProperty("--scene-height");
    rootElement.style.removeProperty("--keyboard-offset");
    rootElement.style.removeProperty("--keyboard-response-top");
    rootElement.style.removeProperty("--keyboard-response-height");
    rootElement.style.removeProperty("--keyboard-glass-size");
    rootElement.style.removeProperty("--keyboard-glass-bottom");
    rootElement.style.removeProperty("--keyboard-status-bottom");
    viewportState.keyboardSceneFrozen = false;
}


function syncKeyboardViewport() {
    if (
        !messageInput ||
        !mobileInputQuery.matches ||
        document.activeElement !== messageInput ||
        !window.visualViewport
    ) {
        return;
    }

    const visualViewport = window.visualViewport;
    const keyboardOffset = Math.max(
        0,
        Math.round(
            window.innerHeight -
                visualViewport.height -
                visualViewport.offsetTop
        )
    );

    rootElement.style.setProperty(
        "--keyboard-offset",
        `${keyboardOffset}px`
    );
}


messageInput?.addEventListener("input", () => {
    if (mobileInputQuery.matches) {
        resizeMessageInput();
    }
});
messageInput?.addEventListener("focus", () => {
    if (!mobileInputQuery.matches) {
        return;
    }

    freezeSceneForKeyboard();
    syncKeyboardViewport();
});
messageInput?.addEventListener("blur", restoreSceneAfterKeyboard);
window.visualViewport?.addEventListener(
    "resize",
    syncKeyboardViewport,
    { passive: true }
);
window.visualViewport?.addEventListener(
    "scroll",
    syncKeyboardViewport,
    { passive: true }
);
if (mobileInputQuery.matches) {
    resizeMessageInput();
}


function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");
    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function getOrCreateSessionId() {
    let savedSessionId = sessionStorage.getItem(
        SESSION_ID_KEY
    );

    if (!savedSessionId) {
        savedSessionId = crypto.randomUUID();
        sessionStorage.setItem(
            SESSION_ID_KEY,
            savedSessionId
        );
    }

    return savedSessionId;
}


async function recordSessionStart() {
    try {
        await fetch("/api/session/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                session_id: sessionId,
            }),
            keepalive: true,
        });
    } catch (error) {
        console.warn("방문 통계를 기록하지 못했습니다.");
    }
}


function shouldShowEntryGuide() {
    try {
        return localStorage.getItem(
            GUIDE_HIDDEN_DATE_STORAGE_KEY
        ) !== getLocalDateKey();
    } catch (error) {
        console.warn(
            "첫 진입 안내 설정을 불러오지 못했습니다.",
            error
        );
        return true;
    }
}


function saveEntryGuideHiddenForToday() {
    try {
        localStorage.setItem(
            GUIDE_HIDDEN_DATE_STORAGE_KEY,
            getLocalDateKey()
        );
    } catch (error) {
        console.warn(
            "첫 진입 안내 설정을 저장하지 못했습니다.",
            error
        );
    }
}


function getEntryGuideFocusableElements() {
    if (!entryGuideDialog) {
        return [];
    }

    return Array.from(
        entryGuideDialog.querySelectorAll(
            "button:not([disabled]), " +
            "[href], input:not([disabled]), " +
            "select:not([disabled]), " +
            "textarea:not([disabled]), " +
            "[tabindex]:not([tabindex='-1'])"
        )
    ).filter(
        (element) => !element.hidden
    );
}


function openEntryGuide() {
    if (!entryGuide || entryGuideState.isOpen) {
        return;
    }

    window.clearTimeout(
        entryGuideState.closeTimerId
    );
    entryGuideState.closeTimerId = null;
    window.cancelAnimationFrame(
        entryGuideState.openAnimationFrameId
    );

    entryGuideState.previouslyFocusedElement =
        document.activeElement;
    entryGuideState.isOpen = true;
    entryGuide.hidden = false;
    entryGuide.classList.remove("is-closing");
    appShell?.setAttribute("inert", "");
    document.body.classList.add(
        "is-entry-guide-open"
    );

    entryGuideState.openAnimationFrameId =
        window.requestAnimationFrame(() => {
            entryGuideState.openAnimationFrameId =
                null;

            if (!entryGuideState.isOpen) {
                return;
            }

            entryGuide.classList.add("is-visible");
            entryGuideStartButton?.focus({
                preventScroll: true,
            });
        });
}


function closeEntryGuide({
    hideForToday = false,
} = {}) {
    if (hideForToday) {
        saveEntryGuideHiddenForToday();
    }

    if (!entryGuide || !entryGuideState.isOpen) {
        return;
    }

    entryGuideState.isOpen = false;
    window.cancelAnimationFrame(
        entryGuideState.openAnimationFrameId
    );
    entryGuideState.openAnimationFrameId = null;
    entryGuide.classList.remove("is-visible");
    entryGuide.classList.add("is-closing");

    window.clearTimeout(
        entryGuideState.closeTimerId
    );
    entryGuideState.closeTimerId =
        window.setTimeout(() => {
            entryGuide.hidden = true;
            entryGuide.classList.remove(
                "is-closing"
            );
            appShell?.removeAttribute("inert");
            document.body.classList.remove(
                "is-entry-guide-open"
            );

            const previousFocusedElement =
                entryGuideState
                    .previouslyFocusedElement;

            if (
                previousFocusedElement &&
                previousFocusedElement !==
                    document.body &&
                document.contains(
                    previousFocusedElement
                )
            ) {
                previousFocusedElement.focus({
                    preventScroll: true,
                });
            } else {
                beerGlass?.focus({
                    preventScroll: true,
                });
            }

            entryGuideState
                .previouslyFocusedElement = null;
            entryGuideState.closeTimerId = null;
        }, GUIDE_CLOSE_DURATION_MS);
}


function handleEntryGuideKeydown(event) {
    if (!entryGuideState.isOpen) {
        return;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        closeEntryGuide();
        return;
    }

    if (event.key !== "Tab") {
        return;
    }

    const focusableElements =
        getEntryGuideFocusableElements();

    if (focusableElements.length === 0) {
        event.preventDefault();
        entryGuideDialog?.focus({
            preventScroll: true,
        });
        return;
    }

    const firstElement = focusableElements[0];
    const lastElement =
        focusableElements[
            focusableElements.length - 1
        ];
    const activeElement = document.activeElement;

    if (
        event.shiftKey &&
        (
            activeElement === firstElement ||
            !entryGuideDialog?.contains(
                activeElement
            )
        )
    ) {
        event.preventDefault();
        lastElement.focus({
            preventScroll: true,
        });
        return;
    }

    if (
        !event.shiftKey &&
        (
            activeElement === lastElement ||
            !entryGuideDialog?.contains(
                activeElement
            )
        )
    ) {
        event.preventDefault();
        firstElement.focus({
            preventScroll: true,
        });
    }
}


function initializeEntryGuide() {
    entryGuideStartButton?.addEventListener(
        "click",
        () => closeEntryGuide()
    );
    entryGuideCloseButton?.addEventListener(
        "click",
        () => closeEntryGuide()
    );
    entryGuideHideTodayButton?.addEventListener(
        "click",
        () => closeEntryGuide({
            hideForToday: true,
        })
    );
    document.addEventListener(
        "keydown",
        handleEntryGuideKeydown
    );

    if (shouldShowEntryGuide()) {
        openEntryGuide();
    }
}


function loadHistory() {
    try {
        const savedHistory = sessionStorage.getItem(STORAGE_KEY);

        if (!savedHistory) {
            return [];
        }

        const parsedHistory = JSON.parse(savedHistory);

        return Array.isArray(parsedHistory)
            ? parsedHistory
            : [];
    } catch (error) {
        console.error("대화 기록을 불러오지 못했습니다.", error);
        return [];
    }
}


function saveHistory(history) {
    const limitedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(limitedHistory)
    );

    return limitedHistory;
}


function wait(milliseconds) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}


function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}


function setBeerVisualLevel(value = 100) {
    if (!beerGlass) {
        return;
    }

    const parsedValue = Number.parseFloat(value);
    const safeLevel = Number.isFinite(parsedValue)
        ? clamp(parsedValue, 0, 100)
        : 100;

    beerGlass.style.setProperty(
        "--beer-level",
        `${safeLevel.toFixed(3)}%`
    );

    const finalFoamProgress = clamp(
        (safeLevel - 70) / 30,
        0,
        1
    );
    const foamHeight =
        15 + finalFoamProgress * 4;

    beerGlass.style.setProperty(
        "--beer-foam-height",
        `${foamHeight.toFixed(3)}%`
    );
}


function setDrinkingOverlayVisible(shouldShow) {
    const canShow =
        Boolean(shouldShow) &&
        beerState.drinkingOverlayAvailable;

    beerState.drinkingOverlayVisible = canShow;
    beerGlass?.classList.toggle(
        "has-drinking-overlay",
        beerState.drinkingOverlayAvailable
    );
    beerGlass?.classList.toggle(
        "is-drinking-overlay-visible",
        canShow
    );
}


function preloadDrinkingOverlay() {
    if (
        !beerDrinkingOverlay ||
        beerState.drinkingOverlayPreloadStarted
    ) {
        return;
    }

    beerState.drinkingOverlayPreloadStarted = true;

    const preloader = new Image();
    preloader.decoding = "async";
    preloader.onload = () => {
        beerDrinkingOverlay.src =
            BEER_DRINKING_OVERLAY_URL;
        beerDrinkingOverlay.hidden = false;
        beerState.drinkingOverlayAvailable = true;
        setDrinkingOverlayVisible(
            beerState.useDrinkingOverlayForCurrentDrink &&
            shouldShowDrinkingOverlay(
                beerState.motionStartedAt === null
                    ? 0
                    : performance.now() -
                        beerState.motionStartedAt
            ) &&
            beerState.motionState !== "lowering" &&
            beerState.motionState !== "idle"
        );
    };
    preloader.onerror = () => {
        beerState.drinkingOverlayAvailable = false;
        setDrinkingOverlayVisible(false);
    };
    preloader.src = BEER_DRINKING_OVERLAY_URL;
}


function renderBeerIdleFrame(index) {
    if (!beerIdleImage) {
        return;
    }

    const normalizedIndex =
        index % BEER_IDLE_FRAME_URLS.length;
    const preloadedFrame =
        beerIdleState.preloadedFrames[
            normalizedIndex
        ];

    beerIdleState.frameIndex = normalizedIndex;
    beerIdleImage.src =
        preloadedFrame?.src ??
        BEER_IDLE_FRAME_URLS[normalizedIndex];
}


function preloadBeerIdleFrames() {
    if (beerIdleState.preloadPromise) {
        return beerIdleState.preloadPromise;
    }

    beerIdleState.preloadPromise = Promise.all(
        BEER_IDLE_FRAME_URLS.map((source) => (
            new Promise((resolve, reject) => {
                const frame = new Image();
                frame.decoding = "async";
                frame.onload = () => resolve(frame);
                frame.onerror = () => reject(
                    new Error(
                        `맥주 대기 프레임을 불러오지 못했습니다: ${source}`
                    )
                );
                frame.src = source;
            })
        ))
    ).then((frames) => {
        beerIdleState.preloadedFrames = frames;
        return frames;
    }).catch((error) => {
        beerIdleState.preloadPromise = null;
        console.error(error);
        throw error;
    });

    return beerIdleState.preloadPromise;
}


function showBeerIdleSprite(shouldShow) {
    if (!beerGlass || !beerIdleImage) {
        return;
    }

    beerGlass.classList.toggle(
        "is-idle-sprite",
        shouldShow
    );
    beerIdleImage.hidden = !shouldShow;
}


function scheduleNextBeerIdleFrame() {
    if (
        !beerIdleState.isPlaying ||
        beerIdleState.timerId !== null
    ) {
        return;
    }

    beerIdleState.timerId = window.setTimeout(() => {
        beerIdleState.timerId = null;

        if (!beerIdleState.isPlaying) {
            return;
        }

        renderBeerIdleFrame(
            beerIdleState.frameIndex + 1
        );
        scheduleNextBeerIdleFrame();
    }, BEER_IDLE_FRAME_MS);
}


function canPlayBeerIdleAnimation() {
    return Boolean(
        beerIdleImage &&
        beerState.amount === 100 &&
        beerState.motionState === "idle" &&
        !beerState.isDrinking &&
        !beerState.isRefilling &&
        !document.hidden
    );
}


async function startBeerIdleAnimation() {
    if (!canPlayBeerIdleAnimation()) {
        return;
    }

    showBeerIdleSprite(true);

    if (reducedMotionQuery.matches) {
        stopBeerIdleAnimation({
            keepSpriteVisible: true,
        });
        renderBeerIdleFrame(0);
        return;
    }

    if (beerIdleState.isPlaying) {
        return;
    }

    const generation = beerIdleState.generation;

    try {
        await preloadBeerIdleFrames();
    } catch (error) {
        showBeerIdleSprite(false);
        return;
    }

    if (
        generation !== beerIdleState.generation ||
        beerIdleState.isPlaying ||
        !canPlayBeerIdleAnimation()
    ) {
        return;
    }

    beerIdleState.isPlaying = true;
    renderBeerIdleFrame(beerIdleState.frameIndex);
    scheduleNextBeerIdleFrame();
}


function stopBeerIdleAnimation({
    keepSpriteVisible = false,
} = {}) {
    beerIdleState.generation += 1;
    beerIdleState.isPlaying = false;

    if (beerIdleState.timerId !== null) {
        window.clearTimeout(
            beerIdleState.timerId
        );
        beerIdleState.timerId = null;
    }

    if (!keepSpriteVisible) {
        showBeerIdleSprite(false);
    }
}


function syncBeerIdleAnimation() {
    if (canPlayBeerIdleAnimation()) {
        startBeerIdleAnimation();
        return;
    }

    stopBeerIdleAnimation({
        keepSpriteVisible:
            document.hidden &&
            beerState.amount === 100,
    });
}


function setAiStatus(status) {
    if (!Object.values(AI_STATUS).includes(status)) {
        console.error(`지원하지 않는 AI 상태입니다: ${status}`);
        return;
    }

    aiState.status = status;
    console.log(`[AI 상태] ${aiState.status}`);
}


function clearBubbleDismissTimer() {
    if (bubbleDismissTimerId !== null) {
        window.clearTimeout(bubbleDismissTimerId);
        bubbleDismissTimerId = null;
    }
}


function removeCurrentBubbleImmediately() {
    clearBubbleDismissTimer();

    if (responseArea) {
        responseArea.replaceChildren();
    }
}


function createBubble(className, message = "") {
    if (!responseArea) {
        return null;
    }

    removeCurrentBubbleImmediately();

    const bubble = document.createElement("div");
    bubble.className = `scene-bubble ${className}`;
    bubble.textContent = message;

    responseArea.appendChild(bubble);

    window.requestAnimationFrame(() => {
        bubble.classList.add("is-visible");
    });

    return bubble;
}


function showUserBubble(message) {
    return createBubble("user-bubble", message);
}


function hideBubble(bubble) {
    if (!bubble || !bubble.isConnected) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        bubble.classList.remove("is-visible");
        bubble.classList.add("is-leaving");

        window.setTimeout(() => {
            bubble.remove();
            resolve();
        }, BUBBLE_LEAVE_MS);
    });
}


function hasScrollableReply(bubble) {
    const textElement = bubble?.querySelector(
        ".streaming-text"
    );

    if (!textElement) {
        return false;
    }

    return (
        textElement.scrollHeight
        > textElement.clientHeight + 1
    );
}


function scheduleAiBubbleDismiss(bubble, messageLength) {
    clearBubbleDismissTimer();

    if (hasScrollableReply(bubble)) {
        return;
    }

    const visibleDuration = clamp(
        AI_BUBBLE_MIN_VISIBLE_MS + messageLength * 28,
        AI_BUBBLE_MIN_VISIBLE_MS,
        AI_BUBBLE_MAX_VISIBLE_MS
    );

    bubbleDismissTimerId = window.setTimeout(async () => {
        bubbleDismissTimerId = null;
        await hideBubble(bubble);
    }, visibleDuration);
}


function createStreamingBubble() {
    if (!responseArea) {
        return null;
    }

    removeCurrentBubbleImmediately();

    const bubble = document.createElement("div");
    bubble.className = "scene-bubble ai-bubble is-streaming";

    const textElement = document.createElement("span");
    textElement.className = "streaming-text";

    const waitingIndicator = document.createElement("span");
    waitingIndicator.className = "waiting-indicator";
    waitingIndicator.textContent = ".";

    bubble.appendChild(textElement);
    bubble.appendChild(waitingIndicator);
    responseArea.appendChild(bubble);

    window.requestAnimationFrame(() => {
        bubble.classList.add("is-visible");
    });

    return {
        bubble,
        textElement,
        waitingIndicator,
    };
}


function showSystemBubble(message) {
    const bubble = createBubble(
        "ai-bubble refill-bubble",
        message
    );

    scheduleAiBubbleDismiss(bubble, message.length);

    return bubble;
}


function startWaitingAnimation(waitingIndicator) {
    const frames = [".", "..", "..."];
    let frameIndex = 0;
    let isStopped = false;

    waitingIndicator.textContent = frames[frameIndex];

    const timerId = window.setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        waitingIndicator.textContent = frames[frameIndex];
    }, WAITING_FRAME_INTERVAL_MS);

    return function stopWaitingAnimation() {
        if (isStopped) {
            return;
        }

        isStopped = true;
        window.clearInterval(timerId);

        if (waitingIndicator.isConnected) {
            waitingIndicator.remove();
        }
    };
}


function createTypingController(textElement, onTypingStart) {
    let pendingText = "";
    let displayedText = "";
    let timerId = null;
    let streamFinished = false;
    let typingStarted = false;
    let isResolved = false;
    let resolveFinished = null;
    let shouldFollowOutput = true;

    const finished = new Promise((resolve) => {
        resolveFinished = resolve;
    });

    function isNearScrollBottom() {
        const distanceFromBottom =
            textElement.scrollHeight
            - textElement.clientHeight
            - textElement.scrollTop;

        return (
            distanceFromBottom
            <= SCROLL_BOTTOM_THRESHOLD_PX
        );
    }

    function followLatestText() {
        if (!shouldFollowOutput) {
            return;
        }

        textElement.scrollTop =
            textElement.scrollHeight;
    }

    textElement.addEventListener(
        "scroll",
        () => {
            shouldFollowOutput =
                isNearScrollBottom();
        },
        { passive: true }
    );

    function finishTypingIfReady() {
        if (
            streamFinished &&
            pendingText.length === 0 &&
            !isResolved
        ) {
            isResolved = true;

            if (timerId !== null) {
                window.clearInterval(timerId);
                timerId = null;
            }

            resolveFinished(displayedText.trim());
        }
    }

    function typeNextCharacter() {
        if (pendingText.length > 0) {
            if (!typingStarted) {
                typingStarted = true;
                onTypingStart();
            }

            const nextCharacter = pendingText[0];
            pendingText = pendingText.slice(1);
            displayedText += nextCharacter;
            textElement.textContent = displayedText;
            followLatestText();
        }

        finishTypingIfReady();
    }

    function startTimer() {
        if (timerId !== null) {
            return;
        }

        timerId = window.setInterval(
            typeNextCharacter,
            TYPE_INTERVAL_MS
        );
    }

    return {
        append(text) {
            if (!text) {
                return;
            }

            pendingText += text;
            startTimer();
        },

        finish() {
            streamFinished = true;
            startTimer();
            finishTypingIfReady();
        },

        cancel() {
            if (timerId !== null) {
                window.clearInterval(timerId);
                timerId = null;
            }

            pendingText = "";
            streamFinished = true;
        },

        finished,
    };
}


function setLoading(isLoading) {
    isSending = isLoading;

    syncRequestControls();
}


function syncRequestControls() {
    if (!messageInput || !submitButton) {
        return;
    }

    const cooldownActive = Date.now() < cooldownUntil;
    const isDisabled = (
        isSending ||
        cooldownActive ||
        permanentlyDisabled
    );

    messageInput.disabled = isDisabled;
    submitButton.disabled = isDisabled;

    submitButton.classList.toggle(
        "is-loading",
        isSending
    );

    submitButton.setAttribute(
        "aria-label",
        isSending
            ? "답변 생성 중"
            : "메시지 보내기"
    );
}


function clearCooldownTimer() {
    if (cooldownTimer !== null) {
        window.clearInterval(cooldownTimer);
        cooldownTimer = null;
    }
}


function startCooldown(seconds, message = "") {
    clearCooldownTimer();
    cooldownUntil = Date.now() + Math.max(0, seconds) * 1000;

    const updateCountdown = () => {
        const remaining = Math.max(
            0,
            Math.ceil((cooldownUntil - Date.now()) / 1000)
        );

        if (requestStatus) {
            requestStatus.textContent = remaining > 0
                ? `${message || "잠깐만 기다려줘."} ${remaining}초`
                : "";
        }

        syncRequestControls();

        if (remaining <= 0) {
            clearCooldownTimer();
            cooldownUntil = 0;
            syncRequestControls();
            if (!entryGuideState.isOpen) {
                messageInput?.focus();
            }
        }
    };

    updateCountdown();
    cooldownTimer = window.setInterval(updateCountdown, 250);
}


function disableChatPermanently(message) {
    clearCooldownTimer();
    permanentlyDisabled = true;
    cooldownUntil = 0;
    if (requestStatus) {
        requestStatus.textContent = message;
    }
    syncRequestControls();
}


class ChatRequestError extends Error {
    constructor(data, status) {
        super(
            data?.message ||
            `서버 오류: ${status}`
        );
        this.name = "ChatRequestError";
        this.errorCode = data?.error_code || "REQUEST_FAILED";
        this.retryAfter = Number.isFinite(data?.retry_after)
            ? data.retry_after
            : null;
    }
}


async function streamMessage(message, onChunk) {
    const requestId = crypto.randomUUID();
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            session_id: sessionId,
            request_id: requestId,
            message: message,
            history: chatHistory.slice(
                -MAX_API_HISTORY_MESSAGES
            ),
        }),
    });

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        throw new Error("서버 응답을 읽을 수 없습니다.");
    }

    if (!response.ok || !data?.success) {
        throw new ChatRequestError(data, response.status);
    }

    if (!data.message) {
        throw new Error("빈 응답이 반환되었습니다.");
    }

    onChunk(data.message);
    return data.message.trim();
}


function getBeerLevelName(amount) {
    if (amount >= 100) {
        return "full";
    }

    if (amount <= 0) {
        return "empty";
    }

    return String(amount);
}


function renderBeer({
    visualLevel = beerState.amount,
    syncIdle = true,
} = {}) {
    if (!beerGlass) {
        return;
    }

    const parsedAmount =
        Number.parseFloat(beerState.amount);
    const amount = Number.isFinite(parsedAmount)
        ? clamp(parsedAmount, 0, 100)
        : 100;
    const parsedVisualLevel =
        Number.parseFloat(visualLevel);
    const safeVisualLevel = Number.isFinite(
        parsedVisualLevel
    )
        ? clamp(parsedVisualLevel, 0, 100)
        : amount;

    beerState.amount = amount;
    beerState.visualAmount = safeVisualLevel;

    window.beer3D?.setAmount(safeVisualLevel);
    setBeerVisualLevel(safeVisualLevel);

    beerGlass.dataset.beerLevel =
        getBeerLevelName(Math.round(amount));

    beerGlass.classList.toggle(
        "is-empty",
        amount <= 0
    );

    beerGlass.setAttribute(
        "aria-valuenow",
        String(Math.round(amount))
    );

    beerGlass.setAttribute(
        "aria-valuetext",
        `${Math.round(amount)}% 남음`
    );

    if (syncIdle) {
        syncBeerIdleAnimation();
    }
}


function prepareGulpAudio() {
    const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

    if (!AudioContextClass) {
        return;
    }

    if (!gulpAudioContext) {
        gulpAudioContext =
            new AudioContextClass();
    }

    if (gulpAudioContext.state === "suspended") {
        gulpAudioContext.resume().catch(() => {});
    }
}


function playGulpSound() {
    if (
        !gulpAudioContext ||
        gulpAudioContext.state !== "running"
    ) {
        return;
    }

    const now = gulpAudioContext.currentTime;
    const oscillator =
        gulpAudioContext.createOscillator();
    const gain = gulpAudioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(185, now);
    oscillator.frequency.exponentialRampToValueAtTime(
        92,
        now + 0.18
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
        0.045,
        now + 0.035
    );
    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.18
    );

    oscillator.connect(gain);
    gain.connect(gulpAudioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.19);
}


function setDrinkStatusText(
    message,
    {
        mode = DRINK_STATUS_MODE.DEFAULT,
        force = false,
    } = {}
) {
    if (!beerStatus) {
        return false;
    }

    const currentPriority =
        DRINK_STATUS_PRIORITY[
            drinkStatusState.mode
        ] ?? 0;
    const nextPriority =
        DRINK_STATUS_PRIORITY[mode] ?? 0;

    if (!force && nextPriority < currentPriority) {
        return false;
    }

    drinkStatusState.mode = mode;
    beerStatus.dataset.statusMode = mode;
    beerStatus.textContent = message;

    return true;
}


function clearDrinkStatusText({
    mode = null,
} = {}) {
    if (
        mode !== null &&
        drinkStatusState.mode !== mode
    ) {
        return;
    }

    drinkStatusState.mode =
        DRINK_STATUS_MODE.DEFAULT;

    if (beerStatus) {
        beerStatus.dataset.statusMode =
            DRINK_STATUS_MODE.DEFAULT;
        beerStatus.textContent = "";
    }
}


function stopGulpStatusCycle() {
    if (drinkStatusState.gulpTimerId !== null) {
        window.clearTimeout(
            drinkStatusState.gulpTimerId
        );
        drinkStatusState.gulpTimerId = null;
    }

    drinkStatusState.gulpFrameIndex = 0;
    clearDrinkStatusText({
        mode: DRINK_STATUS_MODE.DRINKING,
    });
}


function startGulpStatusCycle() {
    stopGulpStatusCycle();

    const frames = [
        "꿀꺽...",
        "꿀꺽 꿀꺽...",
    ];

    const showNextFrame = () => {
        if (
            !beerState.isDrinking ||
            (
                beerState.motionState !==
                    "nearMouth" &&
                beerState.motionState !==
                    "gulping"
            )
        ) {
            stopGulpStatusCycle();
            return;
        }

        setDrinkStatusText(
            frames[
                drinkStatusState.gulpFrameIndex
            ],
            {
                mode: DRINK_STATUS_MODE.DRINKING,
                force: true,
            }
        );

        drinkStatusState.gulpFrameIndex =
            (
                drinkStatusState.gulpFrameIndex +
                1
            ) % frames.length;
        drinkStatusState.gulpTimerId =
            window.setTimeout(
                showNextFrame,
                GULP_STATUS_INTERVAL_MS
            );
    };

    showNextFrame();
}


function clearAutoPourResumeTimer() {
    if (
        drinkStatusState.autoPourResumeTimerId ===
        null
    ) {
        return;
    }

    window.clearTimeout(
        drinkStatusState.autoPourResumeTimerId
    );
    drinkStatusState.autoPourResumeTimerId = null;
}


function restoreDrinkStatusText() {
    if (beerState.isDrinking) {
        return;
    }

    if (beerState.isRefilling) {
        setDrinkStatusText(
            "맥주를 따르는 중...",
            {
                mode:
                    DRINK_STATUS_MODE.REFILLING,
                force: true,
            }
        );
        return;
    }

    if (
        refillState.pourState ===
        POUR_STATE.WAITING_FOR_AI
    ) {
        setDrinkStatusText(
            "답변을 기다리는 중...",
            {
                mode:
                    DRINK_STATUS_MODE.REFILLING,
                force: true,
            }
        );
        return;
    }

    if (beerState.amount <= 0) {
        clearDrinkStatusText();
        return;
    }

    setDrinkStatusText(
        "잔을 누르면 한 모금 마실 수 있어.",
        {
            mode: DRINK_STATUS_MODE.DEFAULT,
            force: true,
        }
    );
}


function clearFinishCelebration() {
    if (
        drinkStatusState.celebrationTimerId !==
        null
    ) {
        window.clearTimeout(
            drinkStatusState.celebrationTimerId
        );
        drinkStatusState.celebrationTimerId =
            null;
    }

    drinkStatusState.celebrationMinimumUntil = 0;

    clearDrinkStatusText({
        mode: DRINK_STATUS_MODE.CELEBRATING,
    });
}


function showFinishCelebration() {
    clearFinishCelebration();
    stopGulpStatusCycle();

    const now = performance.now();
    drinkStatusState.celebrationMinimumUntil =
        now + FINISH_STATUS_MINIMUM_MS;

    setDrinkStatusText("캬~", {
        mode: DRINK_STATUS_MODE.CELEBRATING,
        force: true,
    });

    drinkStatusState.celebrationTimerId =
        window.setTimeout(() => {
            drinkStatusState.celebrationTimerId =
                null;
            drinkStatusState
                .celebrationMinimumUntil = 0;
            clearDrinkStatusText({
                mode:
                    DRINK_STATUS_MODE.CELEBRATING,
            });
            restoreDrinkStatusText();
            tryStartAutoPour();
        }, FINISH_STATUS_VISIBLE_MS);
}


function onBeerEmpty() {
    if (refillState.beerIsEmpty) {
        tryStartAutoPour();
        return;
    }

    refillState.beerIsEmpty = true;
    refillState.refillPending = true;
    refillState.refillScheduled = true;
    refillState.hasStartedForEmptyCycle = false;
    console.log("[이벤트] 맥주가 비었습니다.");
    tryStartAutoPour();
}


function onAiFinished() {
    refillState.aiHasFinished = true;
    console.log("[이벤트] AI 답변이 끝났습니다.");
    tryStartAutoPour();
}


function setPourState(nextState) {
    if (!Object.values(POUR_STATE).includes(nextState)) {
        return;
    }

    refillState.pourState = nextState;
    refillActor.dataset.pourState = nextState;

    const bottleIsVisible = [
        POUR_STATE.ENTERING,
        POUR_STATE.TILTING,
        POUR_STATE.POURING,
        POUR_STATE.UNTILTING,
    ].includes(nextState);
    const bottleIsTilted = [
        POUR_STATE.TILTING,
        POUR_STATE.POURING,
    ].includes(nextState);

    refillActor.classList.toggle(
        "is-visible",
        bottleIsVisible
    );
    refillActor.classList.toggle(
        "is-tilted",
        bottleIsTilted
    );
    refillActor.classList.toggle(
        "is-leaving",
        nextState === POUR_STATE.LEAVING
    );
}


function getRefillBottleHeightRatio() {
    const currentRatio = window.matchMedia(
        "(max-width: 768px), " +
            "(max-width: 900px) and " +
            "(orientation: landscape)"
    ).matches
        ? 1.10
        : 1.55;

    return currentRatio *
        BOTTLE_SIZE_MULTIPLIER;
}


function updateRefillBottleLayout() {
    if (
        !beerScene ||
        !beerGlass ||
        !refillActor ||
        !refillBottle
    ) {
        return null;
    }

    const sceneRect =
        beerScene.getBoundingClientRect();
    const glassRect =
        beerGlass.getBoundingClientRect();
    const heightRatio =
        getRefillBottleHeightRatio();
    const layout = getRefillBottleLayout({
        sceneLeft: sceneRect.left,
        sceneTop: sceneRect.top,
        glassLeft: glassRect.left,
        glassTop: glassRect.top,
        glassWidth: glassRect.width,
        glassHeight: glassRect.height,
        heightRatio,
        nativeAspectRatio:
            BOTTLE_NATIVE_ASPECT_RATIO,
        tiltDegrees: BOTTLE_TILT_DEGREES,
        transformOriginX:
            BOTTLE_TRANSFORM_ORIGIN.x,
        transformOriginY:
            BOTTLE_TRANSFORM_ORIGIN.y,
        mouthAnchorX: BOTTLE_MOUTH_ANCHOR.x,
        mouthAnchorY: BOTTLE_MOUTH_ANCHOR.y,
    });

    refillActor.style.left =
        `${layout.actorLeft}px`;
    refillActor.style.top =
        `${layout.actorTop}px`;
    refillActor.style.width =
        `${layout.bottleWidth}px`;
    refillActor.style.height =
        `${layout.bottleHeight}px`;
    refillActor.dataset.heightRatio =
        heightRatio.toFixed(2);
    refillActor.dataset.tiltDegrees =
        String(BOTTLE_TILT_DEGREES);

    return layout;
}


function setPourStreamVisible(shouldShow) {
    beerPourStream.classList.toggle(
        "is-visible",
        Boolean(shouldShow)
    );
}


function getBottleMouthPosition() {
    const mouthRect =
        refillBottleMouth.getBoundingClientRect();

    return {
        x: mouthRect.left + mouthRect.width / 2,
        y: mouthRect.top + mouthRect.height / 2,
    };
}


function getGlassPourTarget() {
    const glassRect =
        beerGlass.getBoundingClientRect();

    return {
        x: glassRect.left + glassRect.width * 0.4,
        y: glassRect.top + glassRect.height * 0.16,
    };
}


function updatePourStreamGeometry() {
    if (
        !beerScene ||
        !refillBottleMouth ||
        !beerPourStream
    ) {
        return;
    }

    const sceneRect =
        beerScene.getBoundingClientRect();
    const mouth = getBottleMouthPosition();
    const target = getGlassPourTarget();
    const { length, angle } =
        getPourStreamGeometry({
            mouthX: mouth.x,
            mouthY: mouth.y,
            targetX: target.x,
            targetY: target.y,
        });

    beerPourStream.style.left =
        `${mouth.x - sceneRect.left}px`;
    beerPourStream.style.top =
        `${mouth.y - sceneRect.top}px`;
    beerPourStream.style.width = `${length}px`;
    beerPourStream.style.transform =
        `rotate(${angle}rad)`;
}


function schedulePourGeometryUpdate() {
    if (
        refillState.geometryAnimationFrameId !==
        null
    ) {
        return;
    }

    refillState.geometryAnimationFrameId =
        window.requestAnimationFrame(() => {
            refillState.geometryAnimationFrameId =
                null;
            updatePourStreamGeometry();
        });
}


function cancelPourGeometryUpdate() {
    if (
        refillState.geometryAnimationFrameId ===
        null
    ) {
        return;
    }

    window.cancelAnimationFrame(
        refillState.geometryAnimationFrameId
    );
    refillState.geometryAnimationFrameId = null;
}


function handlePourViewportChange() {
    updateRefillBottleLayout();

    if (
        refillState.pourState ===
            POUR_STATE.TILTING ||
        refillState.pourState ===
            POUR_STATE.POURING
    ) {
        schedulePourGeometryUpdate();
    }
}


function waitForPourStage(
    duration,
    pourSessionId
) {
    return new Promise((resolve) => {
        if (refillState.stageTimerId !== null) {
            window.clearTimeout(
                refillState.stageTimerId
            );
        }

        refillState.stageTimerId =
            window.setTimeout(() => {
                refillState.stageTimerId = null;
                resolve(
                    pourSessionId ===
                    refillState.pourSessionId
                );
            }, duration);
    });
}


function cancelFillAnimation() {
    if (beerState.fillAnimationFrameId === null) {
        return;
    }

    window.cancelAnimationFrame(
        beerState.fillAnimationFrameId
    );
    beerState.fillAnimationFrameId = null;
}


function animateAutoPour(pourSessionId) {
    cancelFillAnimation();

    beerState.amount = 0;
    beerState.visualAmount = 0;
    beerState.accumulatedDrinkMs =
        getConsumedMsForLevel(0);
    renderBeer({
        visualLevel: 0,
        syncIdle: false,
    });

    const startedAt = performance.now();

    return new Promise((resolve) => {
        const update = (now) => {
            beerState.fillAnimationFrameId = null;

            if (
                pourSessionId !==
                    refillState.pourSessionId ||
                refillState.pourState !==
                    POUR_STATE.POURING
            ) {
                resolve(false);
                return;
            }

            const elapsed = now - startedAt;
            const level =
                getAutoPourLevel(elapsed);

            beerState.amount = level;
            beerState.visualAmount = level;
            beerState.accumulatedDrinkMs =
                getConsumedMsForLevel(level);
            renderBeer({
                visualLevel: level,
                syncIdle: false,
            });

            if (level < 100) {
                beerState.fillAnimationFrameId =
                    window.requestAnimationFrame(
                        update
                    );
                return;
            }

            beerState.amount = 100;
            beerState.visualAmount = 100;
            beerState.accumulatedDrinkMs = 0;
            renderBeer({
                visualLevel: 100,
                syncIdle: false,
            });
            resolve(true);
        };

        beerState.fillAnimationFrameId =
            window.requestAnimationFrame(update);
    });
}


function tryStartAutoPour() {
    if (
        beerState.amount !== 0 ||
        beerState.isRefilling ||
        refillState.hasStartedForEmptyCycle
    ) {
        return;
    }

    refillState.refillPending = true;
    refillState.refillScheduled = true;

    if (
        beerState
            .didFinishBeerDuringCurrentDrink &&
        beerState.motionState !== "idle"
    ) {
        return;
    }

    const celebrationDelay = Math.max(
        0,
        drinkStatusState
            .celebrationMinimumUntil -
            performance.now()
    );

    if (celebrationDelay > 0) {
        clearAutoPourResumeTimer();
        drinkStatusState.autoPourResumeTimerId =
            window.setTimeout(() => {
                drinkStatusState
                    .autoPourResumeTimerId = null;
                tryStartAutoPour();
            }, celebrationDelay);
        return;
    }

    if (!refillState.aiHasFinished) {
        if (
            refillState.pourState ===
            POUR_STATE.IDLE
        ) {
            setPourState(
                POUR_STATE.WAITING_FOR_AI
            );
        }
        setDrinkStatusText(
            "답변을 기다리는 중...",
            {
                mode:
                    DRINK_STATUS_MODE.REFILLING,
            }
        );
        return;
    }

    const canStart = canStartAutoPour({
        beerLevel: beerState.amount,
        isAiResponseComplete:
            refillState.aiHasFinished,
        pourState: refillState.pourState,
        refillPending:
            refillState.refillPending,
        hasStartedForEmptyCycle:
            refillState.hasStartedForEmptyCycle,
    });

    if (!canStart) {
        return;
    }

    startAutoPour();
}


function getRandomRefillMessage() {
    const randomIndex = Math.floor(
        Math.random() * REFILL_MESSAGES.length
    );

    return REFILL_MESSAGES[randomIndex];
}


async function finishAutoPour(pourSessionId) {
    if (
        pourSessionId !==
        refillState.pourSessionId
    ) {
        return;
    }

    cancelFillAnimation();
    cancelPourGeometryUpdate();
    setPourStreamVisible(false);
    setPourState(POUR_STATE.IDLE);

    beerState.isRefilling = false;
    beerState.amount = 100;
    beerState.visualAmount = 100;
    beerState.accumulatedDrinkMs = 0;
    beerState.currentDrinkStartedAt = null;
    renderBeer();

    refillState.beerIsEmpty = false;
    refillState.refillPending = false;
    refillState.refillScheduled = false;
    refillState.hasStartedForEmptyCycle = false;

    if (refillState.aiHasFinished) {
        setAiStatus(AI_STATUS.IDLE);
    }

    clearFinishCelebration();
    clearAutoPourResumeTimer();
    setDrinkStatusText(
        "잔을 누르면 한 모금 마실 수 있어.",
        {
            mode: DRINK_STATUS_MODE.DEFAULT,
            force: true,
        }
    );
    startBeerIdleAnimation();
}


async function startAutoPour() {
    if (
        beerState.isRefilling ||
        beerState.amount !== 0 ||
        !refillState.aiHasFinished ||
        refillState.hasStartedForEmptyCycle
    ) {
        return;
    }

    refillState.hasStartedForEmptyCycle = true;
    refillState.refillPending = false;
    refillState.refillScheduled = false;
    refillState.pourSessionId += 1;

    const pourSessionId =
        refillState.pourSessionId;

    beerState.isRefilling = true;
    refillState.refillCount += 1;
    setAiStatus(AI_STATUS.REFILLING);
    clearAutoPourResumeTimer();

    showSystemBubble(getRandomRefillMessage());
    setDrinkStatusText(
        "맥주를 따르는 중...",
        {
            mode: DRINK_STATUS_MODE.REFILLING,
        }
    );

    updateRefillBottleLayout();
    setPourState(POUR_STATE.ENTERING);

    if (!await waitForPourStage(
        POUR_STAGE_DURATION_MS.entering,
        pourSessionId
    )) {
        return;
    }

    setPourState(POUR_STATE.TILTING);

    if (!await waitForPourStage(
        POUR_STAGE_DURATION_MS.tilting,
        pourSessionId
    )) {
        return;
    }

    updatePourStreamGeometry();
    setPourState(POUR_STATE.POURING);
    setPourStreamVisible(true);

    if (!await waitForPourStage(
        POUR_STAGE_DURATION_MS.stream,
        pourSessionId
    )) {
        return;
    }

    const didFill =
        await animateAutoPour(pourSessionId);

    if (!didFill) {
        return;
    }

    setPourStreamVisible(false);

    if (!await waitForPourStage(
        POUR_STAGE_DURATION_MS.stream,
        pourSessionId
    )) {
        return;
    }

    setPourState(POUR_STATE.UNTILTING);

    if (!await waitForPourStage(
        POUR_STAGE_DURATION_MS.untilting,
        pourSessionId
    )) {
        return;
    }

    setPourState(POUR_STATE.LEAVING);

    if (!await waitForPourStage(
        POUR_STAGE_DURATION_MS.leaving,
        pourSessionId
    )) {
        return;
    }

    finishAutoPour(pourSessionId);
}


function getCurrentConsumedMs(
    now = performance.now()
) {
    return getConsumedMsAt({
        accumulatedDrinkMs:
            beerState.accumulatedDrinkMs,
        currentDrinkStartedAt:
            beerState.currentDrinkStartedAt,
        now,
        isDrinking: beerState.isDrinking,
    });
}


function cancelDrinkAnimationFrame() {
    if (beerState.animationFrameId === null) {
        return;
    }

    window.cancelAnimationFrame(
        beerState.animationFrameId
    );
    beerState.animationFrameId = null;
}


function setBeerMotionState(nextState) {
    const motionClassByState = {
        anticipation: "is-anticipating",
        lifting: "is-lifting",
        nearMouth: "is-near-mouth",
        gulping: "is-gulping",
        lowering: "is-lowering",
    };

    beerState.motionState = nextState;
    beerGlass.classList.remove(
        ...BEER_MOTION_CLASS_NAMES
    );

    const motionClass =
        motionClassByState[nextState];

    if (motionClass) {
        beerGlass.classList.add(motionClass);
    }

    beerGlass.dataset.motionState = nextState;
}


function scheduleInteractionFrame(
    drinkSessionId = beerState.drinkSessionId
) {
    if (beerState.animationFrameId !== null) {
        return;
    }

    beerState.animationFrameId =
        window.requestAnimationFrame(
            (timestamp) => {
                updateInteractionFrame(
                    timestamp,
                    drinkSessionId
                );
            }
        );
}


function renderDrinkProgress(
    consumedMs,
    { snapToLogicalLevel = false } = {}
) {
    const safeConsumedMs =
        clampConsumedMs(consumedMs);
    const logicalLevel =
        getLogicalLevel(safeConsumedMs);
    const visualLevel = snapToLogicalLevel
        ? logicalLevel
        : getVisualLevel(safeConsumedMs);

    beerState.amount = logicalLevel;
    renderBeer({
        visualLevel,
        syncIdle: false,
    });

    return {
        consumedMs: safeConsumedMs,
        logicalLevel,
        visualLevel,
    };
}


function releaseActivePointer(pointerId) {
    if (
        typeof pointerId !== "number" ||
        !beerGlass?.hasPointerCapture?.(pointerId)
    ) {
        return;
    }

    try {
        beerGlass.releasePointerCapture(pointerId);
    } catch (error) {
        // 이미 브라우저가 캡처를 해제한 경우에는 무시한다.
    }
}


function playEmptyGlassImpact() {
    tableImpact?.classList.add("is-impacting");

    window.setTimeout(() => {
        tableImpact?.classList.remove(
            "is-impacting"
        );
    }, 420);
}


function finishDrinking({
    atTime = performance.now(),
} = {}) {
    if (
        beerState.motionState === "idle" ||
        beerState.motionState === "lowering"
    ) {
        return;
    }

    const drinkingStartsAt =
        beerState.motionStartedAt === null
            ? null
            : beerState.motionStartedAt +
                BEER_MOTION_DURATIONS.anticipation +
                BEER_MOTION_DURATIONS.lifting;

    if (
        !beerState.isDrinking &&
        drinkingStartsAt !== null &&
        atTime > drinkingStartsAt
    ) {
        startLiquidConsumption(
            drinkingStartsAt
        );
    }

    const consumedMs = beerState.isDrinking
        ? getCurrentConsumedMs(atTime)
        : beerState.accumulatedDrinkMs;
    const consumedThisDrink =
        consumedMs -
        beerState.drinkStartedConsumedMs;
    const activePointerId =
        beerState.activePointerId;
    const currentTransform =
        getComputedStyle(beerGlass).transform;

    beerState.accumulatedDrinkMs = consumedMs;
    beerState.currentDrinkStartedAt = null;
    beerState.isPointerDown = false;
    beerState.isDrinking = false;
    beerState.activePointerId = null;
    beerState.motionStartedAt = null;
    beerState.loweringStartedAt = atTime;
    beerState.drinkSessionId += 1;

    cancelDrinkAnimationFrame();
    window.beer3D?.stopDrinking();
    releaseActivePointer(activePointerId);

    const { logicalLevel } =
        renderDrinkProgress(
            consumedMs,
            { snapToLogicalLevel: true }
        );
    const didFinishBeerThisDrink =
        logicalLevel === 0 &&
        beerState.drinkStartedConsumedMs <
            TOTAL_DRINK_MS &&
        consumedMs >= TOTAL_DRINK_MS;

    beerState.didFinishBeerDuringCurrentDrink =
        didFinishBeerThisDrink;
    stopGulpStatusCycle();

    beerGlass.style.transition = "none";
    setBeerMotionState("lowering");
    beerGlass.style.transform =
        currentTransform === "none"
            ? "translate3d(0, 0, 0) rotate(0) scale(1)"
            : currentTransform;
    void beerGlass.offsetWidth;
    beerGlass.style.transition =
        `transform ${BEER_MOTION_DURATIONS.lowering}ms ` +
        "cubic-bezier(0.22, 0.72, 0.24, 1)";
    beerGlass.style.transform =
        "translate3d(0, 0, 0) rotate(0) scale(1)";

    if (consumedThisDrink >= 10) {
        playGulpSound();
    }

    if (logicalLevel === 0) {
        clearDrinkStatusText();
        playEmptyGlassImpact();
        onBeerEmpty();
    } else {
        setDrinkStatusText(
            "잔을 다시 누르면 더 마실 수 있어.",
            {
                mode:
                    DRINK_STATUS_MODE.DEFAULT,
                force: true,
            }
        );
    }

    scheduleInteractionFrame(
        beerState.drinkSessionId
    );
}


function startLiquidConsumption(startedAt) {
    if (beerState.isDrinking) {
        return;
    }

    beerState.isDrinking = true;
    beerState.currentDrinkStartedAt = startedAt;
    startGulpStatusCycle();
}


function updateHeldMotion(timestamp) {
    const elapsedMs = Math.max(
        0,
        timestamp - beerState.motionStartedAt
    );
    const nextMotionState =
        getHeldMotionState(elapsedMs);

    if (
        nextMotionState !==
        beerState.motionState
    ) {
        setBeerMotionState(nextMotionState);
    }

    if (
        beerState.useDrinkingOverlayForCurrentDrink &&
        shouldShowDrinkingOverlay(elapsedMs)
    ) {
        setDrinkingOverlayVisible(true);
    }

    if (
        (
            nextMotionState === "nearMouth" ||
            nextMotionState === "gulping"
        ) &&
        !beerState.isDrinking
    ) {
        const drinkingStartsAt =
            beerState.motionStartedAt +
            BEER_MOTION_DURATIONS.anticipation +
            BEER_MOTION_DURATIONS.lifting;

        startLiquidConsumption(
            drinkingStartsAt
        );
    }
}


function completeLowering() {
    beerGlass.style.removeProperty("transition");
    beerGlass.style.removeProperty("transform");
    beerState.loweringStartedAt = null;
    beerState.useDrinkingOverlayForCurrentDrink =
        false;
    setDrinkingOverlayVisible(false);
    setBeerMotionState("idle");
    syncBeerIdleAnimation();

    const shouldCelebrate =
        beerState
            .didFinishBeerDuringCurrentDrink;
    beerState.didFinishBeerDuringCurrentDrink =
        false;

    if (shouldCelebrate) {
        showFinishCelebration();
        tryStartAutoPour();
    }
}


function updateLowering(timestamp) {
    const elapsedMs = Math.max(
        0,
        timestamp - beerState.loweringStartedAt
    );

    if (
        beerState.drinkingOverlayVisible &&
        elapsedMs >=
            BEER_MOTION_DURATIONS.lowering *
            0.22
    ) {
        setDrinkingOverlayVisible(false);
    }

    if (
        elapsedMs >=
        BEER_MOTION_DURATIONS.lowering
    ) {
        completeLowering();
        return false;
    }

    return true;
}


function updateInteractionFrame(
    timestamp,
    drinkSessionId
) {
    beerState.animationFrameId = null;

    if (
        drinkSessionId !==
            beerState.drinkSessionId ||
        beerState.motionState === "idle"
    ) {
        return;
    }

    if (beerState.motionState === "lowering") {
        if (updateLowering(timestamp)) {
            scheduleInteractionFrame(
                drinkSessionId
            );
        }
        return;
    }

    if (!beerState.isPointerDown) {
        return;
    }

    updateHeldMotion(timestamp);

    if (beerState.isDrinking) {
        const consumedMs =
            getCurrentConsumedMs(timestamp);

        renderDrinkProgress(consumedMs);

        if (consumedMs >= TOTAL_DRINK_MS) {
            finishDrinking({
                atTime: timestamp,
            });
            return;
        }
    }

    scheduleInteractionFrame(drinkSessionId);
}


function startDrinking({
    pointerId,
    startedAt = performance.now(),
} = {}) {
    if (
        beerState.motionState !== "idle" ||
        beerState.isRefilling ||
        refillState.pourState !== POUR_STATE.IDLE ||
        beerState.amount <= 0
    ) {
        return;
    }

    stopBeerIdleAnimation();
    beerState.isPointerDown = true;
    beerState.isDrinking = false;
    beerState.activePointerId = pointerId;
    beerState.currentDrinkStartedAt = null;
    beerState.drinkStartedConsumedMs =
        beerState.accumulatedDrinkMs;
    beerState.motionStartedAt = startedAt;
    beerState.loweringStartedAt = null;
    beerState.useDrinkingOverlayForCurrentDrink =
        beerState.drinkingOverlayAvailable;
    beerState.didFinishBeerDuringCurrentDrink =
        false;
    beerState.drinkSessionId += 1;

    setDrinkingOverlayVisible(false);
    setBeerMotionState("anticipation");
    clearDrinkStatusText();

    const drinkSessionId =
        beerState.drinkSessionId;

    cancelDrinkAnimationFrame();
    scheduleInteractionFrame(drinkSessionId);
}


function handlePressStart(event) {
    if (
        event.isPrimary === false ||
        event.button !== 0 ||
        beerState.isPointerDown ||
        beerState.motionState !== "idle" ||
        beerState.isRefilling ||
        refillState.pourState !== POUR_STATE.IDLE ||
        beerState.amount <= 0
    ) {
        return;
    }

    event.preventDefault();
    prepareGulpAudio();

    const pointerId = event.pointerId;

    if (typeof pointerId === "number") {
        try {
            beerGlass.setPointerCapture(
                pointerId
            );
        } catch (error) {
            // 지원하지 않아도 동작한다.
        }
    }

    startDrinking({
        pointerId,
        startedAt: performance.now(),
    });
}


function handlePressEnd(event) {
    if (
        !beerState.isPointerDown ||
        event.pointerId !==
            beerState.activePointerId
    ) {
        return;
    }

    event.preventDefault();
    finishDrinking();
}


function handlePressCancel(event) {
    if (
        !beerState.isPointerDown ||
        (
            typeof event?.pointerId ===
                "number" &&
            event.pointerId !==
                beerState.activePointerId
        )
    ) {
        return;
    }

    event?.preventDefault?.();
    finishDrinking();
}


function handleBeerKeyboard(event) {
    if (
        event.code !== "Space" &&
        event.code !== "Enter"
    ) {
        return;
    }

    event.preventDefault();

    if (event.type === "keydown") {
        if (
            event.repeat ||
            beerState.isPointerDown ||
            beerState.motionState !== "idle"
        ) {
            return;
        }

        prepareGulpAudio();
        startDrinking({
            pointerId: KEYBOARD_POINTER_ID,
            startedAt: performance.now(),
        });

        return;
    }

    if (
        beerState.activePointerId ===
        KEYBOARD_POINTER_ID
    ) {
        finishDrinking();
    }
}


function cancelScheduledRefill() {
    if (!refillState.refillScheduled) {
        return;
    }

    refillState.refillPending = false;
    refillState.refillScheduled = false;
    refillState.hasStartedForEmptyCycle = false;

    if (
        refillState.pourState ===
        POUR_STATE.WAITING_FOR_AI
    ) {
        setPourState(POUR_STATE.IDLE);
    }
}


function setBeerAmount(value = 100) {
    if (
        beerState.motionState !== "idle" ||
        beerState.isRefilling
    ) {
        return;
    }

    const parsedValue = Number.parseFloat(value);
    const amount = Number.isFinite(parsedValue)
        ? clamp(Math.round(parsedValue), 0, 100)
        : 100;

    if (amount > 0) {
        cancelScheduledRefill();
        refillState.beerIsEmpty = false;
    }

    beerState.amount = amount;
    beerState.visualAmount = amount;
    beerState.accumulatedDrinkMs =
        getConsumedMsForLevel(amount);
    beerState.currentDrinkStartedAt = null;

    renderBeer();

    if (amount === 0) {
        onBeerEmpty();
    }
}


function handleWindowBlur() {
    if (beerState.isPointerDown) {
        finishDrinking();
    }
}


function handleVisibilityChange() {
    if (
        document.hidden &&
        beerState.isPointerDown
    ) {
        finishDrinking();
    }

    syncBeerIdleAnimation();
}


messageInput.addEventListener(
    "compositionstart",
    () => {
        isComposing = true;
    }
);


messageInput.addEventListener(
    "compositionend",
    () => {
        isComposing = false;
    }
);


messageInput.addEventListener(
    "keydown",
    (event) => {
        if (
            event.key !== "Enter" ||
            event.shiftKey
        ) {
            return;
        }

        if (
            isComposing ||
            event.isComposing ||
            event.keyCode === 229
        ) {
            return;
        }

        event.preventDefault();

        if (
            messageInput.disabled ||
            submitButton.disabled ||
            !messageInput.value.trim()
        ) {
            return;
        }

        chatForm.requestSubmit();
    }
);


chatForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (
            isSending ||
            permanentlyDisabled ||
            Date.now() < cooldownUntil
        ) {
            return;
        }

        const message =
            messageInput.value.trim();

        if (!message) {
            return;
        }

        isSending = true;
        clearBubbleDismissTimer();

        const userBubble =
            showUserBubble(message);

        setLoading(true);

        refillState.aiHasFinished = false;

        setAiStatus(AI_STATUS.THINKING);

        let bubble = null;
        let textElement = null;
        let stopWaitingAnimation = null;
        let typingController = null;

        try {
            const bufferedChunks = [];
            let typingReady = false;

            let streamError = null;
            const streamPromise = streamMessage(
                message,
                (chunk) => {
                    if (
                        typingReady &&
                        typingController
                    ) {
                        typingController.append(chunk);
                        return;
                    }

                    bufferedChunks.push(chunk);
                }
            ).catch((error) => {
                streamError = error;
                return "";
            });

            await wait(USER_BUBBLE_VISIBLE_MS);
            await hideBubble(userBubble);

            const streamingElements =
                createStreamingBubble();

            bubble = streamingElements.bubble;
            textElement = streamingElements.textElement;

            stopWaitingAnimation =
                startWaitingAnimation(
                    streamingElements.waitingIndicator
                );

            typingController =
                createTypingController(
                    textElement,
                    () => {
                        stopWaitingAnimation();
                        setAiStatus(AI_STATUS.TALKING);
                    }
                );

            typingReady = true;

            for (const chunk of bufferedChunks) {
                typingController.append(chunk);
            }

            const streamedReply =
                await streamPromise;

            if (streamError) {
                throw streamError;
            }

            if (!streamedReply) {
                throw new Error(
                    "빈 응답이 반환되었습니다."
                );
            }

            typingController.finish();

            const displayedReply =
                await typingController.finished;

            if (!displayedReply) {
                throw new Error(
                    "표시할 답변이 없습니다."
                );
            }

            stopWaitingAnimation();

            bubble.classList.remove("is-streaming");

            scheduleAiBubbleDismiss(
                bubble,
                displayedReply.length
            );

            setAiStatus(AI_STATUS.IDLE);
            onAiFinished();

            chatHistory.push({
                role: "user",
                content: message,
            });

            chatHistory.push({
                role: "assistant",
                content: displayedReply,
            });

            chatHistory = saveHistory(chatHistory);
            messageInput.value = "";
            if (mobileInputQuery.matches) {
                resizeMessageInput();
            }
            startCooldown(NORMAL_COOLDOWN_SECONDS);
        } catch (error) {
            console.error(error);

            await hideBubble(userBubble);

            if (!bubble) {
                const elements =
                    createStreamingBubble();

                bubble = elements.bubble;
                textElement = elements.textElement;

                elements.waitingIndicator.remove();
            }

            if (typingController) {
                typingController.cancel();
            }

            if (stopWaitingAnimation) {
                stopWaitingAnimation();
            }

            bubble.classList.remove("is-streaming");

            const errorMessage = error instanceof ChatRequestError
                ? error.message
                : "잠깐 문제가 생겼네. 조금 있다가 다시 얘기해줘.";

            textElement.textContent = errorMessage;

            scheduleAiBubbleDismiss(
                bubble,
                errorMessage.length
            );

            setAiStatus(AI_STATUS.IDLE);
            onAiFinished();

            if (error instanceof ChatRequestError) {
                if (
                    error.errorCode === "SESSION_LIMIT_REACHED" ||
                    error.errorCode === "DAILY_LIMIT_REACHED"
                ) {
                    disableChatPermanently(error.message);
                } else if (error.retryAfter !== null) {
                    startCooldown(
                        error.retryAfter,
                        error.message
                    );
                }
            }
        } finally {
            isSending = false;
            setLoading(false);

            if (!entryGuideState.isOpen) {
                messageInput.focus();
            }
        }
    }
);


beerGlass.addEventListener(
    "pointerdown",
    handlePressStart
);

beerGlass.addEventListener(
    "pointerup",
    handlePressEnd
);

beerGlass.addEventListener(
    "pointercancel",
    handlePressCancel
);

beerGlass.addEventListener(
    "lostpointercapture",
    handlePressCancel
);

beerGlass.addEventListener(
    "contextmenu",
    (event) => {
        event.preventDefault();
    }
);

beerGlass.addEventListener(
    "keydown",
    handleBeerKeyboard
);

beerGlass.addEventListener(
    "keyup",
    handleBeerKeyboard
);

window.addEventListener(
    "beer3d-ready",
    renderBeer
);

document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
);

window.addEventListener(
    "blur",
    handleWindowBlur
);

window.addEventListener(
    "resize",
    handlePourViewportChange,
    { passive: true }
);

const handleReducedMotionChange = () => {
    if (reducedMotionQuery.matches) {
        stopBeerIdleAnimation({
            keepSpriteVisible:
                beerState.amount === 100,
        });
        renderBeerIdleFrame(0);
        return;
    }

    syncBeerIdleAnimation();
};

if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener(
        "change",
        handleReducedMotionChange
    );
} else {
    reducedMotionQuery.addListener(
        handleReducedMotionChange
    );
}

window.beerIdleAnimation = {
    preload: preloadBeerIdleFrames,
    start: startBeerIdleAnimation,
    stop: stopBeerIdleAnimation,
    renderFrame: renderBeerIdleFrame,
};

window.beerInteractionDebug = Object.freeze({
    getState() {
        return {
            amount: beerState.amount,
            visualAmount:
                beerState.visualAmount,
            consumedMs:
                getCurrentConsumedMs(),
            accumulatedDrinkMs:
                beerState.accumulatedDrinkMs,
            isPointerDown:
                beerState.isPointerDown,
            isDrinking:
                beerState.isDrinking,
            motionState:
                beerState.motionState,
            isRefilling:
                beerState.isRefilling,
            activePointerId:
                beerState.activePointerId,
            animationFrameScheduled:
                beerState.animationFrameId !==
                null,
            drinkSessionId:
                beerState.drinkSessionId,
            refillScheduled:
                refillState.refillScheduled,
            refillCount:
                refillState.refillCount,
            pourState:
                refillState.pourState,
            refillPending:
                refillState.refillPending,
            hasStartedForEmptyCycle:
                refillState.hasStartedForEmptyCycle,
            fillAnimationFrameScheduled:
                beerState.fillAnimationFrameId !==
                null,
            drinkingOverlayAvailable:
                beerState.drinkingOverlayAvailable,
            drinkingOverlayVisible:
                beerState.drinkingOverlayVisible,
            didFinishBeerDuringCurrentDrink:
                beerState
                    .didFinishBeerDuringCurrentDrink,
            drinkStatusMode:
                drinkStatusState.mode,
            drinkStatusText:
                beerStatus?.textContent ?? "",
            gulpStatusTimerScheduled:
                drinkStatusState.gulpTimerId !==
                null,
            celebrationTimerScheduled:
                drinkStatusState
                    .celebrationTimerId !== null,
            bottleHeightRatio:
                Number.parseFloat(
                    refillActor?.dataset
                        .heightRatio
                ) || null,
            bottleTiltDegrees:
                Number.parseFloat(
                    refillActor?.dataset
                        .tiltDegrees
                ) || null,
            bottleMouth:
                refillBottleMouth
                    ? getBottleMouthPosition()
                    : null,
            glassPourTarget:
                beerGlass
                    ? getGlassPourTarget()
                    : null,
            bubbleCount:
                beerGlass.querySelectorAll(
                    ".main-beer-mug__bubble"
                ).length,
        };
    },
});

window.entryGuideDebug = Object.freeze({
    getState() {
        return {
            isOpen: entryGuideState.isOpen,
            localDateKey: getLocalDateKey(),
            isAppInert:
                appShell?.hasAttribute("inert") ??
                false,
        };
    },
    open: openEntryGuide,
    close: closeEntryGuide,
    getLocalDateKey,
});

window.setBeerLevel = setBeerAmount;
preloadDrinkingOverlay();
updateRefillBottleLayout();
setPourState(POUR_STATE.IDLE);
setBeerAmount(100);
setAiStatus(AI_STATUS.IDLE);
initializeEntryGuide();
recordSessionStart();
