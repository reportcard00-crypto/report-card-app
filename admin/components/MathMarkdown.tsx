import React from "react";
import { Platform, Text, StyleSheet, View } from "react-native";

type MathMarkdownProps = {
  content: string;
  style?: any;
  fontSize?: number;
};

// Web-specific component using react-markdown with KaTeX
const WebMathMarkdown = ({ content, style, fontSize = 16 }: MathMarkdownProps) => {
  // Dynamic imports for web only
  const ReactMarkdown = require("react-markdown").default;
  const remarkMath = require("remark-math").default;
  const rehypeKatex = require("rehype-katex").default;

  // Inject KaTeX CSS
  React.useEffect(() => {
    const katexCssId = "katex-css";
    if (!document.getElementById(katexCssId)) {
      const link = document.createElement("link");
      link.id = katexCssId;
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
      link.integrity = "sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV";
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  }, []);

  // Pre-process content to handle both $ and $$ delimiters
  const processedContent = React.useMemo(() => {
    if (!content) return "";
    
    // Replace \( ... \) with $ ... $ for inline math
    let processed = content.replace(/\\\((.+?)\\\)/g, '$$$1$$');
    // Replace \[ ... \] with $$ ... $$ for display math
    processed = processed.replace(/\\\[(.+?)\\\]/gs, '$$$$$$1$$$$');
    
    return processed;
  }, [content]);

  const customStyles: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight: 1.6,
    color: "#1f2937",
    wordBreak: "break-word" as const,
    ...style,
  };

  return (
    <div style={customStyles} className="math-markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Custom renderers for better styling
          p: ({ children }) => (
            <p style={{ margin: "0 0 0.5em 0" }}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: "0.5em 0", paddingLeft: "1.5em" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "0.5em 0", paddingLeft: "1.5em" }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: "0.25em" }}>{children}</li>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: "#111827" }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ fontStyle: "italic" }}>{children}</em>
          ),
          code: ({ children, className }) => {
            // Check if it's inline or block code
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <pre style={{ 
                  backgroundColor: "#f3f4f6", 
                  padding: "12px", 
                  borderRadius: "6px",
                  overflow: "auto",
                  fontSize: "14px"
                }}>
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code style={{
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "0.9em"
              }}>
                {children}
              </code>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

// Native fallback - display plain text with basic formatting
const NativeMathMarkdown = ({ content, style, fontSize = 16 }: MathMarkdownProps) => {
  // For native, we'll do basic rendering
  // In a production app, you'd want to use a proper native markdown renderer
  return (
    <View style={style}>
      <Text style={[styles.text, { fontSize }]}>
        {content}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  text: {
    color: "#1f2937",
    lineHeight: 24,
  },
});

// Export platform-specific component
const MathMarkdown = Platform.OS === "web" ? WebMathMarkdown : NativeMathMarkdown;

export default MathMarkdown;
