import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useDashboard } from '../queries/dashboard';
import { useToast } from '../../components/ToastProvider';
import { autoCloseOfflineShiftIfDue } from '../offlineShift';

export function useAutoCloseOfflineShift(enabled: boolean) {
  const { data: dashboard } = useDashboard();
  const { showToast } = useToast();
  const scheduleTimeOut = dashboard?.progress?.schedule?.time_out;

  useEffect(() => {
    if (!enabled || !scheduleTimeOut) return;

    const run = () =>
      autoCloseOfflineShiftIfDue(scheduleTimeOut)
        .then(closed => {
          if (closed) {
            showToast(
              'You forgot to time out, so your offline shift was closed at your scheduled time out.',
              'info',
            );
          }
        })
        .catch(() => {});

    run(); // on app open / when the schedule loads
    const id = setInterval(run, 30 * 1000); // while the app stays open
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') run(); // on return to the foreground
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [enabled, scheduleTimeOut]);
}