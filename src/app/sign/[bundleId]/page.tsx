import { SignClient } from "./sign-client";

export const metadata = { title: "Sign a launch · labs" };

export default async function Page({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  const { bundleId } = await params;
  return <SignClient bundleId={bundleId} />;
}
