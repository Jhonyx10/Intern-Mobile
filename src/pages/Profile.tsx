import { Text, View } from 'react-native';
import { User } from 'lucide-react-native';

export default function Profile() {
    return (
        <View className="flex-1 items-center justify-center bg-slate-50 px-6">
            <View className="items-center justify-center rounded-full bg-blue-50 p-5">
                <User color="#1D4ED8" size={40} strokeWidth={2} />
            </View>
            <Text className="mt-4 text-2xl font-bold text-slate-900">
                Profile
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-500">
                Your account details will appear here.
            </Text>
        </View>
    );
}
