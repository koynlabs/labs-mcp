const MARK = `
 _          _    ____   ____
| |        / \\  | __ ) / ___|
| |       / _ \\ |  _ \\ \\___ \\
| |___   / ___ \\| |_) | ___) |
|_____| /_/   \\_\\____/ |____/
`.trim();

export default function Wordmark() {
  return (
    <div className="wordmark">
      <p>&lt; labs &gt;</p>
      <pre aria-label="LABS">{MARK}</pre>
    </div>
  );
}
