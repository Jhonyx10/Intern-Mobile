import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Bell,
  ArrowLeft,
  CheckCheck,
  Info,
  CheckCircle2,
  AlertCircle,
  Trash2,
  X,
} from 'lucide-react-native';
import { RootStackParamList } from '../components/Navigation';
import {
  useAllNotifications,
  useMarkNotificationRead,
  useMarkInAppNotificationsRead,
  useDeleteNotification,
  useClearAllNotifications,
  InAppNotification,
} from '../util/queries/notifications';
import { useUser } from '../util/queries/auth';
import { withAlpha } from '../util/timeLogHelpers';

const GRAY = '#94A3B8';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Decide which screen a notification belongs to.
 * Return null if the notification has no destination
 * (it will just be marked as read).
 */
type NavTarget =
  | { name: 'MyEvaluation' }
  | { name: 'TimeLogDetails'; params: { timeLogId: number } }
  | { name: 'TimeLogHistory' }
  | { name: 'Main'; params: { screen: string } } // a tab inside BottomTabs
  | null;

function resolveTarget(item: InAppNotification): NavTarget {
  const d = item.data;

  switch (d?.category) {
    case 'document':
    case 'documents':
      // TODO: replace 'Documents' with your real tab name in BottomTabs
      return { name: 'Main', params: { screen: 'Documents' } };

    case 'evaluation':
      return { name: 'MyEvaluation' };

    case 'schedule':
      // TODO: replace 'Schedule' with your real tab name in BottomTabs
      return { name: 'Main', params: { screen: 'Schedule' } };

    case 'time_log':
    case 'timelog':
      return d.time_log_id
        ? {
            name: 'TimeLogDetails',
            params: { timeLogId: Number(d.time_log_id) },
          }
        : { name: 'TimeLogHistory' };

    default:
      // Fallback: anything carrying a document id goes to the Documents tab
      if (d?.document_id || d?.student_document_id) {
        return { name: 'Main', params: { screen: 'Documents' } };
      }
      return null;
  }
}

function NotifIcon({
  item,
  themeColor,
}: {
  item: InAppNotification;
  themeColor: string;
}) {
  const isRead = !!item.read_at;
  const status = item.data?.status;

  if (status === 'approved') {
    return (
      <CheckCircle2
        color={isRead ? GRAY : '#16A34A'}
        size={16}
        strokeWidth={2.25}
      />
    );
  }
  if (status === 'rejected') {
    return (
      <AlertCircle
        color={isRead ? GRAY : '#DC2626'}
        size={16}
        strokeWidth={2.25}
      />
    );
  }
  return (
    <Info color={isRead ? GRAY : themeColor} size={16} strokeWidth={2.25} />
  );
}

function NotifCard({
  item,
  themeColor,
  onPress,
  onDelete,
}: {
  item: InAppNotification;
  themeColor: string;
  onPress: (item: InAppNotification) => void;
  onDelete: (item: InAppNotification) => void;
}) {
  const isUnread = !item.read_at;
  const reason = item.data?.rejection_reason?.trim();

  return (
    <Animated.View entering={FadeInUp.duration(300)}>
      <Pressable
        onPress={() => onPress(item)}
        className="mx-4 mb-3 rounded-2xl"
        style={{
          // Opaque base so the shadow can't show through as a gray edge
          backgroundColor: isUnread ? '#FFFFFF' : '#F1F5F9',
          opacity: isUnread ? 1 : 0.6,
          shadowColor: '#0F172A',
          shadowOpacity: isUnread ? 0.06 : 0,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: isUnread ? 2 : 0,
          overflow: 'hidden',
        }}
      >
        {/* Unread tint sits on top of the opaque white card (no border) */}
        {isUnread && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: withAlpha(themeColor, '0D'),
            }}
          />
        )}

        <View className="flex-row items-start gap-3 px-4 py-4">
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: 36,
              height: 36,
              marginRight: 10,
              backgroundColor: isUnread
                ? withAlpha(themeColor, '18')
                : '#E2E8F0',
            }}
          >
            <NotifIcon item={item} themeColor={themeColor} />
          </View>

          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              <Text
                className={
                  'flex-1 text-[13px] ' +
                  (isUnread
                    ? 'font-bold text-slate-900'
                    : 'font-medium text-slate-500')
                }
              >
                {item.data.title}
              </Text>
              {isUnread && (
                <View
                  className="ml-2 rounded-full"
                  style={{ width: 8, height: 8, backgroundColor: themeColor }}
                />
              )}
            </View>

            <Text
              className={
                'mt-0.5 text-[12px] ' +
                (isUnread ? 'text-slate-500' : 'text-slate-400')
              }
            >
              {item.data.body}
            </Text>

            {item.data?.status === 'rejected' && reason ? (
              <View
                className={
                  'mt-2 rounded-xl border px-3 py-2 ' +
                  (isUnread
                    ? 'bg-red-50 border-red-100'
                    : 'bg-slate-100 border-slate-200')
                }
              >
                <Text
                  className={
                    'text-[11px] leading-4 ' +
                    (isUnread ? 'text-red-700' : 'text-slate-500')
                  }
                >
                  Reason: {reason}
                </Text>
              </View>
            ) : null}

            <Text className="mt-2 text-[10px] font-medium text-slate-400">
              {timeAgo(item.created_at)}
            </Text>
          </View>

          {/* Dismiss single notification */}
          <Pressable
            onPress={() => onDelete(item)}
            hitSlop={10}
            className="ml-2 w-6 h-6 rounded-full items-center justify-center"
          >
            <X color={GRAY} size={14} strokeWidth={2.25} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function Notifications() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: userData } = useUser();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';

  // Read + unread, so notifications stay visible after you open them
  const {
    data: notifications = [],
    isLoading,
    isRefetching,
    refetch,
  } = useAllNotifications();
  const markOneRead = useMarkNotificationRead();
  const markAllRead = useMarkInAppNotificationsRead();
  const deleteOne = useDeleteNotification();
  const clearAll = useClearAllNotifications();

  const unreadCount = notifications.filter(n => !n.read_at).length;

  // Tap = mark as read (if unread) + navigate to the related screen
  const handlePress = (item: InAppNotification) => {
    if (!item.read_at) {
      markOneRead.mutate(item.id);
    }

    const target = resolveTarget(item);
    if (target) {
      const params = 'params' in target ? target.params : undefined;
      (navigation.navigate as any)(target.name, params);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear notifications',
      'This will remove all your notifications. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => clearAll.mutate(),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)}>
        <LinearGradient
          colors={[themeColor, withAlpha(themeColor, 'CC')]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            paddingTop: 52,
            paddingBottom: 24,
            paddingHorizontal: 24,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
          }}
        >
          <View className="flex-row items-center mb-1">
            <Pressable
              onPress={() => navigation.goBack()}
              className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3"
            >
              <ArrowLeft color="#fff" size={18} strokeWidth={2} />
            </Pressable>
            <Bell color="#fff" size={22} strokeWidth={2} />
            <Text className="text-white text-[22px] font-bold ml-2">
              Notifications
            </Text>
          </View>

          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-white/70 text-[13px]">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </Text>

            {notifications.length > 0 && (
              <View className="flex-row items-center">
                {unreadCount > 0 && (
                  <Pressable
                    onPress={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                    className="flex-row items-center bg-white/20 px-3 py-1.5 rounded-full mr-2"
                    style={{ opacity: markAllRead.isPending ? 0.6 : 1 }}
                  >
                    <CheckCheck color="#fff" size={14} strokeWidth={2} />
                    <Text className="text-white text-[11px] font-semibold ml-1">
                      Mark all read
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleClearAll}
                  disabled={clearAll.isPending}
                  className="flex-row items-center bg-white/20 px-3 py-1.5 rounded-full"
                  style={{ opacity: clearAll.isPending ? 0.6 : 1 }}
                >
                  <Trash2 color="#fff" size={14} strokeWidth={2} />
                  <Text className="text-white text-[11px] font-semibold ml-1">
                    Clear all
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Body */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <NotifCard
              item={item}
              themeColor={themeColor}
              onPress={handlePress}
              onDelete={i => deleteOne.mutate(i.id)}
            />
          )}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <Bell color="#CBD5E1" size={48} />
              <Text className="text-slate-400 text-center text-sm mt-4">
                No notifications yet.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
