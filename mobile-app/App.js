import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, StatusBar, SafeAreaView, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

// Die URL Ihrer TruckerMaps Web-App
const APP_URL = 'https://logisticspro-18.preview.emergentagent.com';

export default function App() {
  const webViewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState(null);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');
      
      if (status !== 'granted') {
        Alert.alert(
          'Standort-Berechtigung',
          'TruckerMaps benötigt Zugriff auf Ihren Standort für die Navigation.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Location permission error:', error);
    }
  };

  // Inject JavaScript to handle location
  const injectedJavaScript = `
    (function() {
      // Override geolocation for better native integration
      const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
      const originalWatchPosition = navigator.geolocation.watchPosition;
      
      // Send messages to React Native
      window.sendToNative = function(type, data) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
      };
      
      // Listen for orientation changes
      window.addEventListener('orientationchange', function() {
        window.sendToNative('orientation', screen.orientation.type);
      });
      
      // Improve touch handling
      document.addEventListener('touchstart', function() {}, { passive: true });
      
      console.log('TruckerMaps Native Bridge loaded');
    })();
    true;
  `;

  const handleMessage = async (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'getLocation') {
        if (locationPermission) {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High
          });
          
          // Send location back to WebView
          webViewRef.current?.injectJavaScript(`
            window.dispatchEvent(new CustomEvent('nativeLocation', {
              detail: {
                latitude: ${location.coords.latitude},
                longitude: ${location.coords.longitude},
                accuracy: ${location.coords.accuracy}
              }
            }));
          `);
        }
      }
    } catch (error) {
      console.error('Message handling error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#09090B" />
      
      {isLoading && (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>TruckerMaps</Text>
          <Text style={styles.loadingSubtext}>Wird geladen...</Text>
        </View>
      )}
      
      <WebView
        ref={webViewRef}
        source={{ uri: APP_URL }}
        style={styles.webview}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        onLoadEnd={() => setIsLoading(false)}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('WebView error: ', nativeEvent);
          Alert.alert('Fehler', 'Verbindung fehlgeschlagen. Bitte überprüfen Sie Ihre Internetverbindung.');
        }}
        // Performance optimizations
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // iOS specific
        allowsBackForwardNavigationGestures={true}
        // Geolocation
        geolocationEnabled={true}
        // Cache
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        // User Agent
        userAgent="TruckerMaps-iOS/1.0"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  webview: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#09090B',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#F97316',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  loadingSubtext: {
    color: '#666',
    fontSize: 16,
  },
});
