// API Base URL (same host since we serve directly from FastAPI)
const API_BASE = "";

// Global state
let isEngineActive = true;
let existingLogIds = new Set();
let homeConsoleTimer = null;
let activeEpsilon = 1.0;
let dpEnabled = true;

// Audio Assistant manager using Web Audio API and Speech Synthesis
class AudioSynthManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
    }
    
    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    playBlip(freq = 600, duration = 0.08, type = "sine") {
        if (!this.enabled || !this.ctx) return;
        try {
            this.ctx.resume();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.error(e);
        }
    }
    
    playPoisonSweep() {
        if (!this.enabled || !this.ctx) return;
        try {
            this.ctx.resume();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(750, this.ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        } catch (e) {
            console.error(e);
        }
    }

    playAlertTone() {
        if (!this.enabled || !this.ctx) return;
        this.playBlip(880, 0.15, "triangle");
        setTimeout(() => this.playBlip(440, 0.12, "triangle"), 80);
    }
    
    speak(text) {
        if (!this.enabled) return;
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.05;
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error(e);
        }
    }
}

const soundManager = new AudioSynthManager();

// Sample texts for the parser
const SAMPLES = {
    google: "We collect information to provide better services to all our users. This includes information you provide us, information we get from your use of our services (like device logs, location tracking, and referral search terms). We combine this data across our platforms to show personalized advertisements and build a profile of your interests, which we share with third-party advertisers and partners for commercial profiling.",
    facebook: "We collect the content, communications and other information you provide when you use our Products, including when you sign up for an account, create or share content, and message or communicate with others. We also collect information about how you use our Products, such as the types of content you view or engage with. We track you across non-Meta websites using our Meta Pixels and social plug-ins to optimize ads and build biometric profiling databases for facial features recognition.",
    github: "We do not sell your personal information. We only use your information as this Privacy Statement describes. We restrict cookie usage to essential security features. We collect some usage and telemetry data on developer services to improve product delivery, which you can opt out of. We do not use third-party targeting pixels."
};

const DPDP_SAMPLES = {
    google: "Notice: Google provides this privacy notice describing how personal data like cookies, locations, and search logs are collected for target advertising. Consent: By accepting our terms, you agree to cross-site profiling. You can revoke consent, but doing so limits service functionality and requires deleting items piece by piece from settings. Children: We collect student data on Chromebooks, but prohibit targeted advertising to child profiles under 13 unless managed via Family Link. Grievance: If you have queries, contact our global Data Protection Officer team via web form.",
    facebook: "Notice: Meta collects information about your friends, likes, messages, and external pixel telemetry. Consent: Access to Meta services requires accepting automated behavioral advertising profiling. Opt-out from cross-site tracking is restricted. Children: Meta apps are restricted to users above 13, but browser cookies actively track teenage user profiles and serve targeted behavioral social ads. Grievance: Complaints can be filed through the standard support dashboard help center.",
    github: "Notice: GitHub lists operational data gathered to support developer pipelines. Consent: We restrict tracking cookies. Telemetry is optional and consent can be withdrawn easily with a single toggle. Erasure: User profiles, issues, and codes are completely erased upon account deletion requests. Children: We do not serve targeted advertisements or build profiling databases on student developer accounts. Grievance: Explicit contact information for privacy escalations and complaints is detailed."
};

// SVG stroke details
const CIRCLE_CIRCUMFERENCE = 264; // 2 * pi * r (r=42)

// DOM Elements
const navTabs = document.querySelectorAll(".nav-tab");
const tabContents = document.querySelectorAll(".tab-content");
const brandHomeBtn = document.getElementById("btn-brand-home");
const ctaDashboardBtn = document.getElementById("cta-dashboard-btn");
const ctaDocsBtn = document.getElementById("cta-docs-btn");

const engineToggle = document.getElementById("engine-toggle");
const statusLabel = document.getElementById("status-label");
const statusGlow = document.getElementById("status-glow");
const profileName = document.getElementById("profile-name");
const profileInterests = document.getElementById("profile-interests");
const profileDesc = document.getElementById("profile-desc");

// Metrics
const metricPoisoned = document.getElementById("metric-poisoned");
const metricBlocked = document.getElementById("metric-blocked");
const metricExposed = document.getElementById("metric-exposed");
const metricTotal = document.getElementById("metric-total");

// Sandbox
const sandboxUrl = document.getElementById("sandbox-url");
const sandboxBtn = document.getElementById("sandbox-btn");
const rawCookieTerminal = document.getElementById("raw-cookie-terminal");
const poisonCookieTerminal = document.getElementById("poison-cookie-terminal");

// Logs
const auditLogsContainer = document.getElementById("audit-logs-container");
const clearLogsBtn = document.getElementById("clear-logs-btn");

// Scorecard & Parser
const scoreDisplay = document.getElementById("score-display");
const scoreRing = document.getElementById("score-ring");
const policyText = document.getElementById("policy-text");
const parseBtn = document.getElementById("parse-btn");
const parserResultsBox = document.getElementById("parser-results-box");

const sampleGoogle = document.getElementById("sample-google");
const sampleFacebook = document.getElementById("sample-facebook");
const sampleGithub = document.getElementById("sample-github");

// Docs Sidebar
const docsLinks = document.querySelectorAll(".docs-link");
const docsSections = document.querySelectorAll(".docs-section");

// Settings
const settingsSaveBtn = document.getElementById("settings-save-btn");
const settingsResetBtn = document.getElementById("settings-reset-btn");
const toastBanner = document.getElementById("toast-banner");

// Home Simulator
const simTriggerBtn = document.getElementById("sim-trigger-btn");
const homeSimConsole = document.getElementById("home-sim-console");

// Sound control
const soundBtn = document.getElementById("btn-sound-assistant");
const soundIcon = document.getElementById("sound-icon");

// DPDP Scanner
const dpdpScanBtn = document.getElementById("dpdp-scan-btn");
const dpdpText = document.getElementById("dpdp-policy-text");
const dpdpSummary = document.getElementById("dpdp-summary-text");
const dpdpProvisions = document.getElementById("dpdp-provisions-container");
const dpdpScoreTxt = document.getElementById("dpdp-score-txt");
const dpdpEngineInfo = document.getElementById("dpdp-engine-info");

const dpdpSampleGoogle = document.getElementById("dpdp-sample-google");
const dpdpSampleFacebook = document.getElementById("dpdp-sample-facebook");
const dpdpSampleGithub = document.getElementById("dpdp-sample-github");

// Differential Privacy
const dpToggle = document.getElementById("dp-toggle");
const dpSlider = document.getElementById("dp-epsilon-slider");
const dpEpsilonVal = document.getElementById("dp-epsilon-value");
const dpCanvas = document.getElementById("dp-canvas");

// Dynamic Persona Generator
const personaRoleInput = document.getElementById("persona-role");
const personaInterestsInput = document.getElementById("persona-interests");
const btnGeneratePersona = document.getElementById("btn-generate-persona");

// Tracker Heatmap
const btnRefreshHeatmap = document.getElementById("btn-refresh-heatmap");
const heatmapGridBody = document.getElementById("heatmap-grid-body");
const riskInfoTitle = document.getElementById("risk-info-title");
const riskInfoDesc = document.getElementById("risk-info-desc");

// Mock Extension
const extShieldBtn = document.getElementById("ext-shield-btn");
const extShieldStatus = document.getElementById("ext-shield-status");
const extFuzzedWidth = document.getElementById("ext-fuzzed-width");
const extPoisonedCount = document.getElementById("ext-poisoned-count");
const extEpsilonVal = document.getElementById("ext-epsilon-val");

// Init Hook
window.addEventListener("DOMContentLoaded", () => {
    fetchStatus();
    fetchLogs(false); 
    fetchAnalytics();
    loadHeatmap();
    drawDPDistribution(1.0);
    
    // Background polling
    setInterval(() => {
        const isDashboardActive = document.getElementById("sec-dashboard").classList.contains("active");
        fetchLogs(isDashboardActive); 
        fetchAnalytics();
        
        if (isDashboardActive) {
            updateMockExtensionStats();
        }
    }, 2500);

    setupNavigation();
    setupSoundAssistant();
    setupEpsilonControls();
    setupDynamicPersona();
    setupDPDPScanner();
    setupHeatmapEvents();
    setupMockExtension();
    setupDefenseWs();

    // Event Listeners
    engineToggle.addEventListener("change", handleEngineToggle);
    sandboxBtn.addEventListener("click", runSandboxSimulation);
    parseBtn.addEventListener("click", parsePrivacyPolicy);
    clearLogsBtn.addEventListener("click", () => {
        soundManager.playBlip(300, 0.05);
        auditLogsContainer.innerHTML = `
            <div class="audit-item" style="opacity: 0.5; justify-content: center;">
                <span style="font-size: 0.85rem;">Logs cleared. Waiting for active traffic...</span>
            </div>
        `;
        existingLogIds.clear();
    });

    // Sample buttons
    sampleGoogle.addEventListener("click", () => { soundManager.playBlip(500, 0.04); policyText.value = SAMPLES.google; });
    sampleFacebook.addEventListener("click", () => { soundManager.playBlip(500, 0.04); policyText.value = SAMPLES.facebook; });
    sampleGithub.addEventListener("click", () => { soundManager.playBlip(500, 0.04); policyText.value = SAMPLES.github; });

    // Settings
    settingsSaveBtn.addEventListener("click", saveSettings);
    settingsResetBtn.addEventListener("click", () => {
        soundManager.playBlip(400, 0.08);
        showToast("Settings reset to defaults");
    });

    // Home Console Simulator
    simTriggerBtn.addEventListener("click", toggleHomeSimulation);
    setTimeout(startHomeSimulation, 1000);
});

// Sound assistant setup
function setupSoundAssistant() {
    soundBtn.addEventListener("click", () => {
        soundManager.init();
        soundManager.enabled = !soundManager.enabled;
        
        if (soundManager.enabled) {
            soundIcon.innerText = "🔊";
            soundBtn.style.background = "rgba(0, 255, 170, 0.15)";
            soundBtn.style.borderColor = "var(--color-poison)";
            soundManager.playBlip(800, 0.1);
            soundManager.speak("Voice assistant enabled. Data Shadow shield systems ready.");
            showToast("Voice assistant activated");
        } else {
            soundIcon.innerText = "🔇";
            soundBtn.style.background = "rgba(255, 255, 255, 0.02)";
            soundBtn.style.borderColor = "rgba(255, 255, 255, 0.04)";
            showToast("Voice assistant deactivated");
        }
    });
}

// Navigation Switches
function setupNavigation() {
    navTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            soundManager.playBlip(650, 0.05);
            const target = tab.getAttribute("data-target");
            switchTab(target);
        });
        
        tab.addEventListener("mouseenter", () => {
            soundManager.playBlip(800, 0.01);
        });
    });

    brandHomeBtn.addEventListener("click", () => {
        soundManager.playBlip(600, 0.05);
        switchTab("sec-home");
    });

    ctaDashboardBtn.addEventListener("click", () => {
        soundManager.playBlip(600, 0.05);
        switchTab("sec-dashboard");
    });
    
    ctaDocsBtn.addEventListener("click", () => {
        soundManager.playBlip(600, 0.05);
        switchTab("sec-docs");
    });

    docsLinks.forEach(link => {
        link.addEventListener("click", () => {
            soundManager.playBlip(650, 0.05);
            docsLinks.forEach(l => l.classList.remove("active"));
            docsSections.forEach(s => s.classList.remove("active"));
            
            link.classList.add("active");
            const docId = link.getAttribute("data-doc");
            document.getElementById(docId).classList.add("active");
        });
    });
}

function switchTab(targetId) {
    navTabs.forEach(t => {
        t.classList.remove("active");
        if (t.getAttribute("data-target") === targetId) {
            t.classList.add("active");
        }
    });

    tabContents.forEach(content => {
        content.classList.remove("active");
    });
    document.getElementById(targetId).classList.add("active");
}

// Fetch Engine Status
async function fetchStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        isEngineActive = data.is_active;
        dpEnabled = data.dp_enabled;
        activeEpsilon = data.epsilon;
        
        dpToggle.checked = dpEnabled;
        dpSlider.value = activeEpsilon;
        dpEpsilonVal.innerText = activeEpsilon.toFixed(2);
        
        updateEngineUI(data);
    } catch (err) {
        console.error("Failed to fetch engine status", err);
    }
}

// Handle Engine Toggle change
async function handleEngineToggle() {
    try {
        const res = await fetch(`${API_BASE}/api/poison/toggle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: engineToggle.checked })
        });
        const data = await res.json();
        updateEngineUI(data);
        fetchAnalytics();
        
        if (data.is_active) {
            soundManager.playPoisonSweep();
            soundManager.speak("Data shadow deception layer armed.");
            showToast("Shadow Engine ARMED");
        } else {
            soundManager.playBlip(200, 0.25);
            soundManager.speak("Warning. Deception layer disabled. Personal telemetry exposed.");
            showToast("Shadow Engine DISABLED");
        }
    } catch (err) {
        console.error("Failed to toggle engine", err);
    }
}

function updateEngineUI(status) {
    isEngineActive = status.is_active;
    engineToggle.checked = isEngineActive;
    
    if (isEngineActive) {
        statusLabel.innerText = "ARMED";
        statusLabel.style.color = "var(--color-poison)";
        statusGlow.className = "engine-status-indicator status-active";
        
        profileName.innerText = status.current_profile;
        profileDesc.innerText = status.profile_details ? status.profile_details.behavior : "";
        
        profileInterests.innerHTML = "";
        if (status.profile_details && status.profile_details.interests) {
            status.profile_details.interests.forEach(interest => {
                const tag = document.createElement("span");
                tag.className = "interest-tag";
                tag.innerText = interest;
                profileInterests.appendChild(tag);
            });
        }
    } else {
        statusLabel.innerText = "DISABLED";
        statusLabel.style.color = "var(--color-expose)";
        statusGlow.className = "engine-status-indicator status-inactive";
        
        profileName.innerText = "None (Real Identity Exposed)";
        profileDesc.innerText = "No poisoning filters active. Advertisers are receiving actual browser profile and identifying cookies.";
        profileInterests.innerHTML = `<span class="interest-tag" style="background: rgba(255,51,102,0.1); border-color: rgba(255,51,102,0.3); color: var(--color-expose);">EXPOSED</span>`;
    }
}

// Fetch analytics counters
async function fetchAnalytics() {
    try {
        const res = await fetch(`${API_BASE}/api/analytics`);
        const data = await res.json();
        
        metricPoisoned.innerText = data.poisoned_count;
        metricBlocked.innerText = data.blocked_count;
        metricExposed.innerText = data.exposed_count;
        metricTotal.innerText = data.total_events;

        updateScoreRing(data.privacy_score);
    } catch (err) {
        console.error("Failed to fetch analytics", err);
    }
}

function updateScoreRing(score) {
    scoreDisplay.innerText = score;
    const offset = CIRCLE_CIRCUMFERENCE - (score / 100) * CIRCLE_CIRCUMFERENCE;
    scoreRing.style.strokeDashoffset = offset;
    
    if (score >= 80) {
        scoreRing.style.stroke = "var(--color-poison)";
    } else if (score >= 50) {
        scoreRing.style.stroke = "var(--color-warning)";
    } else {
        scoreRing.style.stroke = "var(--color-expose)";
    }
}

// Run the Sandbox cookie comparison simulation
async function runSandboxSimulation() {
    const site = sandboxUrl.value.trim() || "myretailer.com";
    
    rawCookieTerminal.innerText = "Sending Client Request...";
    poisonCookieTerminal.innerText = "Intercepting Packet...";
    soundManager.playBlip(440, 0.08);
    
    try {
        const res = await fetch(`${API_BASE}/api/audit/simulate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ site_url: site })
        });
        const data = await res.json();
        
        const originalCookie = data.original_headers.Cookie;
        rawCookieTerminal.innerText = originalCookie.split("; ").join("\n");
        
        const poisonedCookie = data.poisoned_headers.Cookie;
        if (data.is_poisoned) {
            soundManager.playPoisonSweep();
            poisonCookieTerminal.innerText = poisonedCookie.split("; ").join("\n");
            poisonCookieTerminal.style.color = "var(--color-poison)";
        } else {
            soundManager.playAlertTone();
            poisonCookieTerminal.innerText = "WARNING:\n" + originalCookie.split("; ").join("\n");
            poisonCookieTerminal.style.color = "var(--color-expose)";
        }
        
        fetchAnalytics();
    } catch (err) {
        console.error("Failed to run sandbox simulation", err);
        rawCookieTerminal.innerText = "Error initiating client request.";
        poisonCookieTerminal.innerText = "Proxy bypass failed.";
    }
}

// Fetch logs list from database and render
async function fetchLogs(simulateLive = true) {
    try {
        const res = await fetch(`${API_BASE}/api/audit/logs?limit=30&simulate_live=${simulateLive}`);
        const data = await res.json();
        
        const logs = data.logs;
        if (!logs || logs.length === 0) return;
        
        if (existingLogIds.size === 0) {
            auditLogsContainer.innerHTML = "";
        }
        
        logs.reverse().forEach(log => {
            if (existingLogIds.has(log.id)) return;
            
            existingLogIds.add(log.id);
            
            if (simulateLive && soundManager.enabled && Math.random() > 0.85) {
                soundManager.playBlip(900, 0.03);
            }
            
            const logItem = document.createElement("div");
            logItem.className = "audit-item";
            
            let badgeClass = "badge-poisoned";
            if (log.status === "Blocked") badgeClass = "badge-blocked";
            if (log.status === "Exposed") badgeClass = "badge-exposed";
            
            const formattedTime = new Date(log.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            let details = log.original_value;
            if (log.status === "Poisoned") {
                details = `Injected: ${log.injected_value.substring(0, 80)}...`;
            }
            
            logItem.innerHTML = `
                <div class="audit-meta">
                    <span class="audit-target">${log.target}</span>
                    <span class="audit-details">${details}</span>
                    <span class="audit-time">${formattedTime} • ${log.type}</span>
                </div>
                <div>
                    <span class="badge ${badgeClass}">${log.status}</span>
                </div>
            `;
            
            auditLogsContainer.insertBefore(logItem, auditLogsContainer.firstChild);
        });
    } catch (err) {
        console.error("Failed to fetch audit logs", err);
    }
}

// Parse input text using local simulated LLM pipeline
async function parsePrivacyPolicy() {
    const text = policyText.value.trim();
    if (!text) {
        alert("Please paste some privacy policy text or load a sample first.");
        return;
    }
    
    soundManager.playBlip(440, 0.1, "triangle");
    
    parserResultsBox.innerHTML = `
        <div style="text-align: center; margin-top: 1rem;">
            <span style="display:inline-block; animation: pulse 1s infinite alternate; color: var(--color-accent);">
                Loading TinyLlama LLM Parser (1.1B)...
            </span>
            <p style="font-size:0.7rem; color:var(--text-secondary); margin-top:0.3rem;">Running local weights classification...</p>
        </div>
    `;
    
    try {
        const res = await fetch(`${API_BASE}/api/privacy/parse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text })
        });
        const data = await res.json();
        
        parserResultsBox.innerHTML = "";
        
        const header = document.createElement("div");
        header.style.marginBottom = "0.5rem";
        header.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.25rem;">
                <span>MODEL: ${data.engine}</span>
                <span>TIME: ${data.parse_time_seconds}s</span>
            </div>
            <strong style="color:var(--color-accent);">TinyLlama Classification Summary:</strong>
        `;
        parserResultsBox.appendChild(header);
        
        const summary = document.createElement("p");
        summary.className = "parser-summary";
        summary.innerText = data.summary;
        parserResultsBox.appendChild(summary);
        
        const alertHeader = document.createElement("div");
        alertHeader.style.fontWeight = "600";
        alertHeader.style.marginBottom = "0.4rem";
        alertHeader.style.fontSize = "0.85rem";
        alertHeader.innerText = "Safety Highlights:";
        parserResultsBox.appendChild(alertHeader);
        
        if (data.alerts && data.alerts.length > 0) {
            data.alerts.forEach(alert => {
                const item = document.createElement("div");
                item.className = "alert-item";
                
                let badgeClass = "alert-badge-info";
                if (alert.severity === "CRITICAL") badgeClass = "alert-badge-critical";
                if (alert.severity === "WARNING") badgeClass = "alert-badge-warning";
                
                item.innerHTML = `
                    <span class="alert-badge ${badgeClass}">${alert.severity}</span>
                    <div class="alert-text">
                        <strong>${alert.category}:</strong> ${alert.text}
                    </div>
                `;
                parserResultsBox.appendChild(item);
            });
            
            if (data.score < 60) {
                soundManager.playAlertTone();
                soundManager.speak(`Auditor alert. Policy vulnerability score is low, rated at ${data.score} out of 100.`);
            } else {
                soundManager.playBlip(750, 0.15);
                soundManager.speak(`Policy check completed. Scorecard rated at ${data.score} out of 100.`);
            }
        } else {
            parserResultsBox.innerHTML += `<div style="opacity: 0.5; font-size: 0.75rem; text-align:center;">No high-vulnerability alerts identified in this clause.</div>`;
        }
        
        fetchAnalytics();
    } catch (err) {
        console.error("Failed to parse privacy policy", err);
        parserResultsBox.innerHTML = `<div style="color:var(--color-expose); text-align:center;">Error invoking TinyLlama model pipeline. Check console logs.</div>`;
    }
}

// ==========================================
// 🧪 DIFFERENTIAL PRIVACY IMPL
// ==========================================
function setupEpsilonControls() {
    dpToggle.addEventListener("change", () => {
        soundManager.playBlip(dpToggle.checked ? 700 : 300, 0.05);
        sendDPConfig();
    });

    dpSlider.addEventListener("input", () => {
        const val = parseFloat(dpSlider.value);
        dpEpsilonVal.innerText = val.toFixed(2);
        drawDPDistribution(val);
    });

    dpSlider.addEventListener("change", () => {
        const val = parseFloat(dpSlider.value);
        soundManager.playBlip(500 + val * 50, 0.06, "triangle");
        sendDPConfig();
    });
}

async function sendDPConfig() {
    try {
        const val = parseFloat(dpSlider.value);
        const enabled = dpToggle.checked;
        const res = await fetch(`${API_BASE}/api/poison/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dp_enabled: enabled, epsilon: val })
        });
        const data = await res.json();
        
        dpEnabled = data.dp_enabled;
        activeEpsilon = data.epsilon;
        
        if (soundManager.enabled) {
            soundManager.speak(`Epsilon updated to ${activeEpsilon.toFixed(2)}. ${dpEnabled ? 'Laplace noise active.' : 'Fuzzing disabled.'}`);
        }
    } catch (e) {
        console.error("DP update error", e);
    }
}

// Plot math Laplace distribution curve on canvas
function drawDPDistribution(eps) {
    const ctx = dpCanvas.getContext("2d");
    const w = dpCanvas.width;
    const h = dpCanvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // Draw Axis
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h/2);
    ctx.lineTo(w, h/2);
    ctx.moveTo(w/2, 0);
    ctx.lineTo(w/2, h);
    ctx.stroke();

    const b = 35 / eps; 
    
    ctx.strokeStyle = "var(--color-poison)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let x = 0; x < w; x++) {
        const xOffset = x - w/2;
        const yOffset = (1 / (2 * b)) * Math.exp(-Math.abs(xOffset) / b) * 1500; 
        const y = h/2 - yOffset;
        
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    
    ctx.fillStyle = "var(--color-warning)";
    for (let i = 0; i < 6; i++) {
        const u = Math.random() - 0.5;
        const sgn = u >= 0 ? 1 : -1;
        const noise = -b * sgn * Math.log(1 - 2 * Math.abs(u));
        
        const ptX = w/2 + noise;
        const ptY = h/2 + (Math.random() * 12 - 6); 
        
        ctx.beginPath();
        ctx.arc(ptX, ptY, 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    const displayInfo = document.getElementById("dp-perturbation-info");
    if (displayInfo) {
        displayInfo.innerText = `Scale (Sensitivity/ε): ±${(150 / eps).toFixed(0)}px (Viewport)`;
    }
}

// ==========================================
// 👤 DYNAMIC PERSONA GENERATOR
// ==========================================
function setupDynamicPersona() {
    btnGeneratePersona.addEventListener("click", async () => {
        const role = personaRoleInput.value.trim();
        const interests = personaInterestsInput.value.trim();
        
        if (!role || !interests) {
            alert("Please enter a custom Persona Role and at least two comma-separated interests.");
            return;
        }
        
        soundManager.playPoisonSweep();
        btnGeneratePersona.innerText = "Synthesizing footprint...";
        btnGeneratePersona.disabled = true;
        
        try {
            const res = await fetch(`${API_BASE}/api/persona/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: role, interests: interests })
            });
            const data = await res.json();
            
            await fetchStatus();
            
            soundManager.speak(`Synthesizing custom profile footprints for ${data.profile.name}. Interests loaded.`);
            showToast(`Loaded Custom Persona: ${data.profile.name}`);
            
            personaRoleInput.value = "";
            personaInterestsInput.value = "";
        } catch (e) {
            console.error(e);
        } finally {
            btnGeneratePersona.innerText = "Generate & Load Roleplay Footprint";
            btnGeneratePersona.disabled = false;
        }
    });
}

// ==========================================
// 🛡️ DPDP COMPLIANCE SCANNER
// ==========================================
function setupDPDPScanner() {
    dpdpSampleGoogle.addEventListener("click", () => { soundManager.playBlip(500, 0.04); dpdpText.value = DPDP_SAMPLES.google; });
    dpdpSampleFacebook.addEventListener("click", () => { soundManager.playBlip(500, 0.04); dpdpText.value = DPDP_SAMPLES.facebook; });
    dpdpSampleGithub.addEventListener("click", () => { soundManager.playBlip(500, 0.04); dpdpText.value = DPDP_SAMPLES.github; });

    dpdpScanBtn.addEventListener("click", async () => {
        const text = dpdpText.value.trim();
        if (!text) {
            alert("Please paste a privacy clause or select an audit preset.");
            return;
        }
        
        soundManager.playBlip(440, 0.12, "triangle");
        dpdpScanBtn.innerText = "Auditing notice lines...";
        dpdpScanBtn.disabled = true;
        
        try {
            const res = await fetch(`${API_BASE}/api/privacy/dpdp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: text })
            });
            const data = await res.json();
            
            dpdpSummary.innerText = data.summary;
            dpdpScoreTxt.innerText = `${data.score}%`;
            dpdpEngineInfo.innerText = `Engine: ${data.engine} • Audit in ${data.parse_time_seconds}s`;
            
            dpdpProvisions.innerHTML = "";
            Object.keys(data.provisions).forEach(key => {
                const prov = data.provisions[key];
                const block = document.createElement("div");
                block.className = "dpdp-prov-block";
                block.style.background = "rgba(255,255,255,0.02)";
                block.style.padding = "0.75rem";
                block.style.borderRadius = "8px";
                block.style.border = "1px solid rgba(255,255,255,0.04)";
                
                let badgeColor = "var(--color-poison)";
                if (prov.status === "PARTIAL") badgeColor = "var(--color-warning)";
                if (prov.status === "NON-COMPLIANT") badgeColor = "var(--color-expose)";
                
                block.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <strong style="font-size: 0.85rem; color: #fff;">${prov.name}</strong>
                        <span style="font-size: 0.7rem; font-weight: 700; color: ${badgeColor}; border: 1px solid ${badgeColor}; padding: 0.05rem 0.35rem; border-radius: 4px; background: rgba(255,255,255,0.01);">${prov.status} (${prov.score}%)</span>
                    </div>
                    <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.3;">${prov.comment}</p>
                `;
                dpdpProvisions.appendChild(block);
            });
            
            if (data.score < 60) {
                soundManager.playAlertTone();
                soundManager.speak(`Compliance audit finished. Overall score is low: ${data.score} percent. Flagging non-compliant categories.`);
            } else {
                soundManager.playBlip(700, 0.2, "sine");
                soundManager.speak(`Compliance audit completed. Score: ${data.score} percent.`);
            }
        } catch (e) {
            console.error(e);
            dpdpSummary.innerText = "Error conducting DPDP Act compliance audit. Check console logs.";
        } finally {
            dpdpScanBtn.innerText = "Initiate DPDP Compliance Audit";
            dpdpScanBtn.disabled = false;
        }
    });
}

// ==========================================
// 📊 TRACKER IMPACT HEATMAP
// ==========================================
async function loadHeatmap() {
    try {
        const res = await fetch(`${API_BASE}/api/analytics/heatmap`);
        const data = await res.json();
        
        const rows = {};
        data.forEach(cell => {
            if (!rows[cell.tracker]) {
                rows[cell.tracker] = {};
            }
            rows[cell.tracker][cell.category] = cell.value;
        });
        
        heatmapGridBody.innerHTML = "";
        const categories = ['Social Media', 'E-Commerce', 'News & Blogs', 'Finance', 'Streaming & Media'];
        
        Object.keys(rows).forEach(tracker => {
            const rowDiv = document.createElement("div");
            rowDiv.className = "heatmap-grid-row";
            rowDiv.style.display = "grid";
            rowDiv.style.gridTemplateColumns = "1.2fr repeat(5, 1fr)";
            rowDiv.style.gap = "0.5rem";
            rowDiv.style.alignItems = "center";
            
            const nameLabel = document.createElement("div");
            nameLabel.style.fontSize = "0.8rem";
            nameLabel.style.fontWeight = "600";
            nameLabel.innerText = tracker;
            rowDiv.appendChild(nameLabel);
            
            categories.forEach(cat => {
                const val = rows[tracker][cat] || 0;
                const cell = document.createElement("div");
                cell.className = "heatmap-cell";
                cell.innerText = `${val}%`;
                
                let cellBg = "rgba(0,198,255,0.06)";
                let borderCol = "rgba(0,198,255,0.2)";
                let txtCol = "var(--color-block)";
                
                if (val > 70) {
                    cellBg = "rgba(255,51,102,0.25)";
                    borderCol = "rgba(255,51,102,0.4)";
                    txtCol = "var(--color-expose)";
                } else if (val > 30) {
                    cellBg = "rgba(255,159,28,0.2)";
                    borderCol = "rgba(255,159,28,0.4)";
                    txtCol = "var(--color-warning)";
                }
                
                cell.style.background = cellBg;
                cell.style.border = `1px solid ${borderCol}`;
                cell.style.color = txtCol;
                cell.style.padding = "0.5rem";
                cell.style.borderRadius = "6px";
                cell.style.textAlign = "center";
                cell.style.fontSize = "0.75rem";
                cell.style.fontWeight = "700";
                cell.style.cursor = "pointer";
                cell.style.transition = "all 0.2s ease";
                
                cell.addEventListener("mouseenter", () => {
                    soundManager.playBlip(950, 0.01);
                    cell.style.transform = "scale(1.05)";
                    cell.style.boxShadow = `0 0 8px ${borderCol}`;
                    updateRiskDetailCard(tracker, cat, val);
                });
                
                cell.addEventListener("mouseleave", () => {
                    cell.style.transform = "scale(1)";
                    cell.style.boxShadow = "none";
                });
                
                rowDiv.appendChild(cell);
            });
            
            heatmapGridBody.appendChild(rowDiv);
        });
    } catch (e) {
        console.error("Heatmap loading error", e);
    }
}

function updateRiskDetailCard(tracker, category, score) {
    riskInfoTitle.innerText = `${tracker} on ${category}`;
    
    let description = "";
    if (score > 70) {
        description = `CRITICAL EXPOSURE ALERT: Aggressive cross-site correlation detected. Outbound cookie hashes are mapped to narrow advertisement profile graphs, exposing real browser identities.`;
    } else if (score > 30) {
        description = `MODERATE AUDIT ADVISORY: Cookies are tracked, but location logging and hardware telemetry features are locked or partially masked by GPC headers.`;
    } else {
        description = `SECURED: Safe operational parameters. Standard analytics query logs only; minimal tracking pixels discovered on these endpoints.`;
    }
    riskInfoDesc.innerText = description;
}

function setupHeatmapEvents() {
    btnRefreshHeatmap.addEventListener("click", () => {
        soundManager.playBlip(550, 0.08);
        loadHeatmap();
        showToast("Tracker heatmap refreshed");
    });
}

// ==========================================
// 🔗 BROWSER EXTENSION ROADMAP & POPUP
// ==========================================
function setupMockExtension() {
    extShieldBtn.addEventListener("click", () => {
        const extActive = extShieldStatus.innerText.includes("ACTIVE");
        
        if (extActive) {
            extShieldBtn.style.borderColor = "var(--color-expose)";
            extShieldBtn.style.color = "var(--color-expose)";
            extShieldBtn.style.background = "rgba(255, 51, 102, 0.15)";
            extShieldBtn.style.boxShadow = "0 0 12px rgba(255, 51, 102, 0.2)";
            extShieldStatus.innerText = "SHIELD: OFF";
            extShieldStatus.style.color = "var(--color-expose)";
            soundManager.playBlip(330, 0.2);
            soundManager.speak("Extension protection deactivated.");
        } else {
            extShieldBtn.style.borderColor = "var(--color-poison)";
            extShieldBtn.style.color = "var(--color-poison)";
            extShieldBtn.style.background = "rgba(0, 255, 170, 0.15)";
            extShieldBtn.style.boxShadow = "0 0 12px rgba(0, 255, 170, 0.2)";
            extShieldStatus.innerText = "SHIELD: ACTIVE";
            extShieldStatus.style.color = "var(--color-poison)";
            soundManager.playPoisonSweep();
            soundManager.speak("Extension protection armed.");
        }
    });
}

function updateMockExtensionStats() {
    extEpsilonVal.innerText = activeEpsilon.toFixed(2);
    extPoisonedCount.innerText = metricPoisoned.innerText;
    
    const baseW = 1920;
    const noise = dpEnabled ? (Math.random() - 0.5) * (150 / activeEpsilon) : 0;
    extFuzzedWidth.innerText = `${(baseW + noise).toFixed(0)}px`;
}

// Settings Mock Save
function saveSettings() {
    soundManager.playBlip(720, 0.1, "sine");
    const selectedPersona = document.getElementById("setting-persona-mode").value;
    
    if (selectedPersona !== "auto") {
        showToast(`Override Profile set to: ${selectedPersona.toUpperCase()}`);
        profileName.innerText = `User Override: ${selectedPersona}`;
        soundManager.speak(`Persona overrides set to ${selectedPersona}.`);
    } else {
        showToast("Auto-rotating profiles enabled.");
        soundManager.speak("Auto rotation configured.");
    }
}

// Modern Sliding Toast
function showToast(message) {
    toastBanner.innerText = message;
    toastBanner.classList.add("show");
    setTimeout(() => {
        toastBanner.classList.remove("show");
    }, 3000);
}

// Home Simulator stream
const SIMULATED_STREAM_LINES = [
    { text: "⚡ Initializing Shadow Proxy pipeline listeners on port 8000...", type: "info" },
    { text: "🛡️ Intercepted script load request: connect.facebook.net/fbp.js", type: "blocked" },
    { text: "⛔ Telemetry block rule triggered: script access severed.", type: "blocked" },
    { text: "🛡️ Intercepted cookie packet request: doubleclick.net/ad/tag", type: "poisoned" },
    { text: "🧬 Applying ε-Laplace Differential Privacy perturbation...", type: "poisoned" },
    { text: "🧬 Injected fake query cookie: shadow_interest=nas-setup", type: "poisoned" },
    { text: "🧬 Spoofed fuzzed viewport Client Hint: Sec-CH-Viewport-Width = 1762px", type: "poisoned" },
    { text: "💽 Committing audit logger to SQLite analytics engine...", type: "info" },
    { text: "💾 Cached session counters in-memory (Redis simulation incremented).", type: "info" },
    { text: "🛡️ Intercepted HTTP fetch: google-analytics.com/g/collect", type: "poisoned" },
    { text: "🧬 Swapped GA4 tracker token: _ga=SHADOW_DP_500284729 (DP mask active)", type: "poisoned" }
];

let streamIndex = 0;

function startHomeSimulation() {
    if (homeConsoleTimer) return;
    
    homeSimConsole.innerHTML = '<div class="home-sim-line" style="color: var(--color-poison);">// Active Shield Logging Session Started...</div>';
    
    homeConsoleTimer = setInterval(() => {
        const lineData = SIMULATED_STREAM_LINES[streamIndex];
        
        let colorStyle = "var(--text-secondary)";
        if (lineData.type === "blocked") colorStyle = "var(--color-block)";
        if (lineData.type === "poisoned") colorStyle = "var(--color-poison)";
        if (lineData.type === "info") colorStyle = "#a5b4fc";
        
        const line = document.createElement("div");
        line.className = "home-sim-line";
        line.style.color = colorStyle;
        line.innerText = `[${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}] ${lineData.text}`;
        
        homeSimConsole.appendChild(line);
        homeSimConsole.scrollTop = homeSimConsole.scrollHeight;
        
        streamIndex = (streamIndex + 1) % SIMULATED_STREAM_LINES.length;
    }, 1800);
    
    simTriggerBtn.innerText = "Stop Request Stream";
    simTriggerBtn.classList.add("btn-secondary");
}

function stopHomeSimulation() {
    if (homeConsoleTimer) {
        clearInterval(homeConsoleTimer);
        homeConsoleTimer = null;
    }
    simTriggerBtn.innerText = "Generate Request Stream";
    simTriggerBtn.classList.remove("btn-secondary");
}

function toggleHomeSimulation() {
    if (homeConsoleTimer) {
        soundManager.playBlip(300, 0.05);
        stopHomeSimulation();
    } else {
        soundManager.playBlip(600, 0.05);
        startHomeSimulation();
    }
}

// ----------------------------------------------------
// WebSockets: Real-time Defense Link
// ----------------------------------------------------
let defenseWs = null;

function setupDefenseWs() {
    const btnActivate = document.getElementById("btn-activate-shield");
    const btnPassive = document.getElementById("btn-passive-shield");
    const statusLbl = document.getElementById("defense-ws-status");
    const wsLog = document.getElementById("defense-ws-log");
    const radarSweep = document.getElementById("radar-sweep");
    const radarGlow = document.getElementById("radar-glow-node");
    const radarState = document.getElementById("radar-state-lbl");
    
    if (!btnActivate) return;
    
    function logWsMessage(msg, isError=false, highlightColor=null) {
        const div = document.createElement("div");
        div.style.marginBottom = "4px";
        if (isError) div.style.color = "var(--color-expose)";
        else if (highlightColor) div.style.color = highlightColor;
        else div.style.color = "#fff";
        div.innerText = `> ${msg}`;
        wsLog.appendChild(div);
        wsLog.scrollTop = wsLog.scrollHeight;
    }
    
    function flashRadar(color) {
        radarGlow.style.boxShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
        radarGlow.style.background = color;
        setTimeout(() => {
            radarGlow.style.boxShadow = `0 0 10px var(--color-poison)`;
            radarGlow.style.background = `var(--color-poison)`;
        }, 300);
    }
    
    btnActivate.addEventListener("click", () => {
        if (defenseWs) return; // already connected
        
        soundManager.playSweep(300, 800, "sine");
        soundManager.speak("Establishing real-time connection. Live-Shield active.");
        
        wsLog.innerHTML = "";
        logWsMessage("Initiating WebSocket handshake...", false, "var(--text-secondary)");
        
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/defense/ws`;
        
        defenseWs = new WebSocket(wsUrl);
        
        defenseWs.onopen = () => {
            statusLbl.innerText = "LIVE LINK ACTIVE";
            statusLbl.style.color = "var(--color-poison)";
            statusLbl.style.borderColor = "var(--color-poison)";
            statusLbl.style.background = "rgba(0, 255, 170, 0.1)";
            
            radarSweep.style.display = "block";
            radarGlow.style.boxShadow = "0 0 10px var(--color-poison)";
            radarGlow.style.background = "var(--color-poison)";
            radarState.innerText = "SYNC ESTABLISHED";
            
            btnActivate.style.opacity = "0.5";
            btnActivate.style.pointerEvents = "none";
            btnPassive.style.opacity = "1";
            btnPassive.style.pointerEvents = "auto";
            
            logWsMessage("Connection Established. Monitoring real-time telemetry.", false, "var(--color-poison)");
        };
        
        defenseWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "tracker_event") {
                    let color = "#fff";
                    if (data.status === "Poisoned") {
                        color = "var(--color-poison)";
                        soundManager.playBlip(1200, 0.03);
                        flashRadar("var(--color-poison)");
                    } else if (data.status === "Exposed") {
                        color = "var(--color-expose)";
                        soundManager.playBlip(200, 0.05);
                        flashRadar("var(--color-expose)");
                    } else {
                        color = "var(--color-block)";
                        soundManager.playBlip(800, 0.03);
                        flashRadar("var(--color-block)");
                    }
                    
                    const timeStr = new Date(data.timestamp * 1000).toLocaleTimeString();
                    logWsMessage(`[${timeStr}] Intercepted ${data.tracker}: Status = ${data.status}. Payload = ${data.injected_val}`, false, color);
                }
            } catch(e) {
                console.error("WS Parse Error:", e);
            }
        };
        
        defenseWs.onerror = (err) => {
            logWsMessage("WebSocket connection error occurred.", true);
        };
        
        defenseWs.onclose = () => {
            logWsMessage("WebSocket connection closed. Reverting to Passive Shield.", true);
            statusLbl.innerText = "PASSIVE MODE";
            statusLbl.style.color = "var(--color-expose)";
            statusLbl.style.borderColor = "var(--color-expose)";
            statusLbl.style.background = "rgba(255,51,102,0.05)";
            
            radarSweep.style.display = "none";
            radarGlow.style.boxShadow = "0 0 10px var(--color-expose)";
            radarGlow.style.background = "var(--color-expose)";
            radarState.innerText = "STANDBY LINK";
            
            btnActivate.style.opacity = "1";
            btnActivate.style.pointerEvents = "auto";
            
            defenseWs = null;
        };
    });
    
    btnPassive.addEventListener("click", () => {
        if (defenseWs) {
            soundManager.playBlip(400, 0.05);
            soundManager.speak("WebSocket connection closed. Reverting to passive shield.");
            defenseWs.close();
            defenseWs = null;
        }
    });
}
