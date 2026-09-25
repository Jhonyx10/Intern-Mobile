/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Navigation from './src/components/Navigation';
import { useGeoFenceListeners } from './src/util/hooks/useGeoFenceMonitor';
import { useAuth } from './src/util/queries/auth';
import { useFcmListener } from './src/util/hooks/useFcmListener';
import { useFcmRegistration } from './src/util/hooks/useFcmRegistration';
import { ToastProvider } from './src/components/ToastProvider';
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

  return (
    <View style={styles.container}>
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
