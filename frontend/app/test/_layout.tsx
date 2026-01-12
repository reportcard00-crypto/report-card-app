import { Stack } from "expo-router";

export default function TestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="result/[id]" />
    </Stack>
  );
}

