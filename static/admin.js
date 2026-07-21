const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const loginError = document.querySelector("#login-error");
const dashboardError = document.querySelector("#dashboard-error");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");
const autoRefreshInput = document.querySelector("#auto-refresh");
const lastUpdated = document.querySelector("#last-updated");
const timezoneNote = document.querySelector("#timezone-note");

let refreshTimer = null;
let refreshInFlight = false;


function showLogin(message = "") {
    dashboardView.hidden = true;
    loginView.hidden = false;
    loginError.textContent = message;
    stopAutoRefresh();
    document.querySelector("#username")?.focus();
}


function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
    configureAutoRefresh();
}


async function readJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}


function valueAtPath(source, path) {
    return path.split(".").reduce(
        (value, key) => value?.[key],
        source
    );
}


function renderValues(data) {
    document.querySelectorAll("[data-value]").forEach((element) => {
        const value = valueAtPath(data, element.dataset.value);
        const suffix = element.dataset.suffix || "";
        const formatted = Number.isFinite(value)
            ? value.toLocaleString("ko-KR", {
                maximumFractionDigits: 2,
            })
            : "0";
        element.textContent = `${formatted}${suffix}`;
    });
}


function progressStatus(percent) {
    if (percent >= 90) return ["위험", "danger"];
    if (percent >= 70) return ["주의", "warning"];
    return ["정상", "normal"];
}


function renderProgress(valueId, labelId, used, limit) {
    const safeLimit = Math.max(1, Number(limit) || 1);
    const percent = Math.min(100, Math.max(0, used / safeLimit * 100));
    const [statusText, status] = progressStatus(percent);
    const value = document.querySelector(`#${valueId}`);
    const label = document.querySelector(`#${labelId}`);
    value.style.width = `${percent}%`;
    value.dataset.status = status;
    label.textContent = `${percent.toFixed(1)}% · ${statusText}`;
}


function makeBar(value, maxValue, className, tooltip) {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = `chart-bar ${className}`.trim();
    bar.style.height = `${value > 0 ? Math.max(3, value / maxValue * 100) : 1}%`;
    bar.dataset.tooltip = tooltip;
    bar.setAttribute("aria-label", tooltip);
    return bar;
}


function renderChart(containerId, days, series) {
    const container = document.querySelector(`#${containerId}`);
    const values = days.flatMap((day) => (
        series.map((item) => Number(day[item.key]) || 0)
    ));
    const maxValue = Math.max(1, ...values);
    const fragment = document.createDocumentFragment();

    days.forEach((day) => {
        const column = document.createElement("div");
        column.className = "chart-column";
        const bars = document.createElement("div");
        bars.className = "chart-bars";

        series.forEach((item) => {
            const value = Number(day[item.key]) || 0;
            bars.appendChild(makeBar(
                value,
                maxValue,
                item.className,
                `${day.date} ${item.label} ${value.toLocaleString("ko-KR")}명`
            ));
        });

        const date = document.createElement("span");
        date.className = "chart-date";
        date.textContent = day.date.slice(5).replace("-", ".");
        date.title = day.date;
        column.append(bars, date);
        fragment.appendChild(column);
    });

    container.replaceChildren(fragment);
}


function renderDashboard(data) {
    renderValues(data);
    timezoneNote.textContent = (
        `방문자·채팅 통계: 한국 시간 기준 (${data.traffic_date}) · ` +
        `Gemini 일일 사용량: Pacific Time 기준 (${data.quota_date})`
    );
    renderProgress(
        "daily-progress",
        "daily-progress-label",
        data.gemini_usage.today_attempts,
        data.gemini_usage.app_daily_limit
    );
    renderProgress(
        "rpm-progress",
        "rpm-progress-label",
        data.gemini_usage.current_rpm,
        data.gemini_usage.app_rpm_limit
    );
    renderChart("visitor-chart", data.last_7_days, [
        { key: "visitors", label: "방문자", className: "" },
    ]);
    renderChart("chat-chart", data.last_7_days, [
        { key: "chat_messages", label: "메시지", className: "chart-bar--message" },
        { key: "successful_chats", label: "성공", className: "chart-bar--success" },
    ]);
    const updated = new Date(data.updated_at);
    lastUpdated.textContent = `마지막 갱신 ${updated.toLocaleString("ko-KR")}`;
}


async function refreshDashboard() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    refreshButton.disabled = true;
    refreshButton.textContent = "갱신 중…";
    dashboardError.textContent = "";

    try {
        const response = await fetch("/api/admin/dashboard", {
            headers: { "Accept": "application/json" },
            cache: "no-store",
        });
        const data = await readJson(response);
        if (response.status === 401) {
            showLogin("세션이 만료되었습니다. 다시 로그인해 주세요.");
            return;
        }
        if (!response.ok) {
            throw new Error(data.message || "통계를 불러오지 못했습니다.");
        }
        renderDashboard(data);
    } catch (error) {
        dashboardError.textContent = `${error.message} 기존 표시 값은 유지됩니다.`;
    } finally {
        refreshInFlight = false;
        refreshButton.disabled = false;
        refreshButton.textContent = "새로고침";
    }
}


function stopAutoRefresh() {
    if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
    }
}


function configureAutoRefresh() {
    stopAutoRefresh();
    if (autoRefreshInput.checked) {
        refreshTimer = window.setInterval(refreshDashboard, 30_000);
    }
}


loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.textContent = "";
    loginButton.disabled = true;
    const usernameInput = document.querySelector("#username");
    const passwordInput = document.querySelector("#password");

    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: usernameInput.value,
                password: passwordInput.value,
            }),
        });
        const data = await readJson(response);
        passwordInput.value = "";
        if (!response.ok) {
            throw new Error(data.message || "로그인하지 못했습니다.");
        }
        showDashboard();
        await refreshDashboard();
    } catch (error) {
        loginError.textContent = error.message;
    } finally {
        loginButton.disabled = false;
    }
});


refreshButton.addEventListener("click", refreshDashboard);
autoRefreshInput.addEventListener("change", configureAutoRefresh);
logoutButton.addEventListener("click", async () => {
    try {
        await fetch("/api/admin/logout", { method: "POST" });
    } finally {
        showLogin("로그아웃되었습니다.");
    }
});


async function initialize() {
    try {
        const response = await fetch("/api/admin/me", { cache: "no-store" });
        if (!response.ok) {
            showLogin();
            return;
        }
        showDashboard();
        await refreshDashboard();
    } catch (error) {
        showLogin("관리자 서비스에 연결할 수 없습니다.");
    }
}


initialize();
