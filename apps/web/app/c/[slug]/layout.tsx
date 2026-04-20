import { AppShell } from "@/components/AppShell";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AppShell slug={slug}>{children}</AppShell>;
}
