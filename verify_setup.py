import unittest
from db import redis_sim, postgres_sim
from poison_engine import poison_engine, TRACKERS
from privacy_parser import privacy_parser

class TestDataShadowCore(unittest.TestCase):
    def setUp(self):
        self.session_id = "shadow_session_alpha"
        postgres_sim.create_session(
            session_id=self.session_id,
            ip_address="127.0.0.1",
            browser="TestBrowser",
            country="Localhost",
            privacy_score=100
        )

    def test_database_simulation(self):
        # Verify that RedisSim and PostgresSim CRUD operations function correctly.
        
        # Test Redis simulation
        redis_sim.set("test_key", "val_1")
        self.assertEqual(redis_sim.get("test_key"), "val_1")
        """
        Verify that RedisSim and PostgresSim CRUD operations function correctly.
        """
        # Test Redis simulation
        redis_sim.set("test_key", "val_1")
        self.assertEqual(redis_sim.get("test_key"), "val_1")
        
        redis_sim.incr("counter_key")
        self.assertEqual(redis_sim.get("counter_key"), 1)
        redis_sim.incr("counter_key")
        self.assertEqual(redis_sim.get("counter_key"), 2)
        # Test PostgreSQL/SQLite simulation
        postgres_sim.log_activity(
            session_id=self.session_id,
            log_type="Cookie",
            target="Google Analytics",
            status="Poisoned",
            original_val="real_uid_123",
            injected_val="synthetic_noise_999"
        )
        
        logs = postgres_sim.get_session_logs(self.session_id, limit=5)
        self.assertGreater(len(logs), 0)
        self.assertEqual(logs[0]["target"], "Google Analytics")
        self.assertEqual(logs[0]["status"], "Poisoned")
        
        # Test analytics fetch
        analytics = postgres_sim.get_analytics()
        self.assertIn("total_sessions", analytics)
        self.assertIn("average_privacy_score", analytics)
    def test_poisoning_engine(self):
        """
        Verify that the DataPoisoningEngine generates synthetic metadata and user behaviors.
        """
        original_headers = {
            "User-Agent": "Real Browser UA",
            "Cookie": "uid=real_user_id_101; session=active_session_1",
            "Accept-Language": "en-US"
        }
        
        # When engine is active, headers must be mutated/masked
        poison_engine.is_active = True
        poisoned = poison_engine.poison_headers(original_headers)
        
        self.assertNotEqual(poisoned["User-Agent"], original_headers["User-Agent"])
        self.assertIn("shadow_interest", poisoned["Cookie"])
        self.assertIn("DNT", poisoned)
        
        # When engine is disabled, headers should remain intact
        poison_engine.is_active = False
        unpoisoned = poison_engine.poison_headers(original_headers)
        self.assertEqual(unpoisoned["User-Agent"], original_headers["User-Agent"])
        self.assertEqual(unpoisoned["Cookie"], original_headers["Cookie"])
    def test_privacy_policy_parser(self):
        """
        Verify that the AIPrivacyParser scores, summarizes, and categorizes policy vulnerabilities.
        """
        sample_policy = "We sell your location coordinates, device identifiers, and social contacts to third party affiliates and marketing networks. We store this raw profile metadata indefinitely."
        
        result = privacy_parser.parse_policy(sample_policy)
        
        # High sharing + indefinite retention should lead to a critical score drop (< 60)
        self.assertLess(result["score"], 80)
        self.assertGreater(len(result["alerts"]), 0)
        self.assertTrue(any(a["severity"] == "CRITICAL" for a in result["alerts"]))
        
        # Test pre-canned query logic
        google_result = privacy_parser.parse_policy("", "https://www.google.com")
        self.assertEqual(google_result["score"], 45)
if __name__ == "__main__":
    unittest.main()
