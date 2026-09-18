import React from 'react';
import { Text, View, Modal, Pressable } from 'react-native';
import { MapPinOff } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

export default function TaskNoteModal({
  visible,
  onClose,
  onProceed,
  themeColor,
}: {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
  themeColor: string;
}) {
  const cardScale = useSharedValue(0.92);
  const cardOpacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 200 });
      cardOpacity.value = withTiming(1, { duration: 220 });
      cardScale.value = withSpring(1, {
        damping: 16,
        stiffness: 220,
        mass: 0.6,
      });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 160 });
      cardOpacity.value = withTiming(0, { duration: 160 });
      cardScale.value = withTiming(0.92, {
        duration: 160,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center px-6">
        <Animated.View
          style={[backdropStyle, { backgroundColor: 'rgba(15, 23, 42, 0.55)' }]}
          className="absolute inset-0"
        />

        <Pressable className="absolute inset-0" onPress={onClose} />

        <Animated.View
          style={[
            cardStyle,
            {
              shadowColor: '#0F172A',
              shadowOpacity: 0.18,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 8,
            },
          ]}
          className="w-full max-w-sm rounded-3xl bg-white overflow-hidden"
        >
          {/* Header */}
          <View className="flex-row items-start gap-3 px-6 pt-6 pb-3">
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: 40,
                height: 40,
                backgroundColor: withAlpha(themeColor, '14'),
              }}
            >
              <MapPinOff color={themeColor} size={19} strokeWidth={2.25} />
            </View>
            <View className="flex-1 pt-1">
              <Text className="text-[16px] font-bold text-slate-900">
                You're currently outside
              </Text>
              <Text className="mt-0.5 text-xs leading-[18px] text-slate-500">
                Off-site punch out
              </Text>
            </View>
          </View>

          {/* Body */}
          <View className="px-6 pb-2">
            <View
              className="rounded-2xl px-4 py-4"
              style={{ backgroundColor: withAlpha(themeColor, '08') }}
            >
              <Text className="text-sm leading-[22px] text-slate-700">
                You're punching out while outside the building premises during working hours.{' '}
                <Text className="font-semibold" style={{ color: themeColor }}>
                  Please state your reason on your note
                </Text>{' '}
                when updating your task log.
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View className="flex-row gap-3 px-6 pb-6 pt-4">
            <Pressable
              onPress={onClose}
              className="flex-1 items-center rounded-2xl bg-slate-100 py-3.5 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-slate-600">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onProceed}
              className="flex-1 items-center rounded-2xl py-3.5 active:opacity-85"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-sm font-semibold text-white">
                Proceed to Face ID
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
