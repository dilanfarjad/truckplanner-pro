#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta

class TruckPlannerAPITester:
    def __init__(self, base_url="https://logisticspro-18.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_id = None
        self.manager_token = None
        self.manager_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
            self.failed_tests.append({"test": name, "error": details})

    def test_health_check(self):
        """Test basic API health"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=10)
            success = response.status_code == 200
            self.log_test("Health Check", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("Health Check", False, str(e))
            return False

    def test_register(self):
        """Test user registration"""
        try:
            test_email = f"test_{datetime.now().strftime('%H%M%S')}@driver.de"
            payload = {
                "email": test_email,
                "password": "test123",
                "name": "Test Driver",
                "language": "de",
                "role": "driver"
            }
            
            response = requests.post(f"{self.api_url}/auth/register", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self.user_id = data.get("user", {}).get("id")
                self.log_test("User Registration", True)
                return True
            else:
                self.log_test("User Registration", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("User Registration", False, str(e))
            return False

    def test_register_manager(self):
        """Test manager registration"""
        try:
            test_email = f"manager_{datetime.now().strftime('%H%M%S')}@fleet.de"
            payload = {
                "email": test_email,
                "password": "test123",
                "name": "Test Manager",
                "language": "de",
                "role": "manager"
            }
            
            response = requests.post(f"{self.api_url}/auth/register", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.manager_token = data.get("access_token")
                self.manager_id = data.get("user", {}).get("id")
                self.log_test("Manager Registration", True)
                return True
            else:
                self.log_test("Manager Registration", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Manager Registration", False, str(e))
            return False

    def test_login(self):
        """Test user login with test credentials"""
        try:
            payload = {
                "email": "test@driver.de",
                "password": "test123"
            }
            
            response = requests.post(f"{self.api_url}/auth/login", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self.user_id = data.get("user", {}).get("id")
                self.log_test("User Login", True)
                return True
            else:
                self.log_test("User Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("User Login", False, str(e))
            return False

    def test_get_me(self):
        """Test get current user"""
        if not self.token:
            self.log_test("Get Current User", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/auth/me", headers=headers, timeout=10)
            
            success = response.status_code == 200
            self.log_test("Get Current User", success, f"Status: {response.status_code}")
            return success
            
        except Exception as e:
            self.log_test("Get Current User", False, str(e))
            return False

    def test_get_vehicles(self):
        """Test get vehicle profiles"""
        if not self.token:
            self.log_test("Get Vehicles", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/vehicles", headers=headers, timeout=10)
            
            if response.status_code == 200:
                vehicles = response.json()
                # Should have default vehicles created during registration
                has_vehicles = len(vehicles) >= 4  # Should have 4 default vehicles
                self.log_test("Get Vehicles", has_vehicles, f"Found {len(vehicles)} vehicles")
                return has_vehicles
            else:
                self.log_test("Get Vehicles", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Vehicles", False, str(e))
            return False

    def test_driving_logs_summary(self):
        """Test driving logs summary"""
        if not self.token:
            self.log_test("Driving Logs Summary", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/driving-logs/summary", headers=headers, timeout=10)
            
            if response.status_code == 200:
                summary = response.json()
                required_fields = ["current_week_driving_minutes", "last_week_driving_minutes", "two_week_total_minutes"]
                has_all_fields = all(field in summary for field in required_fields)
                self.log_test("Driving Logs Summary", has_all_fields, f"Response: {summary}")
                return has_all_fields
            else:
                self.log_test("Driving Logs Summary", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Driving Logs Summary", False, str(e))
            return False

    def test_get_driving_logs(self):
        """Test get driving logs"""
        if not self.token:
            self.log_test("Get Driving Logs", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/driving-logs?days=56", headers=headers, timeout=10)
            
            success = response.status_code == 200
            if success:
                logs = response.json()
                self.log_test("Get Driving Logs", True, f"Found {len(logs)} logs")
            else:
                self.log_test("Get Driving Logs", False, f"Status: {response.status_code}")
            return success
                
        except Exception as e:
            self.log_test("Get Driving Logs", False, str(e))
            return False

    def test_holidays_api(self):
        """Test holidays API"""
        try:
            response = requests.get(f"{self.api_url}/holidays/DE?year=2024", timeout=10)
            
            if response.status_code == 200:
                holidays = response.json()
                has_holidays = len(holidays) > 0
                self.log_test("Holidays API", has_holidays, f"Found {len(holidays)} holidays")
                return has_holidays
            else:
                self.log_test("Holidays API", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Holidays API", False, str(e))
            return False

    def test_route_planning(self):
        """Test route planning API"""
        if not self.token:
            self.log_test("Route Planning", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            payload = {
                "start_lat": 53.5511,  # Hamburg
                "start_lon": 9.9937,
                "end_lat": 52.5200,   # Berlin
                "end_lon": 13.4050,
                "current_driving_minutes": 0,
                "current_work_minutes": 0
            }
            
            response = requests.post(f"{self.api_url}/routes/plan", json=payload, headers=headers, timeout=30)
            
            if response.status_code == 200:
                route = response.json()
                required_fields = ["route_geometry", "distance_km", "duration_minutes"]
                has_all_fields = all(field in route for field in required_fields)
                self.log_test("Route Planning", has_all_fields, f"Distance: {route.get('distance_km', 'N/A')} km")
                return has_all_fields
            else:
                self.log_test("Route Planning", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Route Planning", False, str(e))
            return False

    def test_ai_break_advice(self):
        """Test AI break advice"""
        if not self.token:
            self.log_test("AI Break Advice", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {
                "current_driving_minutes": 200,
                "current_work_minutes": 300,
                "route_duration_minutes": 120
            }
            
            response = requests.post(
                f"{self.api_url}/ai/break-advice",
                params=params,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                advice = response.json()
                has_calculated = "calculated" in advice
                self.log_test("AI Break Advice", has_calculated, f"Has advice: {'advice' in advice}")
                return has_calculated
            else:
                self.log_test("AI Break Advice", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("AI Break Advice", False, str(e))
            return False

    def test_gps_location_update(self):
        """Test GPS location update"""
        if not self.token:
            self.log_test("GPS Location Update", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            payload = {
                "latitude": 53.5511,  # Hamburg coordinates
                "longitude": 9.9937,
                "speed": 80.5,
                "heading": 45.0,
                "accuracy": 10.0
            }
            
            response = requests.post(f"{self.api_url}/location/update", json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                has_status = "status" in result and result["status"] == "updated"
                self.log_test("GPS Location Update", has_status, f"Response: {result}")
                return has_status
            else:
                self.log_test("GPS Location Update", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("GPS Location Update", False, str(e))
            return False

    def test_get_current_location(self):
        """Test get current GPS location"""
        if not self.token:
            self.log_test("Get Current Location", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/location/current", headers=headers, timeout=10)
            
            if response.status_code == 200:
                location = response.json()
                has_location = "latitude" in location and "longitude" in location
                self.log_test("Get Current Location", has_location, f"Location: {location.get('latitude', 'N/A')}, {location.get('longitude', 'N/A')}")
                return has_location
            else:
                self.log_test("Get Current Location", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Get Current Location", False, str(e))
            return False

    def test_nearby_parking(self):
        """Test nearby truck parking API"""
        if not self.token:
            self.log_test("Nearby Parking", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {
                "lat": 53.5511,  # Hamburg
                "lon": 9.9937,
                "radius": 10000
            }
            
            response = requests.get(f"{self.api_url}/parking/nearby", params=params, headers=headers, timeout=30)
            
            if response.status_code == 200:
                parking_spots = response.json()
                is_list = isinstance(parking_spots, list)
                self.log_test("Nearby Parking", is_list, f"Found {len(parking_spots) if is_list else 0} parking spots")
                return is_list
            else:
                self.log_test("Nearby Parking", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Nearby Parking", False, str(e))
            return False

    def test_parking_along_route(self):
        """Test parking along route API"""
        if not self.token:
            self.log_test("Parking Along Route", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {
                "start_lat": 53.5511,  # Hamburg
                "start_lon": 9.9937,
                "end_lat": 52.5200,   # Berlin
                "end_lon": 13.4050
            }
            
            response = requests.get(f"{self.api_url}/parking/along-route", params=params, headers=headers, timeout=30)
            
            if response.status_code == 200:
                parking_spots = response.json()
                is_list = isinstance(parking_spots, list)
                self.log_test("Parking Along Route", is_list, f"Found {len(parking_spots) if is_list else 0} parking spots")
                return is_list
            else:
                self.log_test("Parking Along Route", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Parking Along Route", False, str(e))
            return False

    def test_notifications_check(self):
        """Test notifications check"""
        if not self.token:
            self.log_test("Notifications Check", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/notifications/check", headers=headers, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                has_notifications = "notifications" in result
                self.log_test("Notifications Check", has_notifications, f"Notifications: {len(result.get('notifications', []))}")
                return has_notifications
            else:
                self.log_test("Notifications Check", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Notifications Check", False, str(e))
            return False

    def test_fleet_create(self):
        """Test fleet creation (manager only)"""
        if not self.token:
            self.log_test("Fleet Create", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            payload = {
                "name": "Test Fleet",
                "company": "Test Company GmbH"
            }
            
            response = requests.post(f"{self.api_url}/fleet/create", json=payload, headers=headers, timeout=10)
            
            # This should fail for driver role (403) or succeed for manager role (200)
            if response.status_code == 403:
                self.log_test("Fleet Create", True, "Correctly blocked for driver role")
                return True
            elif response.status_code == 200:
                fleet = response.json()
                has_fleet_id = "id" in fleet
                self.log_test("Fleet Create", has_fleet_id, f"Fleet created: {fleet.get('name', 'N/A')}")
                return has_fleet_id
            else:
                self.log_test("Fleet Create", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Fleet Create", False, str(e))
            return False

    def test_fleet_drivers(self):
        """Test get fleet drivers"""
        if not self.token:
            self.log_test("Fleet Drivers", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.api_url}/fleet/drivers", headers=headers, timeout=10)
            
            # Should return empty list for driver role or actual drivers for manager
            if response.status_code == 200:
                drivers = response.json()
                is_list = isinstance(drivers, list)
                self.log_test("Fleet Drivers", is_list, f"Found {len(drivers) if is_list else 0} drivers")
                return is_list
            elif response.status_code == 403:
                self.log_test("Fleet Drivers", True, "Correctly blocked for driver role")
                return True
            else:
                self.log_test("Fleet Drivers", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Fleet Drivers", False, str(e))
            return False

    def test_fleet_create_manager(self):
        """Test fleet creation with manager token"""
        if not self.manager_token:
            self.log_test("Fleet Create (Manager)", False, "No manager token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.manager_token}"}
            payload = {
                "name": "Test Fleet Manager",
                "company": "Manager Test Company GmbH"
            }
            
            response = requests.post(f"{self.api_url}/fleet/create", json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                fleet = response.json()
                has_fleet_id = "id" in fleet
                self.log_test("Fleet Create (Manager)", has_fleet_id, f"Fleet created: {fleet.get('name', 'N/A')}")
                return has_fleet_id
            else:
                self.log_test("Fleet Create (Manager)", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Fleet Create (Manager)", False, str(e))
            return False

    def test_fleet_drivers_manager(self):
        """Test get fleet drivers with manager token"""
        if not self.manager_token:
            self.log_test("Fleet Drivers (Manager)", False, "No manager token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.manager_token}"}
            response = requests.get(f"{self.api_url}/fleet/drivers", headers=headers, timeout=10)
            
            if response.status_code == 200:
                drivers = response.json()
                is_list = isinstance(drivers, list)
                self.log_test("Fleet Drivers (Manager)", is_list, f"Found {len(drivers) if is_list else 0} drivers")
                return is_list
            else:
                self.log_test("Fleet Drivers (Manager)", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Fleet Drivers (Manager)", False, str(e))
            return False

    def run_all_tests(self):
        """Run all API tests"""
        print("🚛 Starting Night Pilot API Tests...")
        print(f"Testing against: {self.base_url}")
        print("=" * 50)
        
        # Basic connectivity
        if not self.test_health_check():
            print("❌ Health check failed - stopping tests")
            return False
        
        # Authentication tests
        auth_success = self.test_register() or self.test_login()
        if not auth_success:
            print("❌ Authentication failed - stopping tests")
            return False
            
        # Also test manager registration
        self.test_register_manager()
            
        self.test_get_me()
        
        # Core functionality tests
        self.test_get_vehicles()
        self.test_driving_logs_summary()
        self.test_get_driving_logs()
        self.test_holidays_api()
        
        # Advanced features
        self.test_route_planning()
        self.test_ai_break_advice()
        
        # New GPS and Location features
        self.test_gps_location_update()
        self.test_get_current_location()
        
        # Truck parking features
        self.test_nearby_parking()
        self.test_parking_along_route()
        
        # Notification features
        self.test_notifications_check()
        
        # Fleet management features
        self.test_fleet_create()
        self.test_fleet_drivers()
        
        # Manager-specific tests
        if self.manager_token:
            self.test_fleet_create_manager()
            self.test_fleet_drivers_manager()
        
        # Print summary
        print("=" * 50)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed tests:")
            for test in self.failed_tests:
                print(f"  - {test['test']}: {test['error']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = TruckPlannerAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())