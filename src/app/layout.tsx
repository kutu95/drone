import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DJI Air 3 Mission Planner',
  description: 'Plan and manage waypoint missions for your DJI Air 3 drone',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}



