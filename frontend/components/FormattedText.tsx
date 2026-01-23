import React from "react";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import Markdown from "react-native-markdown-display";

type FormattedTextProps = {
  content: string;
  style?: any;
  fontSize?: number;
  color?: string;
};

/**
 * FormattedText - Renders markdown content with proper formatting
 * Supports: **bold**, *italic*, lists, code, headers, and LaTeX math
 */
const FormattedText = ({ content, style, fontSize = 16, color = "#111827" }: FormattedTextProps) => {
  const { width } = useWindowDimensions();

  if (!content) return null;

  // Custom styles for markdown rendering
  const markdownStyles = StyleSheet.create({
    body: {
      fontSize,
      color,
      lineHeight: fontSize * 1.5,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
    },
    heading1: {
      fontSize: fontSize * 1.5,
      fontWeight: "bold" as const,
      color,
      marginTop: 12,
      marginBottom: 8,
    },
    heading2: {
      fontSize: fontSize * 1.3,
      fontWeight: "bold" as const,
      color,
      marginTop: 10,
      marginBottom: 6,
    },
    heading3: {
      fontSize: fontSize * 1.15,
      fontWeight: "600" as const,
      color,
      marginTop: 8,
      marginBottom: 4,
    },
    strong: {
      fontWeight: "bold" as const,
    },
    em: {
      fontStyle: "italic" as const,
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      marginVertical: 2,
    },
    code_inline: {
      backgroundColor: "#f3f4f6",
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: fontSize * 0.9,
    },
    code_block: {
      backgroundColor: "#f3f4f6",
      padding: 12,
      borderRadius: 8,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      fontSize: fontSize * 0.85,
      overflow: "hidden" as const,
    },
    fence: {
      backgroundColor: "#f3f4f6",
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: "#d1d5db",
      paddingLeft: 12,
      marginVertical: 8,
      opacity: 0.85,
    },
    link: {
      color: "#2563eb",
      textDecorationLine: "underline" as const,
    },
    table: {
      borderWidth: 1,
      borderColor: "#e5e7eb",
      borderRadius: 6,
    },
    th: {
      backgroundColor: "#f9fafb",
      padding: 8,
      fontWeight: "600" as const,
    },
    td: {
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: "#e5e7eb",
    },
    hr: {
      backgroundColor: "#e5e7eb",
      height: 1,
      marginVertical: 12,
    },
    // Math inline styling (basic support)
    text: {
      fontSize,
      color,
    },
  });

  // Pre-process content to handle common LaTeX patterns for display
  // This provides basic rendering - for full LaTeX support, consider WebView
  const processContent = (text: string): string => {
    if (!text) return "";
    
    // Convert display math \[ ... \] to code block for visibility
    let processed = text.replace(/\\\[([\s\S]*?)\\\]/g, '\n```math\n$1\n```\n');
    
    // Convert inline math \( ... \) to backtick code
    processed = processed.replace(/\\\((.*?)\\\)/g, '`$1`');
    
    // Handle $$ ... $$ display math
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, '\n```math\n$1\n```\n');
    
    // Handle single $ ... $ inline math - convert to code style
    // Be careful not to match currency amounts
    processed = processed.replace(/\$([^$\n]+?)\$/g, '`$1`');
    
    return processed;
  };

  const processedContent = processContent(content);

  return (
    <View style={[styles.container, style]}>
      <Markdown style={markdownStyles}>
        {processedContent}
      </Markdown>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default FormattedText;
