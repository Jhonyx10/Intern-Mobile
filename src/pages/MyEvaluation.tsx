import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  ChevronRight,
  Star,
} from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  FadeInDown,
  FadeInUp,
  LinearTransition,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Evaluation,
  useMyEvaluations,
  usePrimeEvaluation,
} from '../util/queries/evaluation';
import { useUser } from '../util/queries/auth';
import { EvaluationSheet } from '../components/modal/EvaluationSheet';
import { StatusPill } from '../components/StatusPill';

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

const CARD_SHADOW = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
  borderWidth: 1,
  borderColor: '#F1F5F9',
} as const;

const EvaluationRow = ({
  evaluation,
  index,
  themeColor,
  onPress,
}: {
  evaluation: Evaluation;
  index: number;
  themeColor: string;
  onPress: () => void;
}) => (
  <Animated.View
    entering={FadeInDown.delay(Math.min(index, 8) * 50).duration(260)}
    layout={LinearTransition.springify()}
    className="mb-3"
  >
    <View
      className="flex-row items-start rounded-3xl bg-white p-4"
      style={CARD_SHADOW}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: 38,
          height: 38,
          backgroundColor: withAlpha(themeColor, '12'),
        }}
      >
        <ClipboardList color={themeColor} size={18} strokeWidth={2.25} />
      </View>

      <View className="ml-3.5 flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className="flex-1 text-[15px] font-semibold text-slate-900"
            numberOfLines={1}
          >
            {evaluation.template?.title ?? 'Evaluation'}
          </Text>
          <StatusPill status={evaluation.status} />
        </View>

        {evaluation.template?.description ? (
          <Text className="mt-1 text-[13px] text-slate-500" numberOfLines={2}>
            {evaluation.template.description}
          </Text>
        ) : null}

        <Text className="mt-2 text-xs text-slate-400">
          {evaluation.status === 'submitted'
            ? `Submitted ${formatDate(evaluation.submitted_at)}`
            : `Assigned ${formatDate(evaluation.created_at)}`}
          {evaluation.computed_score != null &&
            ` · Score ${evaluation.computed_score}`}
        </Text>
      </View>
    </View>
  </Animated.View>
);

const StatCell = ({
  icon: Icon,
  value,
  label,
  tint,
  divider,
}: {
  icon: typeof Clock;
  value: string;
  label: string;
  tint: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 items-center py-4 ${divider ? 'border-l border-slate-100' : ''
      }`}
  >
    <View
      className="items-center justify-center rounded-full"
      style={{ width: 30, height: 30, backgroundColor: withAlpha(tint, '15') }}
    >
      <Icon color={tint} size={15} strokeWidth={2.25} />
    </View>
    <Text className="mt-2 text-lg font-bold text-slate-900">{value}</Text>
    <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-[1px] text-slate-400">
      {label}
    </Text>
  </View>
);

export const MyEvaluation = () => {
  const { data, isLoading, isRefetching, refetch } = useMyEvaluations();
  const { data: userData } = useUser();
  const primeEvaluation = usePrimeEvaluation();
  const insets = useSafeAreaInsets();

  const themeColor = userData?.settings?.theme_color || '#1D4ED8';
  const evaluations = data ?? [];

  // Gradient grows to swallow the status bar instead of tucking text under it;
  // content inside gets pushed down by the same amount so the layout ratio
  // (title → stat card overlap) stays identical across devices.
  const HEADER_BASE_HEIGHT = 170;
  const headerHeight = HEADER_BASE_HEIGHT + insets.top;

  const stats = useMemo(() => {
    const pending = evaluations.filter(e => e.status === 'pending').length;
    const submitted = evaluations.filter(e => e.status === 'submitted');
    const scored = submitted.filter(e => e.computed_score != null);
    const avg = scored.length
      ? (
        scored.reduce((sum, e) => sum + (e.computed_score ?? 0), 0) /
        scored.length
      ).toFixed(1)
      : '—';
    return { pending, submittedCount: submitted.length, avg };
  }, [evaluations]);



  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={themeColor} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <FlatList
        data={evaluations}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <>
            <View style={{ height: headerHeight }}>
              <LinearGradient
                colors={[themeColor, withAlpha(themeColor, 'CC')]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  height: headerHeight,
                  borderBottomLeftRadius: 40,
                  borderBottomRightRadius: 40,
                  overflow: 'hidden',
                  paddingHorizontal: 24,
                  paddingTop: insets.top + 20,
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
                <Text className="text-[22px] font-bold text-white">
                  Evaluations
                </Text>
                <Text className="mt-1 text-[13px] text-white/80">
                  Feedback from your workplace supervisor
                </Text>
              </LinearGradient>
            </View>

            <Animated.View
              entering={FadeInUp.duration(500).delay(150).springify()}
              className="px-6"
              style={{ marginTop: -32 }}
            >
              <View
                className="flex-row rounded-3xl bg-white"
                style={CARD_SHADOW}
              >
                <StatCell
                  icon={Clock}
                  value={String(stats.pending)}
                  label="Pending"
                  tint="#D97706"
                />
                <StatCell
                  icon={CheckCircle2}
                  value={String(stats.submittedCount)}
                  label="Submitted"
                  tint="#16A34A"
                  divider
                />
                <StatCell
                  icon={Star}
                  value={stats.avg}
                  label="Avg Score"
                  tint={themeColor}
                  divider
                />
              </View>
            </Animated.View>

            <Text className="mb-3 ml-7 mt-7 text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400">
              Assigned Evaluations
            </Text>
          </>
        }
        renderItem={({ item, index }) => (
          <View className="px-6">
            <EvaluationRow
              evaluation={item}
              index={index}
              themeColor={themeColor}
              onPress={() => { }}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={themeColor}
            colors={[themeColor]}
          />
        }
        ListEmptyComponent={
          <View className="items-center px-10 py-16">
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: 56,
                height: 56,
                backgroundColor: withAlpha(themeColor, '12'),
              }}
            >
              <ClipboardList color={themeColor} size={24} strokeWidth={2} />
            </View>
            <Text className="mt-4 text-[15px] font-semibold text-slate-900">
              No evaluations yet
            </Text>
            <Text className="mt-1.5 text-center text-[13px] text-slate-500">
              Once your supervisor assigns one, it'll show up here.
            </Text>
          </View>
        }
      />


    </View>
  );
};
