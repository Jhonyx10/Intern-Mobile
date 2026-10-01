/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar, StyleSheet, useColorScheme, View, Text, Pressable, Platform, Linking } from 'react-native';
import {
  SafeAreaProvider,
} from 'react-native-safe-area-context';
import Navigation from './src/components/Navigation';
import { useGeoFenceListeners } from './src/util/hooks/useGeoFenceMonitor';
import { useAuth } from './src/util/queries/auth';
import { useFcmListener } from './src/util/hooks/useFcmListener';
import { useFcmRegistration } from './src/util/hooks/useFcmRegistration';
import { ToastProvider } from './src/components/ToastProvider';
import { useGpsStatus } from './src/util/hooks/useGpsStatus';
import "./global.css";
import { OfflineSyncProvider } from './src/components/OfflineSyncProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <OfflineSyncProvider>
          <ToastProvider>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <AppContent />
          </ToastProvider>
        </OfflineSyncProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { data: token } = useAuth();
  useGeoFenceListeners();
  useFcmListener();
  useFcmRegistration(Boolean(token));
  const { isGpsEnabled } = useGpsStatus();

  const isLoggedIn = Boolean(token);

  return (
    <View style={styles.container}>
      {/* GPS Location Enforcement Banner */}
      {isLoggedIn && !isGpsEnabled && (
        <Pressable
          onPress={() => {
            if (Platform.OS === 'android') {
              Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
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
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
            ⚠️ Location Services are Disabled. Tap to enable GPS.
          </Text>
        </Pressable>
      )}

      <Navigation />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
