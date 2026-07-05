import "./globals.css";

export const metadata = {
  title: "Oravia Dental Receptionist",
  description: "Local demo dashboard for Oravia Dental Receptionist"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
