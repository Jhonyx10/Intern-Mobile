import { useEffect } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  onTokenRefresh,
  deleteToken,
} from '@react-native-firebase/messaging';
import notifee, { AuthorizationStatus as NotifeeAuthStatus } from '@notifee/react-native';
import { api } from '../api';

export function useFcmRegistration(isAuthenticated: boolean) {
  useEffect(() => {
     console.log('FCM_EFFECT_FIRED', isAuthenticated);
    if (!isAuthenticated) return;

    const messaging = getMessaging(getApp());
    let unsubscribeRefresh: (() => void) | undefined;

    async function register() {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
      }

      const settings = await notifee.requestPermission();
      const enabled =
        settings.authorizationStatus === NotifeeAuthStatus.AUTHORIZED ||
        settings.authorizationStatus === NotifeeAuthStatus.PROVISIONAL;

      if (!enabled) {
        console.log('FCM: notification permission not granted.');
        return;
      }

      try {
        // Delete the cached token first to guarantee a fresh token from Firebase
        await deleteToken(messaging).catch(() => { });
        const fcmToken = await getToken(messaging);
        console.log('RAW_FCM_TOKEN_START', fcmToken, 'RAW_FCM_TOKEN_END');
        await api.post('/user/fcm-token', { fcm_token: fcmToken });
      } catch (err) {
        console.warn('FCM: failed to register token', err);
      }

      unsubscribeRefresh = onTokenRefresh(messaging, async (newToken) => {
        try {
          await api.post('/user/fcm-token', { fcm_token: newToken });
        } catch (err) {
          console.warn('FCM: failed to update refreshed token', err);
        }
      });
    }

    register();

    return () => {
      unsubscribeRefresh?.();
    };
  }, [isAuthenticated]);
}