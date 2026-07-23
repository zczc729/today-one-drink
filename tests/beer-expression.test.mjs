import {
    readFile,
} from "node:fs/promises";
import {
    fileURLToPath,
} from "node:url";
import {
    dirname,
    resolve,
} from "node:path";

const testDirectory = dirname(
    fileURLToPath(import.meta.url)
);
const projectRoot = resolve(
    testDirectory,
    ".."
);
const [
    appSource,
    styleSource,
    templateSource,
    bottleSource,
] = await Promise.all([
    readFile(
        resolve(projectRoot, "static/app.js"),
        "utf8"
    ),
    readFile(
        resolve(projectRoot, "static/style.css"),
        "utf8"
    ),
    readFile(
        resolve(
            projectRoot,
            "templates/index.html"
        ),
        "utf8"
    ),
    readFile(
        resolve(
            projectRoot,
            "static/assets/beer-bottle-pour.svg"
        ),
        "utf8"
    ),
]);

let assertionCount = 0;

function assert(condition, label) {
    assertionCount += 1;

    if (!condition) {
        throw new Error(label);
    }
}

function assertIncludes(source, expected, label) {
    assert(source.includes(expected), label);
}

const bubbleTags =
    templateSource.match(
        /class="main-beer-mug__bubble"/g
    ) ?? [];
const bubbleSizes = [
    ...templateSource.matchAll(
        /--bubble-size:(\d+)px/g
    ),
].map((match) => Number(match[1]));
const bubbleSpeeds = [
    ...templateSource.matchAll(
        /--bubble-speed:(\d+)ms/g
    ),
].map((match) => Number(match[1]));
const bubblePositions = [
    ...templateSource.matchAll(
        /--bubble-x:(\d+)%/g
    ),
].map((match) => Number(match[1]));

assert(
    bubbleTags.length === 16,
    "desktop bubble pool must contain 16 nodes"
);
assert(
    bubbleSizes.every(
        (size) => [2, 3, 4].includes(size)
    ),
    "bubble sizes must stay in the 2-4px range"
);
assert(
    bubbleSizes.filter((size) => size === 4)
        .length === 2,
    "large bubbles must remain uncommon"
);
assert(
    Math.min(...bubbleSpeeds) >= 1800 &&
        Math.max(...bubbleSpeeds) <= 3200,
    "bubble speeds must stay in the requested range"
);
assert(
    Math.min(...bubblePositions) <= 20 &&
        Math.max(...bubblePositions) >= 80,
    "bubbles must span the liquid width"
);
assert(
    /\.main-beer-mug__bubble\s*\{[\s\S]*?scale:\s*1\.75;/.test(
        styleSource
    ),
    "the current user-adjusted bubble scale must be preserved"
);
assert(
    /\.beer-motion-stage\s*\{[\s\S]*?translate:\s*-36%\s+0;/.test(
        styleSource
    ),
    "the glass body center must align with the viewport center"
);
assertIncludes(
    styleSource,
    ".main-beer-mug__bubble:nth-of-type(n + 13)",
    "mobile must cap the visible bubble pool at 12"
);

assertIncludes(
    styleSource,
    "height: var(--beer-foam-height, 19%);",
    "foam height must use the continuous CSS variable"
);
assertIncludes(
    styleSource,
    "min-height: 26px;",
    "foam must retain a substantial minimum thickness"
);
assertIncludes(
    styleSource,
    "max-height: 40px;",
    "foam must remain clipped inside the glass"
);
assertIncludes(
    appSource,
    "15 + finalFoamProgress * 4",
    "foam must thicken continuously from 70% to 100%"
);

assert(
    !appSource.includes("천천히 마시는 중..."),
    "legacy drinking status text must be removed"
);
assert(
    !appSource.includes("잔을 드는 중") &&
        !appSource.includes("잔 드는 중") &&
        !appSource.includes("들어 올리는 중"),
    "lifting must not render a status message"
);
assertIncludes(
    appSource,
    'const GULP_STATUS_INTERVAL_MS = 600;',
    "gulp status must alternate every 600ms"
);
assertIncludes(
    appSource,
    '"꿀꺽...",',
    "the first gulp frame must be restored"
);
assertIncludes(
    appSource,
    '"꿀꺽 꿀꺽...",',
    "the second gulp frame must be restored"
);
assertIncludes(
    appSource,
    'setDrinkStatusText("캬~"',
    "finish celebration must use one tilde"
);
assert(
    !appSource.includes("캬~~"),
    "double-tilde finish copy must be removed"
);
assert(
    !appSource.includes("잔이 비었네") &&
        !appSource.includes("잔 비었네") &&
        !appSource.includes("다 마셨네"),
    "empty-glass copy must not be rendered"
);
assertIncludes(
    appSource,
    "const FINISH_STATUS_VISIBLE_MS = 1400;",
    "finish celebration must last 1.4 seconds"
);
assertIncludes(
    appSource,
    "didFinishBeerDuringCurrentDrink",
    "finish celebration must use a per-drink flag"
);

assertIncludes(
    styleSource,
    "transform-origin: 55% 65%;",
    "bottle must rotate around its held body"
);
assertIncludes(
    styleSource,
    "transform: rotate(-120deg);",
    "bottle must keep its natural downward neck angle"
);
assertIncludes(
    appSource,
    "const BOTTLE_SIZE_MULTIPLIER = 0.9;",
    "bottle must use an exact 90% size multiplier"
);
assertIncludes(
    appSource,
    "return currentRatio *\n        BOTTLE_SIZE_MULTIPLIER;",
    "responsive bottle ratios must both receive the multiplier"
);
assertIncludes(
    appSource,
    "getBoundingClientRect();",
    "bottle and stream geometry must use rendered bounds"
);
assertIncludes(
    appSource,
    "updatePourStreamGeometry();",
    "stream geometry must update at the final tilt"
);

assertIncludes(
    styleSource,
    "font-size: clamp(15px, 1.15vw, 17px);",
    "desktop bubble text must be enlarged"
);
assertIncludes(
    styleSource,
    "max-width: 86vw;",
    "mobile bubble width must remain inside the viewport"
);
assertIncludes(
    styleSource,
    "padding: 18px 14px 12px;",
    "mobile bubble padding must be enlarged"
);
assertIncludes(
    styleSource,
    "font-size: clamp(15px, 1.3vw, 19px);",
    "bottom status text must be enlarged on desktop"
);
assertIncludes(
    styleSource,
    "font-size: clamp(14px, 3.7vw, 16px);",
    "bottom status text must remain responsive on mobile"
);
assertIncludes(
    styleSource,
    ".beer-status:empty",
    "empty lifting and lowering states must hide the status box"
);

const autoPourStart =
    appSource.indexOf(
        "function animateAutoPour("
    );
const autoPourEnd =
    appSource.indexOf(
        "function tryStartAutoPour("
    );
const autoPourSource = appSource.slice(
    autoPourStart,
    autoPourEnd
);

assertIncludes(
    autoPourSource,
    "window.requestAnimationFrame",
    "continuous auto-pour must keep requestAnimationFrame"
);
assert(
    !autoPourSource.includes("setInterval"),
    "continuous auto-pour must not regress to intervals"
);
assertIncludes(
    bottleSource,
    'viewBox="0 0 64 160"',
    "the original bottle canvas must remain unchanged"
);

assertIncludes(
    templateSource,
    "오늘 한 잔, 어떻게 즐기나요?",
    "entry guide must use the approved title"
);
[
    "오늘 하루 있었던 일을 편하게 털어놔.",
    "맥주잔을 길게 누르면 천천히 마실 수 있어.",
    "잔을 다 비우면 친구의 답변이 끝난 뒤 새 맥주가 채워져.",
    "대화는 화면에 잠시 나타났다 자연스럽게 사라져.",
    "오늘 하루 보지 않기",
    "시작하기",
].forEach((copy) => {
    assertIncludes(
        templateSource,
        copy,
        `entry guide must include: ${copy}`
    );
});
assertIncludes(
    templateSource,
    'role="dialog"',
    "entry guide must expose a dialog role"
);
assertIncludes(
    templateSource,
    'aria-modal="true"',
    "entry guide must be announced as modal"
);
assertIncludes(
    templateSource,
    'aria-labelledby="entry-guide-title"',
    "entry guide title must be associated"
);
assertIncludes(
    templateSource,
    'aria-describedby="entry-guide-description"',
    "entry guide description must be associated"
);
assertIncludes(
    templateSource,
    'id="entry-guide"\n        class="entry-guide"\n        hidden',
    "entry guide must start hidden to avoid a flash"
);
assertIncludes(
    appSource,
    '"todayOneDrinkGuideHiddenDate"',
    "entry guide must use the approved localStorage key"
);
assertIncludes(
    appSource,
    "date.getFullYear()",
    "entry guide must use the local calendar year"
);
assertIncludes(
    appSource,
    "date.getMonth() + 1",
    "entry guide must use the local calendar month"
);
assertIncludes(
    appSource,
    "date.getDate()",
    "entry guide must use the local calendar day"
);
assert(
    !appSource.includes("toISOString"),
    "entry guide must not derive its date from UTC"
);
assertIncludes(
    appSource,
    "localStorage.getItem(",
    "entry guide must read its daily-hidden state"
);
assertIncludes(
    appSource,
    "localStorage.setItem(",
    "entry guide must save its daily-hidden state"
);
assertIncludes(
    appSource,
    'appShell?.setAttribute("inert", "")',
    "open guide must disable background interaction"
);
assertIncludes(
    appSource,
    'appShell?.removeAttribute("inert")',
    "closed guide must restore background interaction"
);
assertIncludes(
    appSource,
    'event.key === "Escape"',
    "Escape must close the entry guide"
);
assertIncludes(
    appSource,
    'event.key !== "Tab"',
    "entry guide must trap Tab navigation"
);
assertIncludes(
    appSource,
    "event.shiftKey",
    "entry guide must trap reverse Tab navigation"
);
assertIncludes(
    appSource,
    "GUIDE_CLOSE_DURATION_MS = 160",
    "guide close transition must stay within the requested duration"
);
assertIncludes(
    appSource,
    "if (!entryGuideState.isOpen) {\n                messageInput.focus();",
    "chat input must not steal focus while the guide is open"
);
assert(
    !appSource.includes(
        'entryGuide.addEventListener("click"'
    ),
    "clicking the dimmed backdrop must not close the guide"
);
assertIncludes(
    styleSource,
    ".entry-guide[hidden] {\n    display: none;",
    "closed guide must not intercept input"
);
assertIncludes(
    styleSource,
    "width: min(540px, calc(100vw - 32px));",
    "desktop guide width must remain responsive"
);
assertIncludes(
    styleSource,
    "width: calc(100vw - 32px);",
    "mobile guide must preserve 16px side margins"
);
assertIncludes(
    styleSource,
    "transform:\n        translateY(6px)\n        scale(0.96);",
    "guide must use the requested pixel-style entrance motion"
);
assertIncludes(
    styleSource,
    "width: 40px;\n    height: 40px;",
    "guide close target must be at least 36px"
);
assertIncludes(
    styleSource,
    "flex-direction: column;",
    "guide actions must stack on small screens"
);
assertIncludes(
    templateSource,
    'href="/static/style.css?v=17"',
    "entry guide CSS cache key must be updated"
);
assertIncludes(
    templateSource,
    'src="/static/app.js?v=17"',
    "entry guide script cache key must be updated"
);

console.log(
    `beer-expression: ${assertionCount} assertions passed`
);
