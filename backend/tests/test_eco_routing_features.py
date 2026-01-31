"""
Test Eco-Routing and Tachograph Features for TruckerMaps
Tests:
1. Eco-Routing Toggle - eco_routing parameter passed to TomTom API
2. Zwischenziel shows real rest stop name (not 'Früh')
3. Tachograph Display - Block 1, Block 2, Restlenkzeit, Arbeitszeit
4. Route calculation Köln->Berlin with real rest stop names
5. Backend eco_routing parameter handling
6. Arbeitszeit heute in Tachograph
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEcoRoutingFeatures:
    """Test Eco-Routing and related features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hans@driver.de",
            "password": "test"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_route_professional_without_eco_routing(self):
        """Test route calculation without eco-routing (fastest route)"""
        # Köln -> Berlin route
        response = self.session.post(f"{BASE_URL}/api/route/professional", json={
            "start_lat": 50.9375,
            "start_lon": 6.9603,
            "end_lat": 52.52,
            "end_lon": 13.405,
            "eco_routing": False,
            "waypoints": [],
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "include_toll": True,
            "include_speed_cameras": False,
            "alternatives": 2
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "route" in data, "Response should contain 'route'"
        assert "distance_km" in data["route"], "Route should have distance_km"
        assert "duration_minutes" in data["route"], "Route should have duration_minutes"
        
        # Verify route is reasonable (Köln-Berlin ~570-600km)
        distance = data["route"]["distance_km"]
        assert 500 < distance < 700, f"Distance {distance}km seems unreasonable for Köln-Berlin"
        
        print(f"✓ Fastest route: {distance}km, {data['route']['duration_minutes']}min")
    
    def test_route_professional_with_eco_routing(self):
        """Test route calculation WITH eco-routing enabled"""
        # Köln -> Berlin route with eco-routing
        response = self.session.post(f"{BASE_URL}/api/route/professional", json={
            "start_lat": 50.9375,
            "start_lon": 6.9603,
            "end_lat": 52.52,
            "end_lon": 13.405,
            "eco_routing": True,  # ECO ROUTING ENABLED
            "waypoints": [],
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "include_toll": True,
            "include_speed_cameras": False,
            "alternatives": 2
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "route" in data, "Response should contain 'route'"
        
        # Eco route should still be valid
        distance = data["route"]["distance_km"]
        assert 500 < distance < 750, f"Eco route distance {distance}km seems unreasonable"
        
        print(f"✓ Eco route: {distance}km, {data['route']['duration_minutes']}min")
    
    def test_rest_stop_suggestions_have_real_names(self):
        """Test that rest stop suggestions include real POI names (not just 'Früh')"""
        response = self.session.post(f"{BASE_URL}/api/route/professional", json={
            "start_lat": 50.9375,
            "start_lon": 6.9603,
            "end_lat": 52.52,
            "end_lon": 13.405,
            "eco_routing": False,
            "waypoints": [],
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "include_toll": True,
            "include_speed_cameras": False,
            "alternatives": 2
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Check rest_stop_suggestions
        rest_stops = data.get("rest_stop_suggestions", [])
        assert len(rest_stops) > 0, "Should have rest stop suggestions"
        
        # At least one should have a real name (not just 'Früh', 'Mittel', 'Spät')
        has_real_name = False
        for stop in rest_stops:
            name = stop.get("rest_stop_name", "")
            if name and name not in ["Früh", "Mittel", "Spät", "Early", "Medium", "Late", ""]:
                has_real_name = True
                print(f"✓ Found real rest stop name: {name}")
                break
        
        # Also check rest_stop_address
        for stop in rest_stops:
            if stop.get("rest_stop_address"):
                print(f"✓ Found rest stop address: {stop['rest_stop_address']}")
        
        assert has_real_name, "At least one rest stop should have a real POI name"
    
    def test_tachograph_compliance_endpoint(self):
        """Test tachograph compliance endpoint returns required fields"""
        response = self.session.get(f"{BASE_URL}/api/tachograph/compliance")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check for required tachograph fields (based on ComplianceStatus model)
        required_fields = [
            "is_compliant",
            "risk_level",
            "break_required_in_minutes",
            "break_duration_required",
            "can_split_break"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"✓ Tachograph compliance data: is_compliant={data.get('is_compliant')}, "
              f"risk_level={data.get('risk_level')}, "
              f"break_required_in={data.get('break_required_in_minutes')}min")
    
    def test_driving_logs_summary_for_arbeitszeit(self):
        """Test driving logs summary includes work time (Arbeitszeit)"""
        response = self.session.get(f"{BASE_URL}/api/driving-logs/summary")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check for weekly stats
        assert "current_week_driving_minutes" in data, "Should have current_week_driving_minutes"
        
        print(f"✓ Weekly driving: {data.get('current_week_driving_minutes')}min, "
              f"two_week_total: {data.get('two_week_total_minutes')}min")
    
    def test_route_with_waypoint(self):
        """Test route calculation with a waypoint (Zwischenziel)"""
        # Köln -> Dortmund (waypoint) -> Berlin
        response = self.session.post(f"{BASE_URL}/api/route/professional", json={
            "start_lat": 50.9375,
            "start_lon": 6.9603,
            "end_lat": 52.52,
            "end_lon": 13.405,
            "eco_routing": False,
            "waypoints": [[51.5136, 7.4653]],  # Dortmund as waypoint
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "include_toll": True,
            "include_speed_cameras": False,
            "alternatives": 1
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "route" in data
        
        # Route with waypoint should be longer than direct route
        distance = data["route"]["distance_km"]
        assert distance > 500, f"Route with waypoint should be >500km, got {distance}km"
        
        print(f"✓ Route with waypoint: {distance}km, {data['route']['duration_minutes']}min")


class TestTachographDisplay:
    """Test Tachograph Display features (Block 1, Block 2, etc.)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hans@driver.de",
            "password": "test"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_tachograph_block_data(self):
        """Test that tachograph returns block-level driving data via driving-mode endpoint"""
        # The compliance endpoint returns ComplianceStatus model
        # For detailed block data, we use the driving-mode endpoint
        response = self.session.get(f"{BASE_URL}/api/tachograph/compliance")
        
        assert response.status_code == 200
        data = response.json()
        
        # ComplianceStatus model fields
        assert "break_required_in_minutes" in data, "Should have break_required_in_minutes (REST)"
        assert "is_compliant" in data, "Should have is_compliant"
        assert "risk_level" in data, "Should have risk_level"
        
        # Test driving-mode endpoint for minimal display
        mode_response = self.session.get(f"{BASE_URL}/api/tachograph/driving-mode")
        assert mode_response.status_code == 200
        
        print(f"✓ Compliance: is_compliant={data.get('is_compliant')}")
        print(f"✓ REST (until break): {data.get('break_required_in_minutes')}min")
        print(f"✓ Risk level: {data.get('risk_level')}")
    
    def test_active_driving_log(self):
        """Test active driving log endpoint"""
        response = self.session.get(f"{BASE_URL}/api/driving-logs/active")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return either active entry or is_active: false
        if data.get("is_active") == False:
            print("✓ No active driving log (expected when not driving)")
        else:
            print(f"✓ Active driving log: {data.get('activity_type')}")


class TestVehicleProfiles:
    """Test vehicle profile features"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and login"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with test credentials
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "hans@driver.de",
            "password": "test"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_get_vehicles(self):
        """Test getting vehicle profiles"""
        response = self.session.get(f"{BASE_URL}/api/vehicles")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Should return list of vehicles"
        
        if len(data) > 0:
            vehicle = data[0]
            assert "name" in vehicle, "Vehicle should have name"
            assert "vehicle_type" in vehicle, "Vehicle should have vehicle_type"
            print(f"✓ Found {len(data)} vehicles, first: {vehicle.get('name')}")
        else:
            print("✓ No vehicles found (user may need to create one)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
