import "./globals.css";

export const metadata = {
  title: "FUJIYAMA",
  description: "Float-aware asymmetric AMM for tokenized-stock markets",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
