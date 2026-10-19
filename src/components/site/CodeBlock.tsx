export function CodeBlock({ value, label }: { value: string; label?: string }) {
  return (
    <pre className="code-block" aria-label={label}>
      {value}
    </pre>
  );
}
