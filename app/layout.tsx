import type { ReactNode } from "react";

export const metadata = {
  title: "MOC Part Matcher",
  description: "DMS → MOC archetype identification (rebuild in progress)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
