import {
  Text,
  View,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import { useRef } from 'react';
import {
  LogOut,
  Hash,
  Mail,
  BookOpen,
  GraduationCap,
  ClipboardList,
  Settings as SettingsIcon,
  ChevronRight,
  Bell,
  Palette,
  CheckCircle2,
  Building2,
  UserCircle,
  MapPin,
} from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import Reanimated, { FadeInUp } from 'react-native-reanimated';
import { useUser, useLogout } from '../util/queries/auth';
import { useInternProfile } from '../util/queries/profile';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../components/Navigation';

function initialsFrom(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// themeColor comes in as a plain hex string (e.g. "#1D4ED8"); this appends
// an alpha channel so we can tint icon circles/gradients without a color library.
function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

// NOTE: wire this up to your actual navigation prop/hook (e.g. useNavigation()
// from @react-navigation/native) — left as a no-op placeholder so this file
// doesn't assume a navigation setup it hasn't seen.
type ProfileProps = {
  onNavigateToEvaluations?: () => void;
  onNavigateToSettings?: () => void;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function Profile({
  onNavigateToEvaluations,
  onNavigateToSettings,
}: ProfileProps) {
  const { data: userData, isLoading: isUserLoading } = useUser();
  const { data: profileData, isLoading: isProfileLoading } = useInternProfile();
  const { mutateAsync: logout, isPending } = useLogout();
  const navigation = useNavigation<NavigationProp>();
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.5, 1],
    extrapolate: 'clamp',
  });

  const headerTranslateY = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [-50, 0],
    extrapolate: 'clamp',
  });

  if (isUserLoading || isProfileLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  if (!userData) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-slate-500">No user data available</Text>
      </View>
    );
  }

  const themeColor = userData.settings?.theme_color || '#1D4ED8';
  const { user, student, section, course } = userData;
  const displayName = student?.full_name || user?.name || 'Student Intern';

  const details = [
    { icon: Hash, label: 'Student Number', value: profileData?.student?.student_number || student?.student_number },
    { icon: Mail, label: 'Email Address', value: profileData?.user?.email || user?.email, isEmail: true, verified: !!profileData?.user?.email_verified_at },
    { icon: BookOpen, label: 'Course', value: profileData?.section?.course?.name || course?.course_name },
    { icon: GraduationCap, label: 'Section', value: profileData?.section?.name || section?.name },
  ];

  const menuItems = [
    {
      icon: ClipboardList,
      label: 'My Evaluations',
      sublabel: 'View pending and completed evaluations',
      onPress: () => navigation.navigate('MyEvaluation'),
    },
    {
      icon: SettingsIcon,
      label: 'Settings',
      sublabel: 'Notifications, appearance, and account',
      onPress: () => navigation.navigate('Settings'),
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      contentContainerStyle={{ paddingBottom: 106 }}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false },
      )}
    >
      {/* Gradient header with decorative depth */}
      <Animated.View
        style={[
          { height: 210 },
          {
            transform: [
              { translateY: headerTranslateY },
              { scale: headerScale },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={[themeColor, withAlpha(themeColor, 'CC')]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: 210,
            borderBottomLeftRadius: 40,
            borderBottomRightRadius: 40,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: -40,
              right: -30,
              width: 140,
              height: 140,
              borderRadius: 70,
              backgroundColor: 'rgba(255,255,255,0.10)',
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -50,
              left: -40,
              width: 160,
              height: 160,
              borderRadius: 80,
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          />
        </LinearGradient>
      </Animated.View>

      {/* Avatar overlaps the gradient and the white content below */}
      <Reanimated.View
        entering={FadeInUp.duration(500).delay(200).springify()}
        className="items-center"
        style={{ marginTop: -66 }}
      >
        <View
          className="items-center justify-center rounded-full bg-white"
          style={{
            width: 108,
            height: 108,
            shadowColor: '#0F172A',
            shadowOpacity: 0.18,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: 96,
              height: 96,
              backgroundColor: withAlpha(themeColor, '15'),
            }}
          >
            <Text style={{ color: themeColor }} className="text-3xl font-bold">
              {initialsFrom(displayName)}
            </Text>
          </View>
        </View>

        <Text className="text-[21px] font-bold text-slate-900 text-center mt-4">
          {displayName}
        </Text>
        <View
          className="rounded-full px-3.5 py-1 mt-2 mb-2"
          style={{ backgroundColor: withAlpha(themeColor, '12') }}
        >
          <Text
            style={{ color: themeColor }}
            className="text-[11px] uppercase tracking-[1.5px] font-bold"
          >
            {user?.role?.label || 'Intern'}
          </Text>
        </View>
      </Reanimated.View>

      {/* Account details */}
      <Reanimated.View
        entering={FadeInUp.duration(500).delay(350).springify()}
        className="px-6 mt-7"
      >
        <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400 mb-3 ml-1">
          Account Details
        </Text>

        <View
          className="rounded-3xl bg-white"
          style={{
            shadowColor: '#0F172A',
            shadowOpacity: 0.06,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 2,
            borderWidth: 1,
            borderColor: '#F1F5F9',
          }}
        >
          {details.map((item, index) => {
            const Icon = item.icon;
            return (
              <View
                key={item.label}
                className={`flex-row items-center px-4 py-4 ${index !== details.length - 1
                  ? 'border-b border-slate-100'
                  : ''
                  }`}
              >
                <View
                  className="items-center justify-center rounded-full"
                  style={{
                    width: 38,
                    height: 38,
                    backgroundColor: withAlpha(themeColor, '12'),
                  }}
                >
                  <Icon color={themeColor} size={18} strokeWidth={2.25} />
                </View>
                <View className="ml-3.5 flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] text-slate-400 font-medium">
                      {item.label}
                    </Text>
                    {item.isEmail && item.verified && (
                      <View className="flex-row items-center rounded-lg bg-emerald-50 px-2 py-0.5">
                        <CheckCircle2 color="#10B981" size={12} />
                        <Text className="ml-1 text-[10px] font-bold text-emerald-600">Verified</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-[15px] font-semibold text-slate-900 mt-0.5" numberOfLines={1}>
                    {item.value || 'N/A'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </Reanimated.View>

      {/* Placement Details */}
      {profileData?.placement?.company && (
        <Reanimated.View
          entering={FadeInUp.duration(500).delay(400).springify()}
          className="px-6 mt-7"
        >
          <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400 mb-3 ml-1">
            Placement Details
          </Text>
          <View
            className="rounded-3xl bg-white"
            style={{
              shadowColor: '#0F172A',
              shadowOpacity: 0.06,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 2,
              borderWidth: 1,
              borderColor: '#F1F5F9',
            }}
          >
            {/* Company Info */}
            <View className={`flex-row items-center px-4 py-4 ${profileData.placement.supervisor ? 'border-b border-slate-100' : ''}`}>
              <View
                className="items-center justify-center rounded-full"
                style={{ width: 38, height: 38, backgroundColor: withAlpha(themeColor, '12') }}
              >
                <Building2 color={themeColor} size={18} strokeWidth={2.25} />
              </View>
              <View className="ml-3.5 flex-1">
                <Text className="text-[11px] text-slate-400 font-medium">Company</Text>
                <Text className="text-[15px] font-semibold text-slate-900 mt-0.5">{profileData.placement.company.name}</Text>
                {profileData.placement.company.address ? (
                  <View className="flex-row items-start mt-1 pr-4">
                    <MapPin color="#94A3B8" size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                    <Text className="text-[11px] text-slate-500 ml-1 flex-1 leading-4">{profileData.placement.company.address}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Supervisor Info */}
            {profileData.placement.supervisor && (
              <View className="flex-row items-center px-4 py-4">
                <View
                  className="items-center justify-center rounded-full"
                  style={{ width: 38, height: 38, backgroundColor: withAlpha(themeColor, '12') }}
                >
                  <UserCircle color={themeColor} size={18} strokeWidth={2.25} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-[11px] text-slate-400 font-medium">Supervisor</Text>
                  <Text className="text-[15px] font-semibold text-slate-900 mt-0.5">{profileData.placement.supervisor.name}</Text>
                  <Text className="text-[11px] text-slate-500 mt-0.5">{profileData.placement.supervisor.position_title || 'Supervisor'}</Text>
                </View>
              </View>
            )}
          </View>
        </Reanimated.View>
      )}

      {/* Evaluation & Settings */}
      <Reanimated.View
        entering={FadeInUp.duration(500).delay(450).springify()}
        className="px-6 mt-7"
      >
        <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400 mb-3 ml-1">
          More
        </Text>

        <View
          className="rounded-3xl bg-white"
          style={{
            shadowColor: '#0F172A',
            shadowOpacity: 0.06,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 2,
            borderWidth: 1,
            borderColor: '#F1F5F9',
          }}
        >
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                className={`flex-row items-center px-4 py-4 ${index !== menuItems.length - 1
                  ? 'border-b border-slate-100'
                  : ''
                  }`}
              >
                <View
                  className="items-center justify-center rounded-full"
                  style={{
                    width: 38,
                    height: 38,
                    backgroundColor: withAlpha(themeColor, '12'),
                  }}
                >
                  <Icon color={themeColor} size={18} strokeWidth={2.25} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-[15px] font-semibold text-slate-900">
                    {item.label}
                  </Text>
                  <Text className="text-[12px] text-slate-400 mt-0.5">
                    {item.sublabel}
                  </Text>
                </View>
                <ChevronRight color="#CBD5E1" size={18} />
              </Pressable>
            );
          })}
        </View>
      </Reanimated.View>

      {/* Sign out */}
      <Reanimated.View
        entering={FadeInUp.duration(500).delay(500).springify()}
        className="px-6"
      >
        <Pressable
          onPress={() => logout()}
          disabled={isPending}
          className={`flex-row items-center justify-center rounded-full py-4 mt-8 ${isPending ? 'opacity-60' : ''
            }`}
          style={{
            backgroundColor: '#FEF2F2',
            borderWidth: 1.5,
            borderColor: '#FECACA',
          }}
        >
          {isPending ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <>
              <LogOut color="#DC2626" size={18} strokeWidth={2.5} />
              <Text className="ml-2.5 text-[14px] font-bold text-red-600 tracking-wide">
                Sign Out
              </Text>
            </>
          )}
        </Pressable>
      </Reanimated.View>
    </ScrollView>
  );
}
