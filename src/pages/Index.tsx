import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    Layout,
} from 'react-native-reanimated';
import { Logo } from '../images/Logo';
import { useLogin } from '../util/queries/auth';

export default function Index() {
    const [studentNumber, setStudentNumber] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { mutateAsync: login } = useLogin();

    const handleSignIn = async () => {
        if (!studentNumber.trim() || !password) {
            setError('Please enter your student ID and password.');
            return;
        }

        setError(null);
        setIsSubmitting(true);

        try {
            await login({ student_number: studentNumber.trim(), password });
        } catch (err: any) {
            setError(
                err?.response?.data?.message ??
                'We could not sign you in. Check your details and try again.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            className="flex-1 bg-blue-700"
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View className="flex-1 bg-blue-700">
                    {/* Header */}
                    <Animated.View
                        entering={FadeInDown.duration(500).springify()}
                        className="items-center bg-blue-700 px-6 pb-14"
                        style={{
                            paddingTop: Platform.OS === 'android' ? 48 : 56,
                        }}
                    >
                        <View className="rounded-2xl bg-white p-2 shadow-md">
                            <Logo size={64} />
                        </View>
                        <Text className="mt-4 text-[26px] font-bold tracking-wide text-white">
                            OCC Intern
                        </Text>
                        <Text className="mt-1.5 max-w-[300px] text-center text-sm leading-5 text-white/80">
                            On-the-Job Training Management System
                        </Text>
                    </Animated.View>

                    {/* Body */}
                    <Animated.View
                        layout={Layout.springify()}
                        className="flex-1 rounded-t-[28px] bg-slate-50 px-5 pt-7"
                        style={{ marginTop: -24 }}
                    >
                        <Animated.View
                            entering={FadeInUp.delay(150).duration(500).springify()}
                            layout={Layout.springify()}
                            className="rounded-[18px] border border-slate-200 bg-white p-[22px] shadow-sm"
                            style={{
                                shadowColor: '#0F172A',
                                shadowOpacity: 0.06,
                                shadowRadius: 16,
                                shadowOffset: { width: 0, height: 6 },
                                elevation: 2,
                            }}
                        >
                            <View className="items-center border-b border-slate-200 pb-4 mb-5">
                                <Text className="text-xl font-bold text-slate-900">
                                    Sign in
                                </Text>
                                <Text className="mt-1.5 text-center text-sm leading-[21px] text-slate-500">
                                    Enter your student ID and password to
                                    access your intern account.
                                </Text>
                            </View>

                            {error && (
                                <Animated.View
                                    entering={FadeIn.duration(200)}
                                    className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3"
                                >
                                    <Text className="text-sm leading-5 text-red-600">
                                        {error}
                                    </Text>
                                </Animated.View>
                            )}

                            <Animated.View
                                entering={FadeIn.delay(220).duration(400)}
                                className="mb-4"
                            >
                                <Text className="mb-2 text-[13px] font-semibold tracking-wide text-slate-900">
                                    Student ID
                                </Text>
                                <TextInput
                                    value={studentNumber}
                                    onChangeText={(text) => {
                                        setStudentNumber(text);
                                        if (error) setError(null);
                                    }}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    textContentType="username"
                                    returnKeyType="next"
                                    placeholder="Enter your student ID"
                                    placeholderTextColor="#94A3B8"
                                    editable={!isSubmitting}
                                    accessibilityLabel="Student ID"
                                    className={`rounded-xl border bg-slate-50 px-3.5 text-base text-slate-900 ${error && !studentNumber.trim()
                                        ? 'border-red-300'
                                        : 'border-slate-200'
                                        } ${Platform.OS === 'ios' ? 'py-3.5' : 'py-3'}`}
                                />
                            </Animated.View>

                            <Animated.View
                                entering={FadeIn.delay(280).duration(400)}
                                className="mb-1.5"
                            >
                                <Text className="mb-2 text-[13px] font-semibold tracking-wide text-slate-900">
                                    Password
                                </Text>
                                <View
                                    className={`flex-row items-center overflow-hidden rounded-xl border bg-slate-50 ${error && !password
                                        ? 'border-red-300'
                                        : 'border-slate-200'
                                        }`}
                                >
                                    <TextInput
                                        value={password}
                                        onChangeText={(text) => {
                                            setPassword(text);
                                            if (error) setError(null);
                                        }}
                                        secureTextEntry={!showPassword}
                                        textContentType="password"
                                        returnKeyType="done"
                                        onSubmitEditing={handleSignIn}
                                        placeholder="Enter your password"
                                        placeholderTextColor="#94A3B8"
                                        editable={!isSubmitting}
                                        accessibilityLabel="Password"
                                        className="flex-1 bg-transparent px-3.5 py-3.5 pr-2 text-base text-slate-900"
                                    />
                                    <Pressable
                                        onPress={() => setShowPassword((v) => !v)}
                                        className="px-3.5 py-3.5"
                                        hitSlop={8}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                            showPassword ? 'Hide password' : 'Show password'
                                        }
                                    >
                                        <Text className="text-[13px] font-bold text-blue-700">
                                            {showPassword ? 'Hide' : 'Show'}
                                        </Text>
                                    </Pressable>
                                </View>

                                <Pressable
                                    className="mt-2.5 self-end"
                                    hitSlop={8}
                                    disabled={isSubmitting}
                                >
                                    <Text className="text-[13px] font-semibold text-blue-700">
                                        Forgot password?
                                    </Text>
                                </Pressable>
                            </Animated.View>

                            <Pressable
                                onPress={handleSignIn}
                                disabled={isSubmitting}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: isSubmitting }}
                                className={`mt-4 min-h-[52px] items-center justify-center rounded-xl bg-blue-700 ${isSubmitting ? 'opacity-70' : ''
                                    }`}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text className="text-base font-bold tracking-wide text-white">
                                        Sign in
                                    </Text>
                                )}
                            </Pressable>
                        </Animated.View>

                        <Animated.View
                            entering={FadeIn.delay(400).duration(500)}
                            className="min-h-[96px] items-center px-3 pb-6 pt-7"
                        >
                            <Text className="text-[13px] font-bold uppercase tracking-widest text-slate-500">
                                Authorized access only
                            </Text>
                            <Text className="mt-2 max-w-[320px] text-center text-[13px] leading-5 text-slate-400">
                                This application is intended for registered
                                OJT interns. Faculty and supervisors should
                                use the web portal.
                            </Text>
                        </Animated.View>
                    </Animated.View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
