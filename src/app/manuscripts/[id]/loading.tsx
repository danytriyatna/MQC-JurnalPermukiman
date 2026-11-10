import { BouncedLoader } from "@/components/ui/bounced-loader";

export default function ManuscriptDetailLoading() {
  return (
    <BouncedLoader
      variant="screen"
      message="Memuat detail naskah..."
      label="Memuat detail naskah..."
    />
  );
}
