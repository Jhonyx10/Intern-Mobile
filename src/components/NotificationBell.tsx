import React from 'react';
import { View, Text } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from './Navigation';
import { useInAppNotifications } from '../util/queries/notifications';
import HeaderIconButton from './HeaderIconButton';

// Self-contained: fetches its own unread count and navigates to the
// Notifications screen, so any screen can just drop in <NotificationBell />.
export default function NotificationBell() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { data: inAppNotifications = [] } = useInAppNotifications();
  const unread = inAppNotifications.length;

  return (
    <HeaderIconButton
      onPress={() => navigation.navigate('Notifications')}
      accessibilityLabel="Notifications"
    >
      <Bell color="#fff" size={20} strokeWidth={2} />
      {unread > 0 && (
        <View
          className="absolute items-center justify-center rounded-full bg-red-500 border border-white"
          style={{
            top: -3,
            right: -3,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 3,
          }}
        >
          <Text className="text-white text-[10px] font-bold">
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </HeaderIconButton>
  );
}
