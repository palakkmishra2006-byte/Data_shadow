import time
import random
import asyncio
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from typing import Dict, Any, List, Optional

from db import redis_sim, postgres_sim
from .poison_engine import poison_engine, TRACKERS
from .privacy_parser import privacy_parser

app = FastAPI(title="Data-Shadow Defense Engine API")

# Configure CORS so our Vite frontend can query the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For MVP, allow all origins. Can be restricted to specific localhost ports.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared Session ID for single-user dashboard representation
SESSION_ID = "shadow_session_alpha"

# Initialize Session
postgres_sim.create_session(
    session_id=SESSION_ID,
    ip_address="192.168.1.45",
    browser="Chrome 120.0 (Windows)",
    country="United States",
    privacy_score=100
)

class ToggleRequest(BaseModel):
    is_active: Optional[bool] = None

class PrivacyParseRequest(BaseModel):
    text: str
    url: Optional[str] = ""

class TrackerSimulateRequest(BaseModel):
    site_url: str

class DynamicPersonaRequest(BaseModel):
    role: str
    interests: str

class ConfigDPRequest(BaseModel):
    dp_enabled: Optional[bool] = None
    epsilon: Optional[float] = None

class DPSimulateRequest(BaseModel):
    base_value: float
    sensitivity: float
    count: Optional[int] = 50


@app.get("/api/status")
def get_status():
    """
    Returns the status of the Data-Poisoning Engine.
    """
    return poison_engine.get_status()

@app.post("/api/poison/toggle")
def toggle_poison(req: ToggleRequest):
    """
    Toggles the active state of the Data-Poisoning Engine.
    """
    current_status = poison_engine.is_active
    if req.is_active is not None:
        if req.is_active != current_status:
            poison_engine.toggle()
    else:
        poison_engine.toggle()
    return poison_engine.get_status()

@app.get("/api/audit/logs")
def get_audit_logs(limit: int = 50, simulate_live: bool = True):
    """
    Fetches tracker logs. If simulate_live is True and engine is running,
    we randomly generate new tracker activities to simulate real-time browser behavior.
    """
    if simulate_live and random.random() > 0.4:
        # Simulate a tracker targeting the browser
        tracker = random.choice(TRACKERS)
        
        # Decide if we block, poison, or expose based on engine status
        status_options = ["Poisoned", "Blocked"] if poison_engine.is_active else ["Exposed"]
        status = random.choice(status_options)
        
        orig_val = f"user_real_uid_{random.randint(10000, 99999)}_ip_192.168.1.45"
        
        if status == "Poisoned":
            noise_packet = poison_engine.generate_noise_packet(tracker)
            injected_val = str(noise_packet["poisoned_payload"])
            postgres_sim.log_activity(
                session_id=SESSION_ID,
                log_type="Cookie/Header Injection",
                target=tracker["name"],
                status="Poisoned",
                original_val=orig_val,
                injected_val=injected_val
            )
            # Update Redis-like low-latency count
            redis_sim.incr(f"tracker_count:{tracker['name']}")
        elif status == "Blocked":
            postgres_sim.log_activity(
                session_id=SESSION_ID,
                log_type="Request Interception",
                target=tracker["name"],
                status="Blocked",
                original_val=orig_val,
                injected_val="None (Connection Severed)"
            )
            redis_sim.incr(f"blocked_count:{tracker['name']}")
        else:
            postgres_sim.log_activity(
                session_id=SESSION_ID,
                log_type="Leak Detected",
                target=tracker["name"],
                status="Exposed",
                original_val=orig_val,
                injected_val=orig_val  # Exposed real data!
            )
            redis_sim.incr(f"exposed_count:{tracker['name']}")
            
        # Re-calculate overall session privacy score
        logs = postgres_sim.get_session_logs(SESSION_ID, limit=100)
        exposed_count = sum(1 for log in logs if log["status"] == "Exposed")
        new_score = max(10, 100 - (exposed_count * 12))
        postgres_sim.update_privacy_score(SESSION_ID, new_score)

    logs = postgres_sim.get_session_logs(SESSION_ID, limit=limit)
    return {
        "session_id": SESSION_ID,
        "logs": logs
    }

@app.post("/api/audit/simulate")
def simulate_tracker(req: TrackerSimulateRequest):
    """
    Forces the simulation of a tracking event on a specific website, showing the raw before-and-after headers.
    """
    tracker = random.choice(TRACKERS)
    
    # Original raw client request headers
    original_headers = {
        "Host": tracker["domain"],
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": f"_ga=GA1.2.983742938.17000000; _fbp=fb.1.17000000.12345; user_id=palak_admin_88",
        "Connection": "keep-alive"
    }
    
    poisoned_headers = poison_engine.poison_headers(original_headers)
    
    status = "Poisoned" if poison_engine.is_active else "Exposed"
    
    postgres_sim.log_activity(
        session_id=SESSION_ID,
        log_type="Header Injection",
        target=f"{tracker['name']} on {req.site_url}",
        status=status,
        original_val=original_headers["Cookie"],
        injected_val=poisoned_headers["Cookie"] if status == "Poisoned" else original_headers["Cookie"]
    )
    
    return {
        "tracker": tracker["name"],
        "target_site": req.site_url,
        "is_poisoned": poison_engine.is_active,
        "original_headers": original_headers,
        "poisoned_headers": poisoned_headers
    }

@app.post("/api/privacy/parse")
def parse_policy(req: PrivacyParseRequest):
    """
    Parses a privacy policy text and updates the global privacy scorecard database score.
    """
    result = privacy_parser.parse_policy(req.text, req.url)
    # Update current session score based on parsed score
    postgres_sim.update_privacy_score(SESSION_ID, result["score"])
    return result

@app.get("/api/analytics")
def get_analytics():
    """
    Aggregates session parameters and logger counts for statistics visualization.
    """
    analytics = postgres_sim.get_analytics()
    
    # Add real-time active dashboard trackers
    logs = postgres_sim.get_session_logs(SESSION_ID, limit=100)
    
    total_poisoned = sum(1 for log in logs if log["status"] == "Poisoned")
    total_blocked = sum(1 for log in logs if log["status"] == "Blocked")
    total_exposed = sum(1 for log in logs if log["status"] == "Exposed")
    
    # Calculate score based on actual exposures
    current_score = max(10, 100 - (total_exposed * 12))
    
    return {
        "session_id": SESSION_ID,
        "privacy_score": current_score,
        "total_events": len(logs),
        "poisoned_count": total_poisoned,
        "blocked_count": total_blocked,
        "exposed_count": total_exposed,
        "db_analytics": analytics
    }

@app.post("/api/privacy/dpdp")
def parse_dpdp(req: PrivacyParseRequest):
    """
    Audits a privacy policy text against DPDP Act compliance rules.
    """
    result = privacy_parser.parse_dpdp_compliance(req.text, req.url)
    return result

@app.post("/api/persona/generate")
def generate_persona(req: DynamicPersonaRequest):
    """
    Dynamically generates a custom roleplay persona.
    """
    profile = poison_engine.generate_custom_persona(req.role, req.interests)
    return {
        "status": "Success",
        "profile": profile
    }

@app.get("/api/analytics/heatmap")
def get_heatmap():
    """
    Returns aggregated tracker categories activity counts for heatmap display.
    """
    return postgres_sim.get_heatmap_data()

@app.post("/api/poison/config")
def configure_dp(req: ConfigDPRequest):
    """
    Updates Differential Privacy configurations.
    """
    if req.dp_enabled is not None:
        poison_engine.dp_enabled = req.dp_enabled
    if req.epsilon is not None:
        poison_engine.epsilon = max(0.01, min(100.0, req.epsilon))
    return poison_engine.get_status()

@app.post("/api/poison/simulate_dp")
def simulate_dp(req: DPSimulateRequest):
    """
    Simulates a Laplace noise distribution at current epsilon.
    Useful for client canvas representation.
    """
    eps = poison_engine.epsilon
    scale = req.sensitivity / eps
    
    original_points = []
    poisoned_points = []
    
    for i in range(req.count):
        noise = poison_engine.get_laplace_noise(scale)
        original_points.append(req.base_value)
        poisoned_points.append(req.base_value + noise)
        
    return {
        "epsilon": eps,
        "scale": scale,
        "original": original_points,
        "poisoned": poisoned_points
    }

def resolve_frontend_path(filename: str) -> str:

    import os
    # Start at the directory of this file
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Traverse upwards to find the folder containing "frontend"
    temp_dir = current_dir
    for _ in range(5):
        candidate = os.path.join(temp_dir, "frontend", filename)
        if os.path.exists(candidate):
            return candidate
        parent = os.path.dirname(temp_dir)
        if parent == temp_dir:
            break
        temp_dir = parent
        
    # Fallback to working directory check
    cwd = os.getcwd()
    cwd_candidate = os.path.join(cwd, "frontend", filename)
    if os.path.exists(cwd_candidate):
        return cwd_candidate
        
    cwd_sub_candidate = os.path.join(cwd, "data-shadow", "frontend", filename)
    if os.path.exists(cwd_sub_candidate):
        return cwd_sub_candidate
        
    # Default fallback
    return os.path.join(current_dir, "..", "frontend", filename)

@app.get("/")
def serve_index():
    import os
    from fastapi.responses import HTMLResponse
    path = resolve_frontend_path("index.html")
    if not os.path.exists(path):
        return HTMLResponse(content=f"<h1>Frontend Index Not Found</h1><p>Looked at path: {path}</p><p>Please create index.html in the frontend folder.</p>")
    with open(path, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/style.css")
def serve_css():
    import os
    from fastapi import Response
    path = resolve_frontend_path("style.css")
    if not os.path.exists(path):
        return Response(content=f"/* CSS Not Found at {path} */", media_type="text/css")
    with open(path, "r", encoding="utf-8") as f:
        return Response(content=f.read(), media_type="text/css")

@app.get("/app.js")
def serve_js():
    import os
    from fastapi import Response
    path = resolve_frontend_path("app.js")
    if not os.path.exists(path):
        return Response(content=f"// JS Not Found at {path}", media_type="text/javascript")
    with open(path, "r", encoding="utf-8") as f:
        return Response(content=f.read(), media_type="text/javascript")

@app.websocket("/api/defense/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        # Send initial state
        await websocket.send_json({"type": "status", "connected": True, "mode": "Live-Shield"})
        
        # Continuous stream loop
        while True:
            # Simulate incoming tracker detections
            await asyncio.sleep(random.uniform(1.5, 3.5))
            
            # Generate a real-time event
            tracker = random.choice(TRACKERS)
            status_options = ["Poisoned", "Blocked"] if poison_engine.dp_enabled else ["Exposed"]
            status = random.choice(status_options)
            orig_val = f"user_real_uid_{random.randint(10000, 99999)}_ip_{random.randint(1,255)}.{random.randint(1,255)}.X.X"
            
            injected_val = "None"
            if status == "Poisoned":
                injected_val = f"Perturbed [Laplace Noise applied, Epsilon: {poison_engine.epsilon}]"
                
            # Send real-time event through WebSocket
            await websocket.send_json({
                "type": "tracker_event",
                "tracker": tracker["name"],
                "domain": tracker["domain"],
                "status": status,
                "original_val": orig_val,
                "injected_val": injected_val,
                "timestamp": time.time()
            })
    except WebSocketDisconnect:
        pass
