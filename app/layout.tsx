import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VVO CoachApp',
  description: 'Opstelling, wisselplan en wedstrijdverloop voor een jeugdteam.',
  // Geen open graph met club-, team- of spelersnamen: deze app bevat
  // gegevens van minderjarigen en hoort niet vindbaar of deelbaar te zijn.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#123b5d',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
