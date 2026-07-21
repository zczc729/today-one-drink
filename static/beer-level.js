(function exposeBeerLevelMath(root, factory) {
    const beerLevelMath = factory();

    if (
        typeof module === "object" &&
        module.exports
    ) {
        module.exports = beerLevelMath;
    }

    root.BeerLevelMath = beerLevelMath;
}(
    typeof globalThis !== "undefined"
        ? globalThis
        : window,
    function createBeerLevelMath() {
        const TOTAL_DRINK_MS = 5000;
        const MS_PER_PERCENT = 50;
        const FULL_POUR_DURATION = 2400;
        const BEER_MOTION_DURATIONS =
            Object.freeze({
                anticipation: 55,
                lifting: 185,
                nearMouth: 115,
                gulping: 420,
                lowering: 285,
            });

        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

        function clampConsumedMs(value) {
            const parsedValue = Number(value);

            return Number.isFinite(parsedValue)
                ? clamp(parsedValue, 0, TOTAL_DRINK_MS)
                : 0;
        }

        function getVisualLevel(consumedMs) {
            return clamp(
                100 -
                    clampConsumedMs(consumedMs) /
                    MS_PER_PERCENT,
                0,
                100
            );
        }

        function getLogicalLevel(consumedMs) {
            return Math.ceil(
                getVisualLevel(consumedMs)
            );
        }

        function getConsumedMsForLevel(level) {
            const parsedLevel = Number(level);
            const safeLevel = Number.isFinite(
                parsedLevel
            )
                ? clamp(parsedLevel, 0, 100)
                : 100;

            return (100 - safeLevel) *
                MS_PER_PERCENT;
        }

        function getConsumedMsAt({
            accumulatedDrinkMs = 0,
            currentDrinkStartedAt = null,
            now = 0,
            isDrinking = false,
        } = {}) {
            const hasActiveClock =
                isDrinking &&
                Number.isFinite(
                    currentDrinkStartedAt
                ) &&
                Number.isFinite(now);
            const activeDrinkMs = hasActiveClock
                ? Math.max(
                    0,
                    now - currentDrinkStartedAt
                )
                : 0;

            return clampConsumedMs(
                clampConsumedMs(
                    accumulatedDrinkMs
                ) +
                activeDrinkMs
            );
        }

        function getHeldMotionState(elapsedMs) {
            const parsedElapsed = Number(elapsedMs);
            const safeElapsed = Number.isFinite(
                parsedElapsed
            )
                ? Math.max(0, parsedElapsed)
                : 0;
            const liftingStart =
                BEER_MOTION_DURATIONS.anticipation;
            const nearMouthStart =
                liftingStart +
                BEER_MOTION_DURATIONS.lifting;
            const gulpingStart =
                nearMouthStart +
                BEER_MOTION_DURATIONS.nearMouth;

            if (safeElapsed < liftingStart) {
                return "anticipation";
            }

            if (safeElapsed < nearMouthStart) {
                return "lifting";
            }

            if (safeElapsed < gulpingStart) {
                return "nearMouth";
            }

            return "gulping";
        }

        function shouldShowDrinkingOverlay(
            elapsedMs
        ) {
            const parsedElapsed = Number(elapsedMs);
            const safeElapsed = Number.isFinite(
                parsedElapsed
            )
                ? Math.max(0, parsedElapsed)
                : 0;
            const switchAt =
                BEER_MOTION_DURATIONS.anticipation +
                BEER_MOTION_DURATIONS.lifting *
                0.7;

            return safeElapsed >= switchAt;
        }

        function getAutoPourLevel(elapsedMs) {
            const parsedElapsed = Number(elapsedMs);
            const safeElapsed = Number.isFinite(
                parsedElapsed
            )
                ? Math.max(0, parsedElapsed)
                : 0;
            const progress = Math.min(
                safeElapsed / FULL_POUR_DURATION,
                1
            );

            return progress * 100;
        }

        function canStartAutoPour({
            beerLevel,
            isAiResponseComplete,
            pourState,
            refillPending,
            hasStartedForEmptyCycle,
        } = {}) {
            return (
                Number(beerLevel) === 0 &&
                isAiResponseComplete === true &&
                (
                    pourState === "idle" ||
                    pourState === "waitingForAi"
                ) &&
                refillPending === true &&
                hasStartedForEmptyCycle !== true
            );
        }

        function getPourStreamGeometry({
            mouthX,
            mouthY,
            targetX,
            targetY,
        } = {}) {
            const safeMouthX = Number(mouthX) || 0;
            const safeMouthY = Number(mouthY) || 0;
            const safeTargetX = Number(targetX) || 0;
            const safeTargetY = Number(targetY) || 0;
            const deltaX =
                safeTargetX - safeMouthX;
            const deltaY =
                safeTargetY - safeMouthY;

            return {
                length: Math.hypot(
                    deltaX,
                    deltaY
                ),
                angle: Math.atan2(
                    deltaY,
                    deltaX
                ),
            };
        }

        function getRefillBottleLayout({
            sceneLeft = 0,
            sceneTop = 0,
            glassLeft = 0,
            glassTop = 0,
            glassWidth = 0,
            glassHeight = 0,
            heightRatio = 1.55,
            nativeAspectRatio = 64 / 160,
            tiltDegrees = -120,
            transformOriginX = 0.55,
            transformOriginY = 0.65,
            mouthAnchorX = 0.5,
            mouthAnchorY = 6 / 160,
            rimYRatio = 0.10625,
            mouthXRatio = 0.4,
            mouthClearanceRatio = 0.075,
            minimumMouthClearance = 20,
            maximumMouthClearance = 40,
        } = {}) {
            const bottleHeight =
                Math.max(0, Number(glassHeight) || 0) *
                Math.max(0, Number(heightRatio) || 0);
            const bottleWidth =
                bottleHeight *
                Math.max(
                    0,
                    Number(nativeAspectRatio) || 0
                );
            const mouthClearance = clamp(
                Math.max(
                    0,
                    Number(glassHeight) || 0
                ) *
                    Math.max(
                        0,
                        Number(
                            mouthClearanceRatio
                        ) || 0
                    ),
                Number(minimumMouthClearance) ||
                    0,
                Number(maximumMouthClearance) ||
                    0
            );
            const desiredMouth = {
                x:
                    (Number(glassLeft) || 0) +
                    (Number(glassWidth) || 0) *
                        (Number(mouthXRatio) || 0),
                y:
                    (Number(glassTop) || 0) +
                    (Number(glassHeight) || 0) *
                        (Number(rimYRatio) || 0) -
                    mouthClearance,
            };
            const origin = {
                x:
                    bottleWidth *
                    (Number(transformOriginX) || 0),
                y:
                    bottleHeight *
                    (Number(transformOriginY) || 0),
            };
            const mouthOffset = {
                x:
                    bottleWidth *
                        (Number(mouthAnchorX) || 0) -
                    origin.x,
                y:
                    bottleHeight *
                        (Number(mouthAnchorY) || 0) -
                    origin.y,
            };
            const angle =
                (Number(tiltDegrees) || 0) *
                Math.PI / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rotatedMouthOffset = {
                x:
                    mouthOffset.x * cos -
                    mouthOffset.y * sin,
                y:
                    mouthOffset.x * sin +
                    mouthOffset.y * cos,
            };
            const actorLeft =
                desiredMouth.x -
                (Number(sceneLeft) || 0) -
                origin.x -
                rotatedMouthOffset.x;
            const actorTop =
                desiredMouth.y -
                (Number(sceneTop) || 0) -
                origin.y -
                rotatedMouthOffset.y;

            return {
                actorLeft,
                actorTop,
                bottleWidth,
                bottleHeight,
                heightRatio:
                    Math.max(
                        0,
                        Number(heightRatio) || 0
                    ),
                tiltDegrees:
                    Number(tiltDegrees) || 0,
                mouthClearance,
                desiredMouth,
                origin,
                rotatedMouthOffset,
            };
        }

        return Object.freeze({
            TOTAL_DRINK_MS,
            MS_PER_PERCENT,
            FULL_POUR_DURATION,
            BEER_MOTION_DURATIONS,
            clampConsumedMs,
            getVisualLevel,
            getLogicalLevel,
            getConsumedMsForLevel,
            getConsumedMsAt,
            getHeldMotionState,
            shouldShowDrinkingOverlay,
            getAutoPourLevel,
            canStartAutoPour,
            getPourStreamGeometry,
            getRefillBottleLayout,
        });
    }
));
