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
import { useForgotPassword } from '../util/queries/auth';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../components/Navigation';

export default function ForgotPassword() {
    const [studentNumber, setStudentNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const { mutateAsync: forgotPassword } = useForgotPassword();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    const handleReset = async () => {
        if (!studentNumber.trim()) {
            setError('Please enter your student ID.');
            return;
        }

        setError(null);
        setSuccessMessage(null);
        setIsSubmitting(true);

        try {
            const res = await forgotPassword({ student_number: studentNumber.trim() });
            setSuccessMessage(res.message);
        } catch (err: any) {
            setError(
                err?.response?.data?.message ??
                'We could not process your request. Check your details and try again.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            className="flex-1 bg-blue-700"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                                    Reset Password
                                </Text>
                                <Text className="mt-1.5 text-center text-sm leading-[21px] text-slate-500">
                                    Enter your student ID to request a password reset. A system-generated password will be sent to your registered email.
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

                            {successMessage ? (
                                <Animated.View
                                    entering={FadeIn.duration(200)}
                                    className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 items-center"
                                >
                                    <Text className="text-sm leading-5 text-green-700 font-medium text-center">
                                        {successMessage}
                                    </Text>
                                    <Pressable
                                        onPress={() => navigation.goBack()}
                                        className="mt-4"
                                    >
                                        <Text className="text-[13px] font-bold text-green-800 underline">
                                            Return to Sign In
                                        </Text>
                                    </Pressable>
                                </Animated.View>
                            ) : (
                                <>
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
                                            returnKeyType="done"
                                            onSubmitEditing={handleReset}
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

                                    <Pressable
                                        onPress={handleReset}
                                        disabled={isSubmitting}
                                        accessibilityRole="button"
                                        accessibilityState={{ disabled: isSubmitting }}
                                        className={`mt-2 min-h-[52px] items-center justify-center rounded-xl bg-blue-700 ${isSubmitting ? 'opacity-70' : ''
                                            }`}
                                    >
                                        {isSubmitting ? (
                                            <ActivityIndicator color="#FFFFFF" />
                                        ) : (
                                            <Text className="text-base font-bold tracking-wide text-white">
                                                Send Reset Link
                                            </Text>
                                        )}
                                    </Pressable>
                                    <Pressable
                                        onPress={() => navigation.goBack()}
                                        disabled={isSubmitting}
                                        className="mt-4 self-center"
                                    >
                                        <Text className="text-[14px] font-medium text-slate-500 hover:text-slate-700">
                                            Back to Sign in
                                        </Text>
                                    </Pressable>
                                </>
                            )}
                        </Animated.View>
                    </Animated.View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
