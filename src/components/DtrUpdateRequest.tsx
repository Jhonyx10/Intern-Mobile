import React, { useState } from 'react';
import {
  Text,
  View,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeInUp, SlideInDown } from 'react-native-reanimated';
import {
  Send,
  Pencil,
  CheckCircle2,
  MessageSquare,
  X,
} from 'lucide-react-native';

import { withAlpha, formatLogTime } from '../util/timeLogHelpers';
import { useSubmitCorrectionReason } from '../util/queries/correctionReason';

const MIN_LENGTH = 5;
const MAX_LENGTH = 500;

const CARD_STYLE = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 5 },
  elevation: 2,
  borderWidth: 1,
  borderColor: '#F1F5F9',
} as const;

function errorMessage(err: any): string {
  const data = err?.response?.data;
  return (
    data?.errors?.reason?.[0] ??
    data?.message ??
    err?.message ??
    'Could not send your reason. Please try again.'
  );
}

type Props = {
  /** The time log from useTimeLogDetail */
  log: any;
  themeColor: string;
  /** Called after the reason was sent, so the screen can refetch */
  onSubmitted: () => void;
};

export default function DtrUpdateRequest({
  log,
  themeColor,
  onSubmitted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = useSubmitCorrectionReason(log.id);

  const canAddReason: boolean = Boolean(log.can_add_reason);
  const savedReason: string | null = log.correction_reason ?? null;
  const isCorrected = log.verification_method === 'supervisor_corrected';

  // Nothing to show for a normal log
  if (!canAddReason && !savedReason) {
    return null;
  }

  const trimmed = reason.trim();
  const isValid = trimmed.length >= MIN_LENGTH;

  function openModal() {
    setReason(savedReason ?? '');
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    if (!submit.isPending) {
      setOpen(false);
    }
  }

  function handleSend() {
    if (!isValid || submit.isPending) {
      return;
    }
    setError(null);
    submit.mutate(trimmed, {
      onSuccess: () => {
        setOpen(false);
        onSubmitted();
      },
      onError: e => setError(errorMessage(e)),
    });
  }

  return (
    <>
      <Animated.View
        entering={FadeInUp.duration(400).delay(40)}
        className="rounded-3xl bg-white mb-4 px-5 py-5"
        style={CARD_STYLE}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center flex-1">
            <View
              className="items-center justify-center rounded-full mr-2.5"
              style={{
                width: 32,
                height: 32,
                backgroundColor: withAlpha(themeColor, '1F'),
              }}
            >
              <MessageSquare color={themeColor} size={16} strokeWidth={2.25} />
            </View>
            <Text className="text-[15px] font-bold text-slate-800">
              {savedReason ? 'Your reason' : 'Forgot to time out?'}
            </Text>
          </View>

          {savedReason &&
            (isCorrected ? (
              <View className="flex-row items-center rounded-full px-3 py-1 bg-green-50">
                <CheckCircle2 color="#15803D" size={11} />
                <Text className="ml-1 text-[10px] font-bold uppercase tracking-wide text-green-700">
                  Corrected
                </Text>
              </View>
            ) : (
              <View className="rounded-full px-3 py-1 bg-amber-50">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Waiting for supervisor
                </Text>
              </View>
            ))}
        </View>

        {/* Body */}
        {savedReason ? (
          <Text className="text-[13px] text-slate-700 leading-5">
            {savedReason}
          </Text>
        ) : (
          <Text className="text-[13px] text-slate-500 leading-5">
            Tell your supervisor what happened so they can update your DTR with
            the correct time out.
          </Text>
        )}

        {/* Action */}
        {canAddReason && (
          <Pressable
            onPress={openModal}
            className="mt-4 flex-row items-center justify-center rounded-2xl py-3"
            style={
              savedReason
                ? { borderWidth: 1, borderColor: withAlpha(themeColor, '55') }
                : { backgroundColor: themeColor }
            }
          >
            {savedReason ? (
              <Pencil color={themeColor} size={14} />
            ) : (
              <Send color="#fff" size={14} />
            )}
            <Text
              className="ml-2 text-[13px] font-bold"
              style={{ color: savedReason ? themeColor : '#fff' }}
            >
              {savedReason ? 'Edit reason' : 'Request DTR update'}
            </Text>
          </Pressable>
        )}
      </Animated.View>

      {/* Reason modal */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(15,23,42,0.5)',
          }}
        >
          <Pressable
            onPress={closeModal}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Animated.View
              entering={FadeInUp.duration(400)}
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 28,
              }}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[17px] font-bold text-slate-800">
                    Request DTR update
                  </Text>
                  <Text className="text-[12px] text-slate-500 mt-0.5">
                    You timed in at {formatLogTime(log.time_in)} and the shift
                    was closed automatically.
                  </Text>
                </View>
                <Pressable
                  onPress={closeModal}
                  hitSlop={8}
                  className="items-center justify-center rounded-full bg-slate-100"
                  style={{ width: 30, height: 30 }}
                >
                  <X color="#64748B" size={16} />
                </Pressable>
              </View>

              <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-slate-400 mt-5 mb-2">
                Why did you forget to time out?
              </Text>
              <TextInput
                value={reason}
                onChangeText={t => {
                  setReason(t);
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="e.g. My phone died, so I couldn't time out."
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={MAX_LENGTH}
                textAlignVertical="top"
                autoFocus
                editable={!submit.isPending}
                style={{
                  minHeight: 110,
                  borderWidth: 1,
                  borderColor: error ? '#FCA5A5' : '#E2E8F0',
                  borderRadius: 16,
                  padding: 14,
                  fontSize: 14,
                  color: '#1E293B',
                  backgroundColor: '#F8FAFC',
                }}
              />

              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-[11px] text-red-600 flex-1 pr-3">
                  {error ?? ''}
                </Text>
                <Text className="text-[11px] text-slate-400">
                  {trimmed.length}/{MAX_LENGTH}
                </Text>
              </View>

              <View className="flex-row mt-4">
                <Pressable
                  onPress={closeModal}
                  disabled={submit.isPending}
                  className="flex-1 items-center justify-center rounded-2xl bg-slate-100 py-3.5 mr-2"
                >
                  <Text className="text-[14px] font-bold text-slate-600">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSend}
                  disabled={!isValid || submit.isPending}
                  className="flex-1 flex-row items-center justify-center rounded-2xl py-3.5 ml-2"
                  style={{
                    backgroundColor: themeColor,
                    opacity: !isValid || submit.isPending ? 0.5 : 1,
                  }}
                >
                  {submit.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Send color="#fff" size={14} />
                      <Text className="ml-2 text-[14px] font-bold text-white">
                        Send request
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}
