import React, { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { useUser } from '../util/queries/auth';
import { withAlpha } from '../util/timeLogHelpers';
import NotificationBell from './NotificationBell';

type Props = {
  title: string;
  // A string, or any node (Home uses a "section • course" row)
  subtitle?: ReactNode;
  // Extra buttons shown to the left of the bell
  actions?: ReactNode;
  showBell?: boolean;
  // false (default): tall header with room for a card floating over it
  // true: short header (Reports, where the list starts right below)
  compact?: boolean;
  // Anything extra under the title row (week selector, preset toggle...)
  children?: ReactNode;
};

export default function ScreenHeader({
  title,
  subtitle,
  actions,
  showBell = true,
  compact = false,
  children,
}: Props) {
  const { data: userData } = useUser();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';

  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <LinearGradient
        colors={[themeColor, withAlpha(themeColor, 'CC')]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: 56,
          paddingBottom: compact ? 24 : 84,
          paddingHorizontal: 20,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        }}
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-4">
            <Text
              className="text-[26px] font-bold text-white"
              numberOfLines={1}
            >
              {title}
            </Text>
            {typeof subtitle === 'string' ? (
              <Text
                className="text-[13px] mt-1.5"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              >
                {subtitle}
              </Text>
            ) : (
              subtitle
            )}
          </View>

          {(actions || showBell) && (
            <View className="flex-row items-center gap-3">
              {actions}
              {showBell && <NotificationBell />}
            </View>
          )}
        </View>

        {children}
      </LinearGradient>
    </Animated.View>
  );
}
