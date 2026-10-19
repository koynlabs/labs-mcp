const LINES = [
  {
    role: "you",
    text: "Launch $EXAMPLE on pump.fun. Name it Example, symbol EXAMPLE. Then draft the X announcement.",
  },
  {
    role: "labs",
    text: "Built the launch. Metadata, the create, and one opening buy from a wallet you control, in one bundle.",
  },
  {
    role: "labs",
    text: "Sign at the link. Your wallet holds the key. labs does not.",
  },
  { role: "you", text: "Signed." },
  {
    role: "labs",
    text: "It landed. Draft for your X account, with the art attached. Nothing is posted yet.",
  },
  {
    role: "labs",
    text: "“$EXAMPLE is live on pump.fun. Launched from one conversation. The wallet signed.”",
  },
  { role: "you", text: "Confirm that draft." },
  {
    role: "labs",
    text: "Published on your X account. Mentions can come in after that. Replies are drafted on those threads, capped, and nothing replies on its own.",
  },
] as const;

export default function LaunchTranscript() {
  return (
    <figure className="term" aria-label="Sample assistant session. $EXAMPLE is not a real token.">
      <div className="term-bar" aria-hidden="true">
        <span className="term-dots">
          <i />
          <i />
          <i />
        </span>
        <span>session</span>
      </div>
      <ol className="term-lines">
        {LINES.map((line, index) => (
          <li className={`term-line role-${line.role}`} key={line.text}>
            <span className="term-role">{line.role}</span>
            <span>
              {line.text}
              {index === LINES.length - 1 ? <span className="caret" aria-hidden="true" /> : null}
            </span>
          </li>
        ))}
      </ol>
      <figcaption>Sample only. $EXAMPLE is not a real token, and this session shows no price.</figcaption>
    </figure>
  );
}
