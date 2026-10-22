import React from 'react';
import { Text, View, ActivityIndicator, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Sun, Sunset } from 'lucide-react-native'; // swap for the icon library you already use
import {
  withAlpha,
  PERIOD_LABEL,
  PunchPeriod,
} from '../../util/timeLogHelpers';

const PERIOD_STYLE: Record<PunchPeriod, { color: string; Icon: any }> = {
  morning: { color: '#F59E0B', Icon: Sun },
  afternoon: { color: '#EA580C', Icon: Sunset },
};

export default function PunchActionCard({
  punch,
  isPunching,
}: {
  punch: any;
  isPunching: boolean;
}) {
  const PunchIcon = punch.icon;
  const period: PunchPeriod | undefined = punch.period;
  const periodStyle = period ? PERIOD_STYLE[period] : null;

  return (
    <Animated.View
      entering={FadeInUp.duration(500).delay(200).springify()}
      className="rounded-3xl bg-white mb-4 overflow-hidden"
      style={{
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
        borderWidth: 1.5,
        borderColor: withAlpha(punch.color, '25'),
      }}
    >
      <View className="p-5 flex-row items-center">
        <View
          className="rounded-2xl p-3 mr-4"
          style={{ backgroundColor: withAlpha(punch.color, '12') }}
        >
          <PunchIcon color={punch.color} size={28} strokeWidth={1.75} />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-slate-900">
            {punch.label}
          </Text>

          {period && periodStyle && (
            <View
              className="flex-row items-center self-start rounded-full px-2 py-0.5 mt-1"
              style={{ backgroundColor: withAlpha(periodStyle.color, '18') }}
            >
              <periodStyle.Icon
                color={periodStyle.color}
                size={11}
                strokeWidth={2.25}
              />
              <Text
                className="text-[11px] font-bold ml-1"
                style={{ color: periodStyle.color }}
              >
                {PERIOD_LABEL[period]}
              </Text>
            </View>
          )}

          <Text className="text-[12px] text-slate-500 mt-1">{punch.hint}</Text>
        </View>
        {isPunching && <ActivityIndicator color={punch.color} />}
      </View>
      <Pressable
        onPress={punch.onPress}
        disabled={punch.disabled || isPunching}
        className="mx-5 mb-5 items-center justify-center flex-row rounded-2xl py-3.5"
        style={{
          backgroundColor: punch.color,
          opacity: punch.disabled || isPunching ? 0.5 : 1,
        }}
      >
        <PunchIcon color="#fff" size={18} strokeWidth={2} />
        <Text className="text-white font-bold text-[14px] ml-2">
          {punch.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
