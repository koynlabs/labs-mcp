import { connection } from "next/server";
import { siteHost } from "@/lib/config";
import { launchDisclosure } from "@/lib/launch/disclosure";
import { getBundle } from "@/lib/store";
import { SignClient } from "./sign-client";

export const metadata = {
  title: "Sign a launch",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  await connection();
  const { bundleId } = await params;
  const bundle = await getBundle(bundleId);
  const facts = bundle ? launchDisclosure(bundle, siteHost()) : null;
  return <SignClient bundleId={bundleId} facts={facts} />;
}
