import React from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

// Shared look & feel for the main screens (Home, Time Logs, ...).
// Put this file in components/ScreenKit.tsx

export const PAGE_BG = '#F6F7F9';
export const LINE = '#E6E9EE';
export const INK = '#0F172A';
export const MUTED = '#64748B';

// A titled group of content. The title sits above the panel, in sentence case,
// with an optional element (badge, link) on the right.
export function Section({
  title,
  right,
  entering,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  /** Optional reanimated entering animation, e.g. FadeInUp.duration(500).delay(350).springify() */
  entering?: React.ComponentProps<typeof Animated.View>['entering'];
  children: React.ReactNode;
}) {
  return (
    <Animated.View entering={entering} className="mt-6">
      <View className="mb-2 px-1 flex-row items-center justify-between">
        <Text className="text-[14px] font-semibold" style={{ color: INK }}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </Animated.View>
  );
}

// White surface with a hairline border. `accent` adds a coloured left edge for notices.
export function Panel({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: LINE,
        borderLeftWidth: accent ? 3 : 1,
        borderLeftColor: accent ?? LINE,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

export function DetailRow({
  label,
  value,
  valueColor = INK,
  dotColor,
  last,
}: {
  label: string;
  value: string;
  valueColor?: string;
  dotColor?: string;
  last?: boolean;
}) {
  return (
    <View
      className="flex-row items-center justify-between px-4 py-3.5"
      style={
        last ? undefined : { borderBottomWidth: 1, borderBottomColor: LINE }
      }
    >
      <Text className="text-[13px]" style={{ color: MUTED }}>
        {label}
      </Text>
      <View className="flex-1 flex-row items-center justify-end ml-4">
        {dotColor && (
          <View
            className="rounded-full mr-1.5"
            style={{ width: 7, height: 7, backgroundColor: dotColor }}
          />
        )}
        <Text
          className="text-[14px] font-medium text-right flex-shrink"
          style={{ color: valueColor }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export function Stat({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <View
      className="flex-1 items-center"
      style={
        divider ? { borderLeftWidth: 1, borderLeftColor: LINE } : undefined
      }
    >
      <Text className="text-[17px] font-bold" style={{ color: INK }}>
        {value}
      </Text>
      <Text className="text-[12px] mt-0.5" style={{ color: MUTED }}>
        {label}
      </Text>
    </View>
  );
}
