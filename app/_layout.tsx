import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useAppTheme } from '@/theme/ThemeProvider';

function AppStack() {
  const { isLight, colors } = useAppTheme();
  return (
    <>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}

export default function RootLayout() {
  return <ThemeProvider><AppStack /></ThemeProvider>;
}
