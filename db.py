import sqlite3
import json
import time
import os
from typing import Dict, Any, List

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data_shadow.db")

class RedisSim:
    """
    In-memory mock for Redis. Emulates Redis low-latency key-value, hash, and list operations.
    """
    def __init__(self):
        self._data: Dict[str, Any] = {}

    def get(self, key: str) -> Any:
        return self._data.get(key)

    def set(self, key: str, value: Any) -> None:
        self._data[key] = value

    def lpush(self, key: str, value: Any) -> None:
        if key not in self._data:
            self._data[key] = []
        if not isinstance(self._data[key], list):
            self._data[key] = [self._data[key]]
        self._data[key].insert(0, value)

    def lrange(self, key: str, start: int, stop: int) -> List[Any]:
        lst = self._data.get(key, [])
        if not isinstance(lst, list):
            return []
        # Stop index is inclusive in Redis lrange
        if stop == -1:
            return lst[start:]
        return lst[start:stop + 1]

    def hset(self, key: str, field: str, value: Any) -> None:
        if key not in self._data:
            self._data[key] = {}
        if not isinstance(self._data[key], dict):
            self._data[key] = {}
        self._data[key][field] = value

    def hgetall(self, key: str) -> Dict[str, Any]:
        val = self._data.get(key, {})
        return val if isinstance(val, dict) else {}

    def incr(self, key: str) -> int:
        val = self._data.get(key, 0)
        try:
            val = int(val) + 1
        except (ValueError, TypeError):
            val = 1
        self._data[key] = val
        return val


class PostgresSim:
    """
    SQLite-backed mock for PostgreSQL. Handles persistent user session metrics and logs.
    """
    def __init__(self):
        self._init_db()

    def _get_conn(self):
        # We set check_same_thread=False for FastAPI concurrency
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._get_conn()
        cursor = conn.cursor()
        
        # Create sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                ip_address TEXT,
                browser TEXT,
                country TEXT,
                timestamp REAL,
                privacy_score INTEGER DEFAULT 100
            )
        """)
        
        # Create tracker activity logs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                timestamp REAL,
                type TEXT,
                target TEXT,
                status TEXT,
                original_value TEXT,
                injected_value TEXT,
                FOREIGN KEY(session_id) REFERENCES sessions(session_id)
            )
        """)
        
        conn.commit()
        conn.close()

    def create_session(self, session_id: str, ip_address: str, browser: str, country: str, privacy_score: int = 100) -> None:
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT OR IGNORE INTO sessions (session_id, ip_address, browser, country, timestamp, privacy_score) VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, ip_address, browser, country, time.time(), privacy_score)
            )
            conn.commit()
        finally:
            conn.close()

    def update_privacy_score(self, session_id: str, score: int) -> None:
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "UPDATE sessions SET privacy_score = ? WHERE session_id = ?",
                (score, session_id)
            )
            conn.commit()
        finally:
            conn.close()

    def log_activity(self, session_id: str, log_type: str, target: str, status: str, original_val: str, injected_val: str) -> None:
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO activity_logs (session_id, timestamp, type, target, status, original_value, injected_value) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (session_id, time.time(), log_type, target, status, original_val, injected_val)
            )
            conn.commit()
        finally:
            conn.close()

    def get_session_logs(self, session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT * FROM activity_logs WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?",
                (session_id, limit)
            )
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        finally:
            conn.close()

    def get_analytics(self) -> Dict[str, Any]:
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            # Count total sessions
            cursor.execute("SELECT COUNT(*) FROM sessions")
            total_sessions = cursor.fetchone()[0]

            # Average privacy score
            cursor.execute("SELECT AVG(privacy_score) FROM sessions")
            avg_score_row = cursor.fetchone()
            avg_score = round(avg_score_row[0], 1) if avg_score_row[0] is not None else 100.0

            # Count logs by type
            cursor.execute("SELECT type, COUNT(*) FROM activity_logs GROUP BY type")
            type_counts = {row[0]: row[1] for row in cursor.fetchall()}

            # Count logs by status
            cursor.execute("SELECT status, COUNT(*) FROM activity_logs GROUP BY status")
            status_counts = {row[0]: row[1] for row in cursor.fetchall()}

            return {
                "total_sessions": total_sessions,
                "average_privacy_score": avg_score,
                "counts_by_type": type_counts,
                "counts_by_status": status_counts
            }
        finally:
            conn.close()

    def get_heatmap_data(self) -> List[Dict[str, Any]]:
        """
        Calculates risk/aggressiveness matrix for trackers across categories.
        Includes database log count context to simulate dynamic heatmap updates.
        """
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT COUNT(*) FROM activity_logs")
            count = cursor.fetchone()[0]
        except Exception:
            count = 0
        finally:
            conn.close()

        # Baseline tracking density percentages (0-100) across web verticals
        categories = ['Social Media', 'E-Commerce', 'News & Blogs', 'Finance', 'Streaming & Media']
        base_aggressiveness = {
            'Google Analytics': {'Social Media': 75, 'E-Commerce': 90, 'News & Blogs': 85, 'Finance': 70, 'Streaming & Media': 80},
            'Facebook Pixel': {'Social Media': 95, 'E-Commerce': 85, 'News & Blogs': 40, 'Finance': 30, 'Streaming & Media': 60},
            'TikTok Pixel': {'Social Media': 90, 'E-Commerce': 70, 'News & Blogs': 20, 'Finance': 10, 'Streaming & Media': 85},
            'Hotjar': {'Social Media': 30, 'E-Commerce': 75, 'News & Blogs': 45, 'Finance': 50, 'Streaming & Media': 25},
            'DoubleClick': {'Social Media': 80, 'E-Commerce': 95, 'News & Blogs': 90, 'Finance': 60, 'Streaming & Media': 75},
            'Mixpanel': {'Social Media': 65, 'E-Commerce': 80, 'News & Blogs': 35, 'Finance': 75, 'Streaming & Media': 55}
        }
        
        heatmap = []
        # Dynamic fuzz variation synced with total logs
        fuzz_val = (count % 11) - 5
        for tracker, cat_map in base_aggressiveness.items():
            for category, base_val in cat_map.items():
                fuzzed = max(5, min(100, base_val + fuzz_val + hash(tracker + category) % 7 - 3))
                heatmap.append({
                    "tracker": tracker,
                    "category": category,
                    "value": fuzzed
                })
        return heatmap



# Instantiate global singletons for database simulations
redis_sim = RedisSim()
postgres_sim = PostgresSim()