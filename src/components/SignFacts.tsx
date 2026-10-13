"use client";

import { useEffect, useState } from "react";
import type { AmountLine } from "@/lib/trade/disclosure";

/**
 * The facts a signer checks before approving. Host is read from the address
 * bar after hydration so a proxy cannot advertise a different origin than the
 * one the browser loaded.
 */
export function SignFacts({
  caller,
  host,
  expectedHost,
  action,
  amounts,
  warning,
  expiresAt,
}: {
  caller: string;
  host: string;
  expectedHost: string;
  action: string;
  amounts: AmountLine[];
  warning: string;
  expiresAt?: number;
}) {
  const [shownHost, setShownHost] = useState(host);
  useEffect(() => {
    setShownHost(window.location.host);
  }, []);
  const mismatch = shownHost !== expectedHost;
  return (
    <>
      <ul className="facts">
        <li>
          <span>Caller</span>
          <code>{caller}</code>
        </li>
        <li>
          <span>Host</span>
          {shownHost}
        </li>
        <li>
          <span>Action</span>
          {action}
        </li>
        {amounts.map((line) => (
          <li key={`${line.label}:${line.value}`}>
            <span>{line.label}</span>
            {line.value}
          </li>
        ))}
        {expiresAt ? (
          <li>
            <span>Expires</span>
            {new Date(expiresAt).toISOString()}
          </li>
        ) : null}
      </ul>
      <p className="warn">
        {mismatch ? `This page is on ${shownHost}, not ${expectedHost}. ` : null}
        {warning}
      </p>
    </>
  );
}
