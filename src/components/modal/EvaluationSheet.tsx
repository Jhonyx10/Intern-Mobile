import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Dimensions, Modal, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEvaluation } from '../../util/queries/evaluation'
import { StatusPill } from '../StatusPill';

const { height: SCREEN_H } = Dimensions.get('window');
const CLOSED_Y = SCREEN_H;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const SPRING = { damping: 20, stiffness: 220, mass: 0.6 };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnswerBlock = ({ label, value, index }: { label: string; value: unknown; index: number }) => {
  const display = Array.isArray(value)
    ? value.join(', ')
    : value === null || value === undefined || value === ''
      ? 'No answer'
      : String(value);

  return (
    <Animated.View
      entering={FadeIn.delay(index * 40).duration(220)}
      className="mt-5 border-b border-neutral-100 pb-4"
    >
      <Text className="text-[13px] font-semibold text-neutral-700">{label}</Text>
      <Text className="mt-1 text-[15px] leading-6 text-neutral-900">{display}</Text>
    </Animated.View>
  );
};

export const EvaluationSheet = ({
  evaluationId,
  onClose,
}: {
  evaluationId: number | null;
  onClose: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError } = useEvaluation(evaluationId);

  const translateY = useSharedValue(CLOSED_Y);
  const open = evaluationId != null;

  useEffect(() => {
    translateY.value = open ? withSpring(0, SPRING) : CLOSED_Y;
  }, [open, translateY]);

  // Animate out first, then unmount via parent state.
  const dismiss = useCallback(() => {
    translateY.value = withTiming(
      CLOSED_Y,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      finished => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [onClose, translateY]);

  const startY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate(e => {
      // Rubber-band upward drags so the sheet can't be pulled past its top.
      const next = startY.value + e.translationY;
      translateY.value = next < 0 ? next * 0.2 : next;
    })
    .onEnd(e => {
      const shouldDismiss =
        translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;

      if (shouldDismiss) {
        translateY.value = withTiming(CLOSED_Y, { duration: 200 }, finished => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, CLOSED_Y], [1, 0], 'clamp'),
  }));

  const items = useMemo(
    () => [...(data?.template?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [data],
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      {/* RNGH needs its own root inside a Modal on Android. */}
      <GestureHandlerRootView className="flex-1">
        <AnimatedPressable
          onPress={dismiss}
          style={backdropStyle}
          className="absolute inset-0 bg-black/45"
        />

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[sheetStyle, { paddingBottom: insets.bottom + 16 }]}
            className="absolute inset-x-0 bottom-0 max-h-[85%] rounded-t-3xl bg-white px-5 pt-2.5"
          >
            <View className="self-center my-3 h-1 w-10 rounded-full bg-neutral-300" />

            {isLoading ? (
              <View className="items-center py-12">
                <ActivityIndicator />
              </View>
            ) : isError || !data ? (
              <View className="items-center py-12">
                <Text className="text-center text-sm text-neutral-500">
                  Couldn't load this evaluation.
                </Text>
              </View>
            ) : (
              <Animated.ScrollView
                contentContainerClassName="pb-4"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 text-xl font-bold text-neutral-900">
                    {data.template?.title}
                  </Text>
                  <StatusPill status={data.status} />
                </View>

                {data.template?.description ? (
                  <Text className="mt-2 text-sm leading-5 text-neutral-500">
                    {data.template.description}
                  </Text>
                ) : null}

                {data.computed_score != null && (
                  <Animated.View
                    entering={FadeIn.duration(250)}
                    className="mt-4 rounded-xl bg-indigo-50 p-3.5"
                  >
                    <Text className="text-xs font-semibold text-indigo-700">
                      Score
                    </Text>
                    <Text className="mt-0.5 text-[26px] font-bold text-indigo-900">
                      {data.computed_score}
                    </Text>
                  </Animated.View>
                )}

                {data.status === 'pending' ? (
                  <Text className="mt-6 text-center text-sm text-neutral-500">
                    Your supervisor hasn't completed this evaluation yet.
                  </Text>
                ) : (
                  items.map((item, i) => (
                    <AnswerBlock
                      key={item.id}
                      index={i}
                      label={item.label}
                      value={data.responses?.[String(item.id)]}
                    />
                  ))
                )}
              </Animated.ScrollView>
            )}

            <Pressable
              onPress={dismiss}
              className="mt-3 items-center rounded-xl bg-neutral-900 py-3.5 active:opacity-80"
            >
              <Text className="text-[15px] font-semibold text-white">
                Close
              </Text>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
};