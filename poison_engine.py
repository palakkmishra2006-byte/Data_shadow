import random
import time
from typing import Dict, Any, List

SYNTHETIC_PROFILES = [
    {
        "name": "The Crypto Enthusiast",
        "interests": ["bitcoin", "solana", "defi", "web3", "memecoins", "ledger-nano"],
        "searches": ["how to stake solana", "ethereum gas fees now", "is bitcoin reaching 100k", "best hardware wallets"],
        "behavior": "visiting crypto exchanges, checking price charts, reading coin blogs",
        "shopping": ["ledger wallet", "rgb keyboard", "gaming chair", "energy drink"]
    },
    {
        "name": "The Eco-Gardener",
        "interests": ["permaculture", "composting", "organic-seeds", "indoor-plants", "solar-energy"],
        "searches": ["when to plant heirloom tomatoes", "diy worm compost bin", "best grow lights for herbs", "rainwater collection rules"],
        "behavior": "browsing plant nurseries, checking local weather, reading nature forums",
        "shopping": ["coco coir", "pruning shears", "biodegradable pots", "solar garden lights"]
    },
    {
        "name": "The Extreme Sports Fanatic",
        "interests": ["skydiving", "base-jumping", "downhill-mtb", "snowboarding", "gopro-mounts"],
        "searches": ["wingsuit license requirements", "best mtb trails whistler", "gopro hero review", "avalanche safety gear"],
        "behavior": "watching action cams, reading adventure sports blogs, checking mountain wind speeds",
        "shopping": ["mtb helmet", "gopro chest mount", "snowboard wax", "carabiners"]
    },
    {
        "name": "The Vintage Cook",
        "interests": ["sourdough", "cast-iron-cooking", "fermentation", "heirloom-recipes", "ceramic-pots"],
        "searches": ["sourdough starter feeding ratio", "how to restore rusted cast iron", "kombucha secondary fermentation ideas", "grandmas pie crust recipe"],
        "behavior": "browsing food blogs, looking up culinary history, watching baking videos",
        "shopping": ["cast iron skillet", "banneton basket", "mason jars", "linen apron"]
    },
    {
        "name": "The Cyberpunk Tech-Geek",
        "interests": ["custom-keyboards", "sbc-projects", "cyberdeck", "nas-setup", "homelab"],
        "searches": ["lubing linear switches guide", "raspberry pi alternatives 2026", "diy cyberdeck builds", "best self-hosted media server"],
        "behavior": "reading tech subreddits, researching hardware parts, looking up GitHub repositories",
        "shopping": ["soldering iron", "artisan keycaps", "ethernet switch", "thermal paste"]
    }
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/605.1.15",
    "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0"
]

TRACKERS = [
    {"name": "Google Analytics (gtag.js)", "type": "Behavioral Tracker", "domain": "google-analytics.com"},
    {"name": "Facebook Pixel (fbp)", "type": "Social Graph & Ad Tracking", "domain": "connect.facebook.net"},
    {"name": "TikTok Pixel (ttq)", "type": "Ad Optimization Tracker", "domain": "analytics.tiktok.com"},
    {"name": "Hotjar (hj)", "type": "Heatmap & Session Recorder", "domain": "static.hotjar.com"},
    {"name": "DoubleClick (fls)", "type": "Ad Server & Retargeting", "domain": "doubleclick.net"},
    {"name": "Mixpanel", "type": "Product Analytics & Funnel Tracker", "domain": "api.mixpanel.com"}
]

class DataPoisoningEngine:
    def __init__(self):
        self.is_active = True
        self.current_profile = random.choice(SYNTHETIC_PROFILES)
        self.profile_locked_until = time.time() + 60.0  # rotate profile every 60 seconds
        self.dp_enabled = True
        self.epsilon = 1.0  # Privacy budget parameter

    def toggle(self) -> bool:
        self.is_active = not self.is_active
        return self.is_active

    def get_status(self) -> Dict[str, Any]:
        self._check_profile_rotation()
        return {
            "is_active": self.is_active,
            "current_profile": self.current_profile["name"] if self.is_active else "None (Real Data Exposed)",
            "profile_details": self.current_profile if self.is_active else None,
            "dp_enabled": self.dp_enabled,
            "epsilon": self.epsilon
        }

    def _check_profile_rotation(self):
        if time.time() > self.profile_locked_until:
            self.current_profile = random.choice(SYNTHETIC_PROFILES)
            self.profile_locked_until = time.time() + 60.0

    def get_laplace_noise(self, scale: float) -> float:
        """
        Generates standard Laplace noise using a uniform variable mapping.
        Formula: x = -scale * sgn(u) * ln(1 - 2|u|) where u in [-0.5, 0.5]
        """
        import math
        u = random.uniform(-0.49999, 0.49999)
        sgn = 1.0 if u >= 0 else -1.0
        return -scale * sgn * math.log(1.0 - 2.0 * abs(u))

    def generate_custom_persona(self, role: str, interests_str: str) -> Dict[str, Any]:
        """
        Generates a custom roleplay persona dynamically based on user prompt.
        """
        import re
        role_clean = role.strip()[:50] or "Custom Persona"
        interests = [i.strip().lower() for i in re.split(r'[,;]+', interests_str) if i.strip()]
        if not interests:
            interests = ["privacy", "anonymity", "security"]
            
        searches = [
            f"what is the latest news in {interests[0]}",
            f"best tools for {interests[-1]}",
            f"how to learn {random.choice(interests)} quickly",
            f"is {random.choice(interests)} safe for consumer use"
        ]
        behavior = f"reading columns about {', '.join(interests[:3])}, researching online tutorials"
        shopping = [
            f"{interests[0]} handbook",
            f"advanced {interests[-1]} license",
            f"custom {random.choice(interests)} kit",
            "secure hardware token"
        ]
        
        persona = {
            "name": role_clean,
            "interests": interests,
            "searches": searches,
            "behavior": behavior,
            "shopping": shopping
        }
        
        self.current_profile = persona
        self.profile_locked_until = time.time() + 300.0  # Lock rotation for 5 minutes
        return persona

    def poison_headers(self, original_headers: Dict[str, str]) -> Dict[str, str]:
        """
        Masks tracking headers and cookies, injecting synthetic metadata with Laplace noise (DP).
        """
        if not self.is_active:
            return original_headers

        self._check_profile_rotation()
        poisoned = original_headers.copy()

        # Spoof user agent
        poisoned["User-Agent"] = random.choice(USER_AGENTS)

        # Spoof Language & Privacy Flags
        poisoned["Accept-Language"] = random.choice(["en-US,en;q=0.9", "fr-FR,fr;q=0.8", "de-DE,de;q=0.7", "ja-JP,ja;q=0.5"])
        poisoned["DNT"] = "1"  # Do Not Track
        poisoned["Sec-GPC"] = "1"  # Global Privacy Control

        # Inject randomized Client Hints (Sec-CH-UA)
        if "Sec-Ch-Ua" in poisoned or random.random() > 0.5:
            poisoned["Sec-Ch-Ua"] = '"Not A(Brand";v="99", "Chromium";v="121", "Google Chrome";v="121"'
            poisoned["Sec-Ch-Ua-Mobile"] = "?0" if "Mobile" not in poisoned["User-Agent"] else "?1"
            poisoned["Sec-Ch-Ua-Platform"] = '"Windows"' if "Windows" in poisoned["User-Agent"] else '"macOS"'

        # Inject Differential Privacy screen size hints
        screen_w = 1920
        screen_h = 1080
        if self.dp_enabled:
            # Scale = 150px sensitivity
            screen_w += int(self.get_laplace_noise(150.0 / self.epsilon))
            screen_h += int(self.get_laplace_noise(150.0 / self.epsilon))
            # Clamp sizes to standard browser dimensions
            screen_w = max(1024, min(2560, screen_w))
            screen_h = max(768, min(1440, screen_h))
        poisoned["Sec-CH-Viewport-Width"] = str(screen_w)
        poisoned["Sec-CH-Viewport-Height"] = str(screen_h)

        # Spoof IP tracking header (X-Forwarded-For)
        fake_ip = f"{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"
        poisoned["X-Forwarded-For"] = fake_ip

        # Spoof cookies by injecting custom noise cookies
        cookies = poisoned.get("Cookie", "")
        cookie_list = [c.strip() for c in cookies.split(";") if c.strip()]
        
        poisoned_cookies = []
        for c in cookie_list:
            if "=" in c:
                k, v = c.split("=", 1)
                if any(t in k.lower() for t in ["_ga", "_fbp", "_uetsid", "_tt_enable_cookie", "cookie", "sess", "uid"]):
                    if self.dp_enabled:
                        # Perturb base ID integer using Laplace noise. Sensitivity = 100,000.
                        base_id = 500000000 + int(self.get_laplace_noise(100000.0 / self.epsilon))
                        poisoned_cookies.append(f"{k}=SHADOW_DP_{base_id}")
                    else:
                        poisoned_cookies.append(f"{k}=SHADOW_{random.randint(100000000, 999999999)}")
                else:
                    poisoned_cookies.append(c)
            else:
                poisoned_cookies.append(c)

        # Add synthetic noise interest cookies
        poisoned_cookies.append(f"shadow_interest={self.current_profile['interests'][0]}")
        poisoned_cookies.append(f"shadow_noise_tag={random.randint(1000, 9999)}")

        poisoned["Cookie"] = "; ".join(poisoned_cookies)
        return poisoned

    def generate_noise_packet(self, tracker: Dict[str, str]) -> Dict[str, Any]:
        """
        Generates synthetic user behaviors representing injected data-poisoning packets.
        """
        self._check_profile_rotation()
        
        # Synthetic tracker payload parameters
        synthetic_query = random.choice(self.current_profile["searches"])
        synthetic_interest = random.choice(self.current_profile["interests"])
        synthetic_shopping = random.choice(self.current_profile["shopping"])
        
        timestamp = time.time()
        if self.dp_enabled:
            # Perturb timestamp with Laplace noise. Sensitivity = 15 seconds.
            timestamp += self.get_laplace_noise(15.0 / self.epsilon)
        
        # Standard tracker format fields
        payload = {
            "v": "2",
            "tid": f"UA-{random.randint(10000000, 99999999)}-{random.randint(1,9)}",
            "cid": f"SHADOW.{random.randint(1000000000, 9999999999)}.{int(timestamp)}",
            "dt": f"Search Results for {synthetic_query}",
            "dl": f"https://www.google.com/search?q={synthetic_query.replace(' ', '+')}",
            "interests": [synthetic_interest, "poisoned-traffic", f"demo-{synthetic_shopping}"],
            "synthetic_profile": self.current_profile["name"],
            "poison_stamp": f"SHADOW_LAYER_{hex(int(timestamp * 1000))[2:]}"
        }

        if self.dp_enabled:
            payload["dp_epsilon"] = self.epsilon
            payload["dp_applied"] = True
        
        return {
            "tracker": tracker["name"],
            "domain": tracker["domain"],
            "type": tracker["type"],
            "timestamp": timestamp,
            "original_intent": "[Blocked/Masked User Action]",
            "poisoned_payload": payload,
            "status": "Poisoned Successfully"
        }


# Global singleton
poison_engine = DataPoisoningEngine()