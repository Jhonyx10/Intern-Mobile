import { AppRegistry } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { displayRemoteNotification } from './src/util/fcmNotifications';
import { queryClient } from './src/util/queryClient';
import App from './App';
import { name as appName } from './app.json';

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
