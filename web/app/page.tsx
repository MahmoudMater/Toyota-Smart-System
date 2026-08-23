import { KioskApp } from "@/features/kiosk/KioskApp";

export default function Home() {
  return (
    <div className="app-shell">
      <div className="watermark-bg" aria-hidden />
      <KioskApp />
    </div>
  );
}
