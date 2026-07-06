import "./globals.css";

export const metadata = {
  title:
    "Oravia Dental AI Receptionist Agent + Role-Based Clinic Operations Dashboard",
  description:
    "Admin demo tools for Oravia Dental AI Receptionist Agent and clinic operations"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
