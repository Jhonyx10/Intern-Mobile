import { AppRegistry } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { displayRemoteNotification } from './src/util/fcmNotifications';
import { handleHeadlessEvent } from './src/util/hooks/useGeoFenceMonitor';
import { queryClient } from './src/util/queryClient';
import App from './App';
import { name as appName } from './app.json';

/**
 * Android only: when the app is killed while BGGeo is tracking, the plugin
 * spins up a headless JS context and delivers events here. Without this
 * registration the native engine keeps running but every JS event is dropped.
 *
 * handleHeadlessEvent restores persisted state (isPunchedIn, isInsideGeofence,
 * officePolygon) from AsyncStorage on first call, then processes the event
 * exactly like the foreground listeners do.
 */
BackgroundGeolocation.registerHeadlessTask(handleHeadlessEvent);

const messaging = getMessaging(getApp());

setBackgroundMessageHandler(messaging, async remoteMessage => {
  // Refresh cached data even though no screen is in the foreground
  [
    'documents',
    'dashboard',
    'notifications',
    'in_app_notifications',
    'all_notifications',
    'evaluations',
  ].forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
  await displayRemoteNotification(remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
