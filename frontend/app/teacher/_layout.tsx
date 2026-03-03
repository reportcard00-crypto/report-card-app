import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TeacherLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e5e7eb",
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#9ca3af",
        headerStyle: { backgroundColor: "#1e3a5f" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏠" label="" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="classrooms"
        options={{
          title: "Classrooms",
          tabBarLabel: "Classrooms",
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🏫" label="" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="papers"
        options={{
          title: "Question Papers",
          tabBarLabel: "Papers",
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📄" label="" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="test-sessions"
        options={{
          title: "Test Sessions",
          tabBarLabel: "Tests",
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📝" label="" focused={focused} />
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen
        name="classroom-details"
        options={{
          href: null,
          title: "Classroom Details",
        }}
      />
      <Tabs.Screen
        name="test-results"
        options={{
          href: null,
          title: "Test Results",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabEmoji: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 10,
    color: "#9ca3af",
  },
  tabLabelActive: {
    color: "#2563eb",
  },
});
