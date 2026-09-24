import { MakerClient } from "./maker-client";

export const metadata = { title: "Approve quoting · labs" };

export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <MakerClient sessionId={sessionId} />;
}
