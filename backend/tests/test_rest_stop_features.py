"""
Test suite for TruckerMaps Rest Stop Features
Tests:
1. Backend returns rest_stop_name in route response
2. Route Köln->Berlin returns real rest stop names
3. Rest stop suggestions have proper structure
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRestStopFeatures:
    """Test rest stop name features in route API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and login"""
        self.email = "hans@driver.de"
        self.password = "test"
        self.token = None
        
        # Login to get token
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_route_koeln_berlin_returns_rest_stop_names(self):
        """Test 1: Route Köln->Berlin should return real rest stop names"""
        # Köln coordinates: 50.9375, 6.9603
        # Berlin coordinates: 52.5200, 13.4050
        response = requests.post(f"{BASE_URL}/api/route/professional", 
            headers=self.headers,
            json={
                "start_lat": 50.9375,
                "start_lon": 6.9603,
                "end_lat": 52.5200,
                "end_lon": 13.4050,
                "current_driving_minutes": 0,
                "current_work_minutes": 0,
                "alternatives": True
            },
            timeout=60
        )
        
        assert response.status_code == 200, f"Route API failed: {response.text}"
        data = response.json()
        
        # Check rest_stop_suggestions exists
        assert "rest_stop_suggestions" in data, "rest_stop_suggestions missing from response"
        rest_stops = data["rest_stop_suggestions"]
        
        # Should have 3 suggestions (early, medium, late)
        assert len(rest_stops) >= 1, "No rest stop suggestions returned"
        
        # Check first rest stop has rest_stop_name
        first_stop = rest_stops[0]
        assert "rest_stop_name" in first_stop, "rest_stop_name field missing"
        assert first_stop["rest_stop_name"] is not None, "rest_stop_name is None"
        assert len(first_stop["rest_stop_name"]) > 0, "rest_stop_name is empty"
        
        print(f"✓ Found rest stop name: {first_stop['rest_stop_name']}")
    
    def test_rest_stop_suggestion_structure(self):
        """Test 2: Rest stop suggestions have proper structure"""
        response = requests.post(f"{BASE_URL}/api/route/professional", 
            headers=self.headers,
            json={
                "start_lat": 50.9375,
                "start_lon": 6.9603,
                "end_lat": 52.5200,
                "end_lon": 13.4050,
                "current_driving_minutes": 0,
                "current_work_minutes": 0
            },
            timeout=60
        )
        
        assert response.status_code == 200
        data = response.json()
        rest_stops = data.get("rest_stop_suggestions", [])
        
        for stop in rest_stops:
            # Required fields
            assert "type" in stop, "type field missing"
            assert "label" in stop, "label field missing"
            assert "color" in stop, "color field missing"
            assert "location" in stop, "location field missing"
            assert "distance_from_start_km" in stop, "distance_from_start_km missing"
            
            # Location should have lat/lon
            location = stop["location"]
            assert "lat" in location, "lat missing from location"
            assert "lon" in location, "lon missing from location"
            
            # Check rest_stop_name exists (may be None if no POI found)
            if "rest_stop_name" in stop and stop["rest_stop_name"]:
                print(f"✓ {stop['type']}: {stop['rest_stop_name']} at km {stop['distance_from_start_km']}")
    
    def test_three_break_options_returned(self):
        """Test 3: Should return 3 break options (early, medium, late)"""
        response = requests.post(f"{BASE_URL}/api/route/professional", 
            headers=self.headers,
            json={
                "start_lat": 50.9375,
                "start_lon": 6.9603,
                "end_lat": 52.5200,
                "end_lon": 13.4050,
                "current_driving_minutes": 0,
                "current_work_minutes": 0
            },
            timeout=60
        )
        
        assert response.status_code == 200
        data = response.json()
        rest_stops = data.get("rest_stop_suggestions", [])
        
        # Should have 3 options for a long route
        assert len(rest_stops) == 3, f"Expected 3 rest stops, got {len(rest_stops)}"
        
        # Check types
        types = [s["type"] for s in rest_stops]
        assert "early" in types, "early option missing"
        assert "medium" in types, "medium option missing"
        assert "late" in types, "late option missing"
        
        # Check colors
        colors = [s["color"] for s in rest_stops]
        assert "green" in colors, "green (early) color missing"
        assert "yellow" in colors, "yellow (medium) color missing"
        assert "red" in colors, "red (late) color missing"
        
        print("✓ All 3 break options returned with correct types and colors")
    
    def test_rest_stop_names_are_real_pois(self):
        """Test 4: Rest stop names should be real POI names (not generic)"""
        response = requests.post(f"{BASE_URL}/api/route/professional", 
            headers=self.headers,
            json={
                "start_lat": 50.9375,
                "start_lon": 6.9603,
                "end_lat": 52.5200,
                "end_lon": 13.4050,
                "current_driving_minutes": 0,
                "current_work_minutes": 0
            },
            timeout=60
        )
        
        assert response.status_code == 200
        data = response.json()
        rest_stops = data.get("rest_stop_suggestions", [])
        
        # Check that names are not generic placeholders
        generic_names = ["Rastplatz", "Pausenbereich", "Rest Area", "Parking"]
        
        real_names_found = 0
        for stop in rest_stops:
            name = stop.get("rest_stop_name", "")
            if name and name not in generic_names:
                real_names_found += 1
                print(f"✓ Real POI name found: {name}")
        
        # At least one should have a real name
        assert real_names_found >= 1, "No real POI names found in rest stop suggestions"
    
    def test_rest_stop_has_address(self):
        """Test 5: Rest stops should have address information"""
        response = requests.post(f"{BASE_URL}/api/route/professional", 
            headers=self.headers,
            json={
                "start_lat": 50.9375,
                "start_lon": 6.9603,
                "end_lat": 52.5200,
                "end_lon": 13.4050,
                "current_driving_minutes": 0,
                "current_work_minutes": 0
            },
            timeout=60
        )
        
        assert response.status_code == 200
        data = response.json()
        rest_stops = data.get("rest_stop_suggestions", [])
        
        addresses_found = 0
        for stop in rest_stops:
            address = stop.get("rest_stop_address", "")
            if address:
                addresses_found += 1
                print(f"✓ Address found: {address}")
        
        # At least one should have an address
        assert addresses_found >= 1, "No addresses found in rest stop suggestions"


class TestRouteWithWaypoints:
    """Test route calculation with waypoints (rest stops as intermediate destinations)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials"""
        self.email = "hans@driver.de"
        self.password = "test"
        
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.email,
            "password": self.password
        })
        assert response.status_code == 200
        self.token = response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_route_with_waypoint(self):
        """Test route calculation with a waypoint (simulating rest stop as intermediate)"""
        # Köln -> Dortmund (waypoint) -> Berlin
        response = requests.post(f"{BASE_URL}/api/route/professional", 
            headers=self.headers,
            json={
                "start_lat": 50.9375,
                "start_lon": 6.9603,
                "end_lat": 52.5200,
                "end_lon": 13.4050,
                "waypoints": [[51.5136, 7.4653]],  # Dortmund
                "current_driving_minutes": 0,
                "current_work_minutes": 0
            },
            timeout=60
        )
        
        assert response.status_code == 200, f"Route with waypoint failed: {response.text}"
        data = response.json()
        
        # Check route was calculated
        assert "route" in data, "route missing from response"
        route = data["route"]
        assert route.get("distance_km", 0) > 0, "Route distance is 0"
        assert route.get("duration_minutes", 0) > 0, "Route duration is 0"
        
        # Check waypoints_used
        assert data.get("waypoints_used", 0) == 1, "waypoints_used should be 1"
        
        print(f"✓ Route with waypoint: {route['distance_km']} km, {route['duration_minutes']} min")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
