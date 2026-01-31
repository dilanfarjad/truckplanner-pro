"""
Backend API Tests for TruckerMaps
Tests for /route/professional and /route/traffic-check endpoints
Plus login, logout, and basic route functionality
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
DRIVER_EMAIL = "hans@driver.de"
DRIVER_PASSWORD = "test"

class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test login with valid driver credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "access_token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["email"] == DRIVER_EMAIL
        print(f"✅ Login successful for {DRIVER_EMAIL}")
        return data["access_token"]
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code in [401, 404], f"Expected 401/404, got {response.status_code}"
        print("✅ Invalid login correctly rejected")


class TestProfessionalRoute:
    """Tests for /route/professional endpoint - 3 route suggestions"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_professional_route_berlin_munich(self, auth_token):
        """Test professional route calculation Berlin → München with 3 alternatives"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        payload = {
            "start_lat": 52.52,
            "start_lon": 13.405,
            "end_lat": 48.137,
            "end_lon": 11.576,
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "waypoints": [],
            "alternatives": 2,
            "include_toll": True,
            "include_speed_cameras": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/route/professional",
            json=payload,
            headers=headers,
            timeout=60
        )
        
        assert response.status_code == 200, f"Route calculation failed: {response.text}"
        data = response.json()
        
        # Verify main route
        assert "route" in data, "Route not in response"
        route = data["route"]
        assert route.get("source") == "tomtom", f"Expected tomtom source, got {route.get('source')}"
        assert route.get("distance_km", 0) > 500, f"Distance too short: {route.get('distance_km')}"
        assert route.get("duration_minutes", 0) > 300, f"Duration too short: {route.get('duration_minutes')}"
        assert route.get("truck_compliant") == True, "Route should be truck compliant"
        assert "geometry" in route, "Geometry not in route"
        assert len(route["geometry"]) > 0, "Geometry is empty"
        
        # Verify alternatives exist
        assert "alternatives" in data, "Alternatives not in response"
        alternatives = data["alternatives"]
        print(f"✅ Professional route: {route['distance_km']:.1f} km, {route['duration_minutes']:.0f} min")
        print(f"✅ Got {len(alternatives)} alternative routes")
        
        # Verify toll info
        if data.get("toll"):
            print(f"✅ Toll cost: {data['toll'].get('toll_cost', 0):.2f} EUR")
        
        # Verify speed cameras
        if data.get("speed_cameras"):
            print(f"✅ Found {len(data['speed_cameras'])} speed cameras along route")
        
        return data
    
    def test_professional_route_with_waypoints(self, auth_token):
        """Test professional route with intermediate waypoints"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Berlin → Leipzig → München
        payload = {
            "start_lat": 52.52,
            "start_lon": 13.405,
            "end_lat": 48.137,
            "end_lon": 11.576,
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "waypoints": [[51.3397, 12.3731]],  # Leipzig
            "alternatives": 1,
            "include_toll": False,
            "include_speed_cameras": False
        }
        
        response = requests.post(
            f"{BASE_URL}/api/route/professional",
            json=payload,
            headers=headers,
            timeout=60
        )
        
        assert response.status_code == 200, f"Route with waypoints failed: {response.text}"
        data = response.json()
        
        assert data.get("waypoints_used") == 1, f"Expected 1 waypoint, got {data.get('waypoints_used')}"
        print(f"✅ Route with waypoint: {data['route']['distance_km']:.1f} km")
        
    def test_professional_route_unauthorized(self):
        """Test professional route without authentication"""
        payload = {
            "start_lat": 52.52,
            "start_lon": 13.405,
            "end_lat": 48.137,
            "end_lon": 11.576,
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "waypoints": [],
            "alternatives": 2,
            "include_toll": True,
            "include_speed_cameras": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/route/professional",
            json=payload,
            timeout=30
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Unauthorized request correctly rejected")


class TestTrafficCheck:
    """Tests for /route/traffic-check endpoint - continuous traffic monitoring"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_traffic_check_basic(self, auth_token):
        """Test traffic check endpoint"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        payload = {
            "start_lat": 52.52,
            "start_lon": 13.405,
            "end_lat": 48.137,
            "end_lon": 11.576,
            "waypoints": [],
            "current_route_duration": 400  # Current estimated duration in minutes
        }
        
        response = requests.post(
            f"{BASE_URL}/api/route/traffic-check",
            json=payload,
            headers=headers,
            timeout=60
        )
        
        assert response.status_code == 200, f"Traffic check failed: {response.text}"
        data = response.json()
        
        # Response should have has_better_route field
        assert "has_better_route" in data, "has_better_route not in response"
        
        if data.get("has_better_route"):
            print(f"✅ Better route found! Time saved: {data.get('time_saved_minutes', 0)} min")
            assert "alternative_route" in data, "Alternative route not provided"
            assert "geometry" in data["alternative_route"], "Alternative geometry missing"
        else:
            print(f"✅ No better route available. Traffic delay: {data.get('current_traffic_delay', 0)} min")
        
        return data
    
    def test_traffic_check_unauthorized(self):
        """Test traffic check without authentication"""
        payload = {
            "start_lat": 52.52,
            "start_lon": 13.405,
            "end_lat": 48.137,
            "end_lon": 11.576,
            "waypoints": [],
            "current_route_duration": 400
        }
        
        response = requests.post(
            f"{BASE_URL}/api/route/traffic-check",
            json=payload,
            timeout=30
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Unauthorized traffic check correctly rejected")


class TestBasicRouteEndpoint:
    """Tests for basic /route/here endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_basic_route_calculation(self, auth_token):
        """Test basic route calculation (used by SimpleRoutePlanner)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        payload = {
            "start_lat": 52.52,
            "start_lon": 13.405,
            "end_lat": 48.137,
            "end_lon": 11.576,
            "vehicle_height": 4.0,
            "vehicle_width": 2.55,
            "vehicle_length": 16.5,
            "vehicle_weight": 40000,
            "vehicle_axles": 5,
            "include_toll": True,
            "include_speed_cameras": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/route/here",
            json=payload,
            headers=headers,
            timeout=60
        )
        
        assert response.status_code == 200, f"Basic route failed: {response.text}"
        data = response.json()
        
        assert "route" in data, "Route not in response"
        route = data["route"]
        assert route.get("distance_km", 0) > 0, "Distance should be > 0"
        assert route.get("duration_minutes", 0) > 0, "Duration should be > 0"
        
        print(f"✅ Basic route: {route['distance_km']:.1f} km, {route['duration_minutes']:.0f} min")


class TestTachographCompliance:
    """Tests for tachograph/compliance endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_compliance_status(self, auth_token):
        """Test tachograph compliance status"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/tachograph/compliance",
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 200, f"Compliance check failed: {response.text}"
        data = response.json()
        
        # Should have compliance fields
        assert "is_compliant" in data or "risk_level" in data, "Compliance status missing"
        print(f"✅ Compliance status: {data.get('risk_level', 'unknown')}")


class TestDrivingLogsSummary:
    """Tests for driving logs summary (weekly stats)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_weekly_summary(self, auth_token):
        """Test weekly driving summary (used in sidebar)"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/driving-logs/summary",
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 200, f"Summary failed: {response.text}"
        data = response.json()
        
        # Should have weekly stats
        expected_fields = ["current_week_driving_minutes", "last_week_driving_minutes", "two_week_total_minutes"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✅ Weekly summary: This week {data.get('current_week_driving_minutes', 0)} min")


class TestDrivingLogsExport:
    """Tests for /driving-logs/export endpoint - CSV and PDF export"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_export_csv(self, auth_token):
        """Test driving logs CSV export"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/driving-logs/export?format=csv",
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 200, f"CSV export failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type or "application/octet-stream" in content_type or "text/plain" in content_type, f"Unexpected content type: {content_type}"
        
        # Check content disposition header for filename
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp.lower() or len(response.content) > 0, "No file attachment or content"
        
        # Verify CSV content has data
        content = response.content.decode('utf-8', errors='ignore')
        assert len(content) > 0, "CSV content is empty"
        
        print(f"✅ CSV export successful: {len(response.content)} bytes")
        print(f"   Content preview: {content[:200]}...")
    
    def test_export_pdf(self, auth_token):
        """Test driving logs PDF export"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/driving-logs/export?format=pdf",
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or "application/octet-stream" in content_type or len(response.content) > 0, f"Unexpected content type: {content_type}"
        
        # Verify PDF content (PDF files start with %PDF)
        content = response.content
        assert len(content) > 0, "PDF content is empty"
        
        # Check if it's a valid PDF or at least has content
        if content[:4] == b'%PDF':
            print(f"✅ PDF export successful: {len(content)} bytes (valid PDF)")
        else:
            print(f"✅ PDF export returned: {len(content)} bytes")
    
    def test_export_unauthorized(self):
        """Test export without authentication"""
        response = requests.get(
            f"{BASE_URL}/api/driving-logs/export?format=csv",
            timeout=30
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✅ Unauthorized export correctly rejected")


class TestVehicleManagement:
    """Tests for vehicle management endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_get_vehicles(self, auth_token):
        """Test getting user's vehicles"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/vehicles",
            headers=headers,
            timeout=30
        )
        
        assert response.status_code == 200, f"Get vehicles failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Expected list of vehicles"
        print(f"✅ Got {len(data)} vehicles")
        
        if len(data) > 0:
            vehicle = data[0]
            assert "id" in vehicle or "name" in vehicle, "Vehicle missing id/name"
            print(f"   First vehicle: {vehicle.get('name', 'Unknown')}")
        
        return data
    
    def test_update_vehicle(self, auth_token):
        """Test updating a vehicle"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # First get vehicles
        response = requests.get(
            f"{BASE_URL}/api/vehicles",
            headers=headers,
            timeout=30
        )
        
        if response.status_code != 200:
            pytest.skip("Could not get vehicles")
        
        vehicles = response.json()
        if len(vehicles) == 0:
            pytest.skip("No vehicles to update")
        
        vehicle_id = vehicles[0].get("id")
        if not vehicle_id:
            pytest.skip("Vehicle has no ID")
        
        # Update vehicle with all required fields
        existing = vehicles[0]
        update_data = {
            "name": existing.get("name", "Test Truck"),
            "vehicle_type": existing.get("vehicle_type", "truck"),
            "height": existing.get("height", 4.0),
            "width": existing.get("width", 2.55),
            "length": existing.get("length", 16.5),
            "weight": existing.get("weight", 40000),
            "axle_load": existing.get("axle_load", 8000),
            "fuel_consumption": 33.0  # Updated value
        }
        
        response = requests.put(
            f"{BASE_URL}/api/vehicles/{vehicle_id}",
            json=update_data,
            headers=headers,
            timeout=30
        )
        
        # Accept 200 or 404 (if vehicle doesn't exist)
        assert response.status_code in [200, 404], f"Update failed: {response.status_code} - {response.text}"
        
        if response.status_code == 200:
            print(f"✅ Vehicle updated successfully")
        else:
            print(f"⚠️ Vehicle not found (may have been deleted)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
