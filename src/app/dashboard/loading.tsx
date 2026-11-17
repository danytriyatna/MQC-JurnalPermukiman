import { BouncedLoader } from "@/components/ui/bounced-loader";

export default function DashboardLoading() {
  return (
    <BouncedLoader
      variant="screen"
      message="Memuat dasbor naskah..."
      label="Memuat dasbor..."
    />
  );
}
