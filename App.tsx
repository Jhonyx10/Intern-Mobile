/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './src/components/Navigation';
import { useGeoFenceListeners } from './src/util/hooks/useGeoFenceMonitor';
import { useAuth } from './src/util/queries/auth';
import { useFcmListener } from './src/util/hooks/useFcmListener';
import { useFcmRegistration } from './src/util/hooks/useFcmRegistration';
import { ToastProvider } from './src/components/ToastProvider';
import { useGpsStatus } from './src/util/hooks/useGpsStatus';
import './global.css';
import { OfflineSyncProvider } from './src/components/OfflineSyncProvider';
import { queryClient } from './src/util/queryClient';
import { ExcursionProvider } from './src/util/ExcursionContext';
import GeofenceAutoMonitor from './src/components/GeofenceAutoMonitor';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <OfflineSyncProvider>
          <ToastProvider>
            <StatusBar
              barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            />
            <AppContent />
          </ToastProvider>
        </OfflineSyncProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { data: token } = useAuth();
  const isLoggedIn = Boolean(token);
  useGeoFenceListeners();
  useFcmListener();
  useFcmRegistration(isLoggedIn);
  const { isGpsEnabled } = useGpsStatus();

  return (
    <ExcursionProvider isLoggedIn={isLoggedIn}>
      <View style={styles.container}>
        {/* GPS Location Enforcement Banner */}
        {isLoggedIn && !isGpsEnabled && (
          <Pressable
            onPress={() => {
              if (Platform.OS === 'android') {
                Linking.sendIntent(
                  'android.settings.LOCATION_SOURCE_SETTINGS',
                ).catch(() => Linking.openSettings());
              } else {
                Linking.openURL('app-settings:');
              }
            }}
            style={{
              backgroundColor: '#EF4444',
              paddingVertical: 10,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 12,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              ⚠️ Location Services are Disabled. Tap to enable GPS.
            </Text>
          </Pressable>
        )}

        {/* Tracks the intern against the company geofence polygon on every screen */}
        {isLoggedIn && <GeofenceAutoMonitor />}

        <Navigation />
      </View>
    </ExcursionProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
