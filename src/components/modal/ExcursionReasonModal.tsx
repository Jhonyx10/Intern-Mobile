import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

interface ExcursionReasonModalProps {
  visible: boolean;
  /** Unused: the modal is mandatory and can only close via a successful submit. Kept so existing callers still compile. */
  onClose?: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
  themeColor: string;
}

const QUICK_REASONS = [
  'Lunch break',
  'Errand for my supervisor',
  'Emergency',
  'Restroom / personal',
  'Meeting off-site',
];

const MAX_LENGTH = 200;

// Adds transparency to a #RRGGBB color. Falls back to a neutral tint for any other format.
function withAlpha(color: string, alphaHex: string, fallback = '#F1F5F9') {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : fallback;
}

export default function ExcursionReasonModal({
  visible,
  onSubmit,
  isSubmitting,
  themeColor,
}: ExcursionReasonModalProps) {
  const [reason, setReason] = useState('');
  const [focused, setFocused] = useState(false);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setReason(''); // Reset after submit
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      // Mandatory: the Android back button does nothing.
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end"
      >
        {/* Non-dismissible backdrop */}
        <View className="absolute inset-0 bg-slate-900/60" />

        <View className="rounded-t-[32px] bg-white px-6 pb-8 pt-6">
          {/* Header */}
          <View className="mb-5 flex-row items-center">
            <View
              className="mr-4 h-14 w-14 items-center justify-center rounded-2xl"
              style={{ backgroundColor: withAlpha(themeColor, '1F') }}
            >
              <Text
                className="text-[26px] font-bold"
                style={{ color: themeColor, marginTop: -2 }}
              >
                ↗
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-slate-900">
                You stepped outside
              </Text>
              <Text className="mt-0.5 text-[13px] leading-[18px] text-slate-500">
                You left the geofence while timed in. Tell your coordinator why.
              </Text>
            </View>
          </View>

          {/* Quick picks */}
          <Text className="mb-2 text-xs font-semibold text-slate-500">
            Quick pick
          </Text>
          <View className="mb-5 flex-row flex-wrap">
            {QUICK_REASONS.map(item => {
              const selected = reason === item;
              return (
                <Pressable
                  key={item}
                  disabled={isSubmitting}
                  onPress={() => setReason(selected ? '' : item)}
                  className="mb-2 mr-2 rounded-full border px-3.5 py-2"
                  style={{
                    borderColor: selected ? themeColor : '#E2E8F0',
                    backgroundColor: selected
                      ? withAlpha(themeColor, '14')
                      : '#FFFFFF',
                  }}
                >
                  <Text
                    className="text-[13px] font-medium"
                    style={{ color: selected ? themeColor : '#475569' }}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Free text */}
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-slate-500">
              Or write your own
            </Text>
            <Text className="text-xs text-slate-400">
              {reason.length}/{MAX_LENGTH}
            </Text>
          </View>
          <TextInput
            value={reason}
            onChangeText={setReason}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            editable={!isSubmitting}
            placeholder="e.g. Bought supplies for the office"
            placeholderTextColor="#94A3B8"
            maxLength={MAX_LENGTH}
            multiline
            className="mt-1 min-h-[96px] rounded-2xl border-[1.5px] bg-slate-50 px-4 pb-3 pt-3 text-[15px] text-slate-900"
            style={{
              textAlignVertical: 'top',
              borderColor: focused ? themeColor : '#E2E8F0',
            }}
          />

          {/* Actions */}
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            className="mt-5 h-[52px] items-center justify-center rounded-2xl"
            style={{
              backgroundColor: canSubmit ? themeColor : '#CBD5E1',
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-base font-bold text-white">
                Submit reason
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
