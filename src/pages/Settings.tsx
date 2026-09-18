import React, { useState } from 'react';
import {
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInUp,
  FadeInDown,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronRight,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react-native';

import { useUser } from '../util/queries/auth';
import { useInternProfile } from '../util/queries/profile';
import { useUpdateEmail, useUpdatePassword, useSendEmailVerification, useVerifyEmail } from '../util/queries/account';
import { useToast } from '../components/ToastProvider';

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

const CARD_SHADOW = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 5 },
  elevation: 2,
  borderWidth: 1,
  borderColor: '#F1F5F9',
} as const;

function FieldInput({
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  onToggleSecure,
  secureVisible,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboardType?: 'email-address' | 'default';
  onToggleSecure?: () => void;
  secureVisible?: boolean;
}) {
  return (
    <View className="flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-4">
      <TextInput
        className="flex-1 py-3.5 text-sm text-slate-800"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        secureTextEntry={secure && !secureVisible}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType ?? 'default'}
      />
      {secure && onToggleSecure && (
        <Pressable onPress={onToggleSecure} hitSlop={8}>
          {secureVisible ? (
            <EyeOff color="#94A3B8" size={17} />
          ) : (
            <Eye color="#94A3B8" size={17} />
          )}
        </Pressable>
      )}
    </View>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  subtitle,
  themeColor,
  expanded,
  onToggle,
  delay,
  children,
}: {
  icon: typeof Mail;
  title: string;
  subtitle: string;
  themeColor: string;
  expanded: boolean;
  onToggle: () => void;
  delay: number;
  children: React.ReactNode;
}) {
  const rotation = useSharedValue(expanded ? 90 : 0);
  React.useEffect(() => {
    rotation.value = withTiming(expanded ? 90 : 0, { duration: 180 });
  }, [expanded]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      entering={FadeInUp.duration(350).delay(delay)}
      layout={LinearTransition.duration(220)}
      className="mb-4 overflow-hidden rounded-3xl bg-white"
      style={CARD_SHADOW}
    >
      <Pressable
        onPress={onToggle}
        className="flex-row items-center px-5 py-4 active:opacity-70"
      >
        <View
          className="items-center justify-center rounded-2xl"
          style={{
            width: 42,
            height: 42,
            backgroundColor: withAlpha(themeColor, '12'),
          }}
        >
          <Icon color={themeColor} size={19} strokeWidth={2.25} />
        </View>
        <View className="ml-3.5 flex-1">
          <Text className="text-[14px] font-bold text-slate-900">{title}</Text>
          <Text className="mt-0.5 text-[12px] text-slate-500">{subtitle}</Text>
        </View>
        <Animated.View style={chevronStyle}>
          <ChevronRight color="#CBD5E1" size={18} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="border-t border-slate-100 px-5 pb-5 pt-4"
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

export const Settings = () => {
  const { data: userData } = useUser();
  const { data: profileData } = useInternProfile();
  const { showToast } = useToast();
  const themeColor = userData?.settings?.theme_color || '#1D4ED8';

  const updateEmail = useUpdateEmail();
  const updatePassword = useUpdatePassword();
  const sendVerification = useSendEmailVerification();
  const verifyEmail = useVerifyEmail();

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  const [emailExpanded, setEmailExpanded] = useState(false);
  const [passwordExpanded, setPasswordExpanded] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
  const canSubmitEmail =
    emailValid && emailPassword.length > 0 && !updateEmail.isPending;

  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitPassword =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    passwordsMatch &&
    !updatePassword.isPending;

  const handleEmailSave = async () => {
    try {
      await updateEmail.mutateAsync({
        email: newEmail.trim(),
        current_password: emailPassword,
      });
      showToast('Email updated successfully.', 'success');
      setNewEmail('');
      setEmailPassword('');
      setEmailExpanded(false);
    } catch {
      showToast(
        'Could not update email. Check your password and try again.',
        'error',
      );
    }
  };

  const handleSendVerification = async () => {
    try {
      await sendVerification.mutateAsync();
      showToast('Verification code sent to your email.', 'success');
      setShowVerifyModal(true);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to send verification code.', 'error');
    }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 4) {
      showToast('Please enter a valid 4-digit code.', 'error');
      return;
    }
    try {
      await verifyEmail.mutateAsync(verificationCode);
      showToast('Email verified successfully.', 'success');
      setShowVerifyModal(false);
      setVerificationCode('');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to verify code.', 'error');
    }
  };

  const handlePasswordSave = async () => {
    try {
      await updatePassword.mutateAsync({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      showToast('Password updated successfully.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordExpanded(false);
    } catch {
      showToast(
        'Could not update password. Check your current password.',
        'error',
      );
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#F8FAFC' }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)}>
          <LinearGradient
            colors={[themeColor, withAlpha(themeColor, 'CC')]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: 52,
              paddingBottom: 56,
              paddingHorizontal: 24,
              borderBottomLeftRadius: 36,
              borderBottomRightRadius: 36,
            }}
          >
            <Text className="text-[22px] font-bold text-white">Settings</Text>
            <Text className="mt-1 text-[13px] text-white/70">
              Manage your email and password
            </Text>
          </LinearGradient>
        </Animated.View>

        <View className="px-5" style={{ marginTop: -28 }}>
          <Animated.View
            entering={FadeInUp.duration(350).delay(100)}
            className="mb-5 rounded-2xl bg-white px-4 py-3"
            style={CARD_SHADOW}
          >
            <View className="flex-row items-center">
              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: 36,
                  height: 36,
                  backgroundColor: withAlpha(themeColor, '12'),
                }}
              >
                <Mail color={themeColor} size={16} strokeWidth={2.25} />
              </View>
              <View className="ml-3 flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Signed in as
                  </Text>
                  {profileData?.user?.email_verified_at ? (
                    <View className="flex-row items-center rounded-lg bg-emerald-50 px-2 py-0.5">
                      <CheckCircle2 color="#10B981" size={12} />
                      <Text className="ml-1 text-[10px] font-bold text-emerald-600">Verified</Text>
                    </View>
                  ) : (
                    <Pressable
                      disabled={sendVerification.isPending}
                      onPress={handleSendVerification}
                      className="flex-row items-center rounded-lg bg-rose-50 px-2 py-0.5 active:opacity-70"
                    >
                      {sendVerification.isPending ? (
                        <ActivityIndicator color="#E11D48" size="small" />
                      ) : (
                        <Text className="text-[10px] font-bold text-rose-600">Verify Email</Text>
                      )}
                    </Pressable>
                  )}
                </View>
                <Text
                  className="mt-0.5 text-[13px] font-semibold text-slate-800"
                  numberOfLines={1}
                >
                  {profileData?.user?.email ?? userData?.user?.email ?? '—'}
                </Text>
              </View>
            </View>
          </Animated.View>

          {showVerifyModal && (
            <Animated.View entering={FadeInDown.duration(200)} className="mb-5 rounded-2xl bg-white p-5" style={CARD_SHADOW}>
              <Text className="text-[13px] font-bold text-slate-800 mb-1">Enter Verification Code</Text>
              <Text className="text-[11px] text-slate-500 mb-4">Please check your inbox for the 4-digit code.</Text>
              <View className="flex-row items-center gap-3">
                <TextInput
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-[15px] font-bold tracking-widest text-slate-800"
                  value={verificationCode}
                  onChangeText={t => setVerificationCode(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  keyboardType="number-pad"
                />
                <Pressable
                  onPress={handleVerifyCode}
                  disabled={verifyEmail.isPending || verificationCode.length !== 4}
                  className="items-center justify-center rounded-xl px-5 py-3 active:opacity-70"
                  style={{ backgroundColor: (verifyEmail.isPending || verificationCode.length !== 4) ? '#E2E8F0' : themeColor }}
                >
                  {verifyEmail.isPending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text className="text-[13px] font-bold text-white">Confirm</Text>
                  )}
                </Pressable>
              </View>
              <Pressable
                onPress={() => { setShowVerifyModal(false); setVerificationCode(''); }}
                className="mt-4 items-center"
              >
                <Text className="text-[11px] font-bold text-slate-400">Cancel</Text>
              </Pressable>
            </Animated.View>
          )}

          <SettingsSection
            icon={Mail}
            title="Email address"
            subtitle="Update the email you use to sign in"
            themeColor={themeColor}
            expanded={emailExpanded}
            onToggle={() => setEmailExpanded(v => !v)}
            delay={150}
          >
            <Text className="mb-1.5 text-[11px] font-semibold text-slate-500">
              New email
            </Text>
            <FieldInput
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
            />

            <Text className="mb-1.5 mt-4 text-[11px] font-semibold text-slate-500">
              Confirm with your password
            </Text>
            <FieldInput
              value={emailPassword}
              onChangeText={setEmailPassword}
              placeholder="Current password"
              secure
              secureVisible={showEmailPassword}
              onToggleSecure={() => setShowEmailPassword(v => !v)}
            />

            <Pressable
              onPress={handleEmailSave}
              disabled={!canSubmitEmail}
              className="mt-5 flex-row items-center justify-center rounded-2xl py-3.5"
              style={{
                backgroundColor: canSubmitEmail ? themeColor : '#E2E8F0',
              }}
            >
              {updateEmail.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  className="text-[14px] font-bold"
                  style={{ color: canSubmitEmail ? '#FFFFFF' : '#94A3B8' }}
                >
                  Save email
                </Text>
              )}
            </Pressable>
          </SettingsSection>

          <SettingsSection
            icon={Lock}
            title="Password"
            subtitle="Change your account password"
            themeColor={themeColor}
            expanded={passwordExpanded}
            onToggle={() => setPasswordExpanded(v => !v)}
            delay={200}
          >
            <Text className="mb-1.5 text-[11px] font-semibold text-slate-500">
              Current password
            </Text>
            <FieldInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              secure
              secureVisible={showCurrent}
              onToggleSecure={() => setShowCurrent(v => !v)}
            />

            <Text className="mb-1.5 mt-4 text-[11px] font-semibold text-slate-500">
              New password
            </Text>
            <FieldInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              secure
              secureVisible={showNew}
              onToggleSecure={() => setShowNew(v => !v)}
            />

            <Text className="mb-1.5 mt-4 text-[11px] font-semibold text-slate-500">
              Confirm new password
            </Text>
            <FieldInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter new password"
              secure
              secureVisible={showNew}
            />

            {confirmPassword.length > 0 && (
              <View className="mt-2 flex-row items-center">
                {passwordsMatch ? (
                  <>
                    <CheckCircle2 color="#16A34A" size={13} />
                    <Text className="ml-1.5 text-[11px] font-medium text-green-700">
                      Passwords match
                    </Text>
                  </>
                ) : (
                  <Text className="text-[11px] font-medium text-red-500">
                    Passwords do not match
                  </Text>
                )}
              </View>
            )}

            <View className="mt-4 flex-row items-center rounded-xl bg-slate-50 px-3.5 py-2.5">
              <ShieldCheck color="#94A3B8" size={14} />
              <Text className="ml-2 flex-1 text-[11px] leading-4 text-slate-500">
                You'll stay signed in on this device after changing your
                password.
              </Text>
            </View>

            <Pressable
              onPress={handlePasswordSave}
              disabled={!canSubmitPassword}
              className="mt-5 flex-row items-center justify-center rounded-2xl py-3.5"
              style={{
                backgroundColor: canSubmitPassword ? themeColor : '#E2E8F0',
              }}
            >
              {updatePassword.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  className="text-[14px] font-bold"
                  style={{ color: canSubmitPassword ? '#FFFFFF' : '#94A3B8' }}
                >
                  Save password
                </Text>
              )}
            </Pressable>
          </SettingsSection>
        </View>
      </ScrollView >
    </View >
  );
};

export default Settings;
