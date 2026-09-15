import { Text, View } from 'react-native';
import type { Evaluation } from '../util/queries/evaluation';

export const StatusPill = ({ status }: { status: Evaluation['status'] }) => {
  const submitted = status === 'submitted';
  return (
    <View
      className={`rounded-full px-2.5 py-1 ${
        submitted ? 'bg-green-100' : 'bg-amber-100'
      }`}
    >
      <Text
        className={`text-[11px] font-bold ${
          submitted ? 'text-green-800' : 'text-amber-800'
        }`}
      >
        {submitted ? 'Submitted' : 'Pending'}
      </Text>
    </View>
  );
};
