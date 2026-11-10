import { BouncedLoader } from "@/components/ui/bounced-loader";

export default function UploadPageLoading() {
  return (
    <BouncedLoader
      variant="screen"
      message="Memuat formulir unggah..."
      label="Memuat formulir unggah..."
    />
  );
}
