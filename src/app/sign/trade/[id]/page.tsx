import { TradeClient } from "./trade-client";

export const metadata = {
  title: "Sign a trade",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TradeClient id={id} />;
}
