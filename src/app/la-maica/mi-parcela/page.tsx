import type { Metadata } from "next";
import { ParcelForm } from "../../../features/pilot/parcel-form";

export const metadata: Metadata = { title: "Mi parcela" };

export default function ParcelPage() {
  return <ParcelForm />;
}
