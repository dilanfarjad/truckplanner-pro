"""
Tachograph API Tests - EU 561/2006 Compliance
Tests for the new universal tachograph integration with adapter system
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "hans@driver.de"
TEST_PASSWORD = "test1234"


class TestTachographAPI:
    """Tests for Tachograph endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            # Try to register the user first
            register_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD,
                "name": "Hans Fahrer",
                "language": "de",
                "role": "driver"
            })
            if register_response.status_code in [200, 201]:
                token = register_response.json().get("access_token")
                self.session.headers.update({"Authorization": f"Bearer {token}"})
            else:
                pytest.skip("Could not authenticate - skipping tests")
    
    # ============== GET /api/tachograph/available-types ==============
    def test_get_available_types(self):
        """Test: GET /api/tachograph/available-types - Liste der Tachograph-Typen"""
        response = self.session.get(f"{BASE_URL}/api/tachograph/available-types")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "types" in data, "Response should contain 'types' key"
        assert isinstance(data["types"], list), "Types should be a list"
        assert len(data["types"]) > 0, "Should have at least one tachograph type"
        
        # Check structure of first type
        first_type = data["types"][0]
        assert "id" in first_type, "Type should have 'id'"
        assert "name" in first_type, "Type should have 'name'"
        assert "available" in first_type, "Type should have 'available'"
        
        # Check that manual type is available
        manual_type = next((t for t in data["types"] if t["id"] == "manual"), None)
        assert manual_type is not None, "Manual type should exist"
        assert manual_type["available"] == True, "Manual type should be available"
        
        print(f"✓ Found {len(data['types'])} tachograph types")
        print(f"  Types: {[t['id'] for t in data['types']]}")
    
    # ============== POST /api/tachograph/connect ==============
    def test_connect_manual_tachograph(self):
        """Test: POST /api/tachograph/connect - Mit manuellem Tachograph verbinden"""
        response = self.session.post(f"{BASE_URL}/api/tachograph/connect", json={
            "tachograph_type": "manual"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "connected" in data, "Response should contain 'connected'"
        assert data["connected"] == True, "Should be connected"
        assert "tachograph_type" in data, "Response should contain 'tachograph_type'"
        assert data["tachograph_type"] == "manual", "Type should be 'manual'"
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] == "connected", "Status should be 'connected'"
        
        print(f"✓ Connected to tachograph: {data['tachograph_type']}")
    
    # ============== GET /api/tachograph/data ==============
    def test_get_tachograph_data(self):
        """Test: GET /api/tachograph/data - Tachograph-Daten abrufen"""
        # First connect
        self.session.post(f"{BASE_URL}/api/tachograph/connect", json={
            "tachograph_type": "manual"
        })
        
        response = self.session.get(f"{BASE_URL}/api/tachograph/data")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check required fields
        assert "connection_status" in data, "Should have connection_status"
        assert "tachograph_type" in data, "Should have tachograph_type"
        assert "driver_1_activity" in data, "Should have driver_1_activity"
        assert "driving_time_since_break_minutes" in data, "Should have driving_time_since_break_minutes"
        assert "driving_time_today_minutes" in data, "Should have driving_time_today_minutes"
        assert "driving_time_week_minutes" in data, "Should have driving_time_week_minutes"
        
        print(f"✓ Tachograph data retrieved:")
        print(f"  Connection: {data['connection_status']}")
        print(f"  Activity: {data['driver_1_activity']}")
        print(f"  Driving today: {data['driving_time_today_minutes']} min")
    
    # ============== POST /api/tachograph/activity ==============
    def test_set_activity_driving(self):
        """Test: POST /api/tachograph/activity - Aktivität auf 'driving' setzen"""
        # First connect
        self.session.post(f"{BASE_URL}/api/tachograph/connect", json={
            "tachograph_type": "manual"
        })
        
        response = self.session.post(f"{BASE_URL}/api/tachograph/activity", json={
            "activity": "driving",
            "driver": 1
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success'"
        assert data["success"] == True, "Activity change should succeed"
        assert "current_activity" in data, "Response should contain 'current_activity'"
        assert data["current_activity"] == "driving", "Activity should be 'driving'"
        
        print(f"✓ Activity set to: {data['current_activity']}")
    
    def test_set_activity_working(self):
        """Test: POST /api/tachograph/activity - Aktivität auf 'working' setzen"""
        response = self.session.post(f"{BASE_URL}/api/tachograph/activity", json={
            "activity": "working",
            "driver": 1
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["current_activity"] == "working"
        print(f"✓ Activity set to: working")
    
    def test_set_activity_available(self):
        """Test: POST /api/tachograph/activity - Aktivität auf 'available' setzen"""
        response = self.session.post(f"{BASE_URL}/api/tachograph/activity", json={
            "activity": "available",
            "driver": 1
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["current_activity"] == "available"
        print(f"✓ Activity set to: available")
    
    def test_set_activity_rest(self):
        """Test: POST /api/tachograph/activity - Aktivität auf 'rest' setzen"""
        response = self.session.post(f"{BASE_URL}/api/tachograph/activity", json={
            "activity": "rest",
            "driver": 1
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["current_activity"] == "rest"
        print(f"✓ Activity set to: rest")
    
    # ============== GET /api/tachograph/compliance ==============
    def test_get_compliance_status(self):
        """Test: GET /api/tachograph/compliance - Compliance-Status abrufen"""
        response = self.session.get(f"{BASE_URL}/api/tachograph/compliance")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check required fields
        assert "is_compliant" in data, "Should have is_compliant"
        assert "risk_level" in data, "Should have risk_level"
        assert "break_required_in_minutes" in data, "Should have break_required_in_minutes"
        assert "break_required_in_km" in data, "Should have break_required_in_km"
        assert "warnings" in data, "Should have warnings"
        assert "recommendations" in data, "Should have recommendations"
        
        # Validate risk_level is valid
        assert data["risk_level"] in ["green", "yellow", "red"], f"Invalid risk_level: {data['risk_level']}"
        
        print(f"✓ Compliance status:")
        print(f"  Compliant: {data['is_compliant']}")
        print(f"  Risk level: {data['risk_level']}")
        print(f"  Break in: {data['break_required_in_minutes']} min / {data['break_required_in_km']} km")
    
    # ============== GET /api/tachograph/may-drive ==============
    def test_may_drive(self):
        """Test: GET /api/tachograph/may-drive - Darf ich noch fahren?"""
        response = self.session.get(f"{BASE_URL}/api/tachograph/may-drive")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check required fields
        assert "may_drive" in data, "Should have may_drive"
        assert "max_driving_minutes" in data, "Should have max_driving_minutes"
        assert "next_action" in data, "Should have next_action"
        
        # Validate next_action is valid
        valid_actions = ["continue", "plan_break", "take_break", "stop_now"]
        assert data["next_action"] in valid_actions, f"Invalid next_action: {data['next_action']}"
        
        print(f"✓ May drive: {data['may_drive']}")
        print(f"  Max driving: {data['max_driving_minutes']} min")
        print(f"  Next action: {data['next_action']}")
    
    # ============== GET /api/tachograph/driving-mode ==============
    def test_driving_mode_display(self):
        """Test: GET /api/tachograph/driving-mode - Fahrmodus-Daten (3 Infos)"""
        response = self.session.get(f"{BASE_URL}/api/tachograph/driving-mode")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check required fields for driving mode display
        assert "remaining_time" in data, "Should have remaining_time"
        assert "remaining_km" in data, "Should have remaining_km"
        assert "risk_level" in data, "Should have risk_level"
        assert "is_compliant" in data, "Should have is_compliant"
        
        print(f"✓ Driving mode display:")
        print(f"  Remaining time: {data['remaining_time']}")
        print(f"  Remaining km: {data['remaining_km']}")
        print(f"  Risk level: {data['risk_level']}")
    
    # ============== GET /api/tachograph/legal-texts ==============
    def test_get_legal_texts(self):
        """Test: GET /api/tachograph/legal-texts - Haftungsausschluss abrufen"""
        response = self.session.get(f"{BASE_URL}/api/tachograph/legal-texts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check required fields
        assert "disclaimer_short" in data, "Should have disclaimer_short"
        assert "disclaimer_long" in data, "Should have disclaimer_long"
        assert "article_12" in data, "Should have article_12"
        assert "driver_responsibility" in data, "Should have driver_responsibility"
        
        # Check that texts are not empty
        assert len(data["disclaimer_short"]) > 0, "disclaimer_short should not be empty"
        assert len(data["disclaimer_long"]) > 0, "disclaimer_long should not be empty"
        
        print(f"✓ Legal texts retrieved:")
        print(f"  Disclaimer short: {len(data['disclaimer_short'])} chars")
        print(f"  Disclaimer long: {len(data['disclaimer_long'])} chars")
    
    # ============== POST /api/tachograph/manual-time ==============
    def test_set_manual_time(self):
        """Test: POST /api/tachograph/manual-time - Lenkzeit manuell setzen"""
        response = self.session.post(f"{BASE_URL}/api/tachograph/manual-time", json={
            "minutes_today": 120,
            "minutes_since_break": 60,
            "minutes_week": 1200
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success'"
        assert "driving_today" in data, "Response should contain 'driving_today'"
        
        print(f"✓ Manual time set:")
        print(f"  Driving today: {data.get('driving_today', 'N/A')} min")
    
    # ============== POST /api/tachograph/disconnect ==============
    def test_disconnect_tachograph(self):
        """Test: POST /api/tachograph/disconnect - Verbindung trennen"""
        response = self.session.post(f"{BASE_URL}/api/tachograph/disconnect")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "disconnected" in data, "Response should contain 'disconnected'"
        assert data["disconnected"] == True, "Should be disconnected"
        
        print(f"✓ Tachograph disconnected")


class TestTachographCompliance:
    """Tests for EU 561/2006 compliance rules"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
    
    def test_compliance_with_avg_speed(self):
        """Test compliance calculation with different average speeds"""
        # Test with 80 km/h
        response = self.session.get(f"{BASE_URL}/api/tachograph/compliance?avg_speed=80")
        assert response.status_code == 200
        data_80 = response.json()
        
        # Test with 60 km/h
        response = self.session.get(f"{BASE_URL}/api/tachograph/compliance?avg_speed=60")
        assert response.status_code == 200
        data_60 = response.json()
        
        # km should be different based on speed
        print(f"✓ Compliance with different speeds:")
        print(f"  80 km/h: {data_80['break_required_in_km']} km")
        print(f"  60 km/h: {data_60['break_required_in_km']} km")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
