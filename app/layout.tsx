import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cascade',
  description: 'Drain-impact simulator for a gang-scheduled GPU cluster, on CognoDB.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <div className="shell">
          <div className="topbar">
            <Link href="/" className="brand">
              cascade<span>.</span>
            </Link>
            <div className="crumbs">gpu cluster drain impact / cognodb</div>
          </div>
          {children}
          <footer>
            Graph on CognoDB. Traversals are Cypher, the fixed-point loop that runs rounds until
            nothing else breaks is TypeScript.
          </footer>
        </div>
      </body>
    </html>
  );
}
