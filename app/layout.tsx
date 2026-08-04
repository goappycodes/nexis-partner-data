import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexis Partner Data',
  description: 'School and teacher contacts',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
