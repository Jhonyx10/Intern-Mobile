import { Text, View } from 'react-native';

export default function Home() {
    return (
        <View className="flex-1 items-center justify-center bg-slate-50 px-6">
            <Text className="text-2xl font-bold text-slate-900">Home</Text>
            <Text className="mt-2 text-center text-sm text-slate-500">
                Welcome back! Your dashboard content goes here.
            </Text>
        </View>
    );
}
