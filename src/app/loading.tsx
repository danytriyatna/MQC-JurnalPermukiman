import { BouncedLoader } from "@/components/ui/bounced-loader";

export default function RootLoading() {
  return (
    <BouncedLoader
      variant="screen"
      message="Memuat halaman..."
      label="Memuat halaman..."
    />
  );
}
